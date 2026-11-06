import { setImmediate } from "node:timers/promises";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  DemoParser,
  GhostStateAccumulator,
  type GhostUpdate,
  type InfoBlock,
  type Move,
  type MoveData,
  type PacketData,
  type ParsedData,
} from "t2-demo-parser";
import {
  extractMissionInfo,
  parseDemoValues,
} from "../src/stream/demoStreaming.js";
import { assertDemoBlockParsed } from "../src/stream/demoParseError.js";
import { buildCatchupPayload } from "./watchCatchup.js";
import { WatchStateAccumulator } from "./watchState.js";
import type { ReplayCatchupState } from "./replayTypes.js";
import type { WatchCatchupPayload } from "./types.js";

const TICK_SEC = 0.032;
const MAX_PITCH = Math.PI * 0.494;
const MAX_PENDING_MOVES = 46;
/** About one minute. Limit retained history as well as checkpoint frequency. */
const CHECKPOINT_INTERVAL_TICKS = 2_000;
const MAX_CHECKPOINTS = 32;
const WORK_SLICE_MS = 8;
const MAX_BLOCKS_PER_TICK = 512;
/** Real start blocks fit well below this; cap synchronous parser allocations. */
const MAX_INITIAL_BLOCK_BYTES = 1024 * 1024;
const DEFAULT_MAX_DECOMPRESSED_BYTES = 128 * 1024 * 1024;
/** A small push bounds how far inflation can grow before checking its limit. */
const INFLATE_CHUNK_BYTES = 4 * 1024;

export interface ReplaySourceLoadOptions {
  /** Limit the inflated block stream and initial block independently. */
  maxDecompressedBytes?: number;
  signal?: AbortSignal;
}

export type ReplaySourceEvent =
  | { kind: "packet"; data: Uint8Array }
  | { kind: "info"; firstPerson: boolean }
  | { kind: "move"; move: Move; tick: number; firstPerson: boolean };

type MoveCursor = Omit<
  ReplayCatchupState,
  "sessionId" | "epoch" | "tick" | "status"
>;

interface SourceCheckpoint {
  tick: number;
  complete: boolean;
  parser: ReturnType<DemoParser["createCheckpoint"]>;
  ghosts: GhostUpdate[];
  watch: ReturnType<WatchStateAccumulator["save"]>;
  moves: MoveCursor;
}

/** A saved start-block move has packed axes; normal Move blocks already have floats. */
function initialMove(move: MoveData, id: number): Move {
  return {
    ...move,
    x: move.px / 16 - 1,
    y: move.py / 16 - 1,
    z: move.pz / 16 - 1,
    yaw: ((move.pyaw << 16) >> 16) * ((2 * Math.PI) / 65536),
    pitch: ((move.ppitch << 16) >> 16) * ((2 * Math.PI) / 65536),
    roll: ((move.proll << 16) >> 16) * ((2 * Math.PI) / 65536),
    id,
    sendCount: 0,
  };
}

function controlRotation(data: ParsedData | undefined) {
  if (!data) return undefined;
  if (typeof data.rotationZ === "number" && typeof data.headX === "number")
    return { yaw: data.rotationZ, pitch: data.headX };
  if (typeof data.rotZ === "number" && typeof data.rotX === "number")
    return { yaw: data.rotZ, pitch: data.rotX };
  return undefined;
}

/** Variable HUD section counts cannot exceed the rows the initial block owns. */
function checkHudSectionCounts(values: string[]): void {
  if (values.length < 2 || values[0] === "NewDemoData") return;
  let offset = 1;
  const skip = (raw: string | undefined) => {
    const count = parseInt(raw ?? "", 10) || 0;
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > values.length - offset
    )
      throw new Error("Invalid replay initial HUD section count");
    offset += count;
  };
  skip(values[offset++]); // Player list.
  offset += 2; // Reticle and backpack.
  if (offset >= values.length) return;
  const weapons = values[offset++].split("\t");
  skip(weapons[4]);
  skip(weapons[5]);
  if (offset >= values.length) return;
  const inventory = values[offset++].split("\t");
  skip(inventory[4]);
  skip(inventory[5]);
  if (offset >= values.length) return;
  skip(values[offset++].split("\t")[2]); // Score objectives.
}

/**
 * One canonical replay cursor. Parsing and retained network/HUD state advance
 * together; spectators never need the recording or its intervening history.
 * No renderer, collision world, or per-watcher simulation runs here.
 */
export class DemoReplaySource {
  readonly recorderName: string | null;
  readonly recordingDate: string | null;
  private readonly parser: DemoParser;
  private currentTick = 0;
  private ended = false;
  private readonly watch: WatchStateAccumulator;
  private ghosts: GhostStateAccumulator;
  private readonly checkpoints = new Map<number, SourceCheckpoint>();
  private moves: MoveCursor;
  private readonly totalTicks: number;
  private seekQueue: Promise<void> = Promise.resolve();

  static async load(
    bytes: Uint8Array,
    options: ReplaySourceLoadOptions = {},
  ): Promise<DemoReplaySource> {
    const limit =
      options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
    if (!Number.isSafeInteger(limit) || limit <= 0)
      throw new RangeError("Replay decompressed byte limit must be positive");
    const signal = options.signal;
    signal?.throwIfAborted();
    const { header, byteLength } = DemoParser.peekHeader(bytes);
    if (header.initialBlockSize > MAX_INITIAL_BLOCK_BYTES)
      throw new Error(
        `Replay initial block exceeds the ${MAX_INITIAL_BLOCK_BYTES}-byte limit`,
      );
    if (header.initialBlockSize > limit)
      throw new Error(`Replay initial block exceeds the ${limit}-byte limit`);
    const prefixLength = byteLength + header.initialBlockSize;
    if (prefixLength > bytes.byteLength)
      throw new Error("Incomplete replay initial block");
    // Do not hand the compressed tail to load(): incremental mode lets us
    // enforce the expansion limit between pushes instead of after full inflate.
    const parser = new DemoParser(bytes.slice(0, prefixLength), {
      incremental: true,
    });
    await parser.load();
    signal?.throwIfAborted();
    if (parser.initialBlock.moves.length > MAX_PENDING_MOVES)
      throw new Error(
        "Replay initial move queue exceeds the native 46-move limit",
      );
    if (parser.initialBlock.phase2Valid === false)
      throw new Error("Replay initial state is invalid");
    const checkSize = () => {
      if (parser.decompressedByteLength > limit)
        throw new Error(
          `Replay decompressed data exceeds the ${limit}-byte limit`,
        );
    };
    let slice = performance.now();
    let chunks = 0;
    for (
      let offset = prefixLength;
      offset < bytes.byteLength;
      offset += INFLATE_CHUNK_BYTES
    ) {
      signal?.throwIfAborted();
      parser.push(bytes.subarray(offset, offset + INFLATE_CHUNK_BYTES));
      checkSize();
      // Spread block-header indexing over bounded chunks as well. Checkpoints
      // still address the complete retained buffer once finish() trims it.
      void parser.bufferedMoveTicks;
      chunks++;
      if (
        chunks === 1 ||
        chunks % 8 === 0 ||
        performance.now() - slice >= WORK_SLICE_MS
      ) {
        await setImmediate();
        signal?.throwIfAborted();
        slice = performance.now();
      }
    }
    parser.finish();
    checkSize();
    signal?.throwIfAborted();
    return new DemoReplaySource(parser);
  }

  private constructor(parser: DemoParser) {
    this.parser = parser;
    const initial = parser.initialBlock;
    checkHudSectionCounts(initial.demoValues);
    const values = parseDemoValues(initial.demoValues);
    const metadata = extractMissionInfo(initial.demoValues);
    this.recorderName = metadata.recorderName;
    this.recordingDate = metadata.recordingDate;
    this.totalTicks = parser.bufferedMoveTicks;
    this.watch = new WatchStateAccumulator(undefined, {
      now: () => this.currentTick * TICK_SEC,
    });
    const hud = this.watch.getHudState();
    this.watch.seed({
      taggedStrings: Array.from(initial.taggedStrings),
      dataBlocks: Array.from(initial.dataBlocks),
      targetEntries: initial.targetEntries.map((entry) => ({
        ...entry,
        typeDescription: entry.typeDescription ?? "",
      })),
      sensorGroupColors: initial.sensorGroupColors,
      playerSensorGroup: initial.sensorGroup,
      controlObjectGhostIndex: initial.controlObjectGhostIndex,
      controlObjectData: initial.controlObjectData,
      missionName: initial.missionName ?? null,
      worldGravity: values.gravity,
      ghostingComplete: initial.initialGhosts.length > 0,
      initialGhosts: initial.initialGhosts,
      hudState: {
        ...hud,
        playerRoster: Array.from(values.playerRoster, ([clientId, entry]) => ({
          clientId,
          ...entry,
        })),
        teamScores: values.teamScores.map(({ teamId, name, score }) => ({
          teamId,
          name,
          score,
        })),
        flags: values.flags,
        clock:
          values.clockTimeMin == null
            ? undefined
            : { durationMs: values.clockTimeMin * 60_000, elapsedMs: 0 },
        missionDisplayName: metadata.missionDisplayName ?? undefined,
        missionTypeDisplayName: metadata.missionType ?? undefined,
        gameClassName: metadata.gameClassName ?? undefined,
        serverDisplayName: metadata.serverDisplayName ?? undefined,
      },
    });
    this.watch.selfClientId = metadata.recorderClientId;
    this.ghosts = new GhostStateAccumulator(initial.taggedStrings);
    this.ghosts.applyPacket({
      events: [],
      ghosts: initial.initialGhosts,
    } as unknown as PacketData);

    const rotation = controlRotation(initial.controlObjectData);
    this.moves = {
      pendingMoves: initial.moves.map((move, index) => ({
        id: initial.firstMoveIndex + index,
        move: initialMove(move, initial.firstMoveIndex + index),
        firstPerson: initial.firstPerson,
      })),
      nextMoveId: initial.firstMoveIndex + initial.moves.length,
      lastClientMoveId: initial.lastClientMove,
      controlMoveReplayStartId: initial.firstMoveIndex + initial.moves.length,
      lastMoveAck: initial.firstMoveIndex,
      controlMovesAvailable: true,
      firstPerson: initial.firstPerson,
      fov: 100,
      absoluteYaw: rotation?.yaw ?? 0,
      absolutePitch: rotation?.pitch ?? 0,
    };
    this.validateMoves();
    this.checkpoints.set(0, this.capture());
  }

  get tick(): number {
    return this.currentTick;
  }

  get durationTicks(): number {
    return this.totalTicks;
  }

  /** EOF is committed only after packet-only trailing blocks have been consumed. */
  get complete(): boolean {
    return this.ended;
  }

  /**
   * Consume through exactly one Move block, preserving preceding packet order.
   * DemoParser already parses these bytes and processes SendPacket markers.
   */
  advanceOneTick(): ReplaySourceEvent[] {
    if (this.ended) return [];
    const events: ReplaySourceEvent[] = [];
    const parser = this.parser.getPacketParser();
    for (let count = 0; count < MAX_BLOCKS_PER_TICK; count++) {
      const rejected = parser.protocolRejected;
      const noDispatch = parser.protocolNoDispatch;
      const block = this.parser.nextBlock();
      if (!block) {
        this.ended = true;
        return events;
      }
      assertDemoBlockParsed(block, this.currentTick * TICK_SEC);
      if (block.type === BlockTypePacket) {
        // Never forward a natively rejected packet to the passive parser,
        // whose relaxed outgoing ACK validation could accept it instead.
        if (parser.protocolRejected !== rejected) continue;
        if (parser.protocolNoDispatch === noDispatch) {
          const packet = block.parsed as PacketData;
          this.watch.applyPacket(packet, undefined, (name, args) => {
            this.watch.applyMissionStart(name, args);
          });
          this.ghosts.applyPacket(packet);
          const ack = packet.gameState.lastMoveAck;
          this.moves.lastMoveAck = Math.max(this.moves.lastMoveAck, ack);
          this.moves.pendingMoves = this.moves.pendingMoves.filter(
            ({ id }) => id >= ack,
          );
          this.moves.nextMoveId = Math.max(this.moves.nextMoveId, ack);
          if (packet.gameState.controlObjectData?.position) {
            this.moves.lastClientMoveId = this.moves.nextMoveId;
            this.moves.controlMoveReplayStartId = ack;
            // Native packet corrections replay every remaining input using
            // the current view mode, replacing its first-execution context.
            for (const pending of this.moves.pendingMoves)
              pending.firstPerson = this.moves.firstPerson;
          }
          const rotation = controlRotation(packet.gameState.controlObjectData);
          if (rotation) {
            this.moves.absoluteYaw = rotation.yaw;
            this.moves.absolutePitch = rotation.pitch;
          }
        }
        // Delivery queues own their bytes independently of the source cursor.
        events.push({ kind: "packet", data: block.data.slice() });
      } else if (block.type === BlockTypeInfo) {
        if (!block.parsed) throw new Error("Invalid demo camera-info block");
        const info = block.parsed as InfoBlock;
        this.moves.firstPerson = info.firstPerson;
        events.push({ kind: "info", firstPerson: info.firstPerson });
        if (Number.isFinite(info.cameraFov)) this.moves.fov = info.cameraFov;
      } else if (block.type === BlockTypeMove) {
        if (!block.parsed) throw new Error("Invalid demo movement block");
        const move = block.parsed as Move;
        // The initial block stores the client's predicted pose. Its queued
        // inputs stay pending for ACKs, but only still-unprocessed ones run
        // on the first tick; a packet pose instead reruns its unacked suffix.
        this.moves.controlMoveReplayStartId = Math.min(
          this.moves.controlMoveReplayStartId,
          this.moves.lastClientMoveId,
        );
        this.validateMoves(1);
        if (this.moves.controlMovesAvailable) {
          const id = this.moves.nextMoveId++;
          this.moves.pendingMoves.push({
            id,
            move,
            firstPerson: this.moves.firstPerson,
          });
          const twoPi = Math.PI * 2;
          this.moves.absoluteYaw =
            (((this.moves.absoluteYaw + move.yaw) % twoPi) + twoPi) % twoPi;
          this.moves.absolutePitch = Math.max(
            -MAX_PITCH,
            Math.min(MAX_PITCH, this.moves.absolutePitch + move.pitch),
          );
        }
        this.moves.lastClientMoveId = this.moves.nextMoveId;
        this.currentTick++;
        events.push({
          kind: "move",
          move,
          tick: this.currentTick,
          firstPerson: this.moves.firstPerson,
        });
        if (this.currentTick % CHECKPOINT_INTERVAL_TICKS === 0)
          this.retainCheckpoint();
        return events;
      }
    }
    throw new Error("Too many demo blocks without a movement tick");
  }

  /** Restore a source checkpoint and reconstruct once, without spectator fanout. */
  seek(tick: number, signal?: AbortSignal): Promise<void> {
    // A superseding seek waits for the aborted job's rollback before restoring
    // its own checkpoint. Otherwise the old rollback could overwrite new work.
    const task = this.seekQueue
      .catch(() => {})
      .then(() => this.seekTo(tick, signal));
    this.seekQueue = task;
    return task;
  }

  private async seekTo(tick: number, signal?: AbortSignal): Promise<void> {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.totalTicks)
      throw new RangeError("Replay tick is outside the recording");
    signal?.throwIfAborted();
    const previous = this.capture();
    try {
      let checkpoint = this.checkpoints.get(0)!;
      for (const candidate of this.checkpoints.values())
        if (candidate.tick <= tick && candidate.tick > checkpoint.tick)
          checkpoint = candidate;
      // Continuing forward is cheaper than restoring an earlier checkpoint.
      if (this.currentTick > tick || checkpoint.tick > this.currentTick)
        this.restore(checkpoint);
      // Seeking to EOF's last Move boundary excludes trailing packet-only data.
      if (this.ended && this.currentTick === tick) this.restore(checkpoint);
      let slice = performance.now();
      while (this.currentTick < tick) {
        signal?.throwIfAborted();
        if (this.ended)
          throw new Error("Recording ended before the replay tick");
        this.advanceOneTick();
        if (
          this.currentTick % 256 === 0 ||
          performance.now() - slice >= WORK_SLICE_MS
        ) {
          await setImmediate();
          signal?.throwIfAborted();
          slice = performance.now();
        }
      }
      this.assertGhosts();
    } catch (error) {
      this.restore(previous);
      throw error;
    }
  }

  /** Skip the empty loading lead-in, using the same 20-second limit as demos. */
  async prepareScene(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const previous = this.capture();
    const limit = this.currentTick + Math.floor(20 / TICK_SEC);
    let slice = performance.now();
    try {
      while (!this.ended && this.currentTick < limit) {
        signal?.throwIfAborted();
        const hasWorld = [
          ...this.parser.getGhostTracker().getAllGhosts().values(),
        ].some(
          (ghost) =>
            ghost.className === "TerrainBlock" ||
            ghost.className === "InteriorInstance",
        );
        if (
          hasWorld &&
          this.watch.controlObjectGhostIndex >= 0 &&
          this.watch.controlObjectData != null
        )
          return;
        this.advanceOneTick();
        if (performance.now() - slice >= WORK_SLICE_MS) {
          await setImmediate();
          signal?.throwIfAborted();
          slice = performance.now();
        }
      }
      this.restore(previous);
    } catch (error) {
      this.restore(previous);
      throw error;
    }
  }

  catchup(
    sessionId: string,
    epoch: number,
    status: "paused" | "playing" | "ended",
  ): WatchCatchupPayload {
    this.assertGhosts();
    const payload = buildCatchupPayload({
      packetParser: this.parser.getPacketParser(),
      ghostState: this.ghosts,
      watchState: this.watch,
      epoch,
      serverAddress: `replay:${sessionId}`,
      sourceTime: this.currentTick * TICK_SEC,
    });
    // SendPacket markers stay source-local. A passive browser must accept ACKs
    // for packets it did not send while retaining this exact receive window.
    payload.connectionState.lastSendSeq = 0x1fffffff;
    payload.replay = {
      sessionId,
      epoch,
      tick: this.currentTick,
      status,
      ...structuredClone(this.moves),
    };
    return payload;
  }

  private validateMoves(incoming = 0): void {
    if (
      this.moves.nextMoveId + incoming - this.moves.lastMoveAck <=
      MAX_PENDING_MOVES
    )
      return;
    // Old relay recordings synthesized timing moves that were never sent.
    // Keep their timing while falling back to server movement observations.
    this.moves.controlMovesAvailable = false;
    this.moves.pendingMoves = [];
  }

  private capture(): SourceCheckpoint {
    return {
      tick: this.currentTick,
      complete: this.ended,
      parser: this.parser.createCheckpoint(),
      ghosts: this.ghosts.toInitialGhosts(),
      watch: this.watch.save(),
      moves: structuredClone(this.moves),
    };
  }

  private restore(checkpoint: SourceCheckpoint): void {
    this.parser.restoreCheckpoint(checkpoint.parser);
    this.currentTick = checkpoint.tick;
    this.ended = checkpoint.complete;
    this.watch.restore(checkpoint.watch);
    this.moves = structuredClone(checkpoint.moves);
    this.ghosts = new GhostStateAccumulator(this.watch.getTaggedStrings());
    this.ghosts.applyPacket({
      events: [],
      ghosts: checkpoint.ghosts,
    } as unknown as PacketData);
  }

  private retainCheckpoint(): void {
    if (this.checkpoints.has(this.currentTick)) return;
    this.checkpoints.set(this.currentTick, this.capture());
    while (this.checkpoints.size > MAX_CHECKPOINTS) {
      const oldest = [...this.checkpoints.keys()].find((tick) => tick !== 0)!;
      this.checkpoints.delete(oldest);
    }
  }

  private assertGhosts(): void {
    const actual = this.ghosts.getGhostSeeds();
    const expected = this.parser.getGhostTracker().getAllGhosts();
    if (
      actual.length !== expected.size ||
      actual.some(
        (ghost) => expected.get(ghost.index)?.classId !== ghost.classId,
      )
    )
      throw new Error("Replay ghost state diverged from the packet parser");
  }
}

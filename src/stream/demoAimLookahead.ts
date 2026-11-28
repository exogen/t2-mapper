import type {
  DemoParser,
  MoveData,
  PacketData,
  ParsedData,
} from "t2-demo-parser";
import {
  forkDemoLookahead,
  readDemoLookaheadBlock,
  type DemoLookaheadFork,
} from "./demoLookaheadParser";
import { DEMO_AIM_LOOKAHEAD_TICKS, type DemoAimTick } from "./demoAimFit";
import { GhostMessage } from "./entityClassification";
import { unclampMove } from "./playerPrediction";
import type { QuantizedAimSample } from "./quantizedPlayerAim";

const MAX_LOOKAHEAD_BLOCKS = 128;
const MAX_ROLLING_CATCHUP_TICKS = 4;

export function readDemoAimSample(
  data: ParsedData | undefined,
): QuantizedAimSample | undefined {
  if (!data) return undefined;
  const { rotationZ, headX, headZ } = data;
  if (
    typeof rotationZ !== "number" ||
    typeof headX !== "number" ||
    typeof headZ !== "number"
  ) {
    return undefined;
  }
  const move = data.move as MoveData | undefined;
  return { rotationZ, headX, headZ, move: move && unclampMove(move) };
}

export function isDemoAimCut(data: ParsedData | undefined): boolean {
  return (
    data?.allowWarp === false ||
    typeof data?.mountObject === "number" ||
    (typeof data?.damageState === "number" && data.damageState > 0)
  );
}

interface AimFrame {
  tick: number;
  observations: Map<number, QuantizedAimSample[]>;
  cuts: Set<number>;
  worldCut?: boolean;
}

interface Cursor {
  tick: number;
  requestedTick: number;
  frames: AimFrame[];
  controlGhostIndex?: number;
  stopped: boolean;
}

function readPacket(cursor: Cursor, frame: AimFrame, packet: PacketData): void {
  const controlIndex = packet.gameState.controlObjectGhostIndex;
  if (controlIndex != null && controlIndex !== cursor.controlGhostIndex) {
    if (cursor.controlGhostIndex != null)
      frame.cuts.add(cursor.controlGhostIndex);
    frame.cuts.add(controlIndex);
    cursor.controlGhostIndex = controlIndex;
  }
  for (const { parsedData } of packet.events) {
    if (
      parsedData?.type === "GhostingMessageEvent" &&
      parsedData.message === GhostMessage.EndGhosting
    ) {
      frame.worldCut = true;
    } else if (
      parsedData?.type === "GhostAlwaysObjectEvent" &&
      typeof parsedData.ghostIndex === "number" &&
      typeof parsedData.classId === "number"
    ) {
      frame.cuts.add(parsedData.ghostIndex);
    }
  }
  if (frame.worldCut) return;
  for (const ghost of packet.ghosts) {
    if (ghost.type !== "update" || isDemoAimCut(ghost.parsedData)) {
      frame.cuts.add(ghost.index);
    }
    if (frame.cuts.has(ghost.index)) continue;
    const aim = readDemoAimSample(ghost.parsedData);
    if (!aim) continue;
    const observations = frame.observations.get(ghost.index);
    if (observations) observations.push(aim);
    else frame.observations.set(ghost.index, [aim]);
  }
}

/** Read only the next few complete demo ticks without moving the main parser. */
export class DemoAimLookahead {
  private fork?: DemoLookaheadFork;
  private cursor?: Cursor;
  private failedSource?: DemoParser;

  reset(): void {
    this.cursor = undefined;
    this.failedSource = undefined;
  }

  read(
    source: DemoParser,
    tick: number,
    ghostIndex: number,
    controlGhostIndex?: number,
  ): DemoAimTick[] {
    if (this.fork && this.fork.source !== source) {
      this.fork = undefined;
      this.cursor = undefined;
    }
    if (this.failedSource !== source) this.failedSource = undefined;
    // Progressive parsers can fork once their download has finished.
    if (!source.isComplete || this.failedSource === source) return [];
    try {
      const fork = (this.fork ??= forkDemoLookahead(source));
      if (!fork) return [];
      let cursor = this.cursor;
      if (
        !cursor ||
        tick < cursor.requestedTick ||
        tick - cursor.tick > MAX_ROLLING_CATCHUP_TICKS ||
        (cursor.stopped && tick > cursor.tick && tick > cursor.requestedTick)
      ) {
        this.cursor = undefined;
        fork.rebase();
        cursor = {
          tick,
          requestedTick: tick,
          frames: [],
          controlGhostIndex,
          stopped: false,
        };
        this.cursor = cursor;
      }
      cursor.requestedTick = tick;
      while (cursor.frames.length && cursor.frames[0].tick <= tick)
        cursor.frames.shift();
      this.advance(fork.parser, cursor, tick + DEMO_AIM_LOOKAHEAD_TICKS);
      const result: DemoAimTick[] = [];
      for (const frame of cursor.frames) {
        if (frame.worldCut || frame.cuts.has(ghostIndex)) {
          result.push({ tick: frame.tick, observations: [], cut: true });
          break;
        }
        result.push({
          tick: frame.tick,
          observations: frame.observations.get(ghostIndex) ?? [],
        });
      }
      return result;
    } catch {
      this.failedSource = source;
      return [];
    }
  }

  private advance(
    parser: DemoParser,
    cursor: Cursor,
    throughTick: number,
  ): void {
    if (cursor.stopped || cursor.tick >= throughTick) return;
    const protocol = parser.getPacketParser();
    const nextFrame = (): AimFrame => ({
      tick: cursor.tick + 1,
      observations: new Map(),
      cuts: new Set(),
    });
    let frame = nextFrame();
    try {
      for (let count = 0; count < MAX_LOOKAHEAD_BLOCKS; count++) {
        const block = readDemoLookaheadBlock(parser, protocol);
        if (block === "stop") break;
        if (block === "move") {
          cursor.tick++;
          if (cursor.tick > cursor.requestedTick) cursor.frames.push(frame);
          if (cursor.tick >= throughTick) return;
          frame = nextFrame();
        } else if (block !== "skip") readPacket(cursor, frame, block);
      }
    } catch {
      // A speculative read must not surface faults ahead of normal playback.
    }
    // Only completed ticks are cached. Reseed after playback passes this
    // cursor instead of repeatedly scanning an incomplete or oversized tick.
    cursor.stopped = true;
  }
}

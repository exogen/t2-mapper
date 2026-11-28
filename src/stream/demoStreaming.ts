import { matchPhaseFromScoreboard } from "./matchEvents";
import { unclampMove, type PlayerMove } from "./playerPrediction";
import type { PlayerPacketData } from "t2-demo-parser";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  type DemoBlock,
  type DemoParser,
  type PacketData,
} from "t2-demo-parser";
import type { ParsedData } from "t2-demo-parser";
import { clamp } from "../mathUtils";
import { createLogger } from "../logger";
import {
  advancePlayerCameraBlend,
  PLAYER_CAMERA_SPEED,
} from "./playerCameraBlend";
import {
  TICK_DURATION_MS,
  streamTimeToTick,
  MAX_PITCH,
  CameraMode_OrbitObject,
  CameraMode_OrbitPoint,
  observerOrbitDistance,
  isValidPosition,
  stripTaggedStringMarkup,
  detectControlObjectType,
  parseColorSegments,
  collectPreloadShapeNames,
  collectShapeConstructorSequences,
  torqueQuatHeading,
  torqueQuatPitch,
  torqueQuatToThreeJS,
} from "./streamHelpers";
import type { Vec3 } from "./streamHelpers";
import type {
  PlayerTickView,
  DemoPlayerAim,
  StreamCamera,
  StreamRecording,
  StreamSnapshot,
} from "./types";
import { StreamEngine, type MutableEntity } from "./StreamEngine";
import {
  extractMissionInfo,
  parseDemoValues,
  type DemoMissionInfo,
} from "./demoInitialValues";
import { assertDemoBlockParsed } from "./demoParseError";
import { loadDemoParser } from "./loadDemoParser";
import { collisionState } from "../collision/collisionContext";
import { refreshFlagCarriers } from "../../relay/flagState";
import { cloneData } from "../cloneData";
import type { PrecipitationState } from "../weather/types";
import {
  reconstructQuantizedAim,
  type QuantizedAimSample,
} from "./quantizedPlayerAim";
import {
  DEMO_AIM_LOOKAHEAD_TICKS,
  fitDemoAim,
  type DemoAimTick,
} from "./demoAimFit";
import {
  DemoAimLookahead,
  isDemoAimCut,
  readDemoAimSample,
} from "./demoAimLookahead";
import { DemoResourceLookahead } from "./demoResourceLookahead";
import {
  DEFAULT_PLAYER_INTERPOLATION,
  normalizePlayerInterpolation,
  samePlayerInterpolation,
  type PlayerInterpolationSettings,
} from "./playerInterpolation";
import type { DemoCheckpointIndex } from "./demoCheckpoints";
import type { CheckpointMemoryPolicy } from "./checkpointMemoryPolicy";
import { DemoCheckpointRepository } from "./demoCheckpointRepository";
import { emitDiagnosticEvent as markDiagnosticEvent } from "../diagnostics/events";

interface DemoAimObservations {
  observations: QuantizedAimSample[];
  cut?: boolean;
}

interface DemoAimFrame {
  tick: number;
  players: ReadonlyMap<string, DemoAimObservations>;
  previousViews: ReadonlyMap<string, PlayerTickView> | undefined;
}

/** Checkpoint cadence in recorded simulation ticks; each tick is 32 ms. */
export const DEMO_CHECKPOINT_TICKS = 1_000;

function checkCheckpointFields(
  section: string,
  saved: object | undefined,
  current: readonly string[],
  optional?: string,
): void {
  if (!saved) throw new Error(`Invalid seek checkpoint: missing ${section}`);
  for (const key of current) {
    if (key !== optional && !Object.hasOwn(saved, key))
      throw new Error(`Invalid seek checkpoint: missing ${section}.${key}`);
  }
  for (const key of Object.keys(saved)) {
    if (!current.includes(key))
      throw new Error(`Invalid seek checkpoint: unexpected ${section}.${key}`);
  }
}

// Optional metadata must not turn startup into a scan of the recording.
const METADATA_PROBE_MAX_SEC = 2;
const METADATA_PROBE_MAX_BLOCKS = 512;

// Retail getNextMove (0x006019b0) refuses collection above 45 queued moves;
// collectMove's playback branch (0x00601ca0) also stops admission at 46.
const MAX_RECORDED_PENDING_MOVES = 46;
// Camera::processTick (0x5cbc80) caps observer pitch at roughly 80 degrees.
const MAX_OBSERVER_PITCH = 1.3962;

export interface DemoStreamingOptions {
  /** Retain seek checkpoints. Event and director scans can disable them. */
  checkpoints?: boolean;
  /** Queue transient ground-particle ticks only with an attached renderer. */
  groundEffects?: boolean;
  /** Headless consumers that never pose a camera can skip player view data. */
  playerViews?: boolean;
  /** Retain observed mortar and missile impacts for director sampling. */
  directorImpacts?: boolean;
  /** Browser loaders set budgets; offline readers default to all seek anchors. */
  checkpointMemoryPolicy?: CheckpointMemoryPolicy;
}

/** Seekable simulation state. groundEffects is an empty legacy envelope,
 * never the renderer's pending ground-particle input queue. */
export type DemoSeekCheckpoint = ReturnType<
  DemoStreamAdapter["captureCheckpoint"]
>;

const log = createLogger("demoStreaming");

export class DemoStreamAdapter extends StreamEngine {
  lastStepStartTimeSec = 0;
  private readonly checkpointsEnabled: boolean;
  private readonly playerViewsEnabled: boolean;
  private pendingAimObservations = new Map<string, DemoAimObservations>();
  private readonly aimHistory: DemoAimFrame[] = [];
  private readonly aimLookahead = new DemoAimLookahead();
  private readonly resourceLookahead = new DemoResourceLookahead();
  private aimResult?: { tick: number; entityId: string; view: DemoPlayerAim };
  private readonly checkpointRepository: DemoCheckpointRepository;
  private checkpointCaptures = 0;
  private checkpointCaptureMs = 0;
  private checkpointCaptureMaxMs = 0;
  private checkpointImportMs = 0;
  private predictionModeChanged = false;
  private preferredInterpolation = DEFAULT_PLAYER_INTERPOLATION;
  private readonly interpolationOverrides = new Map<
    symbol,
    Readonly<PlayerInterpolationSettings>
  >();

  get currentPlayerInterpolation() {
    return this.playerInterpolation;
  }
  private pendingCheckpointCollision: ReturnType<
    DemoStreamAdapter["captureCollisionWorld"]
  > | null = null;

  private captureCollisionWorld() {
    const world = collisionState();
    return {
      terrain: world.terrain,
      interiors: new Map(world.interiors),
      failedAssets: new Map(world.failedAssets),
    };
  }

  private checkpointCollisionReady(): boolean {
    const previous = this.pendingCheckpointCollision;
    if (!previous) return true;
    const world = collisionState();
    for (const entity of this.entities.values()) {
      if (
        world.failedAssets.has(entity.ghostIndex) &&
        world.failedAssets.get(entity.ghostIndex) !==
          previous.failedAssets.get(entity.ghostIndex)
      )
        continue;
      if (
        entity.className === "TerrainBlock" &&
        (!world.terrain || world.terrain === previous.terrain)
      )
        return false;
      if (entity.className === "InteriorInstance") {
        const id = `ghost:${entity.ghostIndex}`;
        if (
          !world.interiors.has(id) ||
          world.interiors.get(id) === previous.interiors.get(id)
        )
          return false;
      }
    }
    this.pendingCheckpointCollision = null;
    return true;
  }

  get seekSceneSnapshot(): StreamSnapshot | null {
    return this.pendingCheckpointCollision || this.checkpointRepository.wait
      ? this.getSnapshot()
      : null;
  }

  get checkpointWait(): Promise<void> | undefined {
    return this.checkpointRepository.wait;
  }

  get checkpointTicks(): readonly number[] {
    return Array.from(this.checkpointRepository.ticks());
  }

  override getDiagnosticMetrics(): Record<string, number | null> {
    return {
      ...super.getDiagnosticMetrics(),
      ...this.checkpointRepository.getMetrics(),
      demoInflatedBytes: this.parser.decompressedByteLength,
      checkpointCaptures: this.checkpointCaptures,
      checkpointCaptureMs: this.checkpointCaptureMs,
      checkpointCaptureMaxMs: this.checkpointCaptureMaxMs,
      checkpointImportMs: this.checkpointImportMs,
    };
  }

  installCheckpointIndex(index: DemoCheckpointIndex): void {
    this.checkpointRepository.installIndex(index);
  }

  /** Only the loader calls this once an unload/replacement is committed. */
  disposeCheckpointIndex(): void {
    this.checkpointRepository.dispose();
  }

  private clearSessionCheckpoints(): void {
    this.checkpointRepository.clearSession(this.playerPredictionEnabled);
  }

  override setPlayerPredictionEnabled(enabled: boolean): void {
    if (enabled === this.playerPredictionEnabled) return;
    super.setPlayerPredictionEnabled(enabled);
    this.clearSessionCheckpoints();
    this.pendingCheckpointCollision = null;
    this.predictionModeChanged = this.moveTicks > 0;
  }

  setPlayerInterpolation(
    settings: Readonly<PlayerInterpolationSettings>,
  ): void {
    if (samePlayerInterpolation(this.preferredInterpolation, settings)) return;
    this.preferredInterpolation = normalizePlayerInterpolation(settings);
    this.applyPlayerInterpolation();
  }

  holdPlayerInterpolation(
    settings: Readonly<PlayerInterpolationSettings>,
  ): () => void {
    const token = Symbol();
    this.interpolationOverrides.set(
      token,
      normalizePlayerInterpolation(settings),
    );
    this.applyPlayerInterpolation();
    return () => {
      if (this.interpolationOverrides.delete(token))
        this.applyPlayerInterpolation();
    };
  }

  private applyPlayerInterpolation(): void {
    const settings =
      Array.from(this.interpolationOverrides.values()).at(-1) ??
      this.preferredInterpolation;
    if (samePlayerInterpolation(this.playerInterpolation, settings)) return;
    this.playerInterpolation = settings;
    this.clearSessionCheckpoints();
    this.pendingCheckpointCollision = null;
    this.collisionReplayComplete = false;
    if (this.playerPredictionEnabled) this.predictionModeChanged = true;
  }

  // PacketNotify::sendTime is not stored in the demo. Timestamp recorded sends
  // and acknowledgments on its 32 ms move clock (NetConnection::handleNotify).
  private latency?: {
    roundTripMs: number;
    lastSend: number;
    lastAck: number;
    sendTicks: (number | null)[];
  };

  private resetDemoLatency(sequences: {
    lastSendSeq: number;
    highestAckedSeq: number;
  }): void {
    const { roundTripTime } = this.parser.initialBlock;
    this.latency = {
      roundTripMs: Number.isFinite(roundTripTime) ? roundTripTime : 0,
      lastSend: sequences?.lastSendSeq ?? 0,
      lastAck: sequences?.highestAckedSeq ?? 0,
      sendTicks: Array(32).fill(null),
    };
  }

  private updateDemoLatency(block: DemoBlock): void {
    const latency = this.latency;
    if (!latency) return;
    if (block.type === BlockTypeSendPacket) {
      latency.sendTicks[++latency.lastSend & 31] = this.moveTicks;
    } else if (
      block.type === BlockTypePacket &&
      block.parsed &&
      "dnetHeader" in block.parsed
    ) {
      const { highestAck, ackMask } = block.parsed.dnetHeader;
      // The packet parser has already validated this 9-bit sequence number.
      const end = latency.lastAck + ((highestAck - latency.lastAck) & 511);
      for (
        let seq = Math.max(latency.lastAck + 1, end - 31);
        seq <= end;
        seq++
      ) {
        const sent = latency.sendTicks[seq & 31];
        if (sent != null && ackMask & (1 << (end - seq))) {
          const elapsedMs = (this.moveTicks - sent) * TICK_DURATION_MS;
          latency.roundTripMs = Math.fround(
            (latency.roundTripMs + elapsedMs) * 0.5,
          );
        }
        latency.sendTicks[seq & 31] = null;
      }
      latency.lastAck = end;
    }
  }

  protected override getPlayerLatencyTicks(): number {
    // Retail stores a float but truncates the cap for whole-tick prediction.
    const maxTicks = Math.trunc(this.playerInterpolation.maxLatencyTicks);
    const rtt = this.latency?.roundTripMs ?? 0;
    if (!maxTicks || rtt <= 0 || !this.playerCollisionReady()) return 0;
    return Math.min(maxTicks, Math.ceil(rtt / (2 * TICK_DURATION_MS)));
  }

  captureCheckpoint() {
    const started = performance.now();
    const checkpoint = {
      parser: this.parser.createCheckpoint(),
      simulation: this.captureSimulationState(),
      cursor: structuredClone({
        moveTicks: this.moveTicks,
        ...(this.latency && { latency: this.latency }),
        lastRecordedMoveAck: this.lastRecordedMoveAck,
        absoluteYaw: this.absoluteYaw,
        absolutePitch: this.absolutePitch,
        lastAbsYaw: this.lastAbsYaw,
        lastAbsPitch: this.lastAbsPitch,
      }),
    };
    const duration = performance.now() - started;
    this.checkpointCaptures++;
    this.checkpointCaptureMs += duration;
    this.checkpointCaptureMaxMs = Math.max(
      this.checkpointCaptureMaxMs,
      duration,
    );
    markDiagnosticEvent("checkpoint-captured", {
      tick: this.moveTicks,
      durationMs: duration,
    });
    return checkpoint;
  }

  /** Exercise restoration in an offline reader before trusting a saved artifact. */
  static verifyCheckpointRestoration(
    parser: DemoParser,
    checkpoints: readonly DemoSeekCheckpoint[],
  ): void {
    const reader = new DemoStreamAdapter(parser, { checkpoints: false });
    reader.importCheckpoints(checkpoints);
    for (const { checkpoint } of reader.checkpointRepository.importedValues())
      reader.restoreCheckpoint(checkpoint);
  }

  /** Import already validated, collision-correct checkpoints for this recording. */
  importCheckpoints(
    checkpoints: readonly DemoSeekCheckpoint[],
    onRestoreError?: (error: unknown) => void,
  ): void {
    const started = performance.now();
    const owner = this.parser.createCheckpoint().owner;
    const current = this.simulationCheckpointFields();
    const imported = new Map<number, DemoSeekCheckpoint>();
    for (const checkpoint of checkpoints) {
      const tick = checkpoint.cursor.moveTicks;
      const { state } = checkpoint.simulation;
      if (
        !Number.isSafeInteger(tick) ||
        tick < 0 ||
        !Number.isSafeInteger(checkpoint.cursor.lastRecordedMoveAck) ||
        checkpoint.cursor.lastRecordedMoveAck < 0 ||
        ![
          checkpoint.cursor.absoluteYaw,
          checkpoint.cursor.absolutePitch,
          checkpoint.cursor.lastAbsYaw,
          checkpoint.cursor.lastAbsPitch,
        ].every(Number.isFinite) ||
        checkpoint.simulation.state.skippedPlayerPrediction ||
        !Number.isSafeInteger(checkpoint.parser.blockStreamOffset) ||
        checkpoint.parser.blockStreamOffset < 0 ||
        checkpoint.parser.blockStreamOffset >
          this.parser.decompressedByteLength ||
        !Number.isSafeInteger(checkpoint.parser.blockCursor) ||
        checkpoint.parser.blockCursor < 0 ||
        !(checkpoint.simulation.shared instanceof Map) ||
        !(checkpoint.simulation.players instanceof Map) ||
        !(checkpoint.simulation.images instanceof Map) ||
        !(checkpoint.parser.ghosts instanceof Map)
      )
        throw new Error("Invalid seek checkpoint");
      checkCheckpointFields("state", state, current.state);
      // Earlier v24 writers omit matchPhase. ConnectionState.restore derives it
      // from the scoreboard when absent.
      checkCheckpointFields("conn", state.conn, current.conn, "matchPhase");
      checkCheckpointFields("targets", state.conn.targets, current.targets);
      imported.set(tick, {
        ...checkpoint,
        parser: { ...checkpoint.parser, owner },
      });
    }
    this.checkpointRepository.import(
      imported,
      this.playerPredictionEnabled,
      onRestoreError,
    );
    this.checkpointImportMs += performance.now() - started;
  }

  /** Offline generation loads new collision geometry before simulating each tick. */
  async captureCheckpointAt(
    tick: number,
    prepareWorld: (entities: Iterable<MutableEntity>) => Promise<void>,
  ): Promise<DemoSeekCheckpoint> {
    if (!Number.isSafeInteger(tick) || tick < this.moveTicks)
      throw new Error("Checkpoint targets must be ascending simulation ticks");
    await prepareWorld(this.entities.values());
    while (this.moveTicks < tick) {
      if (!this.readSimulationTick())
        throw new Error("Checkpoint is past the end of the demo");
      await prepareWorld(this.entities.values());
      await this.prepareProjectileAssets();
      this.finishMoveTick();
    }
    if (this.skippedPlayerPrediction)
      throw new Error(
        "Checkpoint generation requires complete collision assets",
      );
    return this.captureCheckpoint();
  }

  private restoreCheckpoint(
    checkpoint: ReturnType<DemoStreamAdapter["captureCheckpoint"]>,
  ): void {
    this.resourceLookahead.reset();
    this.snapshotBeforePendingTick = null;
    this.pendingProjectileEvents = undefined;
    this.previousPlayerViews = this.pendingPlayerViews = undefined;
    this.resetAimHistory();
    this.parser.restoreCheckpoint(checkpoint.parser);
    this.ghostTracker = this.parser.getGhostTracker();
    Object.assign(this, cloneData(checkpoint.cursor));
    // Older checkpoints may have no pending-send history. Resume at their
    // packet sequence so future ACKs measure sends made after the seek.
    if (!checkpoint.cursor.latency)
      this.resetDemoLatency(checkpoint.parser.packetState);
    // Recording attribution belongs to the first discovery, not the seek
    // position. Apply it before restoration publishes mission metadata.
    const info = this.initialMissionInfo;
    const state = checkpoint.simulation.state;
    this.restoreSimulationState({
      ...checkpoint.simulation,
      state: {
        ...state,
        connectedPlayerName:
          info.recorderName ?? this.recorderFallback?.name ?? null,
        connectedClientId: info.recorderName
          ? info.recorderClientId
          : (this.recorderFallback?.clientId ?? null),
        conn: {
          ...state.conn,
          serverDisplayName:
            info.serverDisplayName ?? this.serverNameFallback ?? null,
        },
      },
    });
    // Older checkpoints kept the control packet but rendered orbit-point
    // cameras as free observers. Recover the orbit before the first frame.
    if (
      this.camera?.mode === "observer" &&
      this.lastControlType === "camera" &&
      this.latestControl.data?.cameraMode === CameraMode_OrbitPoint
    ) {
      this.camera = { ...this.camera };
      this.applyObserverCameraMode(this.camera);
    }
    // Checkpoints produced before control-camera interpolation still carry the
    // requested view. Start there so the next recorded toggle can animate.
    if (this.camera && this.camera.controlCameraBlend === undefined) {
      const blend = this.controlCameraFirstPerson() ? 0 : 1;
      this.camera = {
        ...this.camera,
        controlCameraBlend: blend,
        previousControlCameraBlend: blend,
      };
    }
    const mountHead = this.recordedPilotHead();
    if (this.camera && !this.camera.controlMountHead && mountHead) {
      this.camera = { ...this.camera, controlMountHead: mountHead };
    }
    this.exhausted = false;
    this.exhaustedAtBytes = 0;
    this._cachedSnapshot = null;
    this._shapeConstructorCache = null;
  }

  private readonly parser: DemoParser;
  private readonly initialMissionInfo: DemoMissionInfo;
  private readonly controlCameraSpeed: number;
  private readonly initialBlock: {
    dataBlocks: Map<number, { className: string; data: ParsedData }>;
    initialGhosts: Array<{
      index: number;
      type: "create" | "update" | "delete";
      classId?: number;
      parsedData?: ParsedData;
    }>;
    controlObjectGhostIndex: number;
    controlObjectData?: ParsedData;
    targetEntries: Array<{
      targetId: number;
      name?: string;
      typeDescription?: string;
      skin?: string;
      skinPref?: string;
      sensorGroup: number;
      targetData: number;
    }>;
    sensorGroupColors: Array<{
      group: number;
      targetGroup: number;
      r: number;
      g: number;
      b: number;
    }>;
    taggedStrings: Map<number, string>;
    initialEvents: Array<{
      classId: number;
      parsedData?: ParsedData;
    }>;
    demoValues: string[];
    firstPerson: boolean;
  };
  // Demo-specific: move delta tracking for V12-style camera rotation
  private moveTicks = 0;
  private lastRecordedMoveAck = 0;
  private absoluteYaw = 0;
  private absolutePitch = 0;
  private lastAbsYaw = 0;
  private lastAbsPitch = 0;
  private exhausted = false;
  /** Decompressed byte length when `exhausted` latched — new bytes past
   *  this mean the frontier moved and stepping may resume. */
  private exhaustedAtBytes = 0;
  private recorderFallback: { name: string; clientId: number } | null = null;
  private serverNameFallback: string | null = null;

  // Cached snapshot
  private _cachedSnapshot: StreamSnapshot | null = null;
  private _cachedSnapshotTick = -1;
  private _cachedSnapshotGen = -1;
  private previousPlayerViews: ReadonlyMap<string, PlayerTickView> | undefined;
  private pendingPlayerViews: ReadonlyMap<string, PlayerTickView> | undefined;

  constructor(parser: DemoParser, options: DemoStreamingOptions) {
    super();
    this.checkpointRepository = new DemoCheckpointRepository(
      (checkpoint) => this.importCheckpoints([checkpoint]),
      options.checkpointMemoryPolicy,
    );
    this.checkpointsEnabled = options.checkpoints !== false;
    this.groundEffectsEnabled = options.groundEffects !== false;
    this.playerViewsEnabled = options.playerViews !== false;
    this.captureDirectorImpacts = options.directorImpacts === true;
    this.parser = parser;
    this.registry = parser.getRegistry();
    this.ghostTracker = parser.getGhostTracker();
    const initial = parser.initialBlock;
    this.controlCameraSpeed =
      Number.isFinite(initial.cameraSpeed) && initial.cameraSpeed > 0
        ? initial.cameraSpeed
        : PLAYER_CAMERA_SPEED;
    this.initialBlock = {
      dataBlocks: initial.dataBlocks,
      initialGhosts: initial.initialGhosts,
      controlObjectGhostIndex: initial.controlObjectGhostIndex,
      controlObjectData: initial.controlObjectData,
      targetEntries: initial.targetEntries,
      sensorGroupColors: initial.sensorGroupColors,
      taggedStrings: initial.taggedStrings,
      initialEvents: initial.initialEvents,
      demoValues: initial.demoValues,
      firstPerson: initial.firstPerson,
    };
    this.initialMissionInfo = extractMissionInfo(initial.demoValues);

    this.reset();
  }

  // ── StreamEngine abstract implementations ──

  getDataBlockData(dataBlockId: number): ParsedData | undefined {
    const initialBlock = this.initialBlock.dataBlocks.get(dataBlockId);
    if (initialBlock?.data) {
      return initialBlock.data;
    }
    return this.getDataBlockDataMap()?.get(dataBlockId);
  }

  /** Seeded with the initial block's datablocks, then grows with packets. */
  protected getDataBlockDataMap(): ReadonlyMap<number, ParsedData> | undefined {
    return this.parser.getPacketParser().getDataBlockDataMap();
  }

  private _shapeConstructorCache: Map<string, string[]> | null = null;
  private _shapeConstructorCacheSize = -1;

  getShapeConstructorSequences(shapeName: string): string[] | undefined {
    // From-connect recordings (relay watch captures) carry NO datablocks
    // in the initial block — they all arrive as SimDataBlockEvents in
    // the packet stream instead, accumulated by the packet parser. Scan
    // both, and rebuild when more datablocks have arrived, or every
    // player renders with an empty action map and the dead keep walking.
    const packetMap = this.getDataBlockDataMap();
    const size = this.initialBlock.dataBlocks.size + (packetMap?.size ?? 0);
    if (
      !this._shapeConstructorCache ||
      size !== this._shapeConstructorCacheSize
    ) {
      const initial = Array.from(this.initialBlock.dataBlocks.values())
        .filter((db) => db.className === "TSShapeConstructor")
        .map((db) => db.data);
      this._shapeConstructorCache = collectShapeConstructorSequences([
        ...initial,
        ...(packetMap?.values() ?? []),
      ]);
      this._shapeConstructorCacheSize = size;
    }
    return this._shapeConstructorCache.get(shapeName.toLowerCase());
  }

  protected getTimeSec(): number {
    return this.moveTicks * (TICK_DURATION_MS / 1000);
  }

  protected getCameraYawPitch(_data: ParsedData | undefined): {
    yaw: number;
    pitch: number;
  } {
    const hasMoves =
      this.controlMovesAvailable &&
      (this.lastControlType === "player" || this.isObserverOrbit());
    const yaw = hasMoves ? this.absoluteYaw : this.lastAbsYaw;
    const pitch = hasMoves ? this.absolutePitch : this.lastAbsPitch;

    if (hasMoves) {
      this.lastAbsYaw = yaw;
      this.lastAbsPitch = pitch;
    }

    return { yaw, pitch };
  }

  protected getControlPlayerHeadPitch(_pitch: number): number {
    return clamp(this.absolutePitch / MAX_PITCH, -1, 1);
  }

  private isObserverOrbit(): boolean {
    return (
      this.lastControlType === "camera" &&
      (this.lastCameraMode === CameraMode_OrbitObject ||
        this.lastCameraMode === CameraMode_OrbitPoint)
    );
  }

  private recordedPilotHead(): StreamCamera["controlMountHead"] {
    const { data, ghostIndex } = this.latestControl;
    if (
      !this.isPiloting ||
      typeof data?.headX !== "number" ||
      typeof data?.headZ !== "number"
    )
      return;
    const playerId = this.entityIdByGhostIndex.get(ghostIndex);
    const player =
      playerId === undefined ? undefined : this.entities.get(playerId);
    if (
      player?.mountNode !== 0 ||
      this.resolveMountParent(player)?.ghostIndex !== this.lastPilotGhostIndex
    )
      return;
    if (player.damageState) return [data.headZ, data.headX];
    const db =
      player.dataBlockId === undefined
        ? undefined
        : this.getDataBlockData(player.dataBlockId);
    const min =
      typeof db?.minLookAngle === "number" ? db.minLookAngle : -MAX_PITCH;
    const max =
      typeof db?.maxLookAngle === "number" ? db.maxLookAngle : MAX_PITCH;
    const yawLimit =
      typeof db?.maxFreelookAngle === "number"
        ? db.maxFreelookAngle
        : Math.PI / 2;
    let yaw = data.headZ;
    let pitch = data.headX;
    // Player::processTick forwards the moves to the vehicle. The pilot
    // only receives the look deltas while freelooking in seat zero.
    for (const { move } of this.pendingPlayerMoves) {
      if (move.freeLook) {
        const turn = move.yaw ?? 0;
        const tilt = move.pitch ?? 0;
        yaw = clamp(
          yaw + (turn > Math.PI ? turn - 2 * Math.PI : turn),
          -yawLimit,
          yawLimit,
        );
        pitch = clamp(
          pitch + (tilt > Math.PI ? tilt - 2 * Math.PI : tilt),
          min,
          max,
        );
      } else {
        yaw *= 0.5;
        pitch *= 0.5;
      }
    }
    return [yaw, pitch];
  }

  protected override updateCameraAndHud(): void {
    const previous = this.camera?.controlCameraBlend;
    super.updateCameraAndHud();
    if (!this.camera) return;
    this.camera.controlMountHead = this.recordedPilotHead();
    const controlId = this.camera.controlEntityId;
    const controlledTurret =
      controlId != null && this.entities.get(controlId)?.className === "Turret";
    if (!this.latestControl.position && !controlledTurret) {
      this.camera.previousControlCameraBlend = previous;
      return;
    }
    const target = this.controlCameraFirstPerson() ? 0 : 1;
    if (this.moveTicks === 0) {
      const initial = this.parser.initialBlock.cameraPos;
      const blend = Number.isFinite(initial) ? clamp(initial, 0, 1) : target;
      this.camera.controlCameraBlend = this.camera.previousControlCameraBlend =
        blend;
      return;
    }
    // Retail advances by 32 ms in each GameProcessCameraQuery (0x5bbcc0).
    // Demo files record the requested modes but omit render cadence. Advance
    // by the same interval per demo tick so seeking and playback agree.
    const from = previous ?? target;
    this.camera.previousControlCameraBlend = from;
    this.camera.controlCameraBlend = advancePlayerCameraBlend(
      from,
      target === 0,
      TICK_DURATION_MS / 1000,
      this.controlCameraSpeed,
    );
  }

  // ── StreamingPlayback interface ──

  reset(): void {
    this.pendingCheckpointCollision = null;
    this.clearSessionCheckpoints();
    this.predictionModeChanged = false;
    this.collisionReplayComplete = false;
    this.resetToStart();
  }

  private resetToStart(): void {
    this.resourceLookahead.reset();
    this.snapshotBeforePendingTick = null;
    this.pendingProjectileEvents = undefined;
    this.previousPlayerViews = this.pendingPlayerViews = undefined;
    this.resetAimHistory();
    this.skippedPlayerPrediction = false;
    this.parser.reset();
    // parser.reset() creates a fresh GhostTracker internally — refresh our
    // reference so resolveGhostClassName doesn't use the stale one.
    this.ghostTracker = this.parser.getGhostTracker();
    this._cachedSnapshot = null;

    this.resetSharedState();
    this._shapeConstructorCache = null;
    const info = this.initialMissionInfo;
    this.missionDisplayName = info.missionDisplayName;
    this.missionTypeDisplayName = info.missionType;
    this.gameClassName = info.gameClassName;
    this.serverNameFallback ??= info.serverDisplayName;
    this.serverDisplayName = this.serverNameFallback;
    this.connectedPlayerName =
      info.recorderName ?? this.recorderFallback?.name ?? null;
    this.connectedClientId = info.recorderName
      ? info.recorderClientId
      : (this.recorderFallback?.clientId ?? null);

    // Net strings, targets and IFF colors from the initial block.
    this.conn.seedTables({
      taggedStrings: this.initialBlock.taggedStrings,
      targetEntries: this.initialBlock.targetEntries.map((entry) => ({
        ...entry,
        typeDescription: entry.typeDescription ?? "",
      })),
      sensorGroupColors: this.initialBlock.sensorGroupColors,
    });

    // Demo-specific state
    this.moveTicks = 0;
    this.resetDemoLatency(this.parser.initialBlock.connectionState);
    this.absoluteYaw = 0;
    this.absolutePitch = 0;
    this.lastAbsYaw = 0;
    this.lastAbsPitch = 0;
    this.firstPerson = this.initialBlock.firstPerson;
    this.lastControlType =
      detectControlObjectType(this.initialBlock.controlObjectData) ?? "player";
    this.isPiloting =
      this.lastControlType === "player"
        ? !!(
            this.initialBlock.controlObjectData?.pilot ||
            this.initialBlock.controlObjectData?.controlObjectGhost != null
          )
        : false;
    this.lastPilotGhostIndex =
      this.isPiloting &&
      typeof this.initialBlock.controlObjectData?.controlObjectGhost ===
        "number"
        ? this.initialBlock.controlObjectData.controlObjectGhost
        : undefined;
    if (this.isPiloting) {
      const nested = this.initialBlock.controlObjectData?.controlObjectData as
        ParsedData | undefined;
      const ang = nested?.angPosition as
        { x: number; y: number; z: number; w: number } | undefined;
      if (ang && typeof ang.w === "number") {
        this.lastVehicleHeading = torqueQuatHeading(ang);
        this.lastVehiclePitch = torqueQuatPitch(ang);
        const threeQ = torqueQuatToThreeJS(ang);
        if (threeQ) {
          const [qx, qy, qz, qw] = threeQ;
          const fx = 1 - 2 * (qy * qy + qz * qz);
          const fy = 2 * (qx * qy + qz * qw);
          const fz = 2 * (qx * qz - qy * qw);
          this.lastVehicleOrbitDir = [-fx, -fy, -fz];
        }
      }
    }
    this.lastCameraMode =
      this.lastControlType === "camera" &&
      typeof this.initialBlock.controlObjectData?.cameraMode === "number"
        ? this.initialBlock.controlObjectData.cameraMode
        : undefined;
    this.lastOrbitGhostIndex =
      this.lastControlType === "camera" &&
      typeof this.initialBlock.controlObjectData?.orbitObjectGhostIndex ===
        "number"
        ? this.initialBlock.controlObjectData.orbitObjectGhostIndex
        : undefined;
    this.lastOrbitDistance =
      this.lastControlType === "camera"
        ? observerOrbitDistance(this.initialBlock.controlObjectData)
        : undefined;
    const initialAbsRot = this.getAbsoluteRotation(
      this.initialBlock.controlObjectData,
    );
    if (initialAbsRot) {
      this.absoluteYaw = initialAbsRot.yaw;
      this.absolutePitch = initialAbsRot.pitch;
      this.lastAbsYaw = initialAbsRot.yaw;
      this.lastAbsPitch = initialAbsRot.pitch;
    }
    const initial = this.parser.initialBlock;
    const { firstMoveIndex } = initial;
    this.lastRecordedMoveAck = firstMoveIndex;
    this.pendingPlayerMoves = initial.moves.map((move, i) => ({
      id: firstMoveIndex + i,
      move: unclampMove(move),
    }));
    this.nextPlayerMoveId = firstMoveIndex + this.pendingPlayerMoves.length;
    this.lastClientMoveId = initial.lastClientMove;
    this.validateControlMoves();
    this.exhausted = false;
    this.latestFov = 100;
    this.latestControl = {
      ghostIndex: this.initialBlock.controlObjectGhostIndex,
      data: this.initialBlock.controlObjectData,
      position: isValidPosition(
        this.initialBlock.controlObjectData?.position as Vec3,
      )
        ? (this.initialBlock.controlObjectData?.position as Vec3)
        : undefined,
    };
    this.withProjectileGhostBatch(() => {
      for (const ghost of this.initialBlock.initialGhosts) {
        if (ghost.type !== "create" || ghost.classId == null) continue;
        this.processGhostUpdate(ghost);
      }
    }, true);

    if (this.latestControl.data)
      this.correctControlPlayer(this.latestControl.data as PlayerPacketData);

    // Resolve control player entity ID from the ghost index map.
    this.controlPlayerGhostId =
      this.lastControlType === "player" &&
      this.initialBlock.controlObjectGhostIndex >= 0
        ? this.entityIdByGhostIndex.get(
            this.initialBlock.controlObjectGhostIndex,
          )
        : undefined;

    // The recording connection's sensor group, which Tribes2.exe's HUD
    // colors by. SetSensorGroupEvents change it from here.
    this.conn.playerSensorGroup = initial.sensorGroup;
    // Without one, derive it from the control player entity.
    if (
      this.conn.playerSensorGroup === 0 &&
      this.lastControlType === "player" &&
      this.latestControl.ghostIndex >= 0
    ) {
      const ctrlId = this.entityIdByGhostIndex.get(
        this.latestControl.ghostIndex,
      );
      const ctrlEntity = ctrlId ? this.entities.get(ctrlId) : undefined;
      if (ctrlEntity?.sensorGroup != null && ctrlEntity.sensorGroup > 0) {
        this.conn.playerSensorGroup = ctrlEntity.sensorGroup;
      }
    }

    // Saved events are pending, not snapshot state. DemoParser dispatches
    // them with the first packet; applying them here too duplicates match
    // boundaries and other server-message side effects.

    // Seed HUD state from demoValues
    const parsed = parseDemoValues(this.initialBlock.demoValues);
    // recordings.cs setState(GRAVITY): the recorder's world gravity.
    this.worldGravity = parsed.gravity;
    if (parsed.weaponsHud) {
      this.weaponsHud.slots = parsed.weaponsHud.slots;
      this.weaponsHud.activeIndex = parsed.weaponsHud.activeIndex;
    }
    if (parsed.backpackHud) {
      this.backpackHud.packIndex = parsed.backpackHud.packIndex;
      this.backpackHud.active = parsed.backpackHud.active;
      this.backpackHud.text = parsed.backpackHud.text;
    }
    if (parsed.inventoryHud) {
      this.inventoryHud.slots = parsed.inventoryHud.slots;
      this.inventoryHud.activeSlot = parsed.inventoryHud.activeSlot;
    }
    this.conn.teamScores = parsed.teamScores.map(({ teamId, name, score }) => ({
      teamId,
      name,
      score,
    }));
    this.conn.phase = matchPhaseFromScoreboard(
      this.gameClassName,
      parsed.teamScores,
    );
    this.conn.playerRoster = new Map(parsed.playerRoster);
    this.conn.flags = new Map(parsed.flags.map((flag) => [flag.teamId, flag]));
    refreshFlagCarriers(this.conn.flags, this.conn.resolvePlayers());
    if (parsed.clockTimeMin != null) {
      // Reproduce clockHud.setTime(getTime()) at demo start (timeSec=0).
      this.conn.clock = {
        anchorSec: 0,
        durationMs: parsed.clockTimeMin * 60 * 1000,
      };
    }
    // Seed chat messages from demoValues
    for (const rawLine of parsed.chatMessages) {
      const segments = parseColorSegments(rawLine);
      if (!segments.length) continue;
      const fullText = segments.map((s) => s.text).join("");
      if (!fullText.trim()) continue;
      const primaryColor = segments[0].colorCode;
      const hasChatColor = segments.some(
        (s) => s.colorCode === 3 || s.colorCode === 4,
      );
      const isPlayerChat = hasChatColor && fullText.includes(": ");
      if (isPlayerChat) {
        const colonIdx = fullText.indexOf(": ");
        this.pushChatMessage({
          timeSec: 0,
          sender: fullText.slice(0, colonIdx),
          text: fullText.slice(colonIdx + 2),
          kind: "chat",
          colorCode: primaryColor,
          segments,
        });
      } else {
        this.pushChatMessage({
          timeSec: 0,
          sender: "",
          text: fullText,
          kind: "server",
          colorCode: primaryColor,
          segments,
        });
      }
    }

    this.updateCameraAndHud();
  }

  /** Inspect only a small available prefix, then rewind for normal playback. */
  probeRecordingMetadata(): void {
    if (this.connectedPlayerName && this.serverDisplayName) return;
    try {
      this.inferRecorderFromControlPlayer();
      while (
        (!this.connectedPlayerName || !this.serverDisplayName) &&
        this.getTimeSec() + TICK_DURATION_MS / 1000 <= METADATA_PROBE_MAX_SEC &&
        this.parser.blockCursor < METADATA_PROBE_MAX_BLOCKS
      ) {
        // Metadata comes from packet state, not simulated movement. Decode
        // the prefix without advancing animations, prediction, or effects.
        if (!this.readMoveTick(METADATA_PROBE_MAX_BLOCKS)) break;
        this.moveTicks += 1;
      }
    } catch {
      // Metadata is best effort. Rewinding lets normal playback report any
      // malformed packet at its original time instead of failing the load.
    } finally {
      if (this.connectedPlayerName && this.connectedClientId != null) {
        this.recorderFallback ??= {
          name: this.connectedPlayerName,
          clientId: this.connectedClientId,
        };
      }
      this.serverNameFallback ??= this.serverDisplayName;
      this.reset();
    }
  }

  setServerNameFallback(serverName: string): void {
    const name = stripTaggedStringMarkup(serverName).trim();
    if (!name) return;
    const previousName = this.serverDisplayName;
    this.updateServerDisplayName(name);
    if (this.serverDisplayName !== previousName) this.onMissionInfoChange?.();
  }

  protected override updateServerDisplayName(name: string): void {
    if (!name) return;
    this.serverNameFallback ??= name;
    this.serverDisplayName = this.serverNameFallback;
  }

  protected override updateConnectedPlayerName(
    name: string,
    clientId: number,
  ): void {
    this.recorderFallback ??= { name, clientId };
    this.connectedPlayerName = this.recorderFallback.name;
    this.connectedClientId = this.recorderFallback.clientId;
    this._cachedSnapshot = null;
  }

  private inferRecorderFromControlPlayer(): void {
    if (
      this.connectedPlayerName ||
      this.recorderFallback ||
      this.getTimeSec() > METADATA_PROBE_MAX_SEC ||
      this.parser.blockCursor > METADATA_PROBE_MAX_BLOCKS ||
      this.lastControlType !== "player"
    )
      return;
    // Camera/HUD state is updated only on movement ticks; packet control
    // changes can happen more than once before the next tick.
    const controlId = this.entityIdByGhostIndex.get(
      this.latestControl.ghostIndex,
    );
    const player = controlId ? this.entities.get(controlId) : undefined;
    if (player?.className !== "Player" || player.targetId == null) return;
    const matches = [...this.conn.playerRoster].filter(
      ([, entry]) => entry.targetId === player.targetId,
    );
    if (matches.length !== 1) return;
    const [clientId, entry] = matches[0];
    const name = stripTaggedStringMarkup(entry.name).trim();
    if (!name) return;
    this.updateConnectedPlayerName(name, clientId);
    this.onMissionInfoChange?.();
  }

  getSnapshot(): StreamSnapshot {
    return (
      this.snapshotBeforePendingTick ??
      this.currentSnapshot() ??
      this.rebuildSnapshot()
    );
  }

  get projectileAssetBoundarySec(): number | undefined {
    return this.snapshotBeforePendingTick ? this.getTimeSec() : undefined;
  }

  getPlayerAim(entityId: string): DemoPlayerAim | undefined {
    if (
      !this.playerViewsEnabled ||
      !this.parser.isComplete ||
      this.pendingPlayerViews ||
      this.aimHistory.at(-1)?.tick !== this.moveTicks
    )
      return undefined;

    if (
      this.aimResult?.tick === this.moveTicks &&
      this.aimResult.entityId === entityId
    )
      return this.aimResult.view;

    const entity = this.entities.get(entityId);
    const previous = this.previousPlayerViews?.get(entityId);
    if (
      !entity?.viewQuantized ||
      entity.damageState ||
      entity.mountObjectGhostIndex != null ||
      entity.ghostIndex === this.latestControl.ghostIndex ||
      !entity.reconstructedAim ||
      !previous?.viewQuantized ||
      previous.damageState ||
      previous.mountObjectId ||
      !previous.reconstructedAim
    )
      return undefined;

    const tick = this.moveTicks;
    const ticks = this.aimHistory.map((frame, index): DemoAimTick => {
      const data = frame.players.get(entityId);
      const nextFrame = this.aimHistory[index + 1];
      const estimate = nextFrame
        ? nextFrame.previousViews?.get(entityId)?.reconstructedAim
        : entity.reconstructedAim;
      return {
        tick: frame.tick,
        estimate,
        observations: data?.observations ?? [],
        cut: data?.cut || !estimate,
      };
    });
    const future = this.aimLookahead.read(
      this.parser,
      tick,
      entity.ghostIndex,
      this.latestControl.ghostIndex,
    );
    ticks.push(...future);
    const current = fitDemoAim(ticks, tick) ?? entity.reconstructedAim;
    const cut = this.aimHistory.at(-1)?.players.get(entityId)?.cut;
    const view = {
      current,
      previous: cut
        ? current
        : (fitDemoAim(ticks, tick - 1) ?? previous.reconstructedAim),
    };
    this.aimResult = { tick, entityId, view };
    return view;
  }

  private resetAimHistory(): void {
    this.pendingAimObservations.clear();
    this.aimHistory.length = 0;
    this.aimLookahead.reset();
    this.aimResult = undefined;
  }

  /** The cached snapshot, unless the tick or the entity set has moved on. */
  private currentSnapshot(): StreamSnapshot | null {
    // A download may finish with packets after its final move tick.
    if (
      this.exhausted &&
      this.parser.isComplete &&
      this.pendingAimObservations.size
    )
      return null;
    return this._cachedSnapshotTick === this.moveTicks &&
      this._cachedSnapshotGen === this.entityGeneration
      ? this._cachedSnapshot
      : null;
  }

  private rebuildSnapshot(): StreamSnapshot {
    if (this.exhausted && this.parser.isComplete) this.commitAimObservations();
    const snapshot = this.buildSnapshot(this.exhausted);
    snapshot.previousPlayerViews = this.previousPlayerViews?.size
      ? this.previousPlayerViews
      : undefined;
    if (this.exhausted && this.pendingPlayerViews?.size)
      snapshot.bufferingPlayerViews = this.pendingPlayerViews;
    this._cachedSnapshot = snapshot;
    this._cachedSnapshotTick = this.moveTicks;
    this._cachedSnapshotGen = this.entityGeneration;
    return snapshot;
  }

  protected getPreloadShapeNames(): string[] {
    // Initial block only: the parser keeps no class names for datablocks
    // that arrive in packets (from-connect recordings).
    return collectPreloadShapeNames(this.initialBlock.dataBlocks.values());
  }

  getResourceLookahead(targetTimeSec: number) {
    const targetTick =
      Number.isFinite(targetTimeSec) && !this.snapshotBeforePendingTick
        ? streamTimeToTick(targetTimeSec)
        : this.moveTicks;
    return this.resourceLookahead.read(
      this.parser,
      this.moveTicks,
      targetTick,
      () => ({
        netStrings: this.conn.netStrings,
        targets: this.conn.targets,
        entities: this.entities.values(),
      }),
    );
  }

  // A cold seek can precede collision asset loading. Allow one repair after
  // assets arrive so collider remounts cannot cause an endless replay loop.
  // A change to the effective interpolation settings starts a new repair cycle.
  private collisionReplayComplete = false;
  get canStartSeek(): boolean {
    if (this.checkpointRepository.wait) return false;
    if (!this.checkpointCollisionReady()) return false;
    // A failed download must not leave transport waiting forever. Prediction
    // stays disabled until real geometry arrives; recorded poses still work.
    // After the startup repair, collider remounts cannot trigger another replay.
    return (
      !this.playerPredictionEnabled ||
      this.collisionReplayComplete ||
      this.playerCollisionReady(true)
    );
  }

  get needsReplay(): boolean {
    return (
      this.predictionModeChanged ||
      (!this.collisionReplayComplete &&
        this.skippedPlayerPrediction &&
        this.playerCollisionReady())
    );
  }

  stepToTime(
    targetTimeSec: number,
    maxMoveTicks = Number.POSITIVE_INFINITY,
    maxTimeMs = Number.POSITIVE_INFINITY,
    allowForwardCheckpoint = true,
  ): StreamSnapshot {
    const deadline = Number.isFinite(maxTimeMs)
      ? performance.now() + Math.max(0, maxTimeMs)
      : Number.POSITIVE_INFINITY;
    this.unlatchExhaustedIfGrown();
    const safeTargetSec = Number.isFinite(targetTimeSec)
      ? Math.max(0, targetTimeSec)
      : 0;
    const targetTicks = streamTimeToTick(safeTargetSec);
    if (!this.checkpointCollisionReady()) return this.getSnapshot();

    let didReset = false;
    if (this.needsReplay) {
      if (!this.predictionModeChanged) this.collisionReplayComplete = true;
      this.predictionModeChanged = false;
      // A pass without prediction/collision cannot seed accurate later seeks.
      this.clearSessionCheckpoints();
      this.resetToStart();
      didReset = true;
    }
    if (
      this.checkpointRepository.prepareIndexed(
        targetTicks,
        this.moveTicks,
        allowForwardCheckpoint,
        this.playerPredictionEnabled,
      )
    ) {
      this.lastStepStartTimeSec = this.getTimeSec();
      return this.getSnapshot();
    }

    // A replacement seek can land immediately before a staged tick, after
    // the previous seek already passed that boundary without publishing it.
    // Reconstruct that single endpoint through the normal seek path.
    const missingSeekBoundary =
      allowForwardCheckpoint &&
      targetTicks === this.moveTicks &&
      this.snapshotBeforePendingTick !== null &&
      streamTimeToTick(this.snapshotBeforePendingTick.timeSec) < this.moveTicks;
    if (targetTicks < this.moveTicks || allowForwardCheckpoint) {
      const checkpointTick = this.checkpointRepository.nearestTick(targetTicks);
      if (
        targetTicks < this.moveTicks ||
        missingSeekBoundary ||
        (checkpointTick !== undefined && checkpointTick > this.moveTicks)
      ) {
        const checkpoint =
          checkpointTick === undefined
            ? undefined
            : this.checkpointRepository.get(checkpointTick);
        const imported =
          checkpointTick === undefined
            ? undefined
            : this.checkpointRepository.getImported(checkpointTick);
        const previousCollision = imported
          ? this.captureCollisionWorld()
          : null;
        let restored = false;
        if (checkpoint) {
          try {
            this.restoreCheckpoint(checkpoint);
            restored = true;
            if (imported && checkpointTick !== undefined) {
              this.checkpointRepository.touchImported(checkpointTick);
            }
          } catch (error) {
            if (!imported || checkpointTick === undefined) throw error;
            this.checkpointRepository.rejectAnchor(checkpointTick);
            log.warn(
              { err: error, tick: checkpointTick },
              "Skipping unusable demo checkpoint",
            );
            try {
              imported.onRestoreError?.(error);
            } catch (reportError) {
              log.warn(
                { err: reportError },
                "Could not report unusable demo checkpoint",
              );
            }
          }
        }
        if (!restored) this.resetToStart();
        didReset = true;
        if (restored && imported) {
          this.collisionReplayComplete = false;
          this.pendingCheckpointCollision = previousCollision;
          if (
            this.playerPredictionEnabled &&
            !this.checkpointCollisionReady()
          ) {
            this.lastStepStartTimeSec = this.getTimeSec();
            return this.getSnapshot();
          }
        }
      }
    }

    // Match snapshot rounding so forward progress never looks like a rewind.
    this.lastStepStartTimeSec = this.getTimeSec();
    const wasExhausted = this.exhausted;
    let movesProcessed = 0;
    // The same simulation ticks drive playback and seeks. Skipping prediction
    // can preserve the last packet pose while losing intermediate animation state.
    while (
      !this.exhausted &&
      this.moveTicks < targetTicks &&
      movesProcessed < maxMoveTicks &&
      // Yield only between complete simulation ticks, always making progress.
      (movesProcessed === 0 ||
        deadline === Number.POSITIVE_INFINITY ||
        performance.now() < deadline)
    ) {
      if (!this.stepOneMoveTick()) break;
      movesProcessed += 1;
    }

    if (this.snapshotBeforePendingTick) return this.snapshotBeforePendingTick;
    if (movesProcessed === 0 && !didReset && wasExhausted === this.exhausted) {
      const cached = this.currentSnapshot();
      if (cached) return cached;
    }
    return this.rebuildSnapshot();
  }

  /**
   * The first playback time at which there is a scene to render — visible
   * world geometry (terrain or an interior) AND a camera. Retail demos
   * carry this in their initial block, so it's ~0; a from-connect relay
   * demo streams the scene in over its first seconds, so a paused start
   * would otherwise show black. Steps the cursor forward from its current
   * position; returns 0 (no skip) if nothing renders within `maxSec`.
   */
  /**
   * False while a progressive download is still feeding the parser:
   * an exhausted snapshot then means "buffering at the frontier", not
   * the end of the demo (the transport clamps instead of pausing).
   */
  get streamComplete(): boolean {
    return this.parser.isComplete;
  }

  protected override get missileLockWorldReady(): boolean {
    // A mid-mission recording starts with its scoped ghosts already present.
    return (
      super.missileLockWorldReady || this.initialBlock.initialGhosts.length > 0
    );
  }

  /**
   * Demo time buffered so far, in seconds — exact, from the count of
   * fixed-32ms move-tick blocks in the decompressed stream (compressed
   * BYTE progress would misplace the mark badly: quiet stretches pack
   * far denser than fights). Equals the duration once complete.
   */
  get bufferedSec(): number {
    return (this.parser.bufferedMoveTicks * TICK_DURATION_MS) / 1000;
  }

  /**
   * During a progressive download, "exhausted" only means the frontier
   * of the data received when it latched — un-latch when the stream has
   * grown since. (Keyed on byte growth, not isComplete: data that
   * arrives together with finish() would otherwise stay latched.)
   */
  private unlatchExhaustedIfGrown(): void {
    if (
      this.exhausted &&
      this.parser.decompressedByteLength > this.exhaustedAtBytes
    ) {
      this.exhausted = false;
    }
  }

  findSceneReadyTime(maxSec = 20): number {
    this.unlatchExhaustedIfGrown();
    const limitTicks =
      this.moveTicks + Math.floor((maxSec * 1000) / TICK_DURATION_MS);
    while (this.moveTicks < limitTicks && !this.exhausted) {
      if (this.camera != null && this.hasRenderableWorld()) {
        return this.getTimeSec();
      }
      if (!this.stepOneMoveTick()) break;
    }
    return 0;
  }

  /** Whether any static world geometry (terrain / interior) is present. */
  private hasRenderableWorld(): boolean {
    for (const entity of this.entities.values()) {
      const className = entity.sceneData?.className;
      if (className === "TerrainBlock" || className === "InteriorInstance") {
        return true;
      }
    }
    return false;
  }

  // ── Demo block processing ──

  /** The published frame held while the next tick's packets are staged. */
  private snapshotBeforePendingTick: StreamSnapshot | null = null;

  private readSimulationTick(): boolean {
    if (this.snapshotBeforePendingTick) return true;
    const previous = this._cachedSnapshot ?? this.rebuildSnapshot();
    this.pendingProjectileEvents = [];
    if (!this.readMoveTick()) {
      this.flushProjectileEvents();
      return false;
    }
    this.snapshotBeforePendingTick = previous;
    return true;
  }

  private stepOneMoveTick(): boolean {
    if (!this.readSimulationTick() || this.prepareProjectileAssets())
      return false;
    this.finishMoveTick();
    return true;
  }

  private finishMoveTick(): void {
    this.snapshotBeforePendingTick = null;
    this.moveTicks += 1;
    this.processTick();
    if (this.playerViewsEnabled) {
      const players = this.pendingAimObservations;
      this.commitAimObservations();
      this.aimHistory.push({
        tick: this.moveTicks,
        players,
        previousViews: this.pendingPlayerViews,
      });
      if (this.aimHistory.length > DEMO_AIM_LOOKAHEAD_TICKS + 2)
        this.aimHistory.shift();
    }
    this.previousPlayerViews = this.pendingPlayerViews;
    this.pendingPlayerViews = undefined;
    this.flushProjectileEvents();
    if (
      this.checkpointsEnabled &&
      this.checkpointRepository.sessionCaptureEnabled &&
      this.moveTicks % DEMO_CHECKPOINT_TICKS === 0 &&
      !this.checkpointRepository.has(this.moveTicks)
    ) {
      this.checkpointRepository.addSession(
        this.moveTicks,
        this.captureCheckpoint(),
      );
    }
  }

  private readMoveTick(blockLimit?: number): boolean {
    // A partial download may deliver packets before their move tick. Preserve
    // the pre-packet endpoint until that tick completes, including its retries.
    if (this.playerViewsEnabled && !this.pendingPlayerViews) {
      const views = new Map<string, PlayerTickView>();
      for (const entity of this.entities.values()) {
        if (entity.type !== "Player") continue;
        views.set(entity.id, {
          rotation: entity.rotation ? [...entity.rotation] : undefined,
          headPitch: entity.headPitch,
          headYaw: entity.headYaw,
          damageState: entity.damageState,
          viewQuantized: entity.viewQuantized,
          reconstructedAim: entity.reconstructedAim,
          mountObjectId: this.resolveMountParent(entity)?.id,
          mountNode: entity.mountNode,
        });
      }
      this.pendingPlayerViews = views;
    }
    const packets = this.parser.getPacketParser();
    while (true) {
      if (
        blockLimit != null &&
        (this.parser.blockCursor >= blockLimit ||
          (this.connectedPlayerName && this.serverDisplayName))
      )
        return false;
      const rejected = packets.protocolRejected;
      const noDispatch = packets.protocolNoDispatch;
      const block = this.parser.nextBlock();
      if (!block) {
        this.exhausted = true;
        this.exhaustedAtBytes = this.parser.decompressedByteLength;
        // Info/packet FOV updates can follow the last movement tick (also
        // at a progressive download's frontier). Publish them without
        // advancing the simulation or mutating the previous snapshot.
        if (this.camera && this.camera.fov !== this.latestFov) {
          this.camera = { ...this.camera, fov: this.latestFov };
        }
        return false;
      }
      assertDemoBlockParsed(block, this.moveTicks * (TICK_DURATION_MS / 1000));

      // Recorded packets use the same ConnectionProtocol dispatch gate as live
      // packets. Keepalives/duplicates must not apply the parser's empty game state.
      if (packets.protocolRejected > rejected) continue;
      if (this.playerPredictionEnabled) this.updateDemoLatency(block);
      if (packets.protocolNoDispatch > noDispatch) continue;
      this.handleBlock(block);

      if (block.type === BlockTypeMove) {
        return true;
      }
    }
  }

  protected override applyGhostData(
    entity: MutableEntity,
    data: ParsedData | undefined,
    precipitationSeed?: PrecipitationState,
    initial?: boolean,
  ): void {
    const wasAlive = !entity.damageState;
    super.applyGhostData(entity, data, precipitationSeed, initial);
    if (!this.playerViewsEnabled || entity.type !== "Player") return;
    const unavailable =
      !entity.viewQuantized ||
      entity.mountObjectGhostIndex != null ||
      entity.damageState;
    if (unavailable || isDemoAimCut(data)) this.cutAim(entity);
    if (data?.allowWarp === false || (wasAlive && entity.damageState)) {
      const previous = this.pendingPlayerViews?.get(entity.id);
      if (previous && !previous.aimCut) {
        // A progressive snapshot may still reference the pre-packet views.
        this.pendingPlayerViews = new Map(this.pendingPlayerViews).set(
          entity.id,
          { ...previous, aimCut: true },
        );
      }
    }
    if (unavailable) return;
    const observation = readDemoAimSample(data);
    if (!observation) return;
    const pending = this.pendingAimObservations.get(entity.id);
    if (pending) pending.observations.push(observation);
    else
      this.pendingAimObservations.set(entity.id, {
        observations: [observation],
      });
  }

  private cutAim(entity: MutableEntity): void {
    entity.reconstructedAim = undefined;
    entity.aimObservationTick = undefined;
    this.pendingAimObservations.set(entity.id, { observations: [], cut: true });
  }

  private cutAimForGhost(ghostIndex: number): void {
    const id = this.entityIdByGhostIndex.get(ghostIndex);
    const entity = id ? this.entities.get(id) : undefined;
    if (entity?.type === "Player") this.cutAim(entity);
  }

  private commitAimObservations(): void {
    const pending = this.pendingAimObservations;
    this.pendingAimObservations = new Map();
    for (const [id, { observations }] of pending) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      const latest = observations.at(-1);
      if (!entity.viewQuantized || !latest?.move) {
        entity.reconstructedAim = undefined;
        entity.aimObservationTick = undefined;
        continue;
      }
      // Causal estimate uses the latest Move once. The camera fit also sees
      // the ordered pose observations from this tick.
      entity.reconstructedAim = reconstructQuantizedAim(
        entity.reconstructedAim,
        latest,
        entity.aimObservationTick === undefined
          ? 1
          : this.moveTicks - entity.aimObservationTick,
      );
      entity.aimObservationTick = this.moveTicks;
    }
  }

  private handleBlock(block: { type: number; parsed?: unknown }): void {
    if (block.type === BlockTypePacket && this.isPacketData(block.parsed)) {
      const packet = block.parsed;

      // Process control object
      const controlIndex = packet.gameState.controlObjectGhostIndex;
      if (
        this.playerViewsEnabled &&
        controlIndex != null &&
        controlIndex !== this.latestControl.ghostIndex
      ) {
        this.cutAimForGhost(this.latestControl.ghostIndex);
        this.cutAimForGhost(controlIndex);
      }
      this.processControlObject(packet.gameState);
      this.processMissileLock(packet);

      // Apply ghost rotation to absolute tracking. This must happen before
      // the next move delta so that our tracking stays calibrated to V12.
      // During piloting, rotationZ/headX are relative to the vehicle (reset
      // to 0 on mount). We still accept the reset so move deltas accumulate
      // from the correct base; the vehicle heading offset is added later in
      // updateCameraAndHud.
      const controlData = packet.gameState.controlObjectData;
      if (controlData) {
        const absRot = this.getAbsoluteRotation(controlData);
        if (absRot) {
          this.absoluteYaw = absRot.yaw;
          this.absolutePitch = absRot.pitch;
          this.lastAbsYaw = absRot.yaw;
          this.lastAbsPitch = absRot.pitch;
        }
      }

      this.withProjectileGhostBatch(() => {
        for (const evt of packet.events) {
          const eventName = this.registry.getEventParser(evt.classId)?.name;
          this.processEvent(evt, eventName);
        }

        for (const ghost of packet.ghosts) {
          this.processGhostUpdate(ghost);
        }
      });
      this.lastRecordedMoveAck = Math.max(
        this.lastRecordedMoveAck,
        packet.gameState.lastMoveAck,
      );
      this.acknowledgeMoves(packet.gameState.lastMoveAck, controlData);
      this.inferRecorderFromControlPlayer();

      return;
    }

    if (block.type === BlockTypeInfo && this.isInfoData(block.parsed)) {
      // InfoBlock: $firstPerson flag + camera FOV, decoded by the parser
      // the way GameConnection::handleRecordedBlock reads them.
      this.firstPerson = block.parsed.firstPerson;
      if (Number.isFinite(block.parsed.cameraFov)) {
        this.latestFov = block.parsed.cameraFov;
      }
      return;
    }

    if (block.type === BlockTypeMove && this.isMoveData(block.parsed)) {
      this.validateControlMoves(1);
      if (!this.controlMovesAvailable) return;
      this.collectMove(block.parsed as PlayerMove);
      // Replicate V12 Player::updateMove(): apply delta then wrap/clamp.
      this.absoluteYaw += block.parsed.yaw ?? 0;
      const TWO_PI = Math.PI * 2;
      this.absoluteYaw = ((this.absoluteYaw % TWO_PI) + TWO_PI) % TWO_PI;
      const observer = this.isObserverOrbit();
      const pitchLimit = observer ? MAX_OBSERVER_PITCH : MAX_PITCH;
      const pitch = block.parsed.pitch ?? 0;
      this.absolutePitch = clamp(
        this.absolutePitch +
          (observer && pitch > Math.PI ? pitch - TWO_PI : pitch),
        -pitchLimit,
        pitchLimit,
      );
    }
  }

  private validateControlMoves(incoming = 0): void {
    // The replay queue omits camera moves and all inputs during headless scans.
    // Validate the connection's move indices independently of that queue.
    if (
      !this.controlMovesAvailable ||
      this.nextPlayerMoveId + incoming - this.lastRecordedMoveAck <=
        MAX_RECORDED_PENDING_MOVES
    )
      return;
    // Older relay demos synthesized timing blocks the server never received,
    // so they can violate the native input-queue limit. This does not
    // identify the recorder: any such input history is unusable. Recover
    // from packet movement state instead of replaying an unbounded queue or
    // freezing the entire viewer.
    this.pendingPlayerMoves.length = 0;
    this.controlMovesAvailable = false;
    const id = this.entityIdByGhostIndex.get(this.latestControl.ghostIndex);
    if (id) this.entities.get(id)?.playerPrediction?.discardMove();
  }

  // ── Type guards ──

  private isPacketData(parsed: unknown): parsed is PacketData {
    return (
      !!parsed &&
      typeof parsed === "object" &&
      "gameState" in parsed &&
      "events" in parsed &&
      "ghosts" in parsed
    );
  }

  private isMoveData(
    parsed: unknown,
  ): parsed is { yaw?: number; pitch?: number } {
    return !!parsed && typeof parsed === "object" && "yaw" in parsed;
  }

  private isInfoData(
    parsed: unknown,
  ): parsed is { firstPerson: boolean; cameraFov: number } {
    return (
      !!parsed &&
      typeof parsed === "object" &&
      "firstPerson" in parsed &&
      typeof (parsed as { firstPerson?: unknown }).firstPerson === "boolean" &&
      "cameraFov" in parsed &&
      typeof (parsed as { cameraFov?: unknown }).cameraFov === "number"
    );
  }
}

export async function createDemoStreamingRecording(
  data: ArrayBuffer,
  options: DemoStreamingOptions & {
    /** Recover unfinished recordings or interrupted downloads (default: true). */
    allowPartial?: boolean;
  } = {},
): Promise<StreamRecording> {
  const parser = await loadDemoParser(new Uint8Array(data), options);
  return createRecordingFromParser(parser, options);
}

/**
 * Build a recording around an already-load()ed parser — the progressive
 * download path constructs an incremental parser from the first chunks
 * and keeps push()ing while this recording is already playing. Unfinished
 * recordings have no header duration; their duration grows with buffered ticks.
 */
export function createRecordingFromParser(
  parser: DemoParser,
  options: DemoStreamingOptions = {},
): StreamRecording {
  const header = parser.header;
  const initialBlock = parser.initialBlock;
  const info = extractMissionInfo(initialBlock.demoValues);
  const playback = new DemoStreamAdapter(parser, options);
  playback.probeRecordingMetadata();

  return {
    source: "demo",
    get duration() {
      return header.demoLengthMs > 0
        ? header.demoLengthMs / 1000
        : playback.bufferedSec;
    },
    missionName: initialBlock.missionName ?? null,
    gameType: info.missionType,
    serverDisplayName: playback.serverDisplayName,
    recorderName: playback.connectedPlayerName,
    recordingDate: info.recordingDate,
    streamingPlayback: playback,
  };
}

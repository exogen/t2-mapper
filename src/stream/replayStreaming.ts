import type {
  Move,
  PacketData,
  ParsedData,
  PlayerPacketData,
} from "t2-demo-parser";
import type { ReplayState, ReplayServerMessage } from "../../relay/replayTypes";
import type { WatchCatchupPayload } from "../../relay/types";
import { clamp } from "../mathUtils";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import { MAX_PITCH, STREAM_TICK_SEC } from "./streamHelpers";
import type { StreamSnapshot } from "./types";

/** Live packet rendering with authoritative pause/seek snapshots and recorded inputs. */
export class ReplayStreamAdapter extends LiveStreamAdapter {
  readonly localSpectator = true;
  playbackRevision = 0;
  sourceTick = 0;
  private sessionId: string | null = null;
  private epoch = -1;
  private frozenTick: number | null = 0;
  private absoluteYaw = 0;
  private absolutePitch = 0;
  private recordedMoveAck = 0;
  private pendingControlReconstruction = false;
  private controlMoveReplayStartId = 0;

  constructor(relay: RelayClient) {
    super(relay, { mode: "watch" });
  }

  override hydrate(payload: WatchCatchupPayload): void {
    if (!payload.replay)
      throw new Error("Replay catch-up is missing its playback state");
    this.pendingControlReconstruction = false;
    super.hydrate(payload);
    this.pendingControlReconstruction =
      this.lastControlType === "player" &&
      !this.isPiloting &&
      this.pendingPlayerMoves.some(
        ({ id }) => id >= this.controlMoveReplayStartId,
      ) &&
      !this.playerCollisionReady();
    if (this.latestControl.data)
      this.correctControlPlayer(
        this.latestControl.data as PlayerPacketData,
        this.pendingPlayerMoves.filter(
          ({ id }) => id >= this.controlMoveReplayStartId,
        ),
      );
    this.updateCameraAndHud();
    this.invalidateSnapshot();
    this.playbackRevision++;
  }

  override getSnapshot(): StreamSnapshot {
    if (this.pendingControlReconstruction && this.playerCollisionReady()) {
      this.pendingControlReconstruction = false;
      if (this.latestControl.data) {
        this.correctControlPlayer(
          this.latestControl.data as PlayerPacketData,
          this.pendingPlayerMoves.filter(
            ({ id }) => id >= this.controlMoveReplayStartId,
          ),
        );
        // This reconstruction already consumed the suffix; future live ticks
        // may apply only inputs collected after it.
        this.lastClientMoveId = this.nextPlayerMoveId;
        this.updateCameraAndHud();
        this.invalidateSnapshot();
      }
    }
    return super.getSnapshot();
  }

  protected override seedHydration(payload: WatchCatchupPayload): void {
    const replay = payload.replay!;
    this.sessionId = replay.sessionId;
    this.epoch = replay.epoch;
    this.sourceTick = this.tickCount = replay.tick;
    this.frozenTick = replay.status === "playing" ? null : replay.tick;
    this.pendingPlayerMoves = replay.pendingMoves.map(
      ({ id, move, firstPerson }) => ({
        id,
        move: { ...move, trigger: [...move.trigger] },
        firstPerson,
      }),
    );
    this.nextPlayerMoveId = replay.nextMoveId;
    this.lastClientMoveId = replay.lastClientMoveId;
    this.controlMoveReplayStartId = replay.controlMoveReplayStartId;
    this.recordedMoveAck = this.lastMoveAck = replay.lastMoveAck;
    this.controlMovesAvailable = replay.controlMovesAvailable;
    this.firstPerson = replay.firstPerson;
    this.latestFov = replay.fov;
    this.absoluteYaw = replay.absoluteYaw;
    this.absolutePitch = replay.absolutePitch;
  }

  applyState(state: ReplayState): void {
    if (state.sessionId !== this.sessionId || state.epoch !== this.epoch)
      return;
    this.frozenTick = state.status === "playing" ? null : state.tick;
  }

  /** Immediately hold the old scene while a new authoritative snapshot is prepared. */
  hold(): void {
    this.frozenTick = this.tickCount;
  }

  feedReplayInfo(
    message: Extract<ReplayServerMessage, { type: "replayInfo" }>,
  ): void {
    if (message.sessionId === this.sessionId && message.epoch === this.epoch)
      this.firstPerson = message.firstPerson;
  }

  feedReplayTick(
    message: Extract<ReplayServerMessage, { type: "replayTick" }>,
  ): void {
    if (
      message.sessionId !== this.sessionId ||
      message.epoch !== this.epoch ||
      message.tick <= this.sourceTick
    )
      return;
    this.sourceTick = message.tick;
    // This belongs to the recorder's input simulation, independent of the
    // spectator's local camera mode/FOV.
    this.firstPerson = message.firstPerson;
    this.applyRecordedMove(message.move);
  }

  private applyRecordedMove(move: Move): void {
    // The demo parser has already unclamped ordinary Move blocks. Its header
    // inputs are normalized by the relay when the catch-up cursor is built.
    if (this.nextPlayerMoveId + 1 - this.recordedMoveAck > 46) {
      this.pendingPlayerMoves = [];
      this.controlMovesAvailable = false;
      const id = this.entityIdByGhostIndex.get(this.latestControl.ghostIndex);
      if (id) this.entities.get(id)?.playerPrediction?.discardMove();
    }
    if (this.controlMovesAvailable)
      this.collectMove(move, undefined, this.firstPerson);
    const turn = 2 * Math.PI;
    this.absoluteYaw =
      (((this.absoluteYaw + (move.yaw ?? 0)) % turn) + turn) % turn;
    this.absolutePitch = clamp(
      this.absolutePitch + (move.pitch ?? 0),
      -MAX_PITCH,
      MAX_PITCH,
    );
    this.invalidateSnapshot();
  }

  protected override onPacketApplied(packet: PacketData): void {
    if (packet.gameState.controlObjectData?.position) {
      this.controlMoveReplayStartId = packet.gameState.lastMoveAck;
      this.pendingControlReconstruction =
        this.lastControlType === "player" &&
        !this.isPiloting &&
        !this.playerCollisionReady() &&
        this.pendingPlayerMoves.some(
          ({ id }) => id >= packet.gameState.lastMoveAck,
        );
    } else if (this.lastControlType !== "player" || this.isPiloting) {
      this.pendingControlReconstruction = false;
    }
    this.recordedMoveAck = Math.max(
      this.recordedMoveAck,
      packet.gameState.lastMoveAck,
    );
    const rotation = this.getAbsoluteRotation(
      packet.gameState.controlObjectData,
    );
    if (rotation) {
      this.absoluteYaw = rotation.yaw;
      this.absolutePitch = rotation.pitch;
    }
  }

  protected override getCameraYawPitch(data: ParsedData | undefined) {
    return this.lastControlType === "player" && this.controlMovesAvailable
      ? { yaw: this.absoluteYaw, pitch: this.absolutePitch }
      : super.getCameraYawPitch(data);
  }

  override stepToTime(
    targetTimeSec: number,
    maxMoveTicks = Infinity,
  ): StreamSnapshot {
    return super.stepToTime(
      this.frozenTick === null
        ? targetTimeSec
        : Math.min(targetTimeSec, this.frozenTick * STREAM_TICK_SEC),
      maxMoveTicks,
    );
  }
}

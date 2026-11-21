import {
  applyStreamEntityPose,
  applyStreamEntityRotation,
  interpolateStreamPosition,
  isTrackableProjectile,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { createLogger } from "../logger";
import { orbitSpringDebug } from "../state/cameraDebug";
import { MathUtils, Quaternion, Vector3 } from "three";
import type { Group, Object3D } from "three";
import { DEFAULT_EYE_HEIGHT, STREAM_TICK_SEC } from "../stream/playbackUtils";
import { readEyePosition, readWorldCameraNodes } from "./eyePositions";
import { startAssetPrefetch, stopAssetPrefetch } from "../assetPrefetch";
import { isRelayRecording } from "../stream/demoDate";
import { stopAllTrackedSounds } from "./soundEffects";
import {
  advanceEffectClock,
  engineStore,
  isCurrentPlayback,
} from "../state/engineStore";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { syncDemoCaster } from "../state/demoCaster";
import { cameraRegistry } from "../state/cameraRegistry";
import { isPlayerOrbitLocked, resolveCameraOwner } from "../state/cameraOwner";
import { commandCircuitStore } from "../state/commandCircuitStore";
import {
  blendPlayerRenderAim,
  getPlayerRenderAim,
  getPlayerViewAngles,
  playerBodyYawCorrection,
  type PlayerRenderAim,
  type PlayerViewAngles,
} from "../stream/playerView";
import { PlayerOrbitSpring } from "../stream/PlayerOrbitSpring";
import {
  OrbitDistanceSpring,
  ORBIT_OBSTACLE_CUSHION,
} from "../stream/OrbitDistanceSpring";
import {
  constrainOrbitCamera,
  orbitCameraClearance,
} from "../stream/orbitCollision";
import { FramePriority } from "./framePriority";
import { combineCleanups } from "./storeReaction";
import type { FrameContext } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";
import { settingsStore } from "../state/settingsStore";
import { PlaybackClock } from "../stream/PlaybackClock";
import { advancePlaybackFrame } from "../stream/advancePlaybackFrame";
import { gameEntityStore } from "../state/gameEntityStore";
import { isProjectileEntity } from "../state/projectileEntities";
import {
  DIRECTOR_ORBIT_TARGET_MAX_LAG,
  GROUND_MIN_CLEARANCE,
  groundHeightAt,
  smoothedGroundHeightAt,
  TERRAIN_FOLLOW_CLEARANCE,
  TERRAIN_TRACK_MIN_DISTANCE,
} from "../director/cameraRig";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  MAX_ORBIT_DISTANCE,
  streamClock,
  streamPlaybackStore,
  resetStreamPlayback,
} from "../state/streamPlaybackStore";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "../stream/entityBridge";
import { sameImageMounts } from "../stream/imageMount";
import { findFollowedProjectile } from "../stream/projectileFollowIdentity";
import { readStreamEntityCenter } from "./streamEntityCenter";
import {
  yawPitchToQuaternion,
  orbitPullbackDir,
  playerYawToQuaternion,
  threeForwardHeading,
} from "../stream/streamHelpers";
import type {
  StreamRecording,
  StreamEntity,
  StreamSnapshot,
  StreamingPlayback,
  StreamCamera,
} from "../stream/types";
import type { GameEntity } from "../state/gameEntityTypes";
import { isSceneEntity } from "../state/gameEntityTypes";
import { torqueVecToThree } from "../scene/coordinates";
import {
  firstPersonPlayerId,
  shouldUseClipFollowEye,
} from "./firstPersonPlayer";
import { loadProjectileShapeData } from "./shapeCache";
import { markTransformChanged } from "../transformChanges";
import { PlayerCameraTransition } from "./playerCameraTransition";
import { recordedCameraBlend } from "../stream/playerCameraBlend";
import {
  exitToFreeFly,
  findLivingEntityByTargetId,
  resolveFlagEntityId,
} from "../state/watchFollow";
import type { ClipCameraTransition } from "../../relay/clipTypes";
import {
  applyObserverOrbit,
  applyPlayerControlCamera,
  recordedObserverRotation,
} from "./playerViewCamera";

type EntityById = Map<string, StreamEntity>;
type OrbitColliderExclusions = Parameters<typeof constrainOrbitCamera>[4];

interface OrbitTarget {
  group: Object3D;
  entity: StreamEntity | undefined;
}

interface StreamFrame {
  renderCurrent: StreamSnapshot;
  renderPrev: StreamSnapshot;
  interpT: number;
  worldGeneration: number | undefined;
}

const camlog = createLogger("camdbg");

/** Safely access a field that exists only on some GameEntity variants. */
function getField(entity: GameEntity, field: string): string | undefined {
  return (entity as unknown as Record<string, unknown>)[field] as
    string | undefined;
}

/**
 * The director's follow-target spring, bundled so its state resets in
 * one place. `target` arrives raw and leaves smoothed. A shot boundary
 * (snapNonce changed) is the only licence to snap; mid-shot, a >60m
 * jump is a capture/return teleport and freezes on the last framing,
 * a target-id hand-off (carrier-item) glides with the lag clamp
 * suspended, and continuous motion is carried by velocity feed-forward
 * with damping on the residual (see the camdbg log for every event).
 */
interface FollowSpring {
  smoothed: Vector3;
  seeded: boolean;
  lastId: string | null;
  frozen: boolean;
  handOff: boolean;
  snapSeen: number;
  prevRaw: Vector3;
  prevRawValid: boolean;
}

function newFollowSpring(): FollowSpring {
  return {
    smoothed: new Vector3(),
    seeded: false,
    lastId: null,
    frozen: false,
    handOff: false,
    snapSeen: -1,
    prevRaw: new Vector3(),
    prevRawValid: false,
  };
}

function advanceFollowSpring(
  spring: FollowSpring,
  target: Vector3,
  targetId: string,
  snapNonce: number,
  damping: number,
  effDelta: number,
): void {
  // A shot boundary is the ONE moment a discontinuous move is
  // an edit; the director bumps the nonce there. Mid-shot, a
  // >60m jump is always a capture/return teleport (entities
  // move continuously; a carrier-item hand-off is metres), and
  // a hand-off glides WITHOUT the lag clamp — clamping is for
  // continuous-motion sag, and snapping part of a target swap
  // is itself the twitch it was meant to prevent.
  const shotChanged = spring.snapSeen !== snapNonce;
  spring.snapSeen = snapNonce;
  const handOff = spring.lastId !== targetId;
  if (handOff) {
    camlog.info("spring target %s -> %s", spring.lastId, targetId);
  }
  spring.lastId = targetId;
  const jump = spring.seeded ? spring.smoothed.distanceTo(target) : 0;
  orbitSpringDebug.targetId = targetId;
  orbitSpringDebug.jump = jump;
  orbitSpringDebug.active = true;
  if (shotChanged || !spring.seeded) {
    if (jump > 2) {
      camlog.info(
        "spring SNAP seed (%s, jump %sm)",
        shotChanged ? "shot changed" : "unseeded",
        jump.toFixed(1),
      );
    }
    spring.frozen = false;
    spring.handOff = false;
    spring.prevRawValid = false;
    spring.smoothed.copy(target);
    spring.seeded = true;
  } else if (jump > 60) {
    // Mid-shot teleport: hold the pre-teleport framing until
    // the shot ends or the subject comes back near.
    if (!spring.frozen) {
      camlog.info("spring FREEZE (mid-shot jump %sm)", jump.toFixed(0));
    }
    spring.frozen = true;
    spring.prevRawValid = false;
    target.copy(spring.smoothed);
  } else {
    if (spring.frozen) {
      camlog.info("spring unfreeze (subject back near)");
    }
    spring.frozen = false;
    if (handOff && !spring.handOff) {
      camlog.info("spring hand-off glide (jump %sm)", jump.toFixed(1));
    }
    if (handOff) spring.handOff = true;
    // Feed-forward: carry the smoothed point along with the
    // target's own frame-to-frame motion, then damp only the
    // residual. Damping alone tops out at damping x lag m/s of
    // catch-up (~31 m/s) — far below a skiing carrier — which
    // parked the spring on the lag clamp and turned it into a
    // per-frame yank (measured as sustained 150+ m/s camera
    // jitter on chase shots). A hand-off's displacement is the
    // target SWAP, not motion — never fed forward.
    if (!handOff && spring.prevRawValid) {
      _orbitFeedForward.copy(target).sub(spring.prevRaw);
      if (_orbitFeedForward.lengthSq() < 25) {
        spring.smoothed.add(_orbitFeedForward);
      }
    }
    spring.prevRaw.copy(target);
    spring.prevRawValid = true;
    spring.smoothed.lerp(target, 1 - Math.exp(-damping * effDelta));
    // The spring may sag, but only so far: a fast capper on a
    // straight line otherwise settles at speed/damping metres
    // behind and rides the frame edge.
    const lag = spring.smoothed.distanceTo(target);
    if (spring.handOff) {
      if (lag < 1) spring.handOff = false;
    } else if (lag > DIRECTOR_ORBIT_TARGET_MAX_LAG) {
      spring.smoothed.lerp(target, 1 - DIRECTOR_ORBIT_TARGET_MAX_LAG / lag);
    }
    target.copy(spring.smoothed);
  }
  orbitSpringDebug.frozen = spring.frozen;
  orbitSpringDebug.handOff = spring.handOff;
}

/** HUD updates can share the same frozen world during the debrief. */
const _snapshotEntityCache = new WeakMap<
  StreamSnapshot["entities"],
  EntityById
>();
function getEntityMap(snapshot: StreamSnapshot): EntityById {
  let map = _snapshotEntityCache.get(snapshot.entities);
  if (!map) {
    map = new Map(snapshot.entities.map((e) => [e.id, e]));
    _snapshotEntityCache.set(snapshot.entities, map);
  }
  return map;
}

const _tmpVec = new Vector3();
const _interpQuatA = new Quaternion();
const _interpQuatB = new Quaternion();
const _orbitDir = new Vector3();
const _orbitTarget = new Vector3();
const _orbitCandidate = new Vector3();
const _orbitFeedForward = new Vector3();
const _playerView = { yaw: 0, pitch: 0 };
const _followAim: PlayerRenderAim = { yaw: 0, pitch: 0, headYaw: 0 };
const _viewBodyRotation = new Quaternion();
const _mountRotation = new Quaternion();
const _mountedHeadRotation = new Quaternion();
const _followEyeCamera = {
  position: new Vector3(),
  quaternion: new Quaternion(),
};
const _clipTransitionOrigin = {
  position: new Vector3(),
  quaternion: new Quaternion(),
};
const _clipOrbitCamera = {
  position: _orbitCandidate,
  quaternion: new Quaternion(),
  orbitTransition: false,
};

function cameraColliderId(
  entity: StreamEntity | undefined,
): string | undefined {
  return entity?.ghostIndex == null ? undefined : `ghost:${entity.ghostIndex}`;
}

function followOrbitColliders(
  target: StreamEntity | undefined,
  pivot: StreamEntity | undefined,
): OrbitColliderExclusions {
  const collider = cameraColliderId(target);
  return pivot?.type === "Vehicle" && pivot.id !== target?.id
    ? [collider, cameraColliderId(pivot)]
    : collider;
}

function raiseLooseFlagPivot(entity: StreamEntity | undefined): void {
  // The loose flag's origin is at its base; carriers already have a pivot.
  if (
    entity &&
    entity.type !== "Player" &&
    (entity.targetRenderFlags ?? 0) & 0x2
  )
    _orbitTarget.y += 1.2;
}

function placeClipOrbit(
  camera: { position: Vector3; quaternion: Quaternion },
  distance: number,
  exclusions?: OrbitColliderExclusions,
): void {
  _orbitDir.set(0, 0, 1).applyQuaternion(camera.quaternion);
  camera.position.copy(_orbitTarget).addScaledVector(_orbitDir, distance);
  constrainOrbitCamera(
    _orbitTarget,
    camera.position,
    cameraRegistry.perspective
      ? orbitCameraClearance(cameraRegistry.perspective)
      : undefined,
    undefined,
    exclusions,
  );
}

/**
 * Compute first-person camera transform from entity state, matching
 * Torque's Player::getEyeTransform (binary-verified at FUN_005eead0).
 *
 * Position = worldTransform * animatedEyeNodePosition
 * Rotation = total view angles (body rotationZ + head yaw, head pitch)
 * through yawPitchToQuaternion — the same conversion the authoritative
 * first-person stream camera uses (getAbsoluteRotation → rotationZ/headX),
 * so all sign/axis conventions match rendering that's verified in demos.
 *
 * The eye node's animated ROTATION is discarded — only its position is
 * used. The view angles are shared with the locked orbit camera.
 */
function computeFirstPersonCamera(
  camera: { position: Vector3; quaternion: Quaternion },
  playerGroup: { position: Vector3; quaternion: Quaternion },
  eyePos: Vector3,
  { yaw, pitch }: PlayerViewAngles,
): void {
  // Position: body position + body rotation * eye offset.
  _tmpVec.copy(eyePos).applyQuaternion(playerGroup.quaternion);
  camera.position.copy(playerGroup.position).add(_tmpVec);

  const [rx, ry, rz, rw] = yawPitchToQuaternion(yaw, pitch);
  camera.quaternion.set(rx, ry, rz, rw);
}

/**
 * Resolve the top-level group for an orbit. A rider's
 * group is attached to its mount node, so walk to the outermost carrier.
 */
function resolveCameraTarget(
  root: Group,
  entities: EntityById,
  id: string,
): OrbitTarget | null {
  let targetId = id;
  let entity = entities.get(id);
  for (
    let hops = 0;
    hops < 4 && entity?.mountObjectId && entities.has(entity.mountObjectId);
    hops++
  ) {
    targetId = entity.mountObjectId;
    entity = entities.get(targetId);
  }
  const group = root.children.find((child) => child.name === targetId);
  return group ? { group, entity } : null;
}

/**
 * One stream's playback in the canvas: advances the demo clock (or follows
 * the live stream), mirrors the snapshot's entities into gameEntityStore,
 * poses every entity, and poses the stream's camera — the recorded view,
 * the orbit follow, or first person.
 *
 * Created when a recording becomes current and disposed when it's
 * replaced; disposing leaves the entities, HUD and chat in place as a
 * frozen snapshot.
 */
export class StreamPlaybackSession {
  private stream: StreamingPlayback | null = null;
  /**
   * What the playback pass resolved this frame, for the camera pass: the
   * tick pair being blended and how far between them the playhead sits.
   */
  private renderFrame: StreamFrame | null = null;
  private readonly firstPersonAim: PlayerRenderAim = {
    yaw: 0,
    pitch: 0,
    headYaw: 0,
  };
  private readonly followTransition = new PlayerCameraTransition();
  private followCameraBlend: number | null = null;
  private followEyeTarget: StreamEntity | undefined;
  private corpseView: { id: string; seekNonce: number; yaw: number } | null =
    null;
  private readonly clock = new PlaybackClock();
  private readonly lockedOrbit = new PlayerOrbitSpring();
  private readonly orbitDistance = new OrbitDistanceSpring();
  private lastOrbitSnapNonce = 0;
  private spring: FollowSpring = newFollowSpring();
  private publishedSnapshot: StreamSnapshot | null = null;
  private pendingMissionInfo = false;
  private silencedSeek = -1;
  private lastPublishTime = 0;
  private lastSyncedSnapshot: StreamSnapshot | null = null;
  private streamRevision: number | undefined;
  private projectileAssetWait?: Promise<void>;
  private teardown: (() => void) | null = null;
  private readonly removeFrameCallbacks: () => void;

  private readonly engine: GameEngine;
  private readonly recording: StreamRecording;

  constructor(engine: GameEngine, recording: StreamRecording) {
    this.engine = engine;
    this.recording = recording;
    this.teardown = this.start() ?? null;
    this.removeFrameCallbacks = combineCleanups(
      engine.scheduler.add(FramePriority.StreamPlayback, (ctx) =>
        this.playbackPass(ctx),
      ),
      engine.scheduler.add(FramePriority.PlayerView, ({ delta }) =>
        this.selectFirstPersonPose(delta),
      ),
      engine.scheduler.add(FramePriority.CameraStream, (ctx) =>
        this.cameraPass(ctx),
      ),
    );
  }

  dispose(): void {
    this.removeFrameCallbacks();
    this.teardown?.();
    this.teardown = null;
  }

  private watchProjectileAssets(stream: StreamingPlayback): void {
    const wait = stream.projectileAssetWait;
    if (!wait || wait === this.projectileAssetWait) return;
    this.projectileAssetWait = wait;
    const wake = () => {
      if (this.stream !== stream || this.projectileAssetWait !== wait) return;
      this.projectileAssetWait = undefined;
      this.engine.invalidate();
    };
    void wait.then(wake, wake);
  }

  private syncRenderableEntities(snapshot: StreamSnapshot): void {
    const last = this.lastSyncedSnapshot;
    const worldTime = snapshot.matchEndedAtSec ?? snapshot.timeSec;
    if (
      last &&
      snapshot.entities === last.entities &&
      worldTime === (last.matchEndedAtSec ?? last.timeSec)
    )
      return;
    this.lastSyncedSnapshot = snapshot;

    // Operate directly on the store's Map — one canonical source of truth.
    const map = gameEntityStore.getState().streamEntities;
    let structuralChange = false;

    // Track which IDs are in the current snapshot for the removal pass.
    const currentIds = new Set<string>();

    for (const entity of snapshot.entities) {
      // Splash effects are rendered directly from the stream snapshot.
      if (entity.type === "Splash") continue;
      currentIds.add(entity.id);
      let renderEntity = map.get(entity.id);

      // Identity change -> new component (unmount/remount).
      const hasShapeName =
        renderEntity &&
        (renderEntity.renderType === "Shape" ||
          renderEntity.renderType === "Player" ||
          renderEntity.renderType === "Explosion");

      const needsNewIdentity =
        !renderEntity ||
        renderEntity.className !== (entity.className ?? entity.type) ||
        renderEntity.ghostIndex !== entity.ghostIndex ||
        renderEntity.dataBlockId !== entity.dataBlockId ||
        renderEntity.shapeHint !== entity.shapeHint ||
        (entity.visual?.kind === "targetBeam" &&
          renderEntity.renderType !== "TargetBeam" &&
          entity.beamStart != null &&
          entity.beamEnd != null) ||
        (hasShapeName &&
          entity.dataBlock != null &&
          getField(renderEntity, "shapeName") !== entity.dataBlock) ||
        (renderEntity.renderType !== "Player" &&
          hasShapeName &&
          !sameImageMounts(
            "imageSlots" in renderEntity ? renderEntity.imageSlots : undefined,
            entity.imageSlots,
          ));

      if (needsNewIdentity) {
        const prevHidden = renderEntity?.debugHidden;
        renderEntity = streamEntityToGameEntity(entity, worldTime);
        if (prevHidden) renderEntity.debugHidden = true;
        map.set(entity.id, renderEntity);
        structuralChange = true;
      } else {
        // Give the view registry a new entity reference when its placement
        // or presentation changes. Keyframes and threads carry over.
        if (updateGameEntityFromStream(renderEntity!, entity)) {
          renderEntity = { ...renderEntity! };
          map.set(entity.id, renderEntity);
          structuralChange = true;
        }
      }

      // Keyframe update (mutable — position, rotation, velocity, etc.).
      if (isSceneEntity(renderEntity!) || renderEntity!.renderType === "None")
        continue;
      const keyframes = renderEntity!.keyframes!;
      if (keyframes.length === 0) {
        keyframes.push({
          time: worldTime,
          position: entity.position ?? [0, 0, 0],
          rotation: entity.rotation ?? [0, 0, 0, 1],
        });
      }
      const kf = keyframes[0];
      kf.time = worldTime;
      if (entity.position) kf.position = entity.position;
      if (entity.rotation) kf.rotation = entity.rotation;
      kf.velocity = entity.velocity;
      kf.health = entity.health;
      kf.energy = entity.energy;
      kf.actionSlot = entity.actionSlot;
      kf.damageState = entity.damageState;
    }

    // An empty snapshot is authoritative too (before ghosting or on mission change).
    for (const id of map.keys()) {
      if (currentIds.has(id)) continue;
      map.delete(id);
      structuralChange = true;
    }

    if (structuralChange) {
      gameEntityStore.getState().bumpStreamVersion();
    }
  }

  private start(): (() => void) | undefined {
    if (!isCurrentPlayback(this.recording)) return;
    // Stop any lingering sounds from the previous recording before setting
    // up the new one. One-shot sounds and looping projectile sounds survive
    // across recording changes because ParticleEffects doesn't unmount.
    stopAllTrackedSounds();

    this.stream = this.recording.streamingPlayback ?? null;
    this.renderFrame = null;
    this.silencedSeek = -1;
    this.lastSyncedSnapshot = null;
    this.publishedSnapshot = null;
    this.pendingMissionInfo = false;
    this.lastPublishTime = 0;
    this.lockedOrbit.reset();
    this.orbitDistance.reset();
    resetStreamPlayback();
    this.clock.reset(0, engineStore.getState().playback.seekNonce);
    this.engine.streamSnapshot.current = null;

    const stream = this.stream;
    streamPlaybackStore.setState({ playback: stream });
    gameEntityStore.getState().beginStreaming(this.recording.source);

    if (!stream) {
      setStreamSnapshot(null);
      return;
    }

    // Prefetch what this session is certain to render — scene geometry
    // (terrain, interiors) first, then category shapes — re-polled as
    // more state arrives. On-demand loads cover the rest at first sight.
    startAssetPrefetch(() => stream.getPreloadAssets());

    // Update gameEntityStore when mission info arrives via server messages
    // (MsgMissionDropInfo, MsgLoadInfo, MsgClientReady).
    const onMissionInfoChange = () => {
      if (!isCurrentPlayback(this.recording)) return;
      if (
        this.recording.source === "demo" &&
        engineStore.getState().playback.seekNonce !== this.clock.seekNonce
      ) {
        this.pendingMissionInfo = true;
        return;
      }
      this.pendingMissionInfo = false;
      gameEntityStore.getState().setMissionInfo({
        missionDisplayName: stream.missionDisplayName ?? undefined,
        missionTypeDisplayName: stream.missionTypeDisplayName ?? undefined,
        gameClassName: stream.gameClassName ?? undefined,
        // Prefer the stream's server name (MsgMissionDropInfo) — demo
        // header metadata stores it lowercased.
        serverDisplayName: stream.serverDisplayName ?? undefined,
        recorderName: stream.connectedPlayerName ?? undefined,
      });
    };

    stream.onMissionInfoChange = onMissionInfoChange;

    // Save pre-populated mission info before reset clears it.
    const savedMissionDisplayName = stream.missionDisplayName;
    const savedMissionTypeDisplayName = stream.missionTypeDisplayName;
    const savedGameClassName = stream.gameClassName;
    const savedServerDisplayName = stream.serverDisplayName;
    const savedConnectedPlayerName = stream.connectedPlayerName;

    // Reset the stream cursor for demo playback (replay from the beginning).
    // For live streams, skip reset — the adapter is already receiving packets
    // and has accumulated protocol state (net strings, target info, sensor
    // group colors) that the server won't re-send.
    if (this.recording.source !== "live") {
      stream.setPlayerInterpolation?.(
        settingsStore.getState().playerInterpolation,
      );
      stream.setPlayerPredictionEnabled?.(true);
      stream.reset();
    }

    // Restore mission info fields that were parsed from the initial block
    // (demoValues) — reset() clears them but they won't be re-sent.
    stream.missionDisplayName = savedMissionDisplayName;
    stream.missionTypeDisplayName = savedMissionTypeDisplayName;
    stream.gameClassName = savedGameClassName;
    stream.serverDisplayName = savedServerDisplayName;
    stream.connectedPlayerName = savedConnectedPlayerName;

    gameEntityStore.getState().setMissionInfo({
      missionName: this.recording.missionName ?? undefined,
      missionTypeDisplayName:
        savedMissionTypeDisplayName ?? this.recording.gameType ?? undefined,
      missionDisplayName: savedMissionDisplayName ?? undefined,
      gameClassName: savedGameClassName ?? undefined,
      serverDisplayName:
        savedServerDisplayName ?? this.recording.serverDisplayName ?? undefined,
      recorderName:
        savedConnectedPlayerName ?? this.recording.recorderName ?? undefined,
      recordingDate: this.recording.recordingDate ?? undefined,
    });
    // From-connect demos (relay auto-captures) stream the scene in over
    // their first seconds, so a paused start would show black — begin at
    // the first frame that has something to render. Retail demos carry
    // the scene in their initial block, so this is ~0 (no skip).
    stream.setProjectileShapeLoader?.((name) => loadProjectileShapeData(name));
    stream.setMissileLockInferenceEnabled?.(true);
    const snapshot =
      this.recording.source === "demo"
        ? stream.stepToTime(stream.findSceneReadyTime())
        : stream.getSnapshot();
    this.watchProjectileAssets(stream);

    streamClock.time = snapshot.timeSec;
    streamClock.matchEndedAtSec = snapshot.matchEndedAtSec;
    const playback = engineStore.getState().playback;
    this.clock.reset(
      snapshot.timeSec,
      // Remounting during a seek must reconstruct its target again.
      playback.status === "seeking"
        ? playback.seekNonce - 1
        : playback.seekNonce,
      snapshot,
    );
    this.engine.streamSnapshot.current = snapshot;
    this.syncRenderableEntities(snapshot);

    setStreamSnapshot(snapshot);
    this.publishedSnapshot = snapshot;

    // Aim comparisons should redraw immediately, including paused on-demand views.
    const unsubscribeAimSettings = settingsStore.subscribe(
      (state) => state.aimCorrection,
      () => this.engine.invalidate(),
    );
    const unsubscribeInterpolation = settingsStore.subscribe(
      (state) => state.playerInterpolation,
      (settings) => {
        stream.setPlayerInterpolation?.(settings);
        this.engine.invalidate();
      },
    );

    return () => {
      unsubscribeAimSettings();
      unsubscribeInterpolation();
      if (stream.onMissionInfoChange === onMissionInfoChange) {
        stream.onMissionInfoChange = undefined;
      }
      stream.setProjectileShapeLoader?.(undefined);
      stream.setMissileLockInferenceEnabled?.(false);
      this.projectileAssetWait = undefined;
      this.renderFrame = null;
      stopAllTrackedSounds();
      stopAssetPrefetch();
      // Null out the stream so the frame passes stop syncing entities.
      this.stream = null;
      // Don't call endStreaming() or clear the snapshot — leave entities,
      // HUD, and chat in place as a frozen snapshot after disconnect.
      resetStreamPlayback();
    };
  }

  // ── Playback: advance the demo clock, step the stream and place every
  // entity. Runs before shape animation and the camera ladder, which
  // both read what it writes (see framePriority.ts).
  private playbackPass(ctx: FrameContext): void {
    const { aimCorrection } = settingsStore.getState();
    const stream = this.stream;
    if (
      !stream ||
      stream !== this.recording.streamingPlayback ||
      !isCurrentPlayback(this.recording)
    )
      return;
    const clock = this.clock;
    if (
      stream.playbackRevision !== undefined &&
      stream.playbackRevision !== this.streamRevision
    ) {
      this.streamRevision = stream.playbackRevision;
      stopAllTrackedSounds();
      this.renderFrame = null;
      this.followTransition.reset();
      this.corpseView = null;
      this.lastSyncedSnapshot = null;
    }
    const pending = engineStore.getState().playback;
    if (
      (pending.status === "seeking" || stream.needsReplay) &&
      this.silencedSeek !== pending.seekNonce
    ) {
      stopAllTrackedSounds();
      this.silencedSeek = pending.seekNonce;
    }
    advancePlaybackFrame(
      this.recording,
      clock,
      ctx.delta,
      (frame, playback) => {
        const isPlaying = playback.status === "playing";
        const { snapshot, previousSnapshot, isSeeking, playbackDelta } = frame;
        if (this.pendingMissionInfo) stream.onMissionInfoChange?.();
        if (!isCurrentPlayback(this.recording, playback.seekNonce)) return;
        const previousWorldTime = streamClock.worldTime;
        const wasWorldPaused = streamClock.worldPaused;
        streamClock.time = clock.time;
        streamClock.matchEndedAtSec = snapshot.matchEndedAtSec;
        if (isPlaying && !isSeeking && playbackDelta > 0) {
          const elapsed = Math.max(
            0,
            streamClock.worldTime - previousWorldTime,
          );
          // Transport keeps advancing during the debrief while the world is
          // frozen. Resume without carrying that gap into the next mission.
          advanceEffectClock(
            wasWorldPaused
              ? Math.min(elapsed, playbackDelta * playback.rate)
              : elapsed,
            1,
          );
        }

        const renderCurrent = snapshot;
        const renderPrev = previousSnapshot;
        this.engine.streamSnapshot.current = snapshot;
        const tickStartTime = renderCurrent.timeSec - STREAM_TICK_SEC;
        const interpT = streamClock.worldPaused
          ? 1
          : Math.max(
              0,
              Math.min(1, (clock.time - tickStartTime) / STREAM_TICK_SEC),
            );

        this.syncRenderableEntities(renderCurrent);
        if (!isCurrentPlayback(this.recording, playback.seekNonce)) return;

        // A timestamp link may start in a later mission. Wait for its completed
        // frame so the opening scene and intermediate seek scenes don't reset it.
        if (!clock.seekProgress) {
          syncDemoCaster(
            this.recording,
            renderCurrent.missionReadySec,
            demoLoadStore.getState().sourceUrl,
            demoLoadStore.getState().publishedGames ?? undefined,
          );
        }

        // Publish snapshot when it changed. useSyncExternalStore
        // notifications are handled SYNCHRONOUSLY by React and preempt (and
        // restart) in-progress Suspense retry renders, so per-tick publishes
        // starve asset pop-in while shapes are loading: loaded GLBs sit in
        // cache while their retry render never gets to finish (pausing a
        // demo made everything appear instantly). While three's
        // DefaultLoadingManager reports active loads (engine.assetsLoading),
        // throttle publishes hard so retries get long uninterrupted
        // windows; otherwise publish every tick. Imperative per-frame
        // consumers (nameplates, entity fields, streamClock) bypass React
        // and are unaffected either way.
        if (renderCurrent !== this.publishedSnapshot) {
          const now = performance.now();
          const publishInterval =
            !isSeeking &&
            !renderCurrent.exhausted &&
            renderCurrent.matchEnded === this.publishedSnapshot?.matchEnded &&
            this.engine.assetsLoading()
              ? 500
              : 0;
          if (now - this.lastPublishTime >= publishInterval) {
            this.lastPublishTime = now;
            this.publishedSnapshot = renderCurrent;
            setStreamSnapshot(renderCurrent);
          }
        }

        if (!isCurrentPlayback(this.recording, playback.seekNonce)) return;

        // Imperative position interpolation via the shared entity root.
        const currentEntities = getEntityMap(renderCurrent);
        const previousEntities = getEntityMap(renderPrev);
        streamRenderFrame.current = currentEntities;
        streamRenderFrame.previous = previousEntities;
        streamRenderFrame.interpT = interpT;
        streamRenderFrame.reconstructing = isSeeking;
        streamRenderFrame.aimCorrection = aimCorrection;
        const renderEntities = gameEntityStore.getState().streamEntities;
        const root = streamPlaybackStore.getState().root;
        if (root) {
          for (const child of root.children) {
            // Scene infrastructure handles its own positioning; the projectile
            // pool applies these same inputs before animation and retains visibility.
            const renderEntity = renderEntities.get(child.name);
            if (
              renderEntity &&
              (isSceneEntity(renderEntity) || isProjectileEntity(renderEntity))
            ) {
              continue;
            }
            applyStreamEntityPose(
              child,
              renderEntity,
              currentEntities.get(child.name),
              previousEntities.get(child.name),
              interpT,
              ctx.camera,
              aimCorrection,
            );
          }
        }

        // Hand the camera pass the tick pair it must interpolate between.
        this.renderFrame = {
          renderCurrent,
          renderPrev,
          interpT,
          worldGeneration: stream.worldGeneration,
        };
      },
    );
    this.watchProjectileAssets(stream);
    if (engineStore.getState().playback.status === "seeking")
      this.engine.invalidate();
  }

  private cameraSelection(camera: StreamCamera | null) {
    const { cameraMode, followEntityId, projectileFollow } =
      streamPlaybackStore.getState();
    const isLive = this.recording.source === "live";
    // The relay’s own server camera stays in fly mode. Watchers and demo
    // follow overrides use the target selected in the browser.
    const isWatcher =
      isLive &&
      (liveConnectionStore.getState().role === "watcher" ||
        this.stream?.localSpectator === true);
    const userFollowing =
      isWatcher ||
      (!isLive &&
        (cameraMode === "orbitOverride" ||
          cameraMode === "firstPersonOverride"));
    const projectileTracking =
      cameraMode === "orbitOverride" &&
      projectileFollow?.kind === "tracking" &&
      (!isLive || isWatcher) &&
      resolveCameraOwner() === "input"
        ? projectileFollow
        : null;
    const orbitTargetId =
      projectileTracking?.projectileId ??
      (userFollowing ? followEntityId : null) ??
      camera?.orbitTargetId ??
      undefined;
    const firstPersonFollowId =
      cameraMode === "firstPersonOverride" && (!isLive || isWatcher)
        ? orbitTargetId
        : undefined;
    return {
      cameraMode,
      isLive,
      isWatcher,
      orbitTargetId,
      firstPersonFollowId,
      projectileTracking,
    };
  }

  /** Select the view rig before evaluating the eye and mount nodes. */
  private selectFirstPersonPose(delta: number): void {
    const frame = this.renderFrame;
    const playback = engineStore.getState().playback;
    if (
      !frame ||
      playback.recording !== this.recording ||
      this.stream !== this.recording.streamingPlayback ||
      playback.status === "seeking"
    )
      return;
    streamRenderFrame.firstPersonAim = null;
    streamRenderFrame.maskFirstPersonPose = false;
    this.followCameraBlend = null;
    this.followEyeTarget = undefined;
    const owner = resolveCameraOwner();
    if (
      (owner !== "input" && owner !== "clip") ||
      commandCircuitStore.getState().active
    ) {
      streamRenderFrame.firstPersonPlayerId = null;
      this.followTransition.reset();
      this.corpseView = null;
      return;
    }
    const { renderCurrent } = frame;
    const camera = renderCurrent.camera;
    const {
      cameraMode,
      firstPersonFollowId,
      orbitTargetId,
      isLive,
      isWatcher,
    } = this.cameraSelection(camera);
    const entities = getEntityMap(renderCurrent);
    const followEntity = orbitTargetId
      ? entities.get(orbitTargetId)
      : undefined;
    const localPlayerFollow =
      owner === "input" &&
      (!isLive || isWatcher) &&
      (cameraMode === "orbitOverride" ||
        cameraMode === "firstPersonOverride") &&
      streamPlaybackStore.getState().followFlagSlot == null &&
      followEntity?.type === "Player";
    const originalControl =
      !isLive && cameraMode === "original"
        ? this.originalCameraControl(renderCurrent, entities)
        : undefined;
    if (localPlayerFollow && !followEntity.damageState) {
      this.followCameraBlend = this.followTransition.update(
        followEntity.id,
        playback.seekNonce,
        cameraMode === "firstPersonOverride",
        delta,
      );
      if (this.followCameraBlend !== (firstPersonFollowId ? 0 : 1))
        this.engine.invalidate();
    } else this.followTransition.reset();

    const corpse =
      localPlayerFollow && firstPersonFollowId
        ? followEntity
        : owner === "input"
          ? originalControl
          : undefined;
    if (corpse?.type === "Player" && corpse.damageState) {
      if (
        this.corpseView?.id !== corpse.id ||
        this.corpseView.seekNonce !== playback.seekNonce
      ) {
        const rotation = corpse.rotation;
        this.corpseView = {
          id: corpse.id,
          seekNonce: playback.seekNonce,
          yaw: rotation
            ? threeForwardHeading(_viewBodyRotation.fromArray(rotation))
            : 0,
        };
      }
    } else this.corpseView = null;

    const viewTargetId =
      this.followCameraBlend === null
        ? firstPersonFollowId
        : this.followCameraBlend < 1
          ? orbitTargetId
          : undefined;
    if (viewTargetId) {
      this.followEyeTarget = this.resolveFollowEyeTarget(
        renderCurrent,
        entities,
        followEntity,
      );
    }
    const id = firstPersonPlayerId(
      entities,
      camera,
      viewTargetId ? "firstPersonOverride" : cameraMode,
      this.followEyeTarget?.id,
      camera !== null && recordedCameraBlend(camera, frame.interpT) === 0,
      originalControl?.id ?? camera?.controlEntityId,
    );
    const clipSample = owner === "clip" ? this.engine.clipCameraSample : null;
    const clipCannotUseEye =
      clipSample?.cameraMode === "firstPersonOverride" &&
      !shouldUseClipFollowEye(
        clipSample,
        viewTargetId,
        streamPlaybackStore.getState().followEntityId,
      );
    streamRenderFrame.firstPersonPlayerId = clipCannotUseEye ? null : id;
    if (!id || clipCannotUseEye) return;
    streamRenderFrame.maskFirstPersonPose =
      !this.engine.clipCameraTransition &&
      (!viewTargetId || !localPlayerFollow || this.followCameraBlend === 0);
    const player = this.followEyeTarget;
    if (!player) return;
    const mounted = player.mountObjectId && entities.has(player.mountObjectId);
    const group = mounted
      ? this.engine.entities.get(id)?.root
      : streamPlaybackStore
          .getState()
          .root?.children.find((child) => child.name === id);
    if (!group) return;

    const bodyRotation = mounted
      ? this.readMountedPlayerRotation(frame, player)
      : group.quaternion;
    const aim = this.sampleFollowAim(
      frame,
      id,
      bodyRotation,
      streamRenderFrame.aimCorrection,
      this.firstPersonAim,
    );
    if (this.followCameraBlend) {
      const orbitAim = getPlayerRenderAim(
        bodyRotation,
        player,
        frame.interpT,
        _followAim,
        streamRenderFrame.aimCorrection,
      );
      blendPlayerRenderAim(orbitAim, aim, 1 - this.followCameraBlend);
    }
    streamRenderFrame.firstPersonAim = aim;
    // Mounted body yaw belongs to the animated model inside the mount
    // container. The container itself supplies the seat's coordinate frame.
    if (mounted) return;

    // Keep freelook in the head. The eye rotates by body yaw + head yaw;
    // the held weapon follows the body, even when the player looks aside.
    _viewBodyRotation.fromArray(playerYawToQuaternion(aim.yaw - aim.headYaw));
    if (!group.quaternion.equals(_viewBodyRotation)) {
      group.quaternion.copy(_viewBodyRotation);
      markTransformChanged(group);
    }
  }

  private resolveFollowEyeTarget(
    snapshot: StreamSnapshot,
    entities: EntityById,
    player: StreamEntity | undefined,
  ): StreamEntity | undefined {
    const mount =
      player?.type === "Player" && player.mountObjectId
        ? entities.get(player.mountObjectId)
        : undefined;
    if (mount?.type !== "Vehicle") return player;
    if (player?.mountNode === 0) return mount;
    if (player?.mountNode !== 1) return player;
    // Only the dedicated Beowulf and Thundersword gunner seats take over
    // the turret on slot 10. Other passengers keep their own eye and weapon.
    return (
      snapshot.entities.find(
        (candidate) =>
          candidate.className === "Turret" &&
          candidate.mountObjectId === mount.id &&
          candidate.mountNode === 10 &&
          this.entityDatablock(candidate)?.useEyePoint === true,
      ) ?? player
    );
  }

  private readMountedPlayerRotation(
    frame: StreamFrame,
    player: StreamEntity,
  ): Quaternion {
    const rotation = _viewBodyRotation.identity();
    applyStreamEntityRotation(
      rotation,
      player,
      getEntityMap(frame.renderPrev).get(player.id),
      frame.interpT,
      playerBodyYawCorrection(player, streamRenderFrame.aimCorrection),
    );
    return rotation;
  }

  private sampleFollowAim(
    { renderCurrent, interpT }: StreamFrame,
    id: string,
    bodyRotation: Quaternion,
    aimCorrection: boolean,
    out: PlayerRenderAim,
  ): PlayerRenderAim {
    const player = getEntityMap(renderCurrent).get(id);
    const interpolateAim = this.recording.source === "demo" && aimCorrection;
    const tailView = interpolateAim
      ? renderCurrent.bufferingPlayerViews?.get(id)
      : undefined;
    const bufferingView =
      this.stream?.streamComplete === false || tailView?.aimCut
        ? tailView
        : undefined;
    // At the download frontier, packets can arrive before their move
    // tick. Hold the last complete aim so resuming starts at that angle.
    const heldView =
      player?.viewQuantized &&
      bufferingView?.viewQuantized &&
      !bufferingView.aimCut &&
      !player.damageState &&
      !bufferingView.damageState &&
      player.mountObjectId === bufferingView.mountObjectId &&
      player.mountNode === bufferingView.mountNode
        ? bufferingView
        : undefined;
    return getPlayerRenderAim(
      bodyRotation,
      heldView ?? player,
      interpT,
      out,
      aimCorrection,
      interpolateAim
        ? (bufferingView ?? renderCurrent.previousPlayerViews?.get(id))
        : undefined,
      interpolateAim && !bufferingView
        ? this.stream?.getPlayerAim?.(id)
        : undefined,
    );
  }

  private readFollowEye(
    frame: StreamFrame,
    root: Group,
    playerId: string,
    target: StreamEntity,
    aimCorrection: boolean,
    camera = _followEyeCamera,
  ): boolean {
    const { id } = target;
    const turret = target.className === "Turret";
    if (turret && readWorldCameraNodes(id, camera.position, camera.quaternion))
      return true;

    const mounted =
      target.type === "Player" &&
      target.mountObjectId &&
      getEntityMap(frame.renderCurrent).has(target.mountObjectId);
    const group = mounted
      ? this.engine.entities.get(id)?.root
      : root.children.find(
          (child) => child.name === (turret ? target.mountObjectId : id),
        );
    if (!group?.parent) return false;
    const sharedAim =
      streamRenderFrame.firstPersonPlayerId === playerId
        ? streamRenderFrame.firstPersonAim
        : null;
    const aim =
      sharedAim ??
      this.sampleFollowAim(
        frame,
        playerId,
        mounted
          ? this.readMountedPlayerRotation(frame, target)
          : group.quaternion,
        aimCorrection,
        _followAim,
      );
    if (mounted) {
      const head = _mountedHeadRotation.fromArray(
        yawPitchToQuaternion(aim.headYaw, aim.pitch),
      );
      if (
        readWorldCameraNodes(
          id,
          camera.position,
          camera.quaternion,
          undefined,
          head,
        )
      )
        return true;
      camera.position.copy(
        group.localToWorld(_tmpVec.set(0, DEFAULT_EYE_HEIGHT, 0)),
      );
      camera.quaternion
        .fromArray(yawPitchToQuaternion(aim.yaw, aim.pitch))
        .premultiply(group.getWorldQuaternion(_mountRotation));
    } else {
      computeFirstPersonCamera(
        camera,
        group,
        readEyePosition(group.name, _tmpVec) ??
          _tmpVec.set(0, DEFAULT_EYE_HEIGHT, 0),
        aim,
      );
    }
    return true;
  }

  private readClipTransitionOrigin(
    from: ClipCameraTransition,
    frame: StreamFrame,
    entities: EntityById,
    root: Group | null,
    aimCorrection: boolean,
  ): typeof _clipTransitionOrigin | undefined {
    const anchor = from.anchor;
    if (!anchor) return;
    const origin = _clipTransitionOrigin;
    if (anchor.kind === "playerEye") {
      const id = findLivingEntityByTargetId(anchor.targetId);
      if (!root || !id) return;
      const target = this.resolveFollowEyeTarget(
        frame.renderCurrent,
        entities,
        entities.get(id),
      );
      if (
        target &&
        this.readFollowEye(frame, root, id, target, aimCorrection, origin)
      )
        return origin;
      return;
    }

    let exclusions: OrbitColliderExclusions;
    if (anchor.projectile) {
      const projectile = findFollowedProjectile(entities, anchor.projectile);
      if (!projectile) return;
      this.placeProjectileOrbitPivot(projectile, frame);
    } else {
      const id =
        anchor.flagSlot !== null
          ? resolveFlagEntityId(anchor.flagSlot)
          : anchor.targetId === null
            ? null
            : findLivingEntityByTargetId(anchor.targetId);
      if (!root || !id) return;
      const target = resolveCameraTarget(root, entities, id);
      if (!target) return;
      this.placeFollowOrbitPivot(target);
      raiseLooseFlagPivot(target.entity);
      exclusions = followOrbitColliders(entities.get(id), target.entity);
    }
    origin.quaternion.fromArray(from.quaternion);
    placeClipOrbit(
      origin,
      Math.min(MAX_ORBIT_DISTANCE, anchor.distance),
      exclusions,
    );
    return origin;
  }

  // ── The stream's camera pose: the recorded view, the orbit follow, or
  // first person. Runs after the shapes have animated (the first-person
  // eye node) and after the director has set its orbit parameters.
  private cameraPass(ctx: FrameContext): void {
    const { aimCorrection, followBehindPlayer } = settingsStore.getState();
    const frame = this.renderFrame;
    if (!frame) return;
    const { renderCurrent, renderPrev, interpT } = frame;
    const playback = engineStore.getState().playback;
    if (
      playback.recording !== this.recording ||
      this.stream !== this.recording.streamingPlayback ||
      playback.status === "seeking"
    )
      return;
    const isPlaying = playback.status === "playing";
    const currentEntities = getEntityMap(renderCurrent);
    const { root, followEntityId } = streamPlaybackStore.getState();
    const owner = resolveCameraOwner();
    const clipSample = owner === "clip" ? this.engine.clipCameraSample : null;
    const transition = this.engine.clipCameraTransition;
    if (clipSample && transition)
      transition.origin = this.readClipTransitionOrigin(
        transition.from,
        frame,
        currentEntities,
        root,
        aimCorrection,
      );
    const clipOrbit =
      clipSample?.cameraMode === "orbitOverride" ? clipSample : null;
    const hasClipOrbitDistance = clipOrbit?.orbitDistance !== undefined;
    const clipProjectile =
      hasClipOrbitDistance && clipOrbit.projectile
        ? findFollowedProjectile(currentEntities, clipOrbit.projectile)
        : undefined;

    const currentCamera = renderCurrent.camera;
    streamRenderFrame.camera = currentCamera;
    const previousCamera =
      currentCamera &&
      renderPrev.camera &&
      renderPrev.camera.controlEntityId === currentCamera.controlEntityId &&
      (currentCamera.controlEntityId ||
        (renderPrev.camera.mode === currentCamera.mode &&
          renderPrev.camera.orbitTargetId === currentCamera.orbitTargetId))
        ? renderPrev.camera
        : null;

    const {
      cameraMode,
      isLive,
      isWatcher,
      orbitTargetId: selectedOrbitTargetId,
      firstPersonFollowId,
      projectileTracking,
    } = this.cameraSelection(currentCamera);
    let orbitTargetId = selectedOrbitTargetId;
    if (clipOrbit) {
      // Older clips only recorded a world pose. The clip camera can play it directly.
      orbitTargetId = undefined;
      if (hasClipOrbitDistance)
        orbitTargetId = clipOrbit.projectile
          ? clipProjectile?.id
          : (followEntityId ?? undefined);
    }
    // In live mode, InputConsumer owns camera position and rotation
    // (moves are applied locally, matching how the real Tribes 2 client
    // handles its control Camera). StreamPlaybackSession still handles
    // entity interpolation and orbit target positioning.
    const controlDelta =
      !isLive && currentCamera?.controlEntityId
        ? currentEntities.get(currentCamera.controlEntityId)?.playerDelta
        : undefined;
    const backstep = 1 - interpT;
    const cameraYaw = controlDelta
      ? controlDelta.rot +
        controlDelta.rotVec * backstep +
        controlDelta.head[1] +
        controlDelta.headVec[1] * backstep
      : currentCamera?.yaw;
    const cameraPitch = controlDelta
      ? controlDelta.head[0] + controlDelta.headVec[0] * backstep
      : currentCamera?.pitch;

    // Demo/live camera state always lands on the perspective camera.
    // Normally that IS the default render camera; in command circuit mode
    // the ortho rig takes over rendering and reads this camera's position
    // to follow the view (so these writes must not hit the render camera, which
    // would stomp the ortho rig).
    const streamCamera = cameraRegistry.perspective ?? ctx.camera;

    if (currentCamera && cameraMode !== "freeFly") {
      // In live mode, InputConsumer owns both camera position and rotation
      // (client-side prediction with server reconciliation + interpolateTick,
      // matching Tribes 2's Camera behavior). StreamPlaybackSession only
      // handles entity interpolation and orbit target positioning.
      // In orbitOverride mode, skip stream position/rotation — the orbit
      // block below will position the camera using user-controlled yaw/pitch.
      if (!isLive && cameraMode !== "orbitOverride") {
        if (previousCamera) {
          const px = previousCamera.position[0];
          const py = previousCamera.position[1];
          const pz = previousCamera.position[2];
          const cx = currentCamera.position[0];
          const cy = currentCamera.position[1];
          const cz = currentCamera.position[2];
          const ix = px + (cx - px) * interpT;
          const iy = py + (cy - py) * interpT;
          const iz = pz + (cz - pz) * interpT;
          streamCamera.position.set(iy, iz, ix);

          const observerRotation =
            cameraMode === "original" && !currentCamera.controlEntityId
              ? recordedObserverRotation(previousCamera, currentCamera, interpT)
              : undefined;
          if (observerRotation) {
            streamCamera.quaternion.fromArray(observerRotation);
          } else {
            _interpQuatA.set(...previousCamera.rotation);
            _interpQuatB.set(...currentCamera.rotation);
            _interpQuatA.slerp(_interpQuatB, interpT);
            streamCamera.quaternion.copy(_interpQuatA);
          }
        } else {
          torqueVecToThree(currentCamera.position, streamCamera.position);
          streamCamera.quaternion.set(...currentCamera.rotation);
        }
      }

      if (
        !isLive &&
        cameraMode !== "orbitOverride" &&
        currentCamera.controlEntityId
      ) {
        const player = streamRenderFrame.current?.get(
          currentCamera.controlEntityId,
        );
        const prediction = player?.playerDelta;
        if (prediction && player?.position) {
          const dt = 1 - interpT;
          const p = player.position,
            v = prediction.posVec;
          streamCamera.position.set(
            p[1] + v[1] * dt,
            p[2] + v[2] * dt,
            p[0] + v[0] * dt,
          );
          const rotation = yawPitchToQuaternion(cameraYaw!, cameraPitch!);
          streamCamera.quaternion.set(...rotation);
        }
      }
    }

    // Relay (MapGenius) demos: the recorder is an observer that never
    // moves, so its view is only worth a starting pose. "original" seeds
    // the camera from the recorded view (the block above, this frame) and
    // hands over to free-fly on load or a moment link without a camera.
    // Manual mode cycling skips "original" for these recordings.
    if (
      cameraMode === "original" &&
      currentCamera &&
      !isLive &&
      isRelayRecording(this.recording.recorderName)
    ) {
      streamPlaybackStore.setState({ cameraMode: "freeFly" });
    }

    const mode = currentCamera?.mode;
    const recordedControl =
      cameraMode === "original" && !isLive
        ? this.originalCameraControl(renderCurrent, currentEntities)
        : undefined;
    const recordedObserverOrbit =
      cameraMode === "original" &&
      !isLive &&
      mode === "third-person" &&
      currentCamera?.controlEntityId === undefined;
    const followBlend = this.followCameraBlend;
    // In live mode, InputConsumer handles orbit positioning from local rotation
    // so the orbit responds at frame rate. Skip here to avoid fighting —
    // EXCEPT spectate mode, where InputConsumer's live path is off and the
    // follow target is chosen client-side (streamPlaybackStore.followEntityId;
    // the relay's server camera never enters orbit mode).
    // In orbitOverride mode with a valid orbit target, use user-controlled
    // yaw/pitch instead of stream data.
    const orbitOverride =
      (cameraMode === "orbitOverride" ||
        (cameraMode === "firstPersonOverride" &&
          followBlend !== null &&
          followBlend > 0)) &&
      (!isLive || isWatcher) &&
      orbitTargetId != null;
    const orbitLocked =
      projectileTracking === null &&
      (isPlayerOrbitLocked(followBehindPlayer) ||
        (followBehindPlayer &&
          orbitOverride &&
          cameraMode === "firstPersonOverride"));
    const orbitSnapNonce = streamPlaybackStore.getState().orbitSnapNonce;
    if (this.lastOrbitSnapNonce !== orbitSnapNonce) {
      this.lockedOrbit.reset();
      this.orbitDistance.reset();
      this.lastOrbitSnapNonce = orbitSnapNonce;
    }
    const localOrbit = orbitOverride && owner === "input";
    const followOrbit = localOrbit || hasClipOrbitDistance;
    const { followFlagSlot } = streamPlaybackStore.getState();
    // Both springs follow the flag across carrier/item hand-offs. A drop also
    // unlocks at the last smoothed view angle instead of restoring old angles.
    const orbitSpringKey =
      followFlagSlot != null ? `flag:${followFlagSlot}` : orbitTargetId;
    if (!localOrbit) this.orbitDistance.reset();
    const lastLockedOrbit = this.lockedOrbit;
    if (!orbitLocked && lastLockedOrbit.targetId != null) {
      // Unlock in place, once, instead of publishing changing angles every frame.
      if (
        orbitOverride &&
        orbitSpringKey === lastLockedOrbit.targetId &&
        owner === "input"
      ) {
        streamPlaybackStore.setState({
          orbitOverrideYaw: lastLockedOrbit.yaw,
          orbitOverridePitch: lastLockedOrbit.pitch,
        });
      }
      lastLockedOrbit.reset();
    }
    const projectile = projectileTracking
      ? currentEntities.get(projectileTracking.projectileId)
      : undefined;
    const liveProjectile =
      clipProjectile ??
      (isTrackableProjectile(projectile) ? projectile : undefined);
    const terminalPosition = projectileTracking?.terminalPosition;
    const projectileEnded =
      projectileTracking !== null &&
      (terminalPosition !== undefined || liveProjectile === undefined);
    let orbitColliderExclusions: OrbitColliderExclusions;
    if (
      cameraMode !== "freeFly" &&
      (!isLive || isWatcher) &&
      !recordedControl &&
      !recordedObserverOrbit &&
      !this.corpseView &&
      (mode === "third-person" || orbitOverride) &&
      orbitTargetId
    ) {
      const resolvedTarget =
        root && !projectileTracking && !clipProjectile
          ? resolveCameraTarget(root, currentEntities, orbitTargetId)
          : null;
      if (resolvedTarget || liveProjectile || terminalPosition) {
        const targetGroup = resolvedTarget?.group;
        const orbitEntity = resolvedTarget?.entity;
        const vehicleOrbit = followOrbit && orbitEntity?.type === "Vehicle";
        if (followOrbit && resolvedTarget) {
          // Flag follow targets the flag item or its carrier. Keep that
          // direct target out of the ray even when orbiting its vehicle.
          orbitColliderExclusions = followOrbitColliders(
            currentEntities.get(orbitTargetId),
            orbitEntity,
          );
        }
        if (terminalPosition) torqueVecToThree(terminalPosition, _orbitTarget);
        else if (liveProjectile)
          this.placeProjectileOrbitPivot(liveProjectile, frame);
        else if (followOrbit && resolvedTarget)
          this.placeFollowOrbitPivot(resolvedTarget);
        else if (targetGroup) _orbitTarget.copy(targetGroup.position);
        // Loose-spring target for the auto-director: ease toward where
        // the followed thing IS rather than teleporting with it through
        // drops, passes and pickups. A jump far beyond hand-off range is
        // a shot cut — snap, don't glide across the map. EXCEPT a
        // followed flag arriving at a flag stand: that jump is the
        // capture/return teleport, and chasing it yanks the viewer to
        // the home base mid-shot — freeze on the last framing instead
        // and let the next shot (the aftermath) own what follows.
        const spState = streamPlaybackStore.getState();
        const damping =
          projectileTracking || clipOrbit ? null : spState.orbitTargetDamping;
        if (damping != null) {
          advanceFollowSpring(
            this.spring,
            _orbitTarget,
            orbitTargetId,
            spState.orbitSnapNonce,
            damping,
            ctx.delta * (isPlaying ? playback.rate : 0),
          );
        } else {
          this.spring.seeded = false;
          orbitSpringDebug.active = false;
        }
        if (!followOrbit && currentCamera?.orbitOffset) {
          _orbitTarget.y += currentCamera.orbitOffset;
        } else if (!followOrbit && orbitEntity?.type === "Player") {
          _orbitTarget.y += 1.0;
        } else raiseLooseFlagPivot(orbitEntity);

        if (clipOrbit?.orbitDistance !== undefined) {
          const { quaternion } = _clipOrbitCamera;
          quaternion.fromArray(clipOrbit.quaternion);
          let distance = Math.min(MAX_ORBIT_DISTANCE, clipOrbit.orbitDistance);
          const fromDistance = transition?.from.orbitDistance;
          _clipOrbitCamera.orbitTransition = fromDistance !== undefined;
          if (transition && fromDistance !== undefined) {
            // Stay on an orbit around the current subject throughout the move.
            quaternion.slerp(
              _interpQuatA.fromArray(transition.from.quaternion),
              1 - transition.fraction,
            );
            distance = MathUtils.lerp(
              Math.min(MAX_ORBIT_DISTANCE, fromDistance),
              distance,
              transition.fraction,
            );
          }
          placeClipOrbit(_clipOrbitCamera, distance, orbitColliderExclusions);
          this.engine.clipFollowCamera = _clipOrbitCamera;
          return;
        }

        let hasDirection = false;
        if (orbitOverride) {
          if (orbitLocked && targetGroup) {
            if (vehicleOrbit) {
              _playerView.yaw = threeForwardHeading(targetGroup.quaternion);
              _playerView.pitch = 0;
            } else {
              getPlayerViewAngles(
                targetGroup.quaternion,
                currentEntities.get(orbitTargetId),
                interpT,
                _playerView,
                aimCorrection,
              );
            }
            lastLockedOrbit.update(
              orbitSpringKey ?? orbitTargetId,
              playback.seekNonce,
              streamClock.time,
              _playerView,
            );
          }
          // Both camera modes use positive pitch to look down, with the
          // orbit pulling back above the target. Demo and watch share this.
          orbitPullbackDir(
            orbitLocked ? lastLockedOrbit.yaw : spState.orbitOverrideYaw,
            orbitLocked ? lastLockedOrbit.pitch : spState.orbitOverridePitch,
            _orbitDir,
          );
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        } else if (currentCamera?.orbitDirection) {
          // Use explicit pullback direction (e.g. from full vehicle quaternion
          // including roll) when available.
          _orbitDir.set(
            currentCamera.orbitDirection[0],
            currentCamera.orbitDirection[1],
            currentCamera.orbitDirection[2],
          );
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        } else if (
          typeof cameraYaw === "number" &&
          typeof cameraPitch === "number"
        ) {
          // Pull back behind the model from the stream camera's yaw/pitch.
          // The stream camera's pitch is the negative of the orbit-override
          // convention, so negate it to reuse orbitPullbackDir — preserving
          // the original {-cz·cx, -sx, -sz·cx} behind-the-model direction.
          orbitPullbackDir(cameraYaw, -cameraPitch, _orbitDir);
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        }
        if (!hasDirection) {
          _orbitDir.copy(streamCamera.position).sub(_orbitTarget);
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        }
        if (hasDirection) {
          _orbitDir.normalize();
          // The real observer follow orbits at 4 (camera.cs setOrbitMode
          // 0.5/4.5/4.5 rendered at max − min); spectate mode pulls back
          // further for a better view of the action.
          // User-controlled follow zooms distance via the scroll wheel;
          // otherwise use the recorder's distance or the mode default.
          const orbitDistance = orbitOverride
            ? spState.orbitOverrideDistance
            : Math.max(
                0.1,
                currentCamera?.orbitDistance ?? (isWatcher ? 8 : 4),
              );
          _orbitCandidate
            .copy(_orbitTarget)
            .addScaledVector(_orbitDir, orbitDistance);

          // Auto-director terrain track: a follow camera trailing a
          // skier dips into every jag of the ground. Ride the SMOOTHED
          // terrain surface a few metres up instead — a rolling curve
          // even where the heightmap is jagged — with the raw-height
          // clamp underneath as the never-inside-the-hill guarantee.
          // Tight close shots (the defender's hip, the hero frame) are
          // deliberately near the ground and keep only the hard floor.
          const directing = damping != null;
          if (directing && orbitDistance >= TERRAIN_TRACK_MIN_DISTANCE) {
            const soft = smoothedGroundHeightAt(
              _orbitCandidate.x,
              _orbitCandidate.z,
            );
            if (
              soft != null &&
              _orbitCandidate.y < soft + TERRAIN_FOLLOW_CLEARANCE
            ) {
              _orbitCandidate.y = soft + TERRAIN_FOLLOW_CLEARANCE;
            }
          }
          if (directing) {
            const hard = groundHeightAt(_orbitCandidate.x, _orbitCandidate.z);
            if (
              hard != null &&
              _orbitCandidate.y < hard + GROUND_MIN_CLEARANCE
            ) {
              _orbitCandidate.y = hard + GROUND_MIN_CLEARANCE;
            }
          }

          if (localOrbit) {
            const distanceSpring = this.orbitDistance;
            _orbitCandidate
              .copy(_orbitTarget)
              .addScaledVector(
                _orbitDir,
                orbitDistance + ORBIT_OBSTACLE_CUSHION,
              );
            const safeDistance = constrainOrbitCamera(
              _orbitTarget,
              _orbitCandidate,
              cameraRegistry.perspective
                ? orbitCameraClearance(cameraRegistry.perspective)
                : undefined,
              (rayDistance) =>
                Math.min(
                  orbitDistance,
                  rayDistance -
                    Math.min(ORBIT_OBSTACLE_CUSHION, rayDistance * 0.25),
                ),
              orbitColliderExclusions,
            );
            // Ease the actual camera toward a validated destination, allowing
            // brief intersections rather than snapping when clearance changes.
            // Use frame time so zoom/manual orbit also work while paused.
            const distance = distanceSpring.update(
              orbitSpringKey ?? orbitTargetId,
              playback.seekNonce,
              ctx.delta,
              safeDistance,
            );
            _orbitCandidate
              .copy(_orbitTarget)
              .addScaledVector(_orbitDir, distance);
          }
          streamCamera.position.copy(_orbitCandidate);
          // A wall against the pivot can collapse the arm completely. Keep
          // its viewing direction rather than lookAt's coincident-point fallback.
          streamCamera.lookAt(
            _orbitCandidate.distanceToSquared(_orbitTarget) > 1e-10
              ? _orbitTarget
              : _tmpVec.copy(_orbitTarget).sub(_orbitDir),
          );
          if (
            localOrbit &&
            cameraMode === "orbitOverride" &&
            (followBlend === null || followBlend === 1)
          )
            this.engine.recordingOrbitDistance =
              _orbitCandidate.distanceTo(_orbitTarget);
        }
      }
    }

    if (projectileTracking) {
      if (projectileEnded) exitToFreeFly();
      return;
    }

    const eyeFollowId =
      followBlend === null
        ? firstPersonFollowId
        : followBlend < 1
          ? orbitTargetId
          : undefined;
    const corpseView = this.corpseView;
    if (corpseView) {
      const corpse = currentEntities.get(corpseView.id);
      const group = root?.children.find(
        (child) => child.name === corpseView.id,
      );
      if (corpse && this.placeOrbitCenter(corpse, group)) {
        streamCamera.quaternion.fromArray(
          yawPitchToQuaternion(corpseView.yaw, 0),
        );
        applyObserverOrbit(streamCamera, _orbitTarget);
        return;
      }
    } else if (root && eyeFollowId && this.followEyeTarget) {
      // During a Tab transition, the orbit endpoint uses spectator controls.
      if (
        this.readFollowEye(
          frame,
          root,
          eyeFollowId,
          this.followEyeTarget,
          aimCorrection,
        )
      ) {
        if (owner === "input")
          this.engine.recordingFollowEye =
            cameraMode === "firstPersonOverride" && !followBlend;
        if (followBlend) {
          streamCamera.position.lerp(
            _followEyeCamera.position,
            1 - followBlend,
          );
          constrainOrbitCamera(
            _followEyeCamera.position,
            streamCamera.position,
            cameraRegistry.perspective
              ? orbitCameraClearance(cameraRegistry.perspective)
              : undefined,
            undefined,
            orbitColliderExclusions,
          );
          streamCamera.quaternion.slerp(
            _followEyeCamera.quaternion,
            1 - followBlend,
          );
        } else {
          streamCamera.position.copy(_followEyeCamera.position);
          streamCamera.quaternion.copy(_followEyeCamera.quaternion);
          if (
            clipSample &&
            shouldUseClipFollowEye(clipSample, eyeFollowId, followEntityId)
          )
            this.engine.clipFollowCamera = _followEyeCamera;
        }
      }
    }

    if (recordedObserverOrbit && currentCamera) {
      const targetId = currentCamera.orbitTargetId;
      const entity = targetId ? currentEntities.get(targetId) : undefined;
      const group = entity
        ? this.engine.entities.get(entity.id)?.root
        : undefined;
      if (currentCamera.orbitPoint) {
        torqueVecToThree(currentCamera.orbitPoint, _orbitTarget);
      } else if (!entity || !this.placeOrbitCenter(entity, group)) {
        return;
      }
      applyObserverOrbit(
        streamCamera,
        _orbitTarget,
        currentCamera.orbitDistance,
        currentCamera.orbitPoint ? undefined : cameraColliderId(entity),
      );
    } else if (recordedControl && currentCamera) {
      const group = this.engine.entities.get(recordedControl.id)?.root;
      const mount = recordedControl.mountObjectId
        ? currentEntities.get(recordedControl.mountObjectId)
        : undefined;
      const pilotedMount =
        mount?.id === currentCamera.controlEntityId ? mount : undefined;
      const db = this.entityDatablock(pilotedMount ?? recordedControl);
      const min =
        typeof db?.cameraMinDist === "number" ? db.cameraMinDist : 0.2;
      const max = typeof db?.cameraMaxDist === "number" ? db.cameraMaxDist : 3;
      const shapeEye = recordedControl.type !== "Player";
      let mountedPlayerLook: Quaternion | undefined;
      if (mount && !shapeEye) {
        const head = currentCamera.controlMountHead;
        if (head) {
          const previous = previousCamera?.controlMountHead ?? head;
          mountedPlayerLook = _mountedHeadRotation.fromArray(
            yawPitchToQuaternion(
              previous[0] + (head[0] - previous[0]) * interpT,
              previous[1] + (head[1] - previous[1]) * interpT,
            ),
          );
        } else {
          const aim = getPlayerRenderAim(
            _mountedHeadRotation.identity(),
            recordedControl,
            interpT,
            _followAim,
          );
          mountedPlayerLook = _mountedHeadRotation.fromArray(
            yawPitchToQuaternion(aim.headYaw, aim.pitch),
          );
        }
      }
      const blend = recordedCameraBlend(currentCamera, interpT);
      applyPlayerControlCamera(
        streamCamera,
        group,
        recordedControl.id,
        Math.max(0, max - min),
        blend,
        {
          cameraOffset:
            typeof db?.cameraOffset === "number" ? db.cameraOffset : 0,
          colliderId: cameraColliderId(recordedControl),
          mountColliderId: cameraColliderId(mount),
          mountedPlayerLook,
          shapeEye,
        },
      );
      if (
        clipSample?.cameraMode === "original" &&
        blend === 0 &&
        group &&
        !recordedControl.damageState &&
        (recordedControl.type === "Player" ||
          recordedControl.type === "Vehicle" ||
          recordedControl.className === "Turret")
      ) {
        _followEyeCamera.position.copy(streamCamera.position);
        _followEyeCamera.quaternion.copy(streamCamera.quaternion);
        this.engine.clipFollowCamera = _followEyeCamera;
      }
    }
  }

  /** GameConnection keeps the player as the eye owner unless its nested
   * control object opts into using its own eye (e.g. the tank gunner turret). */
  private originalCameraControl(
    snapshot: StreamSnapshot,
    entities: EntityById,
  ) {
    const id = snapshot.camera?.controlEntityId;
    if (id === undefined) return undefined;
    const controlled = entities.get(id);
    const playerId = snapshot.controlPlayerGhostId;
    if (
      playerId === undefined ||
      playerId === id ||
      this.entityDatablock(controlled)?.useEyePoint === true
    )
      return controlled;
    return entities.get(playerId) ?? controlled;
  }

  private entityDatablock(entity: StreamEntity | undefined) {
    return entity?.dataBlockId === undefined
      ? undefined
      : this.stream?.getDataBlockData(entity.dataBlockId);
  }

  private placeProjectileOrbitPivot(
    projectile: StreamEntity,
    frame: StreamFrame,
  ): void {
    interpolateStreamPosition(
      _orbitTarget,
      projectile,
      getEntityMap(frame.renderPrev).get(projectile.id),
      frame.interpT,
    );
  }

  private placeFollowOrbitPivot({ entity, group }: OrbitTarget): void {
    if (entity?.type === "Player") this.placeOrbitCenter(entity, group, 0.8);
    else if (entity?.type === "Vehicle") this.placeOrbitCenter(entity, group);
    else _orbitTarget.copy(group.position);
  }

  private placeOrbitCenter(
    entity: StreamEntity,
    group: Object3D | undefined,
    playerHeightFraction = 0.5,
  ): boolean {
    return readStreamEntityCenter(
      _orbitTarget,
      entity,
      group,
      this.stream,
      playerHeightFraction,
    );
  }
}

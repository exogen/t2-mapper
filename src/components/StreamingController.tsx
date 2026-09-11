import {
  applyStreamEntityPose,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { createLogger } from "../logger";
import { orbitSpringDebug } from "../state/cameraDebug";
import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import type { Group, Object3D } from "three";
import {
  DEFAULT_EYE_HEIGHT,
  STREAM_TICK_SEC,
  torqueHorizontalFovToThreeVerticalFov,
} from "../stream/playbackUtils";
import { useSettings } from "./SettingsProvider";
import { ParticleEffects } from "./ParticleEffects";
import { eyePositions } from "./eyePositions";
import { useProgress } from "@react-three/drei";
import { startAssetPrefetch, stopAssetPrefetch } from "../assetPrefetch";
import { isRelayRecording } from "../stream/demoDate";
import { stopAllTrackedSounds } from "./AudioEmitter";
import { useEngineStoreApi, advanceEffectClock } from "../state/engineStore";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import { cameraRegistry } from "../state/cameraRegistry";
import { FramePriority } from "./framePriority";
import { PlaybackClock } from "../stream/PlaybackClock";
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
  streamClock,
  streamPlaybackStore,
  resetStreamPlayback,
} from "../state/streamPlaybackStore";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "../stream/entityBridge";
import { sameImageMounts } from "../stream/imageMount";
import {
  yawPitchToQuaternion,
  MAX_PITCH,
  threeForwardHeading,
  orbitPullbackDir,
} from "../stream/streamHelpers";
import type {
  StreamRecording,
  StreamEntity,
  StreamSnapshot,
  StreamingPlayback,
} from "../stream/types";
import type { GameEntity } from "../state/gameEntityTypes";
import { isSceneEntity } from "../state/gameEntityTypes";

type EntityById = Map<string, StreamEntity>;

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

/** Cache entity-by-id Maps per snapshot so they're built once, not every frame. */
const _snapshotEntityCache = new WeakMap<StreamSnapshot, EntityById>();
function getEntityMap(snapshot: StreamSnapshot): EntityById {
  let map = _snapshotEntityCache.get(snapshot);
  if (!map) {
    map = new Map(snapshot.entities.map((e) => [e.id, e]));
    _snapshotEntityCache.set(snapshot, map);
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

/** PlayerData::maxLookAngle — all Tribes 2 armor datablocks use 1.5 rad (~85.9°). */
const DEFAULT_MAX_LOOK_ANGLE = 1.5;

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
 * used. headPitch/headYaw are the entity's normalized mHead values.
 */
function computeFirstPersonCamera(
  camera: { position: Vector3; quaternion: Quaternion },
  playerGroup: { position: Vector3; quaternion: Quaternion },
  eyePos: Vector3,
  headPitch: number,
  headYaw: number,
  maxLookAngle = DEFAULT_MAX_LOOK_ANGLE,
): void {
  // Position: body position + body rotation * eye offset.
  _tmpVec.copy(eyePos).applyQuaternion(playerGroup.quaternion);
  camera.position.copy(playerGroup.position).add(_tmpVec);

  // Body quat is Ry(-rotationZ) (playerYawToQuaternion), so model forward
  // is (cos rotZ, 0, sin rotZ) — recover the Torque body yaw from it.
  const bodyYaw = threeForwardHeading(playerGroup.quaternion);
  const pitch = Math.max(
    -MAX_PITCH,
    Math.min(MAX_PITCH, headPitch * maxLookAngle),
  );
  const [rx, ry, rz, rw] = yawPitchToQuaternion(
    bodyYaw + headYaw * maxLookAngle,
    pitch,
  );
  camera.quaternion.set(rx, ry, rz, rw);
}

/**
 * Resolve where a follow target actually renders. Mounted entities
 * (players in vehicles) portal into their mount's bone and have no
 * top-level group in the entity root — the camera follows the mount
 * (the vehicle) instead, walking nested mounts to the outermost carrier.
 */
function resolveCameraTarget(
  root: Group,
  entities: EntityById,
  id: string,
): { group: Object3D; entity: StreamEntity | undefined } | null {
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

export function StreamingController({
  recording,
}: {
  recording: StreamRecording;
}) {
  const engineStore = useEngineStoreApi();
  const { fov: userFov } = useSettings();
  const springRef = useRef<FollowSpring>(newFollowSpring());
  const playbackClockRef = useRef<PlaybackClock>(null!);
  if (!playbackClockRef.current) playbackClockRef.current = new PlaybackClock();
  const prevTickSnapshotRef = useRef<StreamSnapshot | null>(null);
  /**
   * What the playback pass resolved this frame, for the camera pass: the
   * tick pair being blended and how far between them the playhead sits.
   */
  const frameRef = useRef<{
    renderCurrent: StreamSnapshot;
    renderPrev: StreamSnapshot;
    interpT: number;
  } | null>(null);
  const currentTickSnapshotRef = useRef<StreamSnapshot | null>(null);
  const streamRef = useRef<StreamingPlayback | null>(
    recording.streamingPlayback ?? null,
  );
  const publishedSnapshotRef = useRef<StreamSnapshot | null>(null);
  const lastPublishTimeRef = useRef(0);
  const lastSyncedSnapshotRef = useRef<StreamSnapshot | null>(null);

  const syncRenderableEntities = useCallback((snapshot: StreamSnapshot) => {
    if (snapshot === lastSyncedSnapshotRef.current) return;
    lastSyncedSnapshotRef.current = snapshot;

    // Operate directly on the store's Map — one canonical source of truth.
    const map = gameEntityStore.getState().streamEntities;
    let structuralChange = false;

    // Track which IDs are in the current snapshot for the removal pass.
    const currentIds = new Set<string>();

    for (const entity of snapshot.entities) {
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
        renderEntity = streamEntityToGameEntity(entity, snapshot.timeSec);
        if (prevHidden) renderEntity.debugHidden = true;
        map.set(entity.id, renderEntity);
        structuralChange = true;
      } else {
        // Structural changes (mount relationships, force field state) are
        // only seen through a new entity reference — EntityScene
        // re-evaluates mounts (portal rendering) when references change
        // (useAllGameEntities compares references, not versions) — so
        // clone the entity to make the transition visible. The clone
        // shares keyframes/threads arrays, so imperative playback state
        // carries over.
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
          time: snapshot.timeSec,
          position: entity.position ?? [0, 0, 0],
          rotation: entity.rotation ?? [0, 0, 0, 1],
        });
      }
      const kf = keyframes[0];
      kf.time = snapshot.timeSec;
      if (entity.position) kf.position = entity.position;
      if (entity.rotation) kf.rotation = entity.rotation;
      kf.velocity = entity.velocity;
      kf.health = entity.health;
      kf.energy = entity.energy;
      kf.actionAnim = entity.actionAnim;
      kf.actionAtEnd = entity.actionAtEnd;
      kf.actionHoldAtEnd = entity.actionHoldAtEnd;
      kf.actionSeq = entity.actionSeq;
      kf.actionAnimPos = entity.actionAnimPos;
      kf.actionTimeSec = entity.actionTimeSec;
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
  }, []);

  useEffect(() => {
    // Stop any lingering sounds from the previous recording before setting
    // up the new one. One-shot sounds and looping projectile sounds survive
    // across recording changes because ParticleEffects doesn't unmount.
    stopAllTrackedSounds();

    streamRef.current = recording.streamingPlayback ?? null;
    lastSyncedSnapshotRef.current = null;
    publishedSnapshotRef.current = null;
    lastPublishTimeRef.current = 0;
    resetStreamPlayback();
    playbackClockRef.current.reset(
      0,
      engineStore.getState().playback.seekNonce,
    );
    prevTickSnapshotRef.current = null;
    currentTickSnapshotRef.current = null;

    const stream = streamRef.current;
    streamPlaybackStore.setState({ playback: stream });
    gameEntityStore.getState().beginStreaming(recording.source);

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
    stream.onMissionInfoChange = () => {
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
    if (recording.source !== "live") {
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
      missionName: recording.missionName ?? undefined,
      missionTypeDisplayName:
        savedMissionTypeDisplayName ?? recording.gameType ?? undefined,
      missionDisplayName: savedMissionDisplayName ?? undefined,
      gameClassName: savedGameClassName ?? undefined,
      serverDisplayName:
        savedServerDisplayName ?? recording.serverDisplayName ?? undefined,
      recorderName:
        savedConnectedPlayerName ?? recording.recorderName ?? undefined,
      recordingDate: recording.recordingDate ?? undefined,
    });
    // From-connect demos (relay auto-captures) stream the scene in over
    // their first seconds, so a paused start would show black — begin at
    // the first frame that has something to render. Retail demos carry
    // the scene in their initial block, so this is ~0 (no skip).
    const snapshot =
      recording.source === "demo"
        ? stream.stepToTime(stream.findSceneReadyTime())
        : stream.getSnapshot();

    streamClock.time = snapshot.timeSec;
    playbackClockRef.current.time = snapshot.timeSec;
    prevTickSnapshotRef.current = snapshot;
    currentTickSnapshotRef.current = snapshot;
    syncRenderableEntities(snapshot);

    setStreamSnapshot(snapshot);
    publishedSnapshotRef.current = snapshot;

    return () => {
      stopAllTrackedSounds();
      stopAssetPrefetch();
      // Null out streamRef so useFrame stops syncing entities.
      streamRef.current = null;
      // Don't call endStreaming() or clear the snapshot — leave entities,
      // HUD, and chat in place as a frozen snapshot after disconnect.
      resetStreamPlayback();
    };
  }, [recording, engineStore, syncRenderableEntities]);

  // ── Playback: advance the demo clock, step the stream and place every
  // entity. Runs before shape animation and the camera ladder, which
  // both read what it writes (see framePriority.ts).
  useFrame((state, delta) => {
    const stream = streamRef.current;
    if (!stream) return;
    const clock = playbackClockRef.current;

    if (
      stream.needsReplay &&
      engineStore.getState().playback.seekNonce === clock.seekNonce
    )
      engineStore.getState().seekPlayback(clock.time);

    const storeState = engineStore.getState();
    const playback = storeState.playback;
    const isPlaying = playback.status === "playing";
    const timeScale = playback.rate;
    if (playback.seekNonce !== clock.seekNonce) {
      // In-flight sounds belong to the old timeline position. Loops that
      // should still be playing at the target re-trigger from ghost state
      // (sound slots, jet, weapon fire, projectiles) within a frame or two.
      stopAllTrackedSounds();
    }

    const { snapshot, seekPrevious, isSeeking, playbackDelta } = clock.step(
      stream,
      playback,
      delta,
    );
    // Effect timers advance with the successfully reconstructed playback frame.
    if (isPlaying) advanceEffectClock(playbackDelta, timeScale);

    const currentTick = currentTickSnapshotRef.current;
    if (seekPrevious) {
      prevTickSnapshotRef.current = seekPrevious;
      currentTickSnapshotRef.current = snapshot;
    } else if (
      !currentTick ||
      snapshot.timeSec < currentTick.timeSec ||
      snapshot.timeSec - currentTick.timeSec > STREAM_TICK_SEC * 1.5
    ) {
      prevTickSnapshotRef.current = snapshot;
      currentTickSnapshotRef.current = snapshot;
    } else if (snapshot.timeSec !== currentTick.timeSec) {
      prevTickSnapshotRef.current = currentTick;
      currentTickSnapshotRef.current = snapshot;
    }

    const renderCurrent = currentTickSnapshotRef.current ?? snapshot;
    const renderPrev = prevTickSnapshotRef.current ?? renderCurrent;
    const tickStartTime = renderCurrent.timeSec - STREAM_TICK_SEC;
    const interpT = Math.max(
      0,
      Math.min(1, (clock.time - tickStartTime) / STREAM_TICK_SEC),
    );

    streamClock.time = clock.time;

    syncRenderableEntities(renderCurrent);

    // Publish snapshot when it changed. useSyncExternalStore
    // notifications are handled SYNCHRONOUSLY by React and preempt (and
    // restart) in-progress Suspense retry renders, so per-tick publishes
    // starve asset pop-in while shapes are loading: loaded GLBs sit in
    // cache while their retry render never gets to finish (pausing a
    // demo made everything appear instantly). While three's
    // DefaultLoadingManager reports active loads (via drei's useProgress
    // store), throttle publishes hard so retries get long uninterrupted
    // windows; otherwise publish every tick. Imperative per-frame
    // consumers (nameplates, entity fields, streamClock) bypass React
    // and are unaffected either way.
    if (renderCurrent !== publishedSnapshotRef.current) {
      const now = performance.now();
      const publishInterval =
        !isSeeking && useProgress.getState().active ? 500 : 0;
      if (now - lastPublishTimeRef.current >= publishInterval) {
        lastPublishTimeRef.current = now;
        publishedSnapshotRef.current = renderCurrent;
        setStreamSnapshot(renderCurrent);
      }
    }

    // Imperative position interpolation via the shared entity root.
    const currentEntities = getEntityMap(renderCurrent);
    const previousEntities = getEntityMap(renderPrev);
    streamRenderFrame.current = currentEntities;
    streamRenderFrame.previous = previousEntities;
    streamRenderFrame.interpT = interpT;
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
          state.camera,
        );
      }
    }

    // Pause at the true end of the demo. While a progressive download is
    // still running, an exhausted snapshot is merely the buffering
    // frontier — the playhead clamp above holds position and playback
    // resumes on its own as bytes arrive.
    if (isPlaying && snapshot.exhausted && stream.streamComplete !== false) {
      storeState.setPlaybackStatus("paused");
    }

    // Hand the camera pass the tick pair it must interpolate between.
    frameRef.current = { renderCurrent, renderPrev, interpT };
  }, FramePriority.StreamPlayback);

  // ── The stream's camera pose: the recorded view, the orbit follow, or
  // first person. Runs after the shapes have animated (the first-person
  // eye node) and after the director has set its orbit parameters.
  useFrame((state, delta) => {
    const frame = frameRef.current;
    if (!frame) return;
    const { renderCurrent, renderPrev, interpT } = frame;
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const currentEntities = getEntityMap(renderCurrent);
    const root = streamPlaybackStore.getState().root;

    const currentCamera = renderCurrent.camera;
    const previousCamera =
      currentCamera &&
      renderPrev.camera &&
      renderPrev.camera.mode === currentCamera.mode &&
      renderPrev.camera.controlEntityId === currentCamera.controlEntityId &&
      renderPrev.camera.orbitTargetId === currentCamera.orbitTargetId
        ? renderPrev.camera
        : null;

    // Camera mode override for demo playback. "freeFly" lets
    // ObserverControls drive the camera; "orbitOverride" uses
    // user-controlled yaw/pitch for orbit instead of stream data.
    const cameraMode = streamPlaybackStore.getState().cameraMode;
    // In live mode, InputConsumer owns camera position and rotation
    // (moves are applied locally, matching how the real Tribes 2 client
    // handles its control Camera). StreamingController still handles
    // entity interpolation, FOV, and orbit target positioning.
    const isLive = recording.source === "live";
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
    // to follow the view (so these writes must not hit state.camera, which
    // would stomp the ortho rig).
    const streamCamera = cameraRegistry.perspective ?? state.camera;

    if (currentCamera && cameraMode !== "freeFly") {
      // In live mode, InputConsumer owns both camera position and rotation
      // (client-side prediction with server reconciliation + interpolateTick,
      // matching Tribes 2's Camera behavior). StreamingController only
      // handles entity interpolation, FOV, and orbit target positioning.
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

          _interpQuatA.set(...previousCamera.rotation);
          _interpQuatB.set(...currentCamera.rotation);
          _interpQuatA.slerp(_interpQuatB, interpT);
          streamCamera.quaternion.copy(_interpQuatA);
        } else {
          streamCamera.position.set(
            currentCamera.position[1],
            currentCamera.position[2],
            currentCamera.position[0],
          );
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

      if (
        "isPerspectiveCamera" in streamCamera &&
        (streamCamera as any).isPerspectiveCamera
      ) {
        const perspectiveCamera = streamCamera as any;
        // Use the user's FOV preference, matching how the real client applies
        // $pref::Player::defaultFov locally. The stream's camera FOV is the
        // recorder's setting (demos) or server default (live).
        const fovValue = userFov;
        const verticalFov = torqueHorizontalFovToThreeVerticalFov(
          fovValue,
          perspectiveCamera.aspect,
        );
        if (Math.abs(perspectiveCamera.fov - verticalFov) > 0.01) {
          perspectiveCamera.fov = verticalFov;
          perspectiveCamera.updateProjectionMatrix();
        }
      }
    }

    // Relay (MapGenius) demos: the recorder is an observer that never
    // moves, so its view is only worth a starting pose. "original" seeds
    // the camera from the recorded view (the block above, this frame) and
    // hands over to free-fly — on load, on a moment link without a camera,
    // and when the camera cycle comes back around.
    if (
      cameraMode === "original" &&
      currentCamera &&
      !isLive &&
      isRelayRecording(recording.recorderName)
    ) {
      streamPlaybackStore.setState({ cameraMode: "freeFly" });
    }

    const mode = currentCamera?.mode;
    // In live mode, InputConsumer handles orbit positioning from local rotation
    // so the orbit responds at frame rate. Skip here to avoid fighting —
    // EXCEPT spectate mode, where InputConsumer's live path is off and the
    // follow target is chosen client-side (streamPlaybackStore.followEntityId;
    // the relay's server camera never enters orbit mode).
    // In orbitOverride mode with a valid orbit target, use user-controlled
    // yaw/pitch instead of stream data.
    const isWatcher =
      isLive && liveConnectionStore.getState().role === "watcher";
    // The follow target is chosen client-side (followEntityId) in watch
    // AND in demo camera overrides — it wins over the recorder's own
    // orbitTargetId, which is only meaningful for original-mode playback.
    const userFollowing =
      isWatcher ||
      (!isLive &&
        (cameraMode === "orbitOverride" ||
          cameraMode === "firstPersonOverride"));
    const orbitTargetId =
      (userFollowing ? streamPlaybackStore.getState().followEntityId : null) ??
      currentCamera?.orbitTargetId ??
      undefined;
    const orbitOverride =
      cameraMode === "orbitOverride" &&
      (!isLive || isWatcher) &&
      orbitTargetId != null;
    if (
      currentCamera &&
      cameraMode !== "freeFly" &&
      (!isLive || isWatcher) &&
      (mode === "third-person" || orbitOverride) &&
      root &&
      orbitTargetId
    ) {
      const resolvedTarget = resolveCameraTarget(
        root,
        currentEntities,
        orbitTargetId,
      );
      if (resolvedTarget) {
        const targetGroup = resolvedTarget.group;
        const orbitEntity = resolvedTarget.entity;
        _orbitTarget.copy(targetGroup.position);
        // Loose-spring target for the auto-director: ease toward where
        // the followed thing IS rather than teleporting with it through
        // drops, passes and pickups. A jump far beyond hand-off range is
        // a shot cut — snap, don't glide across the map. EXCEPT a
        // followed flag arriving at a flag stand: that jump is the
        // capture/return teleport, and chasing it yanks the viewer to
        // the home base mid-shot — freeze on the last framing instead
        // and let the next shot (the aftermath) own what follows.
        const spState = streamPlaybackStore.getState();
        if (spState.orbitTargetDamping != null) {
          advanceFollowSpring(
            springRef.current,
            _orbitTarget,
            orbitTargetId,
            spState.orbitSnapNonce,
            spState.orbitTargetDamping,
            delta * (isPlaying ? playback.rate : 0),
          );
        } else {
          springRef.current.seeded = false;
          orbitSpringDebug.active = false;
        }
        // Torque orbits the target's render world-box center; player positions
        // in our stream are feet-level, so lift to an approximate center.
        // For vehicles, use the datablock's cameraOffset (vertical Z offset
        // in Torque space = Y in Three.js).
        if (currentCamera.orbitOffset) {
          _orbitTarget.y += currentCamera.orbitOffset;
        } else if (orbitEntity?.type === "Player") {
          _orbitTarget.y += 1.0;
        } else if (((orbitEntity?.targetRenderFlags ?? 0) & 0x2) !== 0) {
          // Flag follow (keys 1/2): the flag shape is ~2.35m tall with its
          // origin at the base — orbit its center, not the ground.
          _orbitTarget.y += 1.2;
        }

        let hasDirection = false;
        if (orbitOverride) {
          // User-controlled orbit: yaw/pitch from the store. Positive pitch
          // raises the camera to look down (see orbitPullbackDir); demo and
          // watch share this — demo's vertical was historically inverted.
          const spState = streamPlaybackStore.getState();
          orbitPullbackDir(
            spState.orbitOverrideYaw,
            spState.orbitOverridePitch,
            _orbitDir,
          );
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        } else if (currentCamera.orbitDirection) {
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
            ? streamPlaybackStore.getState().orbitOverrideDistance
            : Math.max(0.1, currentCamera.orbitDistance ?? (isWatcher ? 8 : 4));
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
          const directing =
            streamPlaybackStore.getState().orbitTargetDamping != null;
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

          streamCamera.position.copy(_orbitCandidate);
          streamCamera.lookAt(_orbitTarget);
        }
      }
    }

    // Spectate first person: mount the camera to the followed player's
    // animated eye node with the game's own eye transform (Player::
    // getEyeTransform) — position from the eye bone, orientation from
    // body yaw plus the player's replicated head pitch/yaw. The base
    // stream-camera write above is fully overwritten here.
    if (
      cameraMode === "firstPersonOverride" &&
      (!isLive || isWatcher) &&
      root &&
      orbitTargetId
    ) {
      const resolvedTarget = resolveCameraTarget(
        root,
        currentEntities,
        orbitTargetId,
      );
      if (resolvedTarget) {
        // Head angles always come from the followed PLAYER; the body
        // basis is whatever they render on (the vehicle when mounted —
        // mirroring the authoritative piloted view, which is
        // vehicle-based). Yaw extraction ignores vehicle pitch/roll,
        // keeping the horizon stable like the real vehicle look.
        const followedEntity = currentEntities.get(orbitTargetId);
        const look = followedEntity?.playerDelta;
        const lookScale = look?.maxLookAngle || 1;
        const mounted = resolvedTarget.entity?.id !== orbitTargetId;
        computeFirstPersonCamera(
          streamCamera,
          resolvedTarget.group,
          mounted
            ? _tmpVec.set(0, DEFAULT_EYE_HEIGHT, 0)
            : (eyePositions.get(orbitTargetId) ??
                _tmpVec.set(0, DEFAULT_EYE_HEIGHT, 0)),
          look
            ? (look.head[0] + look.headVec[0] * backstep) / lookScale
            : (followedEntity?.headPitch ?? 0),
          look
            ? (look.head[1] + look.headVec[1] * backstep) / lookScale
            : (followedEntity?.headYaw ?? 0),
        );
      }
    }

    // First-person camera, recorded view ONLY ("original"): add the
    // animated eye-bone offset on top of the stream camera position.
    // Every other mode owns the camera itself — free-fly is the user
    // flying it, orbitOverride is positioned by the orbit block above,
    // firstPersonOverride by the spectate block, and demo-director
    // shots write it directly — so applying the recorder's eyes here
    // would yank the camera back to them every frame on any
    // first-person recording.
    if (
      mode === "first-person" &&
      cameraMode === "original" &&
      root &&
      currentCamera?.controlEntityId
    ) {
      const eyePos = eyePositions.get(currentCamera.controlEntityId);
      const playerGroup = root.children.find(
        (child) => child.name === currentCamera.controlEntityId,
      );
      if (eyePos && playerGroup) {
        _tmpVec.copy(eyePos).applyQuaternion(playerGroup.quaternion);
        streamCamera.position.add(_tmpVec);
      } else {
        streamCamera.position.y += DEFAULT_EYE_HEIGHT;
      }
    }
  }, FramePriority.CameraStream);

  return (
    <>
      <ParticleEffects
        playback={recording.streamingPlayback}
        snapshotRef={currentTickSnapshotRef}
      />
    </>
  );
}

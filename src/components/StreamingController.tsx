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
import { playerEyePositions } from "./PlayerModel";
import { useProgress } from "@react-three/drei";
import { startAssetPrefetch, stopAssetPrefetch } from "../assetPrefetch";
import { stopAllTrackedSounds } from "./AudioEmitter";
import { useEngineStoreApi, advanceEffectClock } from "../state/engineStore";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import { cameraRegistry } from "../state/cameraRegistry";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  streamClock,
  streamPlaybackStore,
  resetStreamPlayback,
} from "../state/streamPlaybackStore";
import { streamEntityToGameEntity } from "../stream/entityBridge";
import { yawPitchToQuaternion, MAX_PITCH } from "../stream/streamHelpers";
import type {
  StreamRecording,
  StreamEntity,
  StreamSnapshot,
  StreamingPlayback,
} from "../stream/types";
import type { GameEntity } from "../state/gameEntityTypes";
import { isSceneEntity } from "../state/gameEntityTypes";

type EntityById = Map<string, StreamEntity>;

/** Safely access a field that exists only on some GameEntity variants. */
function getField(entity: GameEntity, field: string): string | undefined {
  return (entity as unknown as Record<string, unknown>)[field] as
    string | undefined;
}

/** Mutate render-affecting fields on an entity in-place from stream data.
 * Components read these fields imperatively in useFrame — no React
 * re-render is needed. This is the key to avoiding Suspense starvation. */
function mutateRenderFields(
  renderEntity: GameEntity,
  stream: StreamEntity,
): void {
  // Shared fields (on PositionedBase, used by both Player and Shape).
  const e = renderEntity as unknown as Record<string, unknown>;
  e.mountObjectId = stream.mountObjectId;
  e.mountNode = stream.mountNode;
  e.imageSlots = stream.imageSlots;
  e.threads = stream.threads;
  e.armAction = stream.armAction;
  e.targetRenderFlags = stream.targetRenderFlags;
  e.targetId = stream.targetId;
  e.iffColor = stream.iffColor;
  e.playerName = stream.playerName;
  e.teamId = stream.teamId;
  e.soundSlots = stream.soundSlots;

  // Type-specific fields.
  switch (renderEntity.renderType) {
    case "Player":
      e.falling = stream.falling;
      e.jetting = stream.jetting;
      e.weaponImageState = stream.weaponImageState;
      e.weaponImageStates = stream.weaponImageStates;
      e.headPitch = stream.headPitch;
      e.headYaw = stream.headYaw;
      // Death arrives as a DamageMask update on the existing ghost
      // (0 = alive, 1 = Disabled/dead, 2 = Destroyed) — spectate follow
      // and player cycling depend on seeing it.
      e.damageState = stream.damageState;
      break;
    case "Shape":
      e.damageState = stream.damageState;
      e.fadeVal = stream.fadeVal;
      e.cloakLevel = stream.cloakLevel;
      break;
  }
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
const _billboardFlip = new Quaternion(0, 1, 0, 0); // 180° around Y
const _orbitDir = new Vector3();
const _orbitTarget = new Vector3();
const _orbitCandidate = new Vector3();

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
  const q = playerGroup.quaternion;
  const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
  const fz = 2 * (q.x * q.z - q.w * q.y);
  const bodyYaw = Math.atan2(fz, fx);
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
  const playbackClockRef = useRef(0);
  const lastSeekTimeRef = useRef(0);
  const prevTickSnapshotRef = useRef<StreamSnapshot | null>(null);
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
          getField(renderEntity, "imageSlots") !== entity.imageSlots);

      if (needsNewIdentity) {
        const prevHidden = renderEntity?.debugHidden;
        renderEntity = streamEntityToGameEntity(entity, snapshot.timeSec);
        if (prevHidden) renderEntity.debugHidden = true;
        map.set(entity.id, renderEntity);
        structuralChange = true;
      } else {
        // Detect mount state changes — EntityScene re-evaluates mount
        // relationships (portal rendering) only when entity references
        // change (useAllGameEntities compares references, not versions),
        // so clone the entity to make the transition visible. The clone
        // shares keyframes/threads arrays, so imperative playback state
        // carries over.
        const prevMount = renderEntity!.mountObjectId;
        const prevNode = renderEntity!.mountNode;
        mutateRenderFields(renderEntity!, entity);
        if (
          renderEntity!.mountObjectId !== prevMount ||
          renderEntity!.mountNode !== prevNode
        ) {
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
      kf.damageState = entity.damageState;
    }

    // Removal pass: delete entities no longer in the snapshot.
    // Skip removal when the snapshot is empty — this happens during mission
    // transitions (EndGhosting clears the engine's entities, but no new ones
    // have arrived yet). Keeping the old render entities visible avoids a
    // blank screen flash; they'll be replaced when the new mission loads.
    if (currentIds.size > 0) {
      for (const [id, entity] of map) {
        if (currentIds.has(id)) continue;
        // Retain explosion entities with DTS shapes for up to 5 seconds.
        if (
          entity.renderType === "Explosion" &&
          entity.shapeName &&
          entity.spawnTime != null
        ) {
          const age = snapshot.timeSec - entity.spawnTime;
          if (age < 5) continue;
        }
        map.delete(id);
        structuralChange = true;
      }
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
    playbackClockRef.current = 0;
    lastSeekTimeRef.current = 0;
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
      missionTypeDisplayName: recording.gameType ?? undefined,
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
    playbackClockRef.current = snapshot.timeSec;
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

  useFrame((state, delta) => {
    const stream = streamRef.current;
    if (!stream) return;

    const storeState = engineStore.getState();
    const playback = storeState.playback;
    const isPlaying = playback.status === "playing";
    const isSeeking = playback.seekTime !== lastSeekTimeRef.current;
    if (isSeeking) {
      lastSeekTimeRef.current = playback.seekTime;
      playbackClockRef.current = playback.seekTime;
    }

    // Advance the shared effect clock so all effect timers (particles,
    // explosions, shockwaves, shape animations) respect pause and rate.
    if (isPlaying) {
      advanceEffectClock(delta, playback.rate);
      playbackClockRef.current += delta * playback.rate;
    }

    const moveTicksNeeded = Math.max(
      1,
      Math.ceil((delta * 1000 * Math.max(playback.rate, 0.01)) / 32) + 2,
    );

    // Torque interpolates backwards from the end of the current 32ms tick.
    // We sample one tick ahead and blend previous->current for smooth render.
    const sampleTimeSec = playbackClockRef.current + STREAM_TICK_SEC;
    // During a seek, process all ticks to the target immediately so the world
    // state is fully reconstructed. The per-frame tick limit only applies
    // during normal playback advancement.
    const snapshot = stream.stepToTime(
      sampleTimeSec,
      isPlaying && !isSeeking ? moveTicksNeeded : Number.POSITIVE_INFINITY,
    );

    const currentTick = currentTickSnapshotRef.current;
    if (
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
      Math.min(1, (playbackClockRef.current - tickStartTime) / STREAM_TICK_SEC),
    );

    streamClock.time = playbackClockRef.current;
    if (snapshot.exhausted && isPlaying) {
      playbackClockRef.current = Math.min(
        playbackClockRef.current,
        snapshot.timeSec,
      );
    }

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
      const publishInterval = useProgress.getState().active ? 500 : 0;
      if (now - lastPublishTimeRef.current >= publishInterval) {
        lastPublishTimeRef.current = now;
        publishedSnapshotRef.current = renderCurrent;
        setStreamSnapshot(renderCurrent);
      }
    }

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

    // Imperative position interpolation via the shared entity root.
    const currentEntities = getEntityMap(renderCurrent);
    const previousEntities = getEntityMap(renderPrev);
    const renderEntities = gameEntityStore.getState().streamEntities;
    const root = streamPlaybackStore.getState().root;
    if (root) {
      for (const child of root.children) {
        // Scene infrastructure (terrain, interiors, sky, etc.) handles its
        // own positioning — skip interpolation and visibility management.
        const renderEntity = renderEntities.get(child.name);
        if (renderEntity && isSceneEntity(renderEntity)) {
          continue;
        }

        const entity = currentEntities.get(child.name);
        // Retained entities (e.g. explosion shapes kept alive past their
        // snapshot lifetime) won't be in the snapshot entity map. Fall back
        // to their last-known keyframe position from the render entity.
        if (!entity) {
          const kfs =
            renderEntity && "keyframes" in renderEntity
              ? renderEntity.keyframes
              : undefined;
          if (kfs?.[0]?.position) {
            const kf = kfs[0];
            child.visible = true;
            child.position.set(kf.position[1], kf.position[2], kf.position[0]);
            continue;
          }
        }
        if (!entity?.position || (entity.fadeVal === 0 && !entity.cloakLevel)) {
          child.visible = false;
          continue;
        }

        child.visible = true;
        const previousEntity = previousEntities.get(child.name);
        if (previousEntity?.position) {
          const px = previousEntity.position[0];
          const py = previousEntity.position[1];
          const pz = previousEntity.position[2];
          const cx = entity.position[0];
          const cy = entity.position[1];
          const cz = entity.position[2];
          const ix = px + (cx - px) * interpT;
          const iy = py + (cy - py) * interpT;
          const iz = pz + (cz - pz) * interpT;
          child.position.set(iy, iz, ix);
        } else {
          child.position.set(
            entity.position[1],
            entity.position[2],
            entity.position[0],
          );
        }

        if (entity.faceViewer) {
          child.quaternion
            .copy(state.camera.quaternion)
            .multiply(_billboardFlip);
        } else if (entity.visual?.kind === "tracer") {
          child.quaternion.identity();
        } else if (entity.rotation) {
          if (previousEntity?.rotation) {
            _interpQuatA.set(...previousEntity.rotation);
            _interpQuatB.set(...entity.rotation);
            _interpQuatA.slerp(_interpQuatB, interpT);
            child.quaternion.copy(_interpQuatA);
          } else {
            child.quaternion.set(...entity.rotation);
          }
        }
      }
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
    const orbitTargetId =
      currentCamera?.orbitTargetId ??
      (isWatcher ? streamPlaybackStore.getState().followEntityId : null) ??
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
        // Torque orbits the target's render world-box center; player positions
        // in our stream are feet-level, so lift to an approximate center.
        // For vehicles, use the datablock's cameraOffset (vertical Z offset
        // in Torque space = Y in Three.js).
        if (currentCamera.orbitOffset) {
          _orbitTarget.y += currentCamera.orbitOffset;
        } else if (orbitEntity?.type === "Player") {
          _orbitTarget.y += 1.0;
        }

        let hasDirection = false;
        if (orbitOverride) {
          // User-controlled orbit: use yaw/pitch from store.
          const spState = streamPlaybackStore.getState();
          const sx = Math.sin(spState.orbitOverridePitch);
          const cx = Math.cos(spState.orbitOverridePitch);
          const sz = Math.sin(spState.orbitOverrideYaw);
          const cz = Math.cos(spState.orbitOverrideYaw);
          // Watch follow matches the real observer orbit (applyOrbitCamera
          // / Tribes2.exe): positive pitch raises the camera to look down.
          // Demo orbitOverride keeps its historical inverted vertical.
          _orbitDir.set(-cz * cx, isWatcher ? sx : -sx, -sz * cx);
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
          typeof currentCamera.yaw === "number" &&
          typeof currentCamera.pitch === "number"
        ) {
          const sx = Math.sin(currentCamera.pitch);
          const cx = Math.cos(currentCamera.pitch);
          const sz = Math.sin(currentCamera.yaw);
          const cz = Math.cos(currentCamera.yaw);
          // Pull back behind the model. playerYawToQuaternion uses Ry(-yaw),
          // so model forward in Three.js is (cz, 0, sz) at pitch=0.
          // Behind = (-cz*cx, -sx, -sz*cx).
          _orbitDir.set(-cz * cx, -sx, -sz * cx);
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
          const orbitDistance = Math.max(
            0.1,
            currentCamera.orbitDistance ?? (isWatcher ? 8 : 4),
          );
          _orbitCandidate
            .copy(_orbitTarget)
            .addScaledVector(_orbitDir, orbitDistance);

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
        const mounted = resolvedTarget.entity?.id !== orbitTargetId;
        computeFirstPersonCamera(
          streamCamera,
          resolvedTarget.group,
          mounted
            ? _tmpVec.set(0, DEFAULT_EYE_HEIGHT, 0)
            : (playerEyePositions.get(orbitTargetId) ??
                _tmpVec.set(0, DEFAULT_EYE_HEIGHT, 0)),
          followedEntity?.headPitch ?? 0,
          followedEntity?.headYaw ?? 0,
        );
      }
    }

    // First-person camera: either add the eye offset on top of the
    // stream camera position (original mode), or fully compute the
    // camera transform from entity state (non-authoritative, e.g.
    // observing a different player than the demo recorder). The
    // spectate override above takes precedence — never overwrite the
    // watcher's chosen view with the stream's own first-person eyes.
    if (
      mode === "first-person" &&
      cameraMode !== "firstPersonOverride" &&
      root &&
      currentCamera?.controlEntityId
    ) {
      const eyePos = playerEyePositions.get(currentCamera.controlEntityId);
      const playerGroup = root.children.find(
        (child) => child.name === currentCamera.controlEntityId,
      );

      if (cameraMode === "original") {
        // Stream camera position = entity base position. Add animated
        // eye bone offset (rotated by body orientation).
        if (eyePos && playerGroup) {
          _tmpVec.copy(eyePos).applyQuaternion(playerGroup.quaternion);
          streamCamera.position.add(_tmpVec);
        } else {
          streamCamera.position.y += DEFAULT_EYE_HEIGHT;
        }
      } else if (playerGroup) {
        // Non-authoritative: compute full camera transform from entity
        // state, matching Torque's Player::getEyeTransform.
        const controlEntity = currentEntities.get(
          currentCamera.controlEntityId,
        );
        computeFirstPersonCamera(
          streamCamera,
          playerGroup,
          eyePos ?? _tmpVec.set(0, DEFAULT_EYE_HEIGHT, 0),
          controlEntity?.headPitch ?? 0,
          controlEntity?.headYaw ?? 0,
        );
      }
    }

    if (isPlaying && snapshot.exhausted) {
      storeState.setPlaybackStatus("paused");
    }
  });

  return (
    <>
      <ParticleEffects
        playback={recording.streamingPlayback}
        snapshotRef={currentTickSnapshotRef}
      />
    </>
  );
}

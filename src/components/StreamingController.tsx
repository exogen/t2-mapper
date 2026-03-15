import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import {
  DEFAULT_EYE_HEIGHT,
  STREAM_TICK_SEC,
  torqueHorizontalFovToThreeVerticalFov,
} from "../stream/playbackUtils";
import { useSettings } from "./SettingsProvider";
import { ParticleEffects } from "./ParticleEffects";
import { PlayerEyeOffset } from "./PlayerModel";
import { stopAllTrackedSounds } from "./AudioEmitter";
import { useEngineStoreApi, advanceEffectClock } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import {
  streamPlaybackStore,
  resetStreamPlayback,
} from "../state/streamPlaybackStore";
import { streamEntityToGameEntity } from "../stream/entityBridge";
import type {
  StreamRecording,
  StreamEntity,
  StreamSnapshot,
} from "../stream/types";
import type { GameEntity } from "../state/gameEntityTypes";
import { isSceneEntity } from "../state/gameEntityTypes";

type EntityById = Map<string, StreamEntity>;

/** Safely access a field that exists only on some GameEntity variants. */
function getField(entity: GameEntity, field: string): string | undefined {
  return (entity as unknown as Record<string, unknown>)[field] as
    | string
    | undefined;
}

/** Mutate render-affecting fields on an entity in-place from stream data.
 * Components read these fields imperatively in useFrame — no React
 * re-render is needed. This is the key to avoiding Suspense starvation. */
function mutateRenderFields(
  renderEntity: GameEntity,
  stream: StreamEntity,
): void {
  switch (renderEntity.renderType) {
    case "Player": {
      const e = renderEntity as unknown as Record<string, unknown>;
      e.threads = stream.threads;
      e.weaponShape = stream.weaponShape;
      e.packShape = stream.packShape;
      e.flagShape = stream.flagShape;
      e.falling = stream.falling;
      e.jetting = stream.jetting;
      e.weaponImageState = stream.weaponImageState;
      e.weaponImageStates = stream.weaponImageStates;
      e.playerName = stream.playerName;
      e.iffColor = stream.iffColor;
      e.headPitch = stream.headPitch;
      e.headYaw = stream.headYaw;
      e.targetRenderFlags = stream.targetRenderFlags;
      break;
    }
    case "Shape": {
      const e = renderEntity as unknown as Record<string, unknown>;
      e.threads = stream.threads;
      e.targetRenderFlags = stream.targetRenderFlags;
      e.iffColor = stream.iffColor;
      break;
    }
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

/** Push the current entity map to the game entity store.
 * Only triggers a version bump (and subscriber notifications) when the
 * entity set changed (adds/removes). Render-field updates are mutated
 * in-place on existing entity objects and read imperatively in useFrame. */
function pushEntitiesToStore(entityMap: Map<string, GameEntity>): void {
  gameEntityStore
    .getState()
    .setAllStreamEntities(Array.from(entityMap.values()));
}

const _tmpVec = new Vector3();
const _interpQuatA = new Quaternion();
const _interpQuatB = new Quaternion();
const _billboardFlip = new Quaternion(0, 1, 0, 0); // 180° around Y
const _orbitDir = new Vector3();
const _orbitTarget = new Vector3();
const _orbitCandidate = new Vector3();
export function StreamingController({
  recording,
}: {
  recording: StreamRecording;
}) {
  const engineStore = useEngineStoreApi();
  const { fov: userFov } = useSettings();
  const playbackClockRef = useRef(0);
  const prevTickSnapshotRef = useRef<StreamSnapshot | null>(null);
  const currentTickSnapshotRef = useRef<StreamSnapshot | null>(null);
  const eyeOffsetRef = useRef(new Vector3(0, DEFAULT_EYE_HEIGHT, 0));
  const streamRef = useRef(recording.streamingPlayback ?? null);
  const publishedSnapshotRef = useRef<StreamSnapshot | null>(null);
  const entityMapRef = useRef<Map<string, GameEntity>>(new Map());
  const lastSyncedSnapshotRef = useRef<StreamSnapshot | null>(null);
  const [firstPersonShape, setFirstPersonShape] = useState<string | null>(null);

  const syncRenderableEntities = useCallback((snapshot: StreamSnapshot) => {
    if (snapshot === lastSyncedSnapshotRef.current) return;
    lastSyncedSnapshotRef.current = snapshot;

    const prevMap = entityMapRef.current;
    const nextMap = new Map<string, GameEntity>();

    for (const entity of snapshot.entities) {
      let renderEntity = prevMap.get(entity.id);

      // Identity change -> new component (unmount/remount).
      // Compare fields that, when changed, require a full entity rebuild.
      // Only compare shapeName for entity types that actually use it.
      // Scene entities (Terrain, Interior, Sky, etc.), ForceFieldBare,
      // AudioEmitter, WayPoint, and Camera don't have shapeName on their
      // GameEntity, so comparing against entity.dataBlock would always
      // mismatch and trigger a needless rebuild every frame.
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
        // weaponShape changes only force rebuild for non-Player shapes
        // (turrets, vehicles). Players handle weapon changes internally
        // via PlayerModel's Mount0 bone, and rebuilding on weapon change
        // would lose animation state (death animations, etc.).
        (renderEntity.renderType !== "Player" &&
          hasShapeName &&
          getField(renderEntity, "weaponShape") !== entity.weaponShape);

      if (needsNewIdentity) {
        renderEntity = streamEntityToGameEntity(entity, snapshot.timeSec);
      } else {
        // Mutate render fields in-place on the existing entity object.
        // Components read these imperatively in useFrame — no React
        // re-render needed. This avoids store churn that starves Suspense.
        mutateRenderFields(renderEntity, entity);
      }

      nextMap.set(entity.id, renderEntity);

      // Keyframe update (mutable -- used for fallback position for
      // retained explosion entities and per-frame reads in useFrame).
      // Scene entities and None don't have keyframes.
      if (isSceneEntity(renderEntity) || renderEntity.renderType === "None")
        continue;
      const keyframes = renderEntity.keyframes!;
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

    // Retain explosion entities with DTS shapes after they leave the snapshot.
    // These entities are ephemeral (~1 tick) but the visual effect lasts seconds.
    for (const [id, entity] of prevMap) {
      if (nextMap.has(id)) continue;
      if (
        entity.renderType === "Explosion" &&
        entity.shapeName &&
        entity.spawnTime != null
      ) {
        const age = snapshot.timeSec - entity.spawnTime;
        if (age < 5) {
          nextMap.set(id, entity);
          continue;
        }
      }
    }

    // Only push to store when the entity set changed (adds/removes).
    const shouldRebuild =
      nextMap.size !== prevMap.size ||
      [...nextMap.keys()].some((id) => !prevMap.has(id));

    entityMapRef.current = nextMap;
    if (shouldRebuild) {
      pushEntitiesToStore(nextMap);
    }

    let nextFirstPersonShape: string | null = null;
    if (
      snapshot.camera?.mode === "first-person" &&
      snapshot.camera.controlEntityId
    ) {
      const entity = nextMap.get(snapshot.camera.controlEntityId);
      const sn = entity ? getField(entity, "shapeName") : undefined;
      if (sn) {
        nextFirstPersonShape = sn;
      }
    }
    setFirstPersonShape((prev) =>
      prev === nextFirstPersonShape ? prev : nextFirstPersonShape,
    );
  }, []);

  useEffect(() => {
    // Stop any lingering sounds from the previous recording before setting
    // up the new one. One-shot sounds and looping projectile sounds survive
    // across recording changes because ParticleEffects doesn't unmount.
    stopAllTrackedSounds();

    streamRef.current = recording.streamingPlayback ?? null;
    entityMapRef.current = new Map();
    lastSyncedSnapshotRef.current = null;
    publishedSnapshotRef.current = null;
    resetStreamPlayback();
    playbackClockRef.current = 0;
    prevTickSnapshotRef.current = null;
    currentTickSnapshotRef.current = null;

    const stream = streamRef.current;
    streamPlaybackStore.setState({ playback: stream });
    gameEntityStore.getState().beginStreaming(recording.source);

    if (!stream) {
      engineStore.getState().setPlaybackStreamSnapshot(null);
      return;
    }

    // Update gameEntityStore when mission info arrives via server messages
    // (MsgMissionDropInfo, MsgLoadInfo, MsgClientReady).
    stream.onMissionInfoChange = () => {
      gameEntityStore.getState().setMissionInfo({
        missionDisplayName: stream.missionDisplayName ?? undefined,
        missionTypeDisplayName: stream.missionTypeDisplayName ?? undefined,
        gameClassName: stream.gameClassName ?? undefined,
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
    const snapshot = stream.getSnapshot();

    streamPlaybackStore.setState({ time: snapshot.timeSec });
    playbackClockRef.current = snapshot.timeSec;
    prevTickSnapshotRef.current = snapshot;
    currentTickSnapshotRef.current = snapshot;
    syncRenderableEntities(snapshot);

    engineStore.getState().setPlaybackStreamSnapshot(snapshot);
    publishedSnapshotRef.current = snapshot;

    return () => {
      stopAllTrackedSounds();
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
    const requestedTimeSec = playback.timeMs / 1000;
    const externalSeekWhilePaused =
      !isPlaying &&
      Math.abs(requestedTimeSec - playbackClockRef.current) > 0.0005;
    const externalSeekWhilePlaying =
      isPlaying &&
      Math.abs(requestedTimeSec - streamPlaybackStore.getState().time) > 0.05;
    const isSeeking = externalSeekWhilePaused || externalSeekWhilePlaying;
    if (isSeeking) {
      // Sync stream cursor to UI/programmatic seek.
      playbackClockRef.current = requestedTimeSec;
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

    streamPlaybackStore.setState({ time: playbackClockRef.current });
    if (snapshot.exhausted && isPlaying) {
      playbackClockRef.current = Math.min(
        playbackClockRef.current,
        snapshot.timeSec,
      );
    }

    syncRenderableEntities(renderCurrent);

    // Publish the entity map for imperative reads by components in useFrame.
    // This is a plain object assignment — no React re-renders triggered.
    streamPlaybackStore.getState().entities = entityMapRef.current;

    // Publish snapshot when it changed.
    if (renderCurrent !== publishedSnapshotRef.current) {
      publishedSnapshotRef.current = renderCurrent;
      storeState.setPlaybackStreamSnapshot(renderCurrent);
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

    // When freeFlyCamera is active, skip stream camera positioning so
    // ObserverControls drives the camera instead.
    const freeFly = streamPlaybackStore.getState().freeFlyCamera;
    // In live mode, InputConsumer owns camera position and rotation
    // (moves are applied locally, matching how the real Tribes 2 client
    // handles its control Camera). StreamingController still handles
    // entity interpolation, FOV, and orbit target positioning.
    const isLive = recording.source === "live";

    if (currentCamera && !freeFly) {
      // In live mode, InputConsumer owns both camera position and rotation
      // (client-side prediction with server reconciliation + interpolateTick,
      // matching Tribes 2's Camera behavior). StreamingController only
      // handles entity interpolation, FOV, and orbit target positioning.
      if (!isLive) {
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
          state.camera.position.set(iy, iz, ix);

          _interpQuatA.set(...previousCamera.rotation);
          _interpQuatB.set(...currentCamera.rotation);
          _interpQuatA.slerp(_interpQuatB, interpT);
          state.camera.quaternion.copy(_interpQuatA);
        } else {
          state.camera.position.set(
            currentCamera.position[1],
            currentCamera.position[2],
            currentCamera.position[0],
          );
          state.camera.quaternion.set(...currentCamera.rotation);
        }
      }

      if (
        "isPerspectiveCamera" in state.camera &&
        (state.camera as any).isPerspectiveCamera
      ) {
        const perspectiveCamera = state.camera as any;
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
    const renderEntities = entityMapRef.current;
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
        if (!entity?.position) {
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
    // so the orbit responds at frame rate. Skip here to avoid fighting.
    if (
      !freeFly &&
      !isLive &&
      mode === "third-person" &&
      root &&
      currentCamera?.orbitTargetId
    ) {
      const targetGroup = root.children.find(
        (child) => child.name === currentCamera.orbitTargetId,
      );
      if (targetGroup) {
        const orbitEntity = currentEntities.get(currentCamera.orbitTargetId);
        _orbitTarget.copy(targetGroup.position);
        // Torque orbits the target's render world-box center; player positions
        // in our stream are feet-level, so lift to an approximate center.
        if (orbitEntity?.type === "Player") {
          _orbitTarget.y += 1.0;
        }

        let hasDirection = false;
        if (currentCamera.orbitDirection) {
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
          _orbitDir.copy(state.camera.position).sub(_orbitTarget);
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        }
        if (hasDirection) {
          _orbitDir.normalize();
          const orbitDistance = Math.max(0.1, currentCamera.orbitDistance ?? 4);
          _orbitCandidate
            .copy(_orbitTarget)
            .addScaledVector(_orbitDir, orbitDistance);

          state.camera.position.copy(_orbitCandidate);
          state.camera.lookAt(_orbitTarget);
        }
      }
    }

    if (
      !freeFly &&
      mode === "first-person" &&
      root &&
      currentCamera?.controlEntityId
    ) {
      const playerGroup = root.children.find(
        (child) => child.name === currentCamera.controlEntityId,
      );
      if (playerGroup) {
        _tmpVec
          .copy(eyeOffsetRef.current)
          .applyQuaternion(playerGroup.quaternion);
        state.camera.position.add(_tmpVec);
      } else {
        state.camera.position.y += eyeOffsetRef.current.y;
      }
    }

    if (isPlaying && snapshot.exhausted) {
      storeState.setPlaybackStatus("paused");
    }

    const timeMs = playbackClockRef.current * 1000;
    if (Math.abs(timeMs - playback.timeMs) > 0.5) {
      storeState.setPlaybackTime(timeMs);
    }
  });

  return (
    <>
      <ParticleEffects
        playback={recording.streamingPlayback}
        snapshotRef={currentTickSnapshotRef}
      />
      {firstPersonShape && (
        <Suspense>
          <PlayerEyeOffset
            shapeName={firstPersonShape}
            eyeOffsetRef={eyeOffsetRef}
          />
        </Suspense>
      )}
    </>
  );
}

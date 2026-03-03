import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  Group,
  Quaternion,
  Vector3,
} from "three";
import {
  buildStreamDemoEntity,
  DEFAULT_EYE_HEIGHT,
  nextLifecycleInstanceId,
  STREAM_TICK_SEC,
  torqueHorizontalFovToThreeVerticalFov,
} from "../demo/demoPlaybackUtils";
import { shapeToUrl } from "../loaders";
import { TickProvider } from "./TickProvider";
import { DemoEntityGroup } from "./DemoEntities";
import { DemoParticleEffects } from "./DemoParticleEffects";
import { PlayerEyeOffset } from "./DemoPlayerModel";
import { useEngineStoreApi } from "../state";
import type {
  DemoEntity,
  DemoRecording,
  DemoStreamEntity,
  DemoStreamSnapshot,
} from "../demo/types";

type EntityById = Map<string, DemoStreamEntity>;

/** Cache entity-by-id Maps per snapshot so they're built once, not every frame. */
const _snapshotEntityCache = new WeakMap<DemoStreamSnapshot, EntityById>();
function getEntityMap(snapshot: DemoStreamSnapshot): EntityById {
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

let streamingDemoPlaybackMountCount = 0;
let streamingDemoPlaybackUnmountCount = 0;

export function StreamingDemoPlayback({ recording }: { recording: DemoRecording }) {
  const engineStore = useEngineStoreApi();
  const instanceIdRef = useRef<string | null>(null);
  if (!instanceIdRef.current) {
    instanceIdRef.current = nextLifecycleInstanceId("StreamingDemoPlayback");
  }
  const rootRef = useRef<Group>(null);
  const timeRef = useRef(0);
  const playbackClockRef = useRef(0);
  const prevTickSnapshotRef = useRef<DemoStreamSnapshot | null>(null);
  const currentTickSnapshotRef = useRef<DemoStreamSnapshot | null>(null);
  const eyeOffsetRef = useRef(new Vector3(0, DEFAULT_EYE_HEIGHT, 0));
  const streamRef = useRef(recording.streamingPlayback ?? null);
  const publishedSnapshotRef = useRef<DemoStreamSnapshot | null>(null);
  const entityMapRef = useRef<Map<string, DemoEntity>>(new Map());
  const lastSyncedSnapshotRef = useRef<DemoStreamSnapshot | null>(null);
  const lastEntityRebuildEventMsRef = useRef(0);
  const exhaustedEventLoggedRef = useRef(false);
  const [entities, setEntities] = useState<DemoEntity[]>([]);
  const [firstPersonShape, setFirstPersonShape] = useState<string | null>(null);

  useEffect(() => {
    streamingDemoPlaybackMountCount += 1;
    const mountedAt = Date.now();
    engineStore.getState().recordPlaybackDiagnosticEvent({
      kind: "component.lifecycle",
      message: "StreamingDemoPlayback mounted",
      meta: {
        component: "StreamingDemoPlayback",
        phase: "mount",
        instanceId: instanceIdRef.current,
        mountCount: streamingDemoPlaybackMountCount,
        unmountCount: streamingDemoPlaybackUnmountCount,
        recordingMissionName: recording.missionName ?? null,
        recordingDurationSec: Number(recording.duration.toFixed(3)),
        ts: mountedAt,
      },
    });
    console.info("[demo diagnostics] StreamingDemoPlayback mounted", {
      instanceId: instanceIdRef.current,
      mountCount: streamingDemoPlaybackMountCount,
      unmountCount: streamingDemoPlaybackUnmountCount,
      recordingMissionName: recording.missionName ?? null,
      mountedAt,
    });

    return () => {
      streamingDemoPlaybackUnmountCount += 1;
      const unmountedAt = Date.now();
      engineStore.getState().recordPlaybackDiagnosticEvent({
        kind: "component.lifecycle",
        message: "StreamingDemoPlayback unmounted",
        meta: {
          component: "StreamingDemoPlayback",
          phase: "unmount",
          instanceId: instanceIdRef.current,
          mountCount: streamingDemoPlaybackMountCount,
          unmountCount: streamingDemoPlaybackUnmountCount,
          recordingMissionName: recording.missionName ?? null,
          ts: unmountedAt,
        },
      });
      console.info("[demo diagnostics] StreamingDemoPlayback unmounted", {
        instanceId: instanceIdRef.current,
        mountCount: streamingDemoPlaybackMountCount,
        unmountCount: streamingDemoPlaybackUnmountCount,
        recordingMissionName: recording.missionName ?? null,
        unmountedAt,
      });
    };
  }, [engineStore]);

  const syncRenderableEntities = useCallback((snapshot: DemoStreamSnapshot) => {
    if (snapshot === lastSyncedSnapshotRef.current) return;
    lastSyncedSnapshotRef.current = snapshot;

    const prevMap = entityMapRef.current;
    const nextMap = new Map<string, DemoEntity>();
    // Derive shouldRebuild from the entity loop itself instead of computing
    // an O(n) string signature every frame. Entity count change catches
    // add/remove; identity check catches per-entity changes.
    let shouldRebuild = snapshot.entities.length !== prevMap.size;

    for (const entity of snapshot.entities) {
      let renderEntity = prevMap.get(entity.id);
      if (
        !renderEntity ||
        renderEntity.type !== entity.type ||
        renderEntity.dataBlock !== entity.dataBlock ||
        renderEntity.weaponShape !== entity.weaponShape ||
        renderEntity.className !== entity.className ||
        renderEntity.ghostIndex !== entity.ghostIndex ||
        renderEntity.dataBlockId !== entity.dataBlockId ||
        renderEntity.shapeHint !== entity.shapeHint
      ) {
        renderEntity = buildStreamDemoEntity(
          entity.id,
          entity.type,
          entity.dataBlock,
          entity.visual,
          entity.direction,
          entity.weaponShape,
          entity.playerName,
          entity.className,
          entity.ghostIndex,
          entity.dataBlockId,
          entity.shapeHint,
        );
        shouldRebuild = true;
      }

      renderEntity.playerName = entity.playerName;
      renderEntity.iffColor = entity.iffColor;
      renderEntity.dataBlock = entity.dataBlock;
      renderEntity.visual = entity.visual;
      renderEntity.direction = entity.direction;
      renderEntity.weaponShape = entity.weaponShape;
      renderEntity.className = entity.className;
      renderEntity.ghostIndex = entity.ghostIndex;
      renderEntity.dataBlockId = entity.dataBlockId;
      renderEntity.shapeHint = entity.shapeHint;
      renderEntity.threads = entity.threads;

      if (renderEntity.keyframes.length === 0) {
        renderEntity.keyframes.push({
          time: snapshot.timeSec,
          position: entity.position ?? [0, 0, 0],
          rotation: entity.rotation ?? [0, 0, 0, 1],
        });
      }

      const kf = renderEntity.keyframes[0];
      kf.time = snapshot.timeSec;
      if (entity.position) kf.position = entity.position;
      if (entity.rotation) kf.rotation = entity.rotation;
      kf.velocity = entity.velocity;
      kf.health = entity.health;
      kf.energy = entity.energy;
      kf.actionAnim = entity.actionAnim;
      kf.actionAtEnd = entity.actionAtEnd;
      kf.damageState = entity.damageState;

      nextMap.set(entity.id, renderEntity);
    }

    entityMapRef.current = nextMap;
    if (shouldRebuild) {
      setEntities(Array.from(nextMap.values()));
      const now = Date.now();
      if (now - lastEntityRebuildEventMsRef.current >= 500) {
        lastEntityRebuildEventMsRef.current = now;
        engineStore.getState().recordPlaybackDiagnosticEvent({
          kind: "stream.entities.rebuild",
          message: "Renderable demo entity list was rebuilt",
          meta: {
            previousEntityCount: prevMap.size,
            nextEntityCount: nextMap.size,
            snapshotTimeSec: Number(snapshot.timeSec.toFixed(3)),
          },
        });
      }
    }

    let nextFirstPersonShape: string | null = null;
    if (snapshot.camera?.mode === "first-person" && snapshot.camera.controlEntityId) {
      const entity = nextMap.get(snapshot.camera.controlEntityId);
      if (entity?.dataBlock) {
        nextFirstPersonShape = entity.dataBlock;
      }
    }
    setFirstPersonShape((prev) =>
      prev === nextFirstPersonShape ? prev : nextFirstPersonShape,
    );
  }, [engineStore]);

  useEffect(() => {
    streamRef.current = recording.streamingPlayback ?? null;
    entityMapRef.current = new Map();
    lastSyncedSnapshotRef.current = null;
    publishedSnapshotRef.current = null;
    timeRef.current = 0;
    playbackClockRef.current = 0;
    prevTickSnapshotRef.current = null;
    currentTickSnapshotRef.current = null;
    exhaustedEventLoggedRef.current = false;

    const stream = streamRef.current;
    if (!stream) {
      engineStore.getState().setPlaybackStreamSnapshot(null);
      return;
    }

    stream.reset();
    // Preload weapon effect shapes (explosions) so they're cached before
    // the first projectile detonates — otherwise the GLB fetch latency
    // causes the short-lived explosion entity to expire before it renders.
    for (const shape of stream.getEffectShapes()) {
      useGLTF.preload(shapeToUrl(shape));
    }
    const snapshot = stream.getSnapshot();
    timeRef.current = snapshot.timeSec;
    playbackClockRef.current = snapshot.timeSec;
    prevTickSnapshotRef.current = snapshot;
    currentTickSnapshotRef.current = snapshot;
    syncRenderableEntities(snapshot);
    engineStore.getState().setPlaybackStreamSnapshot(snapshot);
    publishedSnapshotRef.current = snapshot;

    return () => {
      engineStore.getState().setPlaybackStreamSnapshot(null);
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
      !isPlaying && Math.abs(requestedTimeSec - playbackClockRef.current) > 0.0005;
    const externalSeekWhilePlaying =
      isPlaying && Math.abs(requestedTimeSec - timeRef.current) > 0.05;
    const isSeeking = externalSeekWhilePaused || externalSeekWhilePlaying;
    if (isSeeking) {
      // Sync stream cursor to UI/programmatic seek.
      playbackClockRef.current = requestedTimeSec;
    }

    if (isPlaying) {
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

    timeRef.current = playbackClockRef.current;
    if (snapshot.exhausted && isPlaying) {
      playbackClockRef.current = Math.min(playbackClockRef.current, snapshot.timeSec);
    }
    syncRenderableEntities(renderCurrent);

    const publishedSnapshot = publishedSnapshotRef.current;
    const shouldPublish =
      !publishedSnapshot ||
      renderCurrent.timeSec !== publishedSnapshot.timeSec ||
      renderCurrent.exhausted !== publishedSnapshot.exhausted ||
      renderCurrent.status.health !== publishedSnapshot.status.health ||
      renderCurrent.status.energy !== publishedSnapshot.status.energy ||
      renderCurrent.camera?.mode !== publishedSnapshot.camera?.mode ||
      renderCurrent.camera?.controlEntityId !==
        publishedSnapshot.camera?.controlEntityId ||
      renderCurrent.camera?.orbitTargetId !==
        publishedSnapshot.camera?.orbitTargetId;

    if (shouldPublish) {
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

    if (currentCamera) {
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

      if (
        Number.isFinite(currentCamera.fov) &&
        "isPerspectiveCamera" in state.camera &&
        (state.camera as any).isPerspectiveCamera
      ) {
        const perspectiveCamera = state.camera as any;
        const fovValue =
          previousCamera && Number.isFinite(previousCamera.fov)
            ? previousCamera.fov + (currentCamera.fov - previousCamera.fov) * interpT
            : currentCamera.fov;
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

    const currentEntities = getEntityMap(renderCurrent);
    const previousEntities = getEntityMap(renderPrev);
    const root = rootRef.current;
    if (root) {
      for (const child of root.children) {
        const entity = currentEntities.get(child.name);
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
          child.position.set(entity.position[1], entity.position[2], entity.position[0]);
        }

        if (entity.faceViewer) {
          child.quaternion.copy(state.camera.quaternion).multiply(_billboardFlip);
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
    if (mode === "third-person" && root && currentCamera?.orbitTargetId) {
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
        if (
          typeof currentCamera.yaw === "number" &&
          typeof currentCamera.pitch === "number"
        ) {
          const sx = Math.sin(currentCamera.pitch);
          const cx = Math.cos(currentCamera.pitch);
          const sz = Math.sin(currentCamera.yaw);
          const cz = Math.cos(currentCamera.yaw);
          // Camera::validateEyePoint uses Camera::setPosition's column1 in
          // Torque space as the orbit pull-back direction. Converted to Three,
          // that target->camera vector is (-cx, -sz*sx, -cz*sx).
          _orbitDir.set(-cx, -sz * sx, -cz * sx);
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        }
        if (!hasDirection) {
          _orbitDir.copy(state.camera.position).sub(_orbitTarget);
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        }
        if (hasDirection) {
          _orbitDir.normalize();
          const orbitDistance = Math.max(0.1, currentCamera.orbitDistance ?? 4);
          _orbitCandidate.copy(_orbitTarget).addScaledVector(_orbitDir, orbitDistance);

          state.camera.position.copy(_orbitCandidate);
          state.camera.lookAt(_orbitTarget);
        }
      }
    }

    if (mode === "first-person" && root && currentCamera?.controlEntityId) {
      const playerGroup = root.children.find(
        (child) => child.name === currentCamera.controlEntityId,
      );
      if (playerGroup) {
        _tmpVec.copy(eyeOffsetRef.current).applyQuaternion(playerGroup.quaternion);
        state.camera.position.add(_tmpVec);
      } else {
        state.camera.position.y += eyeOffsetRef.current.y;
      }
    }

    if (isPlaying && snapshot.exhausted) {
      if (!exhaustedEventLoggedRef.current) {
        exhaustedEventLoggedRef.current = true;
        storeState.recordPlaybackDiagnosticEvent({
          kind: "stream.exhausted",
          message: "Streaming playback reached end-of-stream while playing",
          meta: {
            streamTimeSec: Number(snapshot.timeSec.toFixed(3)),
            requestedPlaybackSec: Number(playbackClockRef.current.toFixed(3)),
          },
        });
      }
      storeState.setPlaybackStatus("paused");
    } else if (!snapshot.exhausted) {
      exhaustedEventLoggedRef.current = false;
    }

    const timeMs = playbackClockRef.current * 1000;
    if (Math.abs(timeMs - playback.timeMs) > 0.5) {
      storeState.setPlaybackTime(timeMs);
    }
  });

  return (
    <TickProvider>
      <group ref={rootRef}>
        {entities.map((entity) => (
          <DemoEntityGroup key={entity.id} entity={entity} timeRef={timeRef} />
        ))}
      </group>
      <DemoParticleEffects
        playback={recording.streamingPlayback}
        snapshotRef={currentTickSnapshotRef}
      />
      {firstPersonShape && (
        <Suspense fallback={null}>
          <PlayerEyeOffset shapeName={firstPersonShape} eyeOffsetRef={eyeOffsetRef} />
        </Suspense>
      )}
    </TickProvider>
  );
}

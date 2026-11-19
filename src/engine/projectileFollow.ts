import { Vector3, type PerspectiveCamera } from "three";
import { clamp } from "../mathUtils";
import { resolveCameraOwner } from "../state/cameraOwner";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { subscribeAction } from "../state/inputControls";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { playerForEntity } from "../state/playerResolver";
import { replayConnectionStore } from "../state/replayConnectionStore";
import {
  MAX_ORBIT_DISTANCE,
  MIN_ORBIT_DISTANCE,
  streamClock,
  streamPlaybackStore,
  type DemoCameraMode,
  type ProjectileFollow,
} from "../state/streamPlaybackStore";
import { exitToFreeFly, resolveFlagEntityId } from "../state/watchFollow";
import {
  interpolateStreamPosition,
  isTrackableProjectile,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { STREAM_TICK_SEC } from "../stream/streamHelpers";
import type {
  ProjectileLifecycleEvent,
  StreamEntity,
  StreamingPlayback,
} from "../stream/types";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";
import { combineCleanups } from "./storeReaction";

const PROJECTILE_RANGE = 100;
const PROJECTILE_ORBIT_PITCH = Math.PI / 18;

function isPlayerFollowMode(mode: DemoCameraMode): boolean {
  return mode === "orbitOverride" || mode === "firstPersonOverride";
}

function canFollowStream(stream: StreamingPlayback): boolean {
  const { recording, status } = engineStore.getState().playback;
  if (
    recording?.streamingPlayback !== stream ||
    status === "seeking" ||
    resolveCameraOwner() !== "input"
  ) {
    return false;
  }
  if (recording.source === "demo") return true;
  if (stream.localSpectator) {
    const replay = replayConnectionStore.getState();
    return replay.ready && replay.adapter === stream;
  }
  const live = liveConnectionStore.getState();
  return live.role === "watcher" && live.liveReady && live.adapter === stream;
}

/** Use the same tracking state for a selected projectile and a restored link. */
export function startProjectileTracking(
  projectileId: string,
  sourceName: string | undefined,
  orbit: { yaw: number; pitch: number; distance?: number },
): boolean {
  const stream = streamPlaybackStore.getState().playback;
  if (!stream?.subscribeProjectileLifecycle || !canFollowStream(stream))
    return false;
  streamPlaybackStore.setState((state) => ({
    projectileFollow: { kind: "tracking", projectileId, sourceName },
    cameraMode: "orbitOverride",
    followEntityId: null,
    followPlayer: null,
    followTargetId: null,
    followFlagSlot: null,
    orbitOverrideYaw: orbit.yaw,
    orbitOverridePitch: orbit.pitch,
    orbitOverrideDistance:
      orbit.distance == null
        ? state.orbitOverrideDistance
        : clamp(orbit.distance, MIN_ORBIT_DISTANCE, MAX_ORBIT_DISTANCE),
    orbitTargetDamping: null,
    orbitSnapNonce: state.orbitSnapNonce + 1,
  }));
  return true;
}

function nearestProjectile(
  camera: PerspectiveCamera,
  position: Vector3,
): StreamEntity | undefined {
  const { current, previous, interpT } = streamRenderFrame;
  if (!current) return undefined;
  let closest: StreamEntity | undefined;
  let distanceSq = PROJECTILE_RANGE ** 2;
  for (const entity of current.values()) {
    if (!isTrackableProjectile(entity)) continue;
    interpolateStreamPosition(
      position,
      entity,
      previous?.get(entity.id),
      interpT,
    );
    const candidateDistanceSq = position.distanceToSquared(camera.position);
    if (
      !(candidateDistanceSq <= distanceSq) ||
      (closest && candidateDistanceSq === distanceSq)
    )
      continue;
    closest = entity;
    distanceSq = candidateDistanceSq;
  }
  return closest;
}

/** A local camera action for demos, shared replays, and MapGenius spectators. */
export function installProjectileFollow(engine: GameEngine): () => void {
  const direction = new Vector3();
  const position = new Vector3();
  let session: {
    stream: StreamingPlayback;
    seekNonce: number;
    worldGeneration?: number;
    playbackRevision?: number;
    unsubscribe: () => void;
  } | null = null;

  function stopListening() {
    session?.unsubscribe();
    session = null;
  }

  function stopFollowing() {
    const follow = streamPlaybackStore.getState().projectileFollow;
    stopListening();
    if (follow?.kind === "tracking") exitToFreeFly();
    else if (follow) streamPlaybackStore.setState({ projectileFollow: null });
    if (follow) engine.invalidate();
  }

  function sessionIsCurrent(): boolean {
    return (
      session !== null &&
      streamPlaybackStore.getState().playback === session.stream &&
      engineStore.getState().playback.seekNonce === session.seekNonce &&
      session.stream.worldGeneration === session.worldGeneration &&
      session.stream.playbackRevision === session.playbackRevision &&
      canFollowStream(session.stream)
    );
  }

  function track(
    projectileId: string,
    sourceName?: string,
    flightDirection?: readonly [number, number, number],
  ) {
    let yaw: number;
    if (
      flightDirection &&
      Math.hypot(flightDirection[0], flightDirection[1]) > 1e-6
    ) {
      yaw = Math.atan2(flightDirection[0], flightDirection[1]);
    } else {
      engine.cameras.perspective.getWorldDirection(direction);
      yaw = Math.atan2(direction.z, direction.x);
    }
    if (
      startProjectileTracking(projectileId, sourceName, {
        yaw,
        pitch: PROJECTILE_ORBIT_PITCH,
      })
    )
      engine.invalidate();
  }

  function onProjectile(event: ProjectileLifecycleEvent) {
    if (!sessionIsCurrent()) {
      stopFollowing();
      return;
    }
    const follow = streamPlaybackStore.getState().projectileFollow;
    if (follow?.kind === "armed" && event.type === "spawn") {
      if (
        event.sourceEntityId === follow.playerId &&
        (event.launchTimeSec ?? event.timeSec) >=
          follow.armedAtSec - STREAM_TICK_SEC
      ) {
        track(event.id, event.sourceName ?? follow.playerName, event.direction);
      }
    } else if (
      follow?.kind === "tracking" &&
      event.type === "end" &&
      event.id === follow.projectileId
    ) {
      streamPlaybackStore.setState({
        projectileFollow: { ...follow, terminalPosition: event.position },
      });
      engine.invalidate();
    }
  }

  function listen(stream: StreamingPlayback) {
    if (!stream.subscribeProjectileLifecycle) return;
    session = {
      stream,
      seekNonce: engineStore.getState().playback.seekNonce,
      worldGeneration: stream.worldGeneration,
      playbackRevision: stream.playbackRevision,
      unsubscribe: stream.subscribeProjectileLifecycle(onProjectile),
    };
  }

  function toggle() {
    const state = streamPlaybackStore.getState();
    if (state.projectileFollow) {
      stopFollowing();
      return;
    }
    const stream = state.playback;
    if (
      !stream?.subscribeProjectileLifecycle ||
      !canFollowStream(stream) ||
      !streamRenderFrame.current
    )
      return;

    const { followFlagSlot } = state;
    // Flag follow can keep its last camera target while the flag is out of scope.
    const targetId =
      followFlagSlot === null
        ? state.followEntityId
        : resolveFlagEntityId(followFlagSlot);
    const body = targetId
      ? gameEntityStore.getState().streamEntities.get(targetId)
      : undefined;
    if (body?.renderType === "Player" && isPlayerFollowMode(state.cameraMode)) {
      const armed: ProjectileFollow = {
        kind: "armed",
        playerId: body.id,
        playerName: playerForEntity(body).name || "player",
        armedAtSec: streamClock.worldTime,
      };
      streamPlaybackStore.setState({
        followEntityId: body.id,
        projectileFollow: armed,
      });
      engine.invalidate();
      return;
    }
    if (followFlagSlot !== null) return;

    const projectile = nearestProjectile(engine.cameras.perspective, position);
    if (!projectile) return;
    track(
      projectile.id,
      projectile.projectileSourceName,
      projectile.velocity ?? projectile.direction,
    );
  }

  return combineCleanups(
    stopFollowing,
    subscribeAction("followProjectile", toggle),
    streamPlaybackStore.subscribe((state) => {
      const follow = state.projectileFollow;
      if (!follow) {
        if (session) stopListening();
      } else if (
        follow.kind === "armed"
          ? !isPlayerFollowMode(state.cameraMode) ||
            state.followEntityId !== follow.playerId
          : state.cameraMode !== "orbitOverride" ||
            state.followEntityId !== null ||
            state.followPlayer !== null ||
            state.followFlagSlot !== null
      ) {
        // A new camera selection takes precedence, including when it chose another orbit.
        streamPlaybackStore.setState({ projectileFollow: null });
      } else if (!session && state.playback) {
        listen(state.playback);
      }
    }),
    engineStore.subscribe(() => {
      if (session && !sessionIsCurrent()) stopFollowing();
    }),
    engine.scheduler.add(FramePriority.CameraSelect, () => {
      if (session && !sessionIsCurrent()) stopFollowing();
    }),
  );
}

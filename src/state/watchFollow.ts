import { gameEntityStore } from "./gameEntityStore";
import type { GameEntity } from "./gameEntityTypes";
import { liveConnectionStore } from "./liveConnectionStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { threeForwardHeading } from "../stream/streamHelpers";

/**
 * Spectate-mode follow: a purely client-side reproduction of the real
 * observer's fly↔follow modes. The relay never sends moves, so the
 * server's camera can't enter orbit mode for us — instead the selected
 * player's ghost is orbited locally (StreamingController's orbitOverride
 * path, which mirrors Camera::setOrbitMode rendering) and the command
 * circuit tracks the same target.
 */

export function isWatchSpectator(): boolean {
  return liveConnectionStore.getState().role === "watcher";
}

export function watchFollowTargetId(): string | null {
  return streamPlaybackStore.getState().followEntityId;
}

/**
 * Dead bodies are not followable: Torque DamageState 0 = Enabled (alive),
 * 1 = Disabled (dead player awaiting respawn), 2 = Destroyed.
 */
function isDeadEntity(entity: GameEntity): boolean {
  return (
    "damageState" in entity &&
    entity.damageState != null &&
    entity.damageState !== 0
  );
}

/** Living player entity ids in stable (ghost index) order for cycling. */
function playerEntityIds(): string[] {
  const players: { id: string; ghostIndex?: number }[] = [];
  for (const entity of gameEntityStore.getState().streamEntities.values()) {
    if (entity.renderType === "Player" && !isDeadEntity(entity)) {
      players.push({ id: entity.id, ghostIndex: entity.ghostIndex });
    }
  }
  players.sort((a, b) => (a.ghostIndex ?? 0) - (b.ghostIndex ?? 0));
  return players.map((p) => p.id);
}

/**
 * Seed the user-controlled orbit angles to sit behind the target, like
 * the real observer entering follow mode: camera.cs passes the player's
 * own transform to setOrbitMode, so the initial view faces the way the
 * player faces.
 */
function seedOrbitBehindTarget(targetId: string): void {
  const entity = gameEntityStore.getState().streamEntities.get(targetId);
  let yaw = 0;
  const q = entity && "rotation" in entity ? entity.rotation : undefined;
  if (q) {
    // Model forward = entity quaternion applied to +X (Three.js space);
    // orbitOverrideYaw uses the same (cos, 0, sin) forward convention.
    const [x, y, z, w] = q;
    yaw = threeForwardHeading({ x, y, z, w });
  }
  streamPlaybackStore.setState({
    orbitOverrideYaw: yaw,
    orbitOverridePitch: 0,
  });
}

/** Follow a specific player, or the current/first player when omitted. */
export function enterWatchFollow(targetId?: string): void {
  const current = streamPlaybackStore.getState().followEntityId;
  const players = playerEntityIds();
  const target =
    targetId ?? (current && players.includes(current) ? current : players[0]);
  if (!target) return;
  const entity = gameEntityStore.getState().streamEntities.get(target);
  seedOrbitBehindTarget(target);
  // targetId -1 means "no target" on the wire — never match on it.
  const entityTargetId =
    entity && "targetId" in entity && entity.targetId != null
      ? entity.targetId
      : null;
  streamPlaybackStore.setState({
    followEntityId: target,
    followTargetId:
      entityTargetId != null && entityTargetId >= 0 ? entityTargetId : null,
    // Cycling players keeps the current orbit/first-person choice.
    cameraMode: streamPlaybackStore.getState().followCameraMode,
  });
}

/** Back to free-fly; the camera stays where the orbit left it. */
export function exitWatchFollow(): void {
  if (streamPlaybackStore.getState().followEntityId === null) return;
  streamPlaybackStore.setState({
    followEntityId: null,
    followTargetId: null,
    followCameraMode: "orbitOverride",
    cameraMode: "freeFly",
  });
}

/**
 * Keep follow locked onto the same PLAYER across respawns. Each respawn
 * is a brand-new Player ghost (the old one lingers as the corpse), so an
 * entity id alone can't track a player. The real observer follows a
 * client (`%client.observeClient` in camera.cs, re-reading its current
 * `.player` every update); the client-side analogue of that identity is
 * the player's target — per-client, allocated at join, carried in every
 * Player ghost create, and it outlives all of the client's bodies.
 *
 * Returns the entity id to orbit this frame, or null while the player
 * has no body at all (corpse faded, respawn pending) — follow stays
 * armed and re-locks when they spawn. Call once per frame while
 * followEntityId is set.
 */
export function resolveWatchFollowTarget(): string | null {
  const state = streamPlaybackStore.getState();
  const { followEntityId, followTargetId } = state;
  if (!followEntityId) return null;
  const entities = gameEntityStore.getState().streamEntities;
  const current = entities.get(followEntityId);
  const currentAlive = current && !isDeadEntity(current);
  if (currentAlive) return followEntityId;

  // Current body is dead or gone — look for the client's replacement
  // body by target id. Without one (never sent), there is nothing to
  // re-lock onto; hold while the body exists, drop follow once gone.
  if (followTargetId == null) {
    if (current) return followEntityId;
    exitWatchFollow();
    return null;
  }
  let replacement: { id: string; ghostIndex?: number } | undefined;
  for (const entity of entities.values()) {
    if (
      entity.renderType === "Player" &&
      entity.id !== followEntityId &&
      entity.targetId === followTargetId &&
      !isDeadEntity(entity)
    ) {
      // Prefer the newest ghost if several match (stale corpse entries).
      if (
        !replacement ||
        (entity.ghostIndex ?? 0) > (replacement.ghostIndex ?? 0)
      ) {
        replacement = { id: entity.id, ghostIndex: entity.ghostIndex };
      }
    }
  }
  if (replacement) {
    seedOrbitBehindTarget(replacement.id);
    streamPlaybackStore.setState({ followEntityId: replacement.id });
    return replacement.id;
  }
  // No living body yet: stay on the corpse while it lasts, then wait.
  return current ? followEntityId : null;
}

/** Command-circuit toggle: plain follow on/off (no first person there). */
export function toggleWatchFollow(): void {
  if (streamPlaybackStore.getState().followEntityId) {
    exitWatchFollow();
  } else {
    streamPlaybackStore.setState({ followCameraMode: "orbitOverride" });
    enterWatchFollow();
  }
}

/**
 * The observer-mode key cycles fly → follow (orbit) → first person → fly,
 * extending the real observer's fly↔follow toggle with an eye-mounted
 * view of the followed player.
 */
export function cycleWatchObserverMode(): void {
  const state = streamPlaybackStore.getState();
  if (!state.followEntityId) {
    streamPlaybackStore.setState({ followCameraMode: "orbitOverride" });
    enterWatchFollow();
  } else if (state.followCameraMode === "orbitOverride") {
    streamPlaybackStore.setState({
      followCameraMode: "firstPersonOverride",
      cameraMode: "firstPersonOverride",
    });
  } else {
    exitWatchFollow();
  }
}

/** Cycle to the next player (fire trigger / ArrowRight in the real client). */
export function cycleWatchFollow(): void {
  const players = playerEntityIds();
  if (players.length === 0) {
    exitWatchFollow();
    return;
  }
  const current = streamPlaybackStore.getState().followEntityId;
  const index = current ? players.indexOf(current) : -1;
  enterWatchFollow(players[(index + 1) % players.length]);
}

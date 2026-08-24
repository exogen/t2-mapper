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

/**
 * Living, followable players in a STABLE cycle order — one entry per
 * client, deduped and sorted by the per-client target id (allocated at
 * join, constant for the whole match). Sorting by ghost index instead
 * would reshuffle the order every time someone respawns — a respawn is a
 * brand-new ghost with a new, higher index — so cycling would revisit
 * some players and take ages to reach others. A client without a target
 * id falls back to a stable per-entity key so it still appears once.
 */
function playerEntityIds(): string[] {
  const byIdentity = new Map<
    string,
    { id: string; targetId: number | null; ghostIndex: number }
  >();
  for (const entity of gameEntityStore.getState().streamEntities.values()) {
    if (entity.renderType !== "Player" || isDeadEntity(entity)) continue;
    // targetId -1 means "no target" on the wire — treat as absent.
    const rawTargetId = "targetId" in entity ? entity.targetId : undefined;
    const targetId =
      rawTargetId != null && rawTargetId >= 0 ? rawTargetId : null;
    const ghostIndex = entity.ghostIndex ?? 0;
    const key = targetId != null ? `t${targetId}` : `e${entity.id}`;
    const existing = byIdentity.get(key);
    // During a respawn overlap two living bodies can briefly share an
    // identity; keep the newest ghost so we follow the live body.
    if (!existing || ghostIndex > existing.ghostIndex) {
      byIdentity.set(key, { id: entity.id, targetId, ghostIndex });
    }
  }
  return [...byIdentity.values()]
    .sort((a, b) => {
      if (a.targetId != null && b.targetId != null) {
        return a.targetId - b.targetId;
      }
      if (a.targetId != null) return -1;
      if (b.targetId != null) return 1;
      return a.ghostIndex - b.ghostIndex || a.id.localeCompare(b.id);
    })
    .map((p) => p.id);
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

/**
 * Pick the target when re-entering follow with no explicit player:
 * resume the last-followed player (by their respawn-stable target id);
 * if they're gone, the next player past their old list slot; else the
 * first. Keeps view toggles from restarting at the first player.
 */
function resumeFollowTarget(players: string[]): string | undefined {
  if (players.length === 0) return undefined;
  const { lastFollowTargetId, lastFollowGhostIndex } =
    streamPlaybackStore.getState();
  const entities = gameEntityStore.getState().streamEntities;
  if (lastFollowTargetId != null) {
    const same = players.find((id) => {
      const e = entities.get(id);
      return e && "targetId" in e && e.targetId === lastFollowTargetId;
    });
    if (same) return same;
  }
  if (lastFollowGhostIndex != null) {
    const next = players.find(
      (id) => (entities.get(id)?.ghostIndex ?? 0) > lastFollowGhostIndex,
    );
    if (next) return next;
  }
  return players[0];
}

/** Follow a specific player, or resume the last-followed one when omitted. */
export function enterWatchFollow(targetId?: string): void {
  const current = streamPlaybackStore.getState().followEntityId;
  const players = playerEntityIds();
  const target =
    targetId ??
    (current && players.includes(current)
      ? current
      : resumeFollowTarget(players));
  if (!target) return;
  const entity = gameEntityStore.getState().streamEntities.get(target);
  seedOrbitBehindTarget(target);
  // targetId -1 means "no target" on the wire — never match on it.
  const entityTargetId =
    entity && "targetId" in entity && entity.targetId != null
      ? entity.targetId
      : null;
  const validTargetId =
    entityTargetId != null && entityTargetId >= 0 ? entityTargetId : null;
  streamPlaybackStore.setState({
    followEntityId: target,
    followTargetId: validTargetId,
    // Remember for resume across free-fly / pan (persists through exit).
    lastFollowTargetId: validTargetId,
    lastFollowGhostIndex: entity?.ghostIndex ?? null,
    // Cycling players keeps the current orbit/first-person choice.
    cameraMode: streamPlaybackStore.getState().followCameraMode,
  });
}

/**
 * Force the 3D camera to free-fly, clearing any follow. Unlike
 * exitWatchFollow this applies even from the recorded "original" view
 * (which has no followEntityId) — used by the demo command circuit's
 * pan/toggle so exiting follow there reverts the 3D view too.
 */
export function exitToFreeFly(): void {
  streamPlaybackStore.setState({
    followEntityId: null,
    followTargetId: null,
    followCameraMode: "orbitOverride",
    cameraMode: "freeFly",
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

/**
 * Demo-playback camera cycle (the F key): original → free-fly → follow
 * (orbit) → first-person → original. Follow and first-person orbit /
 * observe the chosen player; click cycles players (see cycleWatchFollow).
 * With no players present, follow and first-person are skipped.
 *
 * Unlike watch mode (which defaults to free-fly), demo starts in
 * "original" — the recorder's own viewpoint — and returns there.
 */
export function cycleDemoCameraMode(): void {
  const mode = streamPlaybackStore.getState().cameraMode;
  if (mode === "original") {
    streamPlaybackStore.setState({
      cameraMode: "freeFly",
      followEntityId: null,
      followTargetId: null,
    });
  } else if (mode === "freeFly") {
    streamPlaybackStore.setState({ followCameraMode: "orbitOverride" });
    enterWatchFollow();
    // No players to orbit — skip follow + first-person, back to original.
    if (!streamPlaybackStore.getState().followEntityId) {
      streamPlaybackStore.setState({ cameraMode: "original" });
    }
  } else if (mode === "orbitOverride") {
    streamPlaybackStore.setState({
      followCameraMode: "firstPersonOverride",
      cameraMode: "firstPersonOverride",
    });
  } else {
    streamPlaybackStore.setState({
      cameraMode: "original",
      followEntityId: null,
      followTargetId: null,
    });
  }
}

/** Cycle to the next player (fire trigger / ArrowRight in the real client). */
export function cycleWatchFollow(): void {
  const players = playerEntityIds();
  if (players.length === 0) {
    exitWatchFollow();
    return;
  }
  const { followEntityId, followTargetId } = streamPlaybackStore.getState();
  const entities = gameEntityStore.getState().streamEntities;
  // Locate our slot by the followed player's stable target id (it survives
  // respawns) rather than the current body's entity id, so the cycle
  // advances exactly one player and never jumps back to the top when the
  // followed body has just respawned. Fall back to the entity id, then to
  // -1 (→ start at the first player) if neither resolves.
  let index = -1;
  if (followTargetId != null) {
    index = players.findIndex((id) => {
      const e = entities.get(id);
      return e != null && "targetId" in e && e.targetId === followTargetId;
    });
  }
  if (index === -1 && followEntityId != null) {
    index = players.indexOf(followEntityId);
  }
  enterWatchFollow(players[(index + 1) % players.length]);
}

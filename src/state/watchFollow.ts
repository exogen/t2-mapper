import { createLogger } from "../logger";
import { gameEntityStore } from "./gameEntityStore";
import type { GameEntity } from "./gameEntityTypes";
import { liveConnectionStore } from "./liveConnectionStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { threeForwardHeading } from "../stream/streamHelpers";
import { resolveFlagTeam } from "../components/flagTeam";

const camlog = createLogger("camdbg");

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
 * Flag-marked entities (targetRenderFlags bit 0x2 — the flag item on its
 * stand / on the ground, or the carrying player while held) in a stable
 * order: by team, then by the same identity keys the player cycle uses.
 */
function flagEntities(): { id: string; teamId: number | null }[] {
  const flags: {
    id: string;
    teamId: number | null;
    targetId: number;
    ghostIndex: number;
  }[] = [];
  for (const entity of gameEntityStore.getState().streamEntities.values()) {
    const renderFlags =
      "targetRenderFlags" in entity
        ? ((entity.targetRenderFlags as number | undefined) ?? 0)
        : 0;
    if ((renderFlags & 0x2) === 0 || isDeadEntity(entity)) continue;
    const rawTargetId = "targetId" in entity ? entity.targetId : undefined;
    // Sensor group 0 (e.g. Rabbit's neutral flag — stock RabbitGame.cs
    // never assigns the flag a team) means teamless, like null.
    const rawTeamId = resolveFlagTeam(entity).teamId;
    flags.push({
      id: entity.id,
      teamId: rawTeamId != null && rawTeamId > 0 ? rawTeamId : null,
      targetId:
        rawTargetId != null && rawTargetId >= 0
          ? rawTargetId
          : Number.MAX_SAFE_INTEGER,
      ghostIndex: entity.ghostIndex ?? 0,
    });
  }
  return flags.sort(
    (a, b) =>
      (a.teamId ?? Number.MAX_SAFE_INTEGER) -
        (b.teamId ?? Number.MAX_SAFE_INTEGER) ||
      a.targetId - b.targetId ||
      a.ghostIndex - b.ghostIndex ||
      a.id.localeCompare(b.id),
  );
}

/** Number of followable flags in scope (drives the overlay hint). */
export function countFollowableFlags(): number {
  return flagEntities().length;
}

/** The entity id a flag-follow slot resolves to right now (the item on
 *  its stand / ground, or the carrier while held), or null when that
 *  flag isn't in scope. Used by the director's dolly camera, which
 *  tracks the flag without entering follow mode. */
export function resolveFlagEntityId(slot: number): string | null {
  return resolveFlagSlot(slot)?.id ?? null;
}

/**
 * The flag entity a number key selects RIGHT NOW: the matching team's
 * flag (slot = team id, 1 = Storm / 2 = Inferno by default); when no
 * flag has a team (Rabbit, neutral-flag games), the slot indexes the
 * stable flag list instead. Re-evaluated every frame while flag follow
 * is active, so the orbit hands off between the item and its carriers.
 */
function resolveFlagSlot(
  slot: number,
): { id: string; teamId: number | null } | undefined {
  const flags = flagEntities();
  return (
    flags.find((f) => f.teamId === slot) ??
    (flags.some((f) => f.teamId != null) ? undefined : flags[slot - 1])
  );
}

/**
 * Follow a flag with the number keys: enter orbit follow on the flag item
 * (or its carrier while held) that `slot` selects — see resolveFlagSlot.
 * The follow keeps tracking that slot as the flag changes hands (see
 * resolveWatchFollowTarget); no-op if no such flag is in scope.
 */
export function followFlag(slot: number): void {
  const target = resolveFlagSlot(slot);
  if (!target) return;
  const state = streamPlaybackStore.getState();
  // Re-pressing the active slot is a no-op — never snap the user's
  // orbit angles out from under them.
  if (state.followFlagSlot === slot && state.followEntityId === target.id) {
    return;
  }
  seedOrbitBehindTarget(target.id);
  // Flag follow is its own mode OUTSIDE the player-follow cycle: no
  // first person, and it deliberately skips enterWatchFollow's
  // lastFollow* bookkeeping so resuming player follow later returns to
  // the last-followed PLAYER, not the flag.
  streamPlaybackStore.setState({
    followEntityId: target.id,
    followTargetId: null,
    followFlagSlot: slot,
    followCameraMode: "orbitOverride",
    cameraMode: "orbitOverride",
  });
}

/**
 * True when the follow camera is on a player body via the normal
 * player-follow cycle — the only mode where first person is meaningful.
 * False during flag follow (even while a carrier holds the flag) and for
 * non-player follow targets.
 */
export function isFollowingPlayer(): boolean {
  const { followEntityId, followFlagSlot } = streamPlaybackStore.getState();
  if (followFlagSlot != null || !followEntityId) return false;
  const entity = gameEntityStore.getState().streamEntities.get(followEntityId);
  return entity?.renderType === "Player";
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
    // Any direct follow leaves flag-follow mode (followFlag re-arms it).
    followFlagSlot: null,
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
    followFlagSlot: null,
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
    followFlagSlot: null,
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
  const { followEntityId, followTargetId, followFlagSlot } = state;
  if (!followEntityId) return null;
  const entities = gameEntityStore.getState().streamEntities;
  const current = entities.get(followEntityId);

  // Flag follow: re-resolve the slot's flag-marked entity every frame so
  // the orbit hands off between the item and its carriers as the flag
  // changes hands. The user's orbit angles are deliberately KEPT across
  // hand-offs (no seedOrbitBehindTarget) — a grab/drop moves the anchor
  // barely a meter, so the camera glides instead of snapping behind the
  // new body. While no flag entity is in scope, hold on the last body as
  // long as it exists, armed for the flag to reappear.
  if (followFlagSlot != null) {
    const flag = resolveFlagSlot(followFlagSlot);
    if (flag) {
      if (flag.id !== followEntityId) {
        camlog.info(
          "flag hand-off: slot %d follow %s -> %s",
          followFlagSlot,
          followEntityId,
          flag.id,
        );
        streamPlaybackStore.setState({ followEntityId: flag.id });
      }
      return flag.id;
    }
    if (!current) {
      camlog.info(
        "flag follow: slot %d unresolvable and last body %s gone -> null",
        followFlagSlot,
        followEntityId,
      );
    }
    return current ? followEntityId : null;
  }

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
  const replacement = findLivingEntityByTargetId(
    followTargetId,
    followEntityId,
  );
  if (replacement) {
    seedOrbitBehindTarget(replacement);
    streamPlaybackStore.setState({ followEntityId: replacement });
    return replacement;
  }
  // No living body yet: stay on the corpse while it lasts, then wait.
  return current ? followEntityId : null;
}

/**
 * The living Player entity for a respawn-stable target id (a client's
 * current body), preferring the newest ghost when several match (stale
 * corpse entries). Null while the client has no living body.
 */
export function findLivingEntityByTargetId(
  targetId: number,
  excludeEntityId?: string | null,
): string | null {
  let found: { id: string; ghostIndex?: number } | undefined;
  for (const entity of gameEntityStore.getState().streamEntities.values()) {
    if (
      entity.renderType === "Player" &&
      entity.id !== excludeEntityId &&
      entity.targetId === targetId &&
      !isDeadEntity(entity)
    ) {
      if (!found || (entity.ghostIndex ?? 0) > (found.ghostIndex ?? 0)) {
        found = { id: entity.id, ghostIndex: entity.ghostIndex };
      }
    }
  }
  return found?.id ?? null;
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
  } else if (
    state.followCameraMode === "orbitOverride" &&
    // First person only applies to player follows — a flag follow (its
    // own mode, outside this cycle) exits straight back to free-fly.
    isFollowingPlayer()
  ) {
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
  const state = streamPlaybackStore.getState();
  const mode = state.cameraMode;
  if (mode === "original") {
    streamPlaybackStore.setState({
      cameraMode: "freeFly",
      followEntityId: null,
      followTargetId: null,
      followFlagSlot: null,
    });
  } else if (mode === "freeFly") {
    streamPlaybackStore.setState({ followCameraMode: "orbitOverride" });
    enterWatchFollow();
    // No players to orbit — skip follow + first-person, back to original.
    if (!streamPlaybackStore.getState().followEntityId) {
      streamPlaybackStore.setState({ cameraMode: "original" });
    }
  } else if (mode === "orbitOverride" && isFollowingPlayer()) {
    streamPlaybackStore.setState({
      followCameraMode: "firstPersonOverride",
      cameraMode: "firstPersonOverride",
    });
  } else if (mode === "orbitOverride") {
    // Flag follow is a "secret" cycle slot between original and free-fly:
    // only the number keys enter it, and F resumes the cycle at free-fly
    // (no first person on a flag).
    streamPlaybackStore.setState({
      cameraMode: "freeFly",
      followEntityId: null,
      followTargetId: null,
      followFlagSlot: null,
    });
  } else {
    streamPlaybackStore.setState({
      cameraMode: "original",
      followEntityId: null,
      followTargetId: null,
      followFlagSlot: null,
    });
  }
}

/** Cycle to the next player (fire trigger / ArrowRight in the real
 *  client), or the previous with direction -1 (jet trigger / ArrowLeft). */
export function cycleWatchFollow(direction: 1 | -1 = 1): void {
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
  // From an unresolved slot (-1), next starts at the first player and
  // prev at the last.
  const next =
    index === -1 && direction === -1
      ? players.length - 1
      : (index + direction + players.length) % players.length;
  enterWatchFollow(players[next]);
}

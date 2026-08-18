import { gameEntityStore } from "./gameEntityStore";
import { liveConnectionStore } from "./liveConnectionStore";
import { streamPlaybackStore } from "./streamPlaybackStore";

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

/** Living player entity ids in stable (ghost index) order for cycling. */
function playerEntityIds(): string[] {
  const players: { id: string; ghostIndex?: number }[] = [];
  for (const entity of gameEntityStore.getState().streamEntities.values()) {
    if (entity.renderType === "Player") {
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
    const fx = 1 - 2 * (y * y + z * z);
    const fz = 2 * (x * z - w * y);
    yaw = Math.atan2(fz, fx);
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
  seedOrbitBehindTarget(target);
  streamPlaybackStore.setState({
    followEntityId: target,
    cameraMode: "orbitOverride",
  });
}

/** Back to free-fly; the camera stays where the orbit left it. */
export function exitWatchFollow(): void {
  if (streamPlaybackStore.getState().followEntityId === null) return;
  streamPlaybackStore.setState({
    followEntityId: null,
    cameraMode: "freeFly",
  });
}

export function toggleWatchFollow(): void {
  if (streamPlaybackStore.getState().followEntityId) {
    exitWatchFollow();
  } else {
    enterWatchFollow();
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

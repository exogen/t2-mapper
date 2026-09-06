/**
 * World gravity as Tribes2.exe keeps it: one global (0x007a1a20, default
 * −20 = $DefaultGravity) written by setGravity(), which also broadcasts a
 * GravityEvent to every client; GameConnection::onAdd sends the current
 * value to each new client, and a demo's header stores it (recordings.cs
 * GRAVITY state). Every consumer — grenade flight, particles, players,
 * vehicles — multiplies the global by 0.4905, so −20 is −9.81 m/s².
 */

export const DEFAULT_WORLD_GRAVITY = -20;
const WORLD_GRAVITY_SCALE = 0.4905;

/** setGravity() units → m/s² (negative is down). */
export function worldGravityToMS2(worldGravity: number): number {
  return worldGravity * WORLD_GRAVITY_SCALE;
}

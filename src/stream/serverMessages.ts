/**
 * Server-message tables shared by everything that reads the game's chat
 * log: the app's timeline scanner and the cast director's own scanner.
 *
 * These sets are a protocol fact — which `Msg*` types the server sends
 * for a death and which of those the victim brought on themselves —
 * not an editorial choice. Consumers differ in what they DO with a
 * death (the timeline filters the pub kill feed as noise; cast
 * generation keeps every kill), and that filtering lives in each
 * scanner, downstream of these tables.
 */

/**
 * All death message types where args[2]=victimName, args[5]=killerName,
 * args[9]=DamageTypeText. Case-insensitive matching is used.
 *
 * Note: explicit suicide (Ctrl+K) uses `msgSuicide` which is NOT in
 * this set — we intentionally ignore those.
 */
export const KILL_MSG_TYPES: ReadonlySet<string> = new Set([
  // Player-vs-player kills
  "msglegitkill",
  "msgheadshotkill",
  // Community-server (TacoServer/QoL) variants, same arg layout —
  // verified on real demos: mine-disc combos and rearshots each went
  // 60-90 kills per match UNPARSED before these were added, silently
  // breaking killer attribution and drop classification for them.
  "msgminedisckill",
  "msgrearshotkill",
  "msgteamkill",
  // Self-inflicted (own weapon damage, cratering)
  "msgselfkill",
  // Explosions (can be self or other)
  "msgexplosionkill",
  // Vehicle-related
  "msgvehiclekill",
  "msgvehiclecrash",
  "msgvehiclespawnkill",
  // Turret-related
  "msgturretkill",
  "msgcturretkill",
  "msgturretselfkill",
  // Environmental
  "msgoobkill",
  "msgcampkill",
  "msgrogueminekill",
  "msglavakill",
  "msglightningkill",
]);

/**
 * Death message types where the victim killed themselves (own weapon,
 * cratering, environmental hazards). These are NOT credited as kills
 * but ARE shown as deaths. Does NOT include explicit Ctrl+K suicide
 * (which is `msgSuicide`, not in KILL_MSG_TYPES at all).
 */
export const SELF_INFLICTED_MSG_TYPES: ReadonlySet<string> = new Set([
  "msgselfkill", // Own weapon damage or cratering ($DamageType::Ground)
  "msgturretselfkill", // Own turret
  "msgvehiclecrash", // Vehicle crash
  "msgvehiclespawnkill", // Crushed by vehicle spawning
  "msgoobkill", // Out of bounds
  "msglavakill", // Lava
  "msglightningkill", // Lightning
  "msgcampkill", // Nexus camping
]);

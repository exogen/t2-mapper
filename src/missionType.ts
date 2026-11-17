export const normalizedMissionTypes = {
  arena: "Arena",
  bounty: "Bounty",
  cnh: "CnH",
  ctf: "CTF",
  dm: "DM",
  dnd: "DnD",
  hunters: "Hunters",
  lakrabbit: "LakRabbit",
  lakzm: "LakZM",
  lctf: "LCTF",
  none: "None",
  rabbit: "Rabbit",
  sctf: "SCtF",
  siege: "Siege",
  singleplayer: "SinglePlayer",
  tdm: "TDM",
  teamhunters: "TeamHunters",
  teamlak: "TeamLak",
  tr2: "TR2",
};

/**
 * Long-form display names servers send as $MissionTypeDisplayName
 * (MsgMissionDropInfo, GameInfo queries), keyed lowercased, mapped onto
 * the same short codes as normalizedMissionTypes.
 */
const missionTypeDisplayNames: Record<string, string> = {
  "capture the flag": "CTF",
  "capture the flag (practice)": "CTF (Practice)",
  "spawn ctf": "SCtF",
  "capture and hold": "CnH",
  deathmatch: "DM",
  "team deathmatch": "TDM",
  "defend and destroy": "DnD",
  "team rabbit 2": "TR2",
  "team hunters": "TeamHunters",
  "single player": "SinglePlayer",
  "ma duel mod": "Duel",
};

/**
 * The manifest's short mission type code for a server-sent game type
 * string (short token or long display name, any case), or null when the
 * string is unknown (mod-specific types).
 */
export function lookupMissionType(gameType: string): string | null {
  const key = gameType.trim().toLowerCase();
  const exact =
    missionTypeDisplayNames[key] ??
    (normalizedMissionTypes as Record<string, string>)[key] ??
    null;
  if (exact != null) return exact;
  // Compound types like "Capture the Flag - Team Aerial Combat":
  // abbreviate the known base type, keep the mod's suffix verbatim.
  const dash = gameType.indexOf(" - ");
  if (dash > 0) {
    const base = lookupMissionType(gameType.slice(0, dash));
    if (base != null) return `${base} - ${gameType.slice(dash + 3)}`;
  }
  return null;
}

/**
 * Like lookupMissionType, but unknown strings pass through unchanged.
 */
export function normalizeMissionType(gameType: string): string {
  return lookupMissionType(gameType) ?? gameType;
}

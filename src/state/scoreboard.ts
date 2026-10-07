import type { PlayerRosterEntry, TeamScore } from "../stream/types";

function byScoreThenName(a: PlayerRosterEntry, b: PlayerRosterEntry): number {
  return b.score - a.score || a.name.localeCompare(b.name);
}

export function groupScoreboard(
  playerRoster: readonly PlayerRosterEntry[] = [],
  teamScores: readonly TeamScore[] = [],
) {
  const teamPlayers = new Map<number, PlayerRosterEntry[]>();
  const observers: PlayerRosterEntry[] = [];
  for (const player of playerRoster) {
    if (player.teamId > 0) {
      const list = teamPlayers.get(player.teamId);
      if (list) list.push(player);
      else teamPlayers.set(player.teamId, [player]);
    } else {
      observers.push(player);
    }
  }
  for (const list of teamPlayers.values()) list.sort(byScoreThenName);
  observers.sort((a, b) => a.name.localeCompare(b.name));

  // Only server-declared teams count. Teamless modes also assign sensor
  // group ids (Rabbit uses 1 and 2; DM assigns one per player).
  const sortedTeams = [...teamScores].sort((a, b) => a.teamId - b.teamId);
  const ffaPlayers =
    sortedTeams.length === 0 && playerRoster.length > 0
      ? playerRoster.filter((p) => p.teamId > 0).sort(byScoreThenName)
      : null;
  return { teamPlayers, observers, sortedTeams, ffaPlayers };
}

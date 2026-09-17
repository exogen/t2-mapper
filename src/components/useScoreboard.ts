import { useEffect, useMemo } from "react";
import { useDataSource } from "../state/gameEntityStore";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import type { PlayerRosterEntry, TeamScore } from "../stream/types";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";

export function getScoreboardTeamName(team: TeamScore): string {
  return team.name || DEFAULT_TEAM_NAMES[team.teamId] || `Team ${team.teamId}`;
}

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

/** Shared by the full score screen and the HUD (which unmounts while it is open). */
export function useScoreboard() {
  const dataSource = useDataSource();
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const connectedClientId = useStreamSnapshot(
    (snap) => snap?.connectedClientId,
  );
  const playerRoster = useStreamSnapshot((snap) => snap?.playerRoster);
  const teamScores = useStreamSnapshot((snap) => snap?.teamScores);

  useEffect(() => {
    // Shared watch sessions already poll on the relay, even without a HUD.
    if (dataSource !== "live" || isWatcher) return;
    const request = () =>
      liveConnectionStore.getState().sendCommand("getScores");
    request();
    const interval = setInterval(request, 4000);
    return () => clearInterval(interval);
  }, [dataSource, isWatcher]);

  const grouped = useMemo(
    () => groupScoreboard(playerRoster, teamScores),
    [playerRoster, teamScores],
  );
  return { ...grouped, connectedClientId, playerRoster };
}

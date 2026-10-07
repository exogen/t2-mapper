import { useEffect, useMemo } from "react";
import { useDataSource } from "../state/gameEntityStore";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import type { TeamScore } from "../stream/types";
import { useCaster, displayTeamName } from "../state/casterStore";
import { groupScoreboard } from "../state/scoreboard";

export function getScoreboardTeamName(team: TeamScore): string {
  return displayTeamName(team.teamId, team.name);
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

  const names = useCaster((s) => s.settings?.teamNames);
  const grouped = useMemo(
    () =>
      groupScoreboard(
        playerRoster,
        teamScores?.map((team) =>
          names?.[team.teamId] ? { ...team, name: names[team.teamId] } : team,
        ),
      ),
    [playerRoster, teamScores, names],
  );
  return { ...grouped, connectedClientId, playerRoster, teamScores };
}

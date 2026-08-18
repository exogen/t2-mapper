import { useEffect, useRef, useMemo } from "react";
import { LuUsers } from "react-icons/lu";
import { IoMdStopwatch } from "react-icons/io";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { useMatchClockMs } from "./useMatchClock";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { useDataSource } from "../state/gameEntityStore";
import type { PlayerRosterEntry, TeamScore } from "../stream/types";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import styles from "./ScoreScreen.module.css";

function computePingStats(players: PlayerRosterEntry[]): {
  avg: number;
  dev: number;
} {
  if (!players.length) return { avg: 0, dev: 0 };
  const pings = players.map((p) => p.ping);
  const avg = pings.reduce((a, b) => a + b, 0) / pings.length;
  const variance =
    pings.reduce((sum, p) => sum + (p - avg) ** 2, 0) / pings.length;
  return { avg: Math.round(avg), dev: Math.round(Math.sqrt(variance)) };
}

function formatClock(totalSec: number): string {
  const sign = totalSec < 0 ? "-" : "";
  const abs = Math.abs(totalSec);
  const mins = Math.floor(abs / 60);
  const secs = Math.floor(abs % 60);
  return `${sign}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Renders the match clock. Negative clockMs = counting down, positive = counting up. */
function MatchClock({ clockMs }: { clockMs: number }) {
  // Match the C++ HudClockCtrl: display absolute value, sign determines direction.
  const absSec = Math.abs(clockMs) / 1000;
  const displaySec = clockMs < 0 ? Math.ceil(absSec) : Math.floor(absSec);
  return (
    <span className={styles.MatchClock}>
      <IoMdStopwatch className={styles.ClockIcon} />{" "}
      <span className={styles.Time}>{formatClock(displaySec)}</span>
    </span>
  );
}

function getTeamName(team: TeamScore): string {
  return team.name || DEFAULT_TEAM_NAMES[team.teamId] || `Team ${team.teamId}`;
}

export function ScoreScreen({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dataSource = useDataSource();
  const isLive = dataSource === "live";
  const { connectedClientId, teamScores, playerRoster } = useStreamSnapshot(
    (snap) => {
      return {
        connectedClientId: snap?.connectedClientId,
        teamScores: snap?.teamScores,
        playerRoster: snap?.playerRoster,
      };
    },
    (a, b) =>
      a.connectedClientId === b.connectedClientId &&
      a.teamScores === b.teamScores &&
      a.playerRoster === b.playerRoster,
  );
  const matchClockMs = useMatchClockMs();

  // Focus and exit pointer lock on open
  useEffect(() => {
    dialogRef.current?.focus();
    try {
      document.exitPointerLock();
    } catch {
      /* expected */
    }
  }, []);

  // Block keyboard events from reaching Three.js while open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      e.stopImmediatePropagation();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [onClose]);

  // Poll for scores every 4 seconds in live mode
  useEffect(() => {
    if (!isLive) return;
    const request = () => {
      liveConnectionStore.getState().sendCommand("getScores");
    };
    request();
    const interval = setInterval(request, 4000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Group players by team, sorted by score descending
  const { teamPlayers, observers } = useMemo(() => {
    const teamPlayers = new Map<number, PlayerRosterEntry[]>();
    const observers: PlayerRosterEntry[] = [];
    if (playerRoster) {
      for (const player of playerRoster) {
        if (player.teamId > 0) {
          const list = teamPlayers.get(player.teamId);
          if (list) {
            list.push(player);
          } else {
            teamPlayers.set(player.teamId, [player]);
          }
        } else {
          observers.push(player);
        }
      }
    }
    for (const list of teamPlayers.values()) {
      list.sort(
        (a, b) =>
          b.score - a.score || (a.name ?? "").localeCompare(b.name ?? ""),
      );
    }
    observers.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return { teamPlayers, observers };
  }, [playerRoster]);

  // Sort teams by natural order (team1, team2, etc.). Until the server's
  // MsgCTFAddTeam burst arrives (it lands a few seconds into a fresh
  // session, after the roster), synthesize placeholder team rows from the
  // roster's team ids so the table renders immediately — real entries
  // replace them in place.
  const sortedTeams = useMemo(() => {
    if (teamScores?.length) {
      return [...teamScores].sort((a, b) => a.teamId - b.teamId);
    }
    const teamIds = new Set<number>();
    for (const player of playerRoster ?? []) {
      if (player.teamId > 0) teamIds.add(player.teamId);
    }
    return [...teamIds]
      .sort((a, b) => a - b)
      .map((teamId): TeamScore => ({
        teamId,
        name: DEFAULT_TEAM_NAMES[teamId] ?? `Team ${teamId}`,
        score: 0,
        playerCount: 0,
      }));
  }, [teamScores, playerRoster]);

  const hasTeams = sortedTeams.length >= 2;
  const team1 = sortedTeams[0];
  const team2 = sortedTeams[1];
  const team1Players = team1 ? (teamPlayers.get(team1.teamId) ?? []) : [];
  const team2Players = team2 ? (teamPlayers.get(team2.teamId) ?? []) : [];
  const team1Ping = useMemo(
    () => computePingStats(team1Players),
    [team1Players],
  );
  const team2Ping = useMemo(
    () => computePingStats(team2Players),
    [team2Players],
  );
  const maxRows = Math.max(team1Players.length, team2Players.length);

  return (
    <div className={styles.Overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.Dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Score Screen"
        tabIndex={-1}
      >
        <header className={styles.TitleBar}>
          <h2 className={styles.Title}>Score</h2>{" "}
          <span className={styles.PlayerTotal}>
            <LuUsers className={styles.PlayersIcon} />{" "}
            {playerRoster?.length ?? 0} players
          </span>{" "}
          {matchClockMs != null && <MatchClock clockMs={matchClockMs} />}
        </header>

        {hasTeams ? (
          <div className={styles.TableWrapper}>
            <table className={styles.Table}>
              <thead>
                <tr className={styles.TeamHeaderRow}>
                  <th className={styles.TeamName}>{getTeamName(team1)}</th>
                  <th className={styles.TeamScore}>{team1.score}</th>
                  <th className={styles.TeamName}>{getTeamName(team2)}</th>
                  <th className={styles.TeamScore}>{team2.score}</th>
                </tr>
                <tr className={styles.ColumnHeaderRow}>
                  <th className={styles.ColumnHeader}>
                    <span>Players ({team1Players.length})</span>
                    {team1Players.length > 0 && (
                      <span className={styles.ColumnPing}>
                        {" "}
                        PING: {team1Ping.avg}&thinsp;&#177;&thinsp;
                        {team1Ping.dev}&thinsp;ms
                      </span>
                    )}
                  </th>
                  <th className={styles.ColumnHeaderScore}>Score</th>
                  <th className={styles.ColumnHeader}>
                    <span>Players ({team2Players.length})</span>
                    {team2Players.length > 0 && (
                      <span className={styles.ColumnPing}>
                        {" "}
                        PING: {team2Ping.avg}&thinsp;&#177;&thinsp;
                        {team2Ping.dev}&thinsp;ms
                      </span>
                    )}
                  </th>
                  <th className={styles.ColumnHeaderScore}>Score</th>
                </tr>
              </thead>
              <tbody className={styles.PlayerBody}>
                {Array.from({ length: maxRows }, (_, i) => {
                  const p1 = team1Players[i];
                  const p2 = team2Players[i];
                  const p1IsLocal =
                    connectedClientId != null &&
                    p1?.clientId === connectedClientId;
                  const p2IsLocal =
                    connectedClientId != null &&
                    p2?.clientId === connectedClientId;
                  return (
                    <tr key={`${p1?.clientId ?? ""}-${p2?.clientId ?? ""}`}>
                      <td
                        className={
                          p1IsLocal ? styles.PlayerNameLocal : styles.PlayerName
                        }
                      >
                        {p1?.name || (p1 ? "..." : "")}
                      </td>
                      <td
                        className={
                          p1IsLocal
                            ? styles.PlayerScoreLocal
                            : styles.PlayerScore
                        }
                      >
                        {p1 != null ? p1.score : ""}
                      </td>
                      <td
                        className={
                          p2IsLocal ? styles.PlayerNameLocal : styles.PlayerName
                        }
                      >
                        {p2?.name || (p2 ? "..." : "")}
                      </td>
                      <td
                        className={
                          p2IsLocal
                            ? styles.PlayerScoreLocal
                            : styles.PlayerScore
                        }
                      >
                        {p2 != null ? p2.score : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {observers.length > 0 &&
                (() => {
                  // Split into two columns, filling top-to-bottom then left-to-right.
                  const half = Math.ceil(observers.length / 2);
                  const obsRows = Math.ceil(observers.length / 2);
                  return (
                    <tbody className={styles.ObserverBody}>
                      <tr className={styles.ColumnHeaderRow}>
                        <th colSpan={2} className={styles.ColumnHeader}>
                          Observers ({observers.length})
                        </th>
                        <th colSpan={2} className={styles.ColumnHeader}>
                          &nbsp;
                        </th>
                      </tr>
                      {Array.from({ length: obsRows }, (_, i) => {
                        const o1 = observers[i];
                        const o2 = observers[i + half];
                        const o1IsLocal =
                          connectedClientId != null &&
                          o1?.clientId === connectedClientId;
                        const o2IsLocal =
                          connectedClientId != null &&
                          o2?.clientId === connectedClientId;
                        return (
                          <tr
                            key={`${o1?.clientId ?? ""}-${o2?.clientId ?? ""}`}
                          >
                            <td
                              className={
                                o1IsLocal
                                  ? styles.PlayerNameLocal
                                  : styles.PlayerName
                              }
                            >
                              {o1?.name || (o1 ? "..." : "")}
                            </td>
                            <td
                              className={
                                o1IsLocal
                                  ? styles.PlayerScoreLocal
                                  : styles.PlayerScore
                              }
                            >
                              {o1 != null ? o1.score : ""}
                            </td>
                            <td
                              className={
                                o2IsLocal
                                  ? styles.PlayerNameLocal
                                  : styles.PlayerName
                              }
                            >
                              {o2?.name || ""}
                            </td>
                            <td
                              className={
                                o2IsLocal
                                  ? styles.PlayerScoreLocal
                                  : styles.PlayerScore
                              }
                            >
                              {o2 != null ? o2.score : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })()}
            </table>
          </div>
        ) : (
          <div className={styles.Empty}>
            {playerRoster?.length
              ? "No team data available"
              : "Waiting for player data\u2026"}
          </div>
        )}

        <div className={styles.Footer}>
          <button className={styles.CloseButton} onClick={onClose}>
            Close
          </button>
          <span className={styles.Hint}>Esc to close</span>
        </div>
      </div>
    </div>
  );
}

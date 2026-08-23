import { useEffect, useRef, useMemo } from "react";
import { LuUsers } from "react-icons/lu";
import { IoMdStopwatch } from "react-icons/io";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { formatHudClock, useMatchClockMs } from "./useMatchClock";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { useDataSource } from "../state/gameEntityStore";
import type { PlayerRosterEntry, TeamScore } from "../stream/types";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { ColoredName } from "./ColoredName";
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

/** Renders the match clock. Negative clockMs = counting down, positive = counting up. */
function MatchClock({ clockMs }: { clockMs: number }) {
  return (
    <span className={styles.MatchClock}>
      <IoMdStopwatch className={styles.ClockIcon} />{" "}
      <span className={styles.Time}>{formatHudClock(clockMs)}</span>
    </span>
  );
}

function getTeamName(team: TeamScore): string {
  return team.name || DEFAULT_TEAM_NAMES[team.teamId] || `Team ${team.teamId}`;
}

function byScoreThenName(a: PlayerRosterEntry, b: PlayerRosterEntry): number {
  return b.score - a.score || (a.name ?? "").localeCompare(b.name ?? "");
}

/** Paired left/right player rows for the 4-column table layout. */
function PairedPlayerRows({
  left,
  right,
  connectedClientId,
}: {
  left: PlayerRosterEntry[];
  right: PlayerRosterEntry[];
  connectedClientId: number | null | undefined;
}) {
  const maxRows = Math.max(left.length, right.length);
  return (
    <>
      {Array.from({ length: maxRows }, (_, i) => {
        const p1 = left[i];
        const p2 = right[i];
        const p1IsLocal =
          connectedClientId != null && p1?.clientId === connectedClientId;
        const p2IsLocal =
          connectedClientId != null && p2?.clientId === connectedClientId;
        return (
          <tr key={`${p1?.clientId ?? ""}-${p2?.clientId ?? ""}`}>
            <td
              className={p1IsLocal ? styles.PlayerNameLocal : styles.PlayerName}
            >
              {p1 ? p1.name ? <ColoredName raw={p1.rawName} /> : "..." : ""}
            </td>
            <td
              className={
                p1IsLocal ? styles.PlayerScoreLocal : styles.PlayerScore
              }
            >
              {p1 != null ? p1.score : ""}
            </td>
            <td
              className={p2IsLocal ? styles.PlayerNameLocal : styles.PlayerName}
            >
              {p2 ? p2.name ? <ColoredName raw={p2.rawName} /> : "..." : ""}
            </td>
            <td
              className={
                p2IsLocal ? styles.PlayerScoreLocal : styles.PlayerScore
              }
            >
              {p2 != null ? p2.score : ""}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function PlayersColumnHeader({ players }: { players: PlayerRosterEntry[] }) {
  const ping = computePingStats(players);
  return (
    <th className={styles.ColumnHeader}>
      <span>Players ({players.length})</span>
      {players.length > 0 && (
        <span className={styles.ColumnPing}>
          {" "}
          PING: {ping.avg}&thinsp;&#177;&thinsp;{ping.dev}&thinsp;ms
        </span>
      )}
    </th>
  );
}

/**
 * One or two teams side by side; games with more teams stack additional
 * sections (a lone odd team renders with a blank right half).
 */
function TeamPairSection({
  teamA,
  teamB,
  playersA,
  playersB,
  connectedClientId,
}: {
  teamA: TeamScore;
  teamB: TeamScore | undefined;
  playersA: PlayerRosterEntry[];
  playersB: PlayerRosterEntry[];
  connectedClientId: number | null | undefined;
}) {
  return (
    <tbody className={styles.PlayerBody}>
      <tr className={styles.TeamHeaderRow}>
        <th className={styles.TeamName}>{getTeamName(teamA)}</th>
        <th className={styles.TeamScore}>{teamA.score}</th>
        <th className={styles.TeamName}>{teamB ? getTeamName(teamB) : " "}</th>
        <th className={styles.TeamScore}>{teamB ? teamB.score : " "}</th>
      </tr>
      <tr className={styles.ColumnHeaderRow}>
        <PlayersColumnHeader players={playersA} />
        <th className={styles.ColumnHeaderScore}>Score</th>
        {teamB ? (
          <>
            <PlayersColumnHeader players={playersB} />
            <th className={styles.ColumnHeaderScore}>Score</th>
          </>
        ) : (
          <>
            <th className={styles.ColumnHeader}>&nbsp;</th>
            <th className={styles.ColumnHeaderScore}>&nbsp;</th>
          </>
        )}
      </tr>
      <PairedPlayerRows
        left={playersA}
        right={playersB}
        connectedClientId={connectedClientId}
      />
    </tbody>
  );
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
      list.sort(byScoreThenName);
    }
    observers.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return { teamPlayers, observers };
  }, [playerRoster]);

  // Teams exist only when the server declares them (the per-game
  // MsgXxxAddTeam burst at mission drop). Roster team ids alone don't
  // imply teams: teamless games still assign them (Rabbit uses 1 and 2,
  // DM and Hunters give every player a unique sensor-group team).
  const sortedTeams = useMemo(
    () =>
      teamScores?.length
        ? [...teamScores].sort((a, b) => a.teamId - b.teamId)
        : [],
    [teamScores],
  );

  // Teamless games (Rabbit, DM, ...): everyone with a team id competes
  // individually — one score-sorted list. Team id 0 is still observers.
  const ffaPlayers = useMemo(() => {
    if (sortedTeams.length > 0 || !playerRoster?.length) return null;
    return playerRoster.filter((p) => p.teamId > 0).sort(byScoreThenName);
  }, [sortedTeams, playerRoster]);

  // Two team columns per section; extra teams stack below.
  const teamPairs = useMemo(() => {
    const pairs: [TeamScore, TeamScore | undefined][] = [];
    for (let i = 0; i < sortedTeams.length; i += 2) {
      pairs.push([sortedTeams[i], sortedTeams[i + 1]]);
    }
    return pairs;
  }, [sortedTeams]);

  // FFA fills top-to-bottom then left-to-right across the two halves.
  const ffaHalf = ffaPlayers ? Math.ceil(ffaPlayers.length / 2) : 0;

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
            {playerRoster?.length ?? 0} player
            {(playerRoster?.length ?? 0) === 1 ? "" : "s"}
          </span>{" "}
          {matchClockMs != null && <MatchClock clockMs={matchClockMs} />}
        </header>

        {teamPairs.length > 0 || ffaPlayers ? (
          <div className={styles.TableWrapper}>
            <table className={styles.Table}>
              {teamPairs.map(([teamA, teamB]) => (
                <TeamPairSection
                  key={teamA.teamId}
                  teamA={teamA}
                  teamB={teamB}
                  playersA={teamPlayers.get(teamA.teamId) ?? []}
                  playersB={teamB ? (teamPlayers.get(teamB.teamId) ?? []) : []}
                  connectedClientId={connectedClientId}
                />
              ))}
              {ffaPlayers ? (
                <tbody className={styles.PlayerBody}>
                  <tr className={styles.ColumnHeaderRow}>
                    <PlayersColumnHeader players={ffaPlayers} />
                    <th className={styles.ColumnHeaderScore}>Score</th>
                    <th className={styles.ColumnHeader}>&nbsp;</th>
                    <th className={styles.ColumnHeaderScore}>Score</th>
                  </tr>
                  <PairedPlayerRows
                    left={ffaPlayers.slice(0, ffaHalf)}
                    right={ffaPlayers.slice(ffaHalf)}
                    connectedClientId={connectedClientId}
                  />
                </tbody>
              ) : null}
              {observers.length > 0 ? (
                <tbody className={styles.ObserverBody}>
                  <tr className={styles.ColumnHeaderRow}>
                    <th colSpan={2} className={styles.ColumnHeader}>
                      Observers ({observers.length})
                    </th>
                    <th colSpan={2} className={styles.ColumnHeader}>
                      &nbsp;
                    </th>
                  </tr>
                  <PairedPlayerRows
                    left={observers.slice(0, Math.ceil(observers.length / 2))}
                    right={observers.slice(Math.ceil(observers.length / 2))}
                    connectedClientId={connectedClientId}
                  />
                </tbody>
              ) : null}
            </table>
          </div>
        ) : (
          <div className={styles.Empty}>Waiting for player data&hellip;</div>
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

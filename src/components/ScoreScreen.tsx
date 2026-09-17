import { useEffect, useRef, useMemo } from "react";
import { LuUsers } from "react-icons/lu";
import { IoMdStopwatch } from "react-icons/io";
import { formatHudClock, useMatchClockMs } from "./useMatchClock";
import type { PlayerRosterEntry, TeamScore } from "../stream/types";
import { ColoredName } from "./ColoredName";
import styles from "./ScoreScreen.module.css";
import { getScoreboardTeamName, useScoreboard } from "./useScoreboard";

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
        <th className={styles.TeamName}>{getScoreboardTeamName(teamA)}</th>
        <th className={styles.TeamScore}>{teamA.score}</th>
        <th className={styles.TeamName}>
          {teamB ? getScoreboardTeamName(teamB) : " "}
        </th>
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
  const {
    connectedClientId,
    playerRoster,
    teamPlayers,
    observers,
    sortedTeams,
    ffaPlayers,
  } = useScoreboard();
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

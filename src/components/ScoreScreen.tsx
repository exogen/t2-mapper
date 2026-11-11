import { useEffect, useRef, useMemo, type ReactNode } from "react";
import { VisuallyHidden } from "@ariakit/react";
import { LuUsers } from "react-icons/lu";
import { IoMdStopwatch } from "react-icons/io";
import { formatHudClock, useMatchClockMs } from "./useMatchClock";
import type { PlayerRosterEntry, TeamScore } from "../stream/types";
import { ScorePlayerName } from "./ScorePlayerName";
import { useFollowCamera } from "./useFollowCamera";
import styles from "./ScoreScreen.module.css";
import { getScoreboardTeamName, useScoreboard } from "./useScoreboard";
import { EditableTeamName } from "./TeamNameDialog";

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

function PlayerRows({
  players,
  rowCount,
  connectedClientId,
  onFollow,
}: {
  players: PlayerRosterEntry[];
  rowCount: number;
  connectedClientId: number | null | undefined;
  onFollow?: (player: PlayerRosterEntry) => void;
}) {
  return (
    <>
      {Array.from({ length: rowCount }, (_, i) => {
        const player = players[i];
        const isLocal =
          connectedClientId != null && player?.clientId === connectedClientId;
        return (
          <tr
            key={player?.clientId ?? `empty-${i}`}
            aria-hidden={player ? undefined : true}
          >
            <td
              className={isLocal ? styles.PlayerNameLocal : styles.PlayerName}
            >
              {player ? (
                <ScorePlayerName player={player} onFollow={onFollow} />
              ) : (
                "\u00a0"
              )}
            </td>
            <td
              className={isLocal ? styles.PlayerScoreLocal : styles.PlayerScore}
            >
              {player?.score ?? ""}
            </td>
          </tr>
        );
      })}
    </>
  );
}

/** Equal halves, each with an independently content-sized score column. */
function PlayerPairTables({
  left,
  right,
  leftLabel,
  rightLabel,
  leftHeader,
  rightHeader,
  observers = false,
  connectedClientId,
  onFollow,
}: {
  left: PlayerRosterEntry[];
  right: PlayerRosterEntry[];
  leftLabel: string;
  rightLabel?: string;
  leftHeader?: ReactNode;
  rightHeader?: ReactNode;
  observers?: boolean;
  connectedClientId: number | null | undefined;
  onFollow?: (player: PlayerRosterEntry) => void;
}) {
  const rowCount = Math.max(left.length, right.length);
  return (
    <div className={styles.TablePair}>
      {[left, right].map((players, side) => (
        <table
          key={side}
          className={styles.Table}
          aria-label={side === 0 ? leftLabel : rightLabel}
          aria-hidden={side === 1 && !rightLabel ? true : undefined}
        >
          {observers ? (
            <VisuallyHidden render={<thead />}>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Score</th>
              </tr>
            </VisuallyHidden>
          ) : side === 0 ? (
            leftHeader
          ) : (
            rightHeader
          )}
          <tbody
            className={observers ? styles.ObserverBody : styles.PlayerBody}
          >
            <PlayerRows
              players={players}
              rowCount={rowCount}
              connectedClientId={connectedClientId}
              onFollow={onFollow}
            />
          </tbody>
        </table>
      ))}
    </div>
  );
}

function PlayersColumnHeader({ players }: { players: PlayerRosterEntry[] }) {
  const ping = computePingStats(players);
  return (
    <th className={styles.ColumnHeader} scope="col">
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
  teams,
  playersA,
  playersB,
  connectedClientId,
  onFollow,
}: {
  teamA: TeamScore;
  teamB: TeamScore | undefined;
  teams: readonly TeamScore[];
  playersA: PlayerRosterEntry[];
  playersB: PlayerRosterEntry[];
  connectedClientId: number | null | undefined;
  onFollow?: (player: PlayerRosterEntry) => void;
}) {
  const header = (
    team: TeamScore | undefined,
    players: PlayerRosterEntry[],
  ) => (
    <thead>
      <tr className={styles.TeamHeaderRow}>
        <th className={styles.TeamName}>
          {team ? (
            <EditableTeamName teamId={team.teamId} teams={teams} />
          ) : (
            "\u00a0"
          )}
        </th>
        <th className={styles.TeamScore}>{team?.score ?? "\u00a0"}</th>
      </tr>
      <tr className={styles.ColumnHeaderRow}>
        {team ? (
          <PlayersColumnHeader players={players} />
        ) : (
          <th className={styles.ColumnHeader}>&nbsp;</th>
        )}
        <th className={styles.ColumnHeaderScore} scope="col">
          {team ? "Score" : "\u00a0"}
        </th>
      </tr>
    </thead>
  );
  return (
    <PlayerPairTables
      left={playersA}
      right={playersB}
      leftLabel={`${getScoreboardTeamName(teamA)} players`}
      rightLabel={teamB ? `${getScoreboardTeamName(teamB)} players` : undefined}
      leftHeader={header(teamA, playersA)}
      rightHeader={header(teamB, playersB)}
      connectedClientId={connectedClientId}
      onFollow={onFollow}
    />
  );
}

export function ScoreScreen({ onClose }: { onClose: () => void }) {
  const { enabled, followPlayer } = useFollowCamera();
  const onFollow = enabled
    ? (player: PlayerRosterEntry) => {
        if (followPlayer(player)) onClose();
      }
    : undefined;
  const dialogRef = useRef<HTMLDivElement>(null);
  const {
    connectedClientId,
    playerRoster,
    teamPlayers,
    observers,
    sortedTeams,
    teamScores,
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

  // Block key presses from reaching Three.js while open. Releases still
  // reach the input tracker, or a key held as the screen opened (F2
  // itself) would stay down after it closes.
  useEffect(() => {
    const belongsToAnotherDialog = (e: KeyboardEvent) => {
      const dialog =
        e.target instanceof Element
          ? e.target.closest('[role="dialog"]')
          : null;
      return dialog != null && dialog !== dialogRef.current;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (belongsToAnotherDialog(e)) return;
      if (!e.repeat && (e.key === "Escape" || e.code === "F2")) {
        onClose();
      }
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
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
          <div
            className={styles.TableWrapper}
            role="region"
            aria-label="Player scores"
            tabIndex={0}
          >
            {teamPairs.map(([teamA, teamB]) => (
              <TeamPairSection
                key={teamA.teamId}
                teamA={teamA}
                teamB={teamB}
                teams={teamScores ?? []}
                playersA={teamPlayers.get(teamA.teamId) ?? []}
                playersB={teamB ? (teamPlayers.get(teamB.teamId) ?? []) : []}
                connectedClientId={connectedClientId}
                onFollow={onFollow}
              />
            ))}
            {ffaPlayers ? (
              <PlayerPairTables
                left={ffaPlayers.slice(0, ffaHalf)}
                right={ffaPlayers.slice(ffaHalf)}
                leftLabel="Players, left column"
                rightLabel={
                  ffaPlayers.length > 1 ? "Players, right column" : undefined
                }
                leftHeader={
                  <thead>
                    <tr className={styles.ColumnHeaderRow}>
                      <PlayersColumnHeader players={ffaPlayers} />
                      <th className={styles.ColumnHeaderScore} scope="col">
                        Score
                      </th>
                    </tr>
                  </thead>
                }
                rightHeader={
                  <thead>
                    <tr className={styles.ColumnHeaderRow}>
                      <th className={styles.ColumnHeader} scope="col">
                        <VisuallyHidden>Player</VisuallyHidden>
                      </th>
                      <th className={styles.ColumnHeaderScore} scope="col">
                        Score
                      </th>
                    </tr>
                  </thead>
                }
                connectedClientId={connectedClientId}
                onFollow={onFollow}
              />
            ) : null}
            {observers.length > 0 ? (
              <section>
                <h3 className={styles.ObserversHeader}>
                  Observers ({observers.length})
                </h3>
                <PlayerPairTables
                  left={observers.slice(0, Math.ceil(observers.length / 2))}
                  right={observers.slice(Math.ceil(observers.length / 2))}
                  leftLabel="Observers, left column"
                  rightLabel={
                    observers.length > 1 ? "Observers, right column" : undefined
                  }
                  observers
                  connectedClientId={connectedClientId}
                  onFollow={onFollow}
                />
              </section>
            ) : null}
          </div>
        ) : (
          <div className={styles.Empty}>Waiting for player data&hellip;</div>
        )}

        <div className={styles.Footer}>
          <button className={styles.CloseButton} onClick={onClose}>
            Close
          </button>
          <span className={styles.Hint}>Esc or F2 to close</span>
        </div>
      </div>
    </div>
  );
}

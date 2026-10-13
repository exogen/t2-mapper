import type { PlayerRosterEntry, TeamScore } from "../stream/types";
import { ScorePlayerName } from "./ScorePlayerName";
import { useFollowCamera } from "./useFollowCamera";
import type { HudStyle } from "./SettingsProvider";
import { getScoreboardTeamName, useScoreboard } from "./useScoreboard";
import { EditableTeamName } from "./TeamNameDialog";
import styles from "./ScoreHUD.module.css";

function PlayerScores({
  label,
  teamId,
  teams,
  score,
  players,
  connectedClientId,
  onFollow,
}: {
  label: string;
  teamId?: number;
  teams?: readonly TeamScore[];
  score?: number;
  players: PlayerRosterEntry[];
  connectedClientId: number | null | undefined;
  onFollow?: (player: PlayerRosterEntry) => void;
}) {
  return (
    <div className={styles.Team}>
      <table className={styles.Table} aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className={styles.Name} title={label}>
              {teamId != null && teams ? (
                <EditableTeamName teamId={teamId} teams={teams} />
              ) : (
                label
              )}
            </th>
            <th scope="col" className={styles.Score}>
              {score ?? "Score"}
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr
              key={player.clientId}
              data-local={player.clientId === connectedClientId}
            >
              <td className={styles.Name} title={player.name}>
                <ScorePlayerName player={player} onFollow={onFollow} />
              </td>
              <td className={styles.Score}>{player.score}</td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr>
              <td colSpan={2} className={styles.Empty}>
                &mdash;
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ScoreHUD({ hudStyle }: { hudStyle: HudStyle }) {
  const { enabled, followPlayer } = useFollowCamera();
  const {
    sortedTeams,
    teamScores,
    teamPlayers,
    ffaPlayers,
    connectedClientId,
  } = useScoreboard();
  return (
    <section
      className={styles.ScoreHUD}
      data-style={hudStyle}
      aria-label="Player scores"
      tabIndex={0}
    >
      <div className={styles.Teams}>
        {sortedTeams.length > 0 ? (
          sortedTeams.map((team) => (
            <PlayerScores
              key={team.teamId}
              label={getScoreboardTeamName(team)}
              teamId={team.teamId}
              teams={teamScores ?? []}
              score={team.score}
              players={teamPlayers.get(team.teamId) ?? []}
              connectedClientId={connectedClientId}
              onFollow={enabled ? followPlayer : undefined}
            />
          ))
        ) : (
          <PlayerScores
            label="Players"
            players={ffaPlayers ?? []}
            connectedClientId={connectedClientId}
            onFollow={enabled ? followPlayer : undefined}
          />
        )}
      </div>
    </section>
  );
}

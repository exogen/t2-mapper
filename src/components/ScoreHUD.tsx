import type { PlayerRosterEntry } from "../stream/types";
import { ColoredName } from "./ColoredName";
import type { HudStyle } from "./SettingsProvider";
import { getScoreboardTeamName, useScoreboard } from "./useScoreboard";
import styles from "./ScoreHUD.module.css";

function PlayerScores({
  label,
  score,
  players,
  connectedClientId,
}: {
  label: string;
  score?: number;
  players: PlayerRosterEntry[];
  connectedClientId: number | null | undefined;
}) {
  return (
    <div className={styles.Team}>
      <table className={styles.Table} aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className={styles.Name} title={label}>
              {label}
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
                {player.name ? <ColoredName raw={player.rawName} /> : "…"}
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
  const { sortedTeams, teamPlayers, ffaPlayers, connectedClientId } =
    useScoreboard();
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
              score={team.score}
              players={teamPlayers.get(team.teamId) ?? []}
              connectedClientId={connectedClientId}
            />
          ))
        ) : (
          <PlayerScores
            label="Players"
            players={ffaPlayers ?? []}
            connectedClientId={connectedClientId}
          />
        )}
      </div>
    </section>
  );
}

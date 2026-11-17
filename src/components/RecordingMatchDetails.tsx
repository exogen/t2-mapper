import { Fragment } from "react";
import type { demoSummary } from "./demoFormat";
import tileStyles from "./PreviewTile.module.css";

export function RecordingMatchDetails({
  matchTitle,
  matchups,
}: Pick<ReturnType<typeof demoSummary>, "matchTitle" | "matchups">) {
  return (
    <>
      {matchTitle && (
        <span className={tileStyles.TileMatchTitle} title={matchTitle}>
          {matchTitle}
        </span>
      )}
      {matchups.length > 0 && (
        <span className={tileStyles.TileTeams}>
          {matchups.map((teams, gameIndex) => (
            <Fragment key={gameIndex}>
              {gameIndex > 0 && " → "}
              {teams.map(([id, name], teamIndex) => (
                <Fragment key={id}>
                  {teamIndex > 0 && " vs "}
                  <span className={tileStyles.TileTeamName}>{name}</span>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </span>
      )}
    </>
  );
}

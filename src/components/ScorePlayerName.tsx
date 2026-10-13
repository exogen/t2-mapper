import type { PlayerRosterEntry } from "../stream/types";
import { ColoredName } from "./ColoredName";
import { PlayerAdminBadge } from "./PlayerAdminBadge";
import styles from "./ScorePlayerName.module.css";

export function ScorePlayerName({
  player,
  onFollow,
}: {
  player: PlayerRosterEntry | undefined;
  onFollow?: (player: PlayerRosterEntry) => void;
}) {
  if (!player) return null;
  const name = (
    <>
      {player.name ? <ColoredName raw={player.rawName || player.name} /> : "…"}
      <PlayerAdminBadge player={player} />
    </>
  );
  return onFollow ? (
    <button
      type="button"
      className={styles.Name}
      title={`Follow ${player.name || "player"}`}
      onClick={() => onFollow(player)}
    >
      {name}
    </button>
  ) : (
    name
  );
}

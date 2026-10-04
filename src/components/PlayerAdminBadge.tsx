import { BiSolidCheckShield, BiSolidShield } from "react-icons/bi";
import type { PlayerRosterEntry } from "../stream/types";
import styles from "./PlayerAdminBadge.module.css";

export function PlayerAdminBadge({
  player,
}: {
  player?: Pick<PlayerRosterEntry, "isAdmin" | "isSuperAdmin">;
}) {
  if (!player?.isAdmin && !player?.isSuperAdmin) return null;
  const Icon = player.isSuperAdmin ? BiSolidCheckShield : BiSolidShield;
  const label = player.isSuperAdmin ? "Superadmin" : "Admin";
  return (
    <Icon
      className={player.isSuperAdmin ? styles.SuperadminBadge : styles.Badge}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}

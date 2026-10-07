import type { IconType } from "react-icons";
import type { SavedCamera } from "../state/casterStore";
import { findLivingPlayersByName } from "../state/watchFollow";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { taglessPlayerName } from "../stream/streamHelpers";
import {
  IFF_ENEMY,
  IFF_FRIENDLY,
  IFF_NEUTRAL,
  resolveIffDisplay,
  rgbString,
} from "./iffTheme";
import { useSettings } from "./SettingsProvider";

export function QuickCamIcon({
  camera,
  Icon,
  className,
  flagTeamId,
}: {
  camera: SavedCamera | undefined;
  Icon: IconType;
  className?: string;
  flagTeamId?: number | null;
}) {
  const { observerTeamColors } = useSettings();
  const color = useStreamSnapshot((snapshot) => {
    let teamId = flagTeamId;
    const observer = snapshot?.playerSensorGroup === 0;
    if (camera?.kind === "follow" || camera?.kind === "fp") {
      const matches = findLivingPlayersByName(camera.playerName);
      if (matches.length === 1)
        return rgbString(
          resolveIffDisplay(matches[0], observer, observerTeamColors).color,
        );
      if (matches.length === 0) {
        const name = camera.playerName.toLowerCase();
        teamId = snapshot?.playerRoster.find(
          (player) =>
            taglessPlayerName(player.rawName, player.name).toLowerCase() ===
            name,
        )?.teamId;
      }
    } else if (teamId === undefined && camera?.kind !== "flag") {
      return undefined;
    }
    const display =
      teamId == null || teamId <= 0 || !snapshot
        ? IFF_NEUTRAL
        : observer
          ? resolveIffDisplay({ teamId }, true, observerTeamColors)
          : teamId === snapshot.playerSensorGroup
            ? IFF_FRIENDLY
            : IFF_ENEMY;
    return rgbString(display.color);
  });
  return <Icon className={className} aria-hidden color={color} />;
}

import type { IconType } from "react-icons";
import type { SavedCamera } from "../state/casterStore";
import { getPlayerResolver, resolvePlayerBody } from "../state/playerResolver";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
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
    if (camera?.kind === "player") {
      const body = resolvePlayerBody(camera.player);
      if (body)
        return rgbString(
          resolveIffDisplay(body, observer, observerTeamColors).color,
        );
      teamId = getPlayerResolver(snapshot).resolve(camera.player)?.teamId;
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

import type { IconType } from "react-icons";
import type { SavedCamera } from "../state/casterStore";
import { getPlayerResolver, resolvePlayerBody } from "../state/playerResolver";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import {
  resolveIffDisplay,
  resolveTeamIffDisplay,
  rgbString,
  type IffView,
} from "../iffTheme";

export function QuickCamIcon({
  camera,
  Icon,
  className,
  flagTeamId,
  view,
}: {
  camera: SavedCamera | undefined;
  Icon: IconType;
  className?: string;
  flagTeamId?: number | null;
  view: IffView;
}) {
  const color = useStreamSnapshot((snapshot) => {
    let teamId = flagTeamId;
    if (camera?.kind === "player") {
      const body = resolvePlayerBody(camera.player);
      if (body) return rgbString(resolveIffDisplay(body, view).color);
      teamId = getPlayerResolver(snapshot).resolve(camera.player)?.teamId;
    } else if (teamId === undefined && camera?.kind !== "flag") {
      return undefined;
    }
    return rgbString(resolveTeamIffDisplay(teamId, view).color);
  });
  return <Icon className={className} aria-hidden color={color} />;
}

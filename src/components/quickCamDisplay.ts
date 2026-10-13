import { BiSolidCameraHome } from "react-icons/bi";
import { LuUser } from "react-icons/lu";
import { PiFlagBannerFill } from "react-icons/pi";
import type { QuickCamSlot, SavedCamera } from "../state/casterStore";
import type { FlagCamera } from "./useFlagCameras";

export function quickCamDisplay(
  slot: QuickCamSlot,
  camera: SavedCamera | undefined,
  flags: readonly FlagCamera[],
) {
  const flagSlot =
    camera?.kind === "flag" ? camera.slot : !camera ? slot : null;
  const flag = flags.find((flag) => flag.slot === flagSlot);
  const empty = !camera && !flag;
  let label: string;
  if (flag) {
    label = flag.label;
  } else {
    switch (camera?.kind) {
      case "player":
        label = camera.displayName;
        break;
      case "flag":
        label = `Flag ${camera.slot}`;
        break;
      case "fly":
        label = `Camera ${slot === 0 ? 10 : slot}`;
        break;
      case "original":
        label = "Original view";
        break;
      case undefined:
        label = "Not set";
        break;
    }
  }
  const Icon =
    flag || camera?.kind === "flag"
      ? PiFlagBannerFill
      : camera?.kind === "player"
        ? LuUser
        : camera
          ? BiSolidCameraHome
          : null;
  return { label, Icon, empty, flagSlot, flagTeamId: flag?.teamId };
}

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
  const isPlayer = camera?.kind === "follow" || camera?.kind === "fp";
  const savedLabel = camera?.label.replace(/^(?:Command circuit · |CC: )/, "");
  const label = flag
    ? flag.label
    : isPlayer
      ? savedLabel!.replace(/ · (?:First person|Follow)$/, "")
      : camera?.kind === "fly"
        ? `Camera ${slot === 0 ? 10 : slot}`
        : (savedLabel ?? "Not set");
  const Icon =
    flag || camera?.kind === "flag"
      ? PiFlagBannerFill
      : isPlayer
        ? LuUser
        : camera
          ? BiSolidCameraHome
          : null;
  return { label, Icon, empty, flagTeamId: flag?.teamId };
}

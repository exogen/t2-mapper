import { type QuickCamSlot } from "../state/casterStore";
import { saveQuickCam, restoreQuickCam } from "../state/quickCams";
import { useSettings } from "./SettingsProvider";

/** Saved framing includes whether an orbit tracks behind the player. */
export function useQuickCams() {
  const { followBehindPlayer, setFollowBehindPlayer } = useSettings();
  return {
    save(slot: QuickCamSlot) {
      saveQuickCam(slot, followBehindPlayer);
    },
    restore(slot: QuickCamSlot) {
      const camera = restoreQuickCam(slot);
      if (camera) setFollowBehindPlayer(camera.followBehindPlayer);
    },
  };
}

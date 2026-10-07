import { useEffect } from "react";
import {
  casterStore,
  QUICK_CAM_SLOTS,
  type QuickCamSlot,
} from "../state/casterStore";
import { useQuickCams } from "./useQuickCams";
import { useInputAction } from "./InputControls";
import { useSettings } from "./SettingsProvider";

function SlotBindings({ slot }: { slot: QuickCamSlot }) {
  const { save, restore } = useQuickCams();
  useInputAction(`quickCam${slot}`, () => restore(slot));
  useInputAction(`saveQuickCam${slot}`, () => save(slot));
  return null;
}

export function QuickCamControls() {
  const { fov } = useSettings();
  useEffect(() => {
    casterStore.setState({ fov: null });
  }, [fov]);
  return QUICK_CAM_SLOTS.map((slot) => <SlotBindings key={slot} slot={slot} />);
}

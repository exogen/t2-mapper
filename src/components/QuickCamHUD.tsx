import { useEffect, useRef } from "react";
import { BsShiftFill } from "react-icons/bs";
import { FaClosedCaptioning } from "react-icons/fa";
import { LuCircleDashed } from "react-icons/lu";
import { QUICK_CAM_SLOTS, useCaster } from "../state/casterStore";
import { useDataSource } from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useFlagCameras } from "./useFlagCameras";
import { quickCamDisplay } from "./quickCamDisplay";
import { QuickCamIcon } from "./QuickCamIcon";
import { useQuickCams } from "./useQuickCams";
import { useSettings } from "./SettingsProvider";
import styles from "./QuickCamHUD.module.css";

export function QuickCamHUD({
  position = "left",
}: {
  position?: "left" | "right";
}) {
  const { quickCamHideUnassignedSlots } = useSettings();
  const settings = useCaster((s) => s.settings);
  const lastCameraAction = useCaster((s) => s.lastCameraAction);
  const seenAction = useRef(lastCameraAction);
  const hudRef = useRef<HTMLElement>(null);
  const flags = useFlagCameras();
  const source = useDataSource();
  const liveReady = useLiveSelector((s) => s.role === "watcher" && s.liveReady);
  const ready = source === "demo" || (source === "live" && liveReady);
  const { restore } = useQuickCams();
  useEffect(() => {
    if (lastCameraAction === seenAction.current) return;
    seenAction.current = lastCameraAction;
    if (!lastCameraAction) return;
    const button = hudRef.current?.querySelector<HTMLButtonElement>(
      `button[data-slot="${lastCameraAction.slot}"]`,
    );
    if (!button) return;
    for (const animation of button.getAnimations()) animation.cancel();
    const highlight = {
      backgroundColor: "rgba(35, 145, 132, 0.6)",
      borderColor: "rgba(24, 197, 171, 0.4)",
      color: "#fff",
    };
    button.animate(
      [{ ...highlight, offset: 0 }, { ...highlight, offset: 0.2 }, {}],
      { duration: 600, easing: "ease-out" },
    );
  }, [lastCameraAction]);
  if (!settings) return null;
  return (
    <nav
      ref={hudRef}
      className={styles.QuickCamHUD}
      data-position={position}
      aria-label="Quick cams"
    >
      <div className={styles.CameraList}>
        {QUICK_CAM_SLOTS.map((slot) => {
          const camera = settings.quickCams[slot];
          const { label, Icon, empty, flagTeamId } = quickCamDisplay(
            slot,
            camera,
            flags,
          );
          if (quickCamHideUnassignedSlots && empty) return null;
          return (
            <button
              key={slot}
              type="button"
              className={styles.CameraButton}
              data-slot={slot}
              disabled={!ready || empty}
              onClick={empty ? undefined : () => restore(slot)}
              title={
                empty
                  ? `Press Shift+${slot} to set camera ${slot}`
                  : `Recall camera ${slot}: ${label}`
              }
            >
              <kbd>{slot}</kbd>
              {empty ? (
                <LuCircleDashed aria-hidden />
              ) : (
                Icon && (
                  <QuickCamIcon
                    camera={camera}
                    Icon={Icon}
                    flagTeamId={flagTeamId}
                  />
                )
              )}
              <span className={styles.Label}>
                {empty ? (
                  <span className={styles.SetHint}>
                    Press{" "}
                    <BsShiftFill
                      className={styles.ShiftIcon}
                      aria-label="Shift"
                    />
                    <span>
                      <kbd>{slot}</kbd> to set
                    </span>
                  </span>
                ) : (
                  label
                )}
              </span>
              {camera?.commandCircuit && (
                <FaClosedCaptioning aria-label="Command circuit" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

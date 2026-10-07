import { BsShiftFill } from "react-icons/bs";
import { FaClosedCaptioning } from "react-icons/fa";
import { casterStore, useCaster, QUICK_CAM_SLOTS } from "../state/casterStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useFlagCameras } from "./useFlagCameras";
import { quickCamDisplay } from "./quickCamDisplay";
import { QuickCamIcon } from "./QuickCamIcon";
import { useQuickCams } from "./useQuickCams";
import { useSettings, type HudPosition } from "./SettingsProvider";
import styles from "./InspectorControls.module.css";
import cameraStyles from "./QuickCamPanel.module.css";

export function QuickCamPanel({ watching }: { watching: boolean }) {
  const {
    showQuickCamHud,
    setShowQuickCamHud,
    quickCamHudPosition,
    setQuickCamHudPosition,
    quickCamHideUnassignedSlots,
    setQuickCamHideUnassignedSlots,
  } = useSettings();
  return (
    <>
      <div className={styles.CheckboxField}>
        <input
          id="showQuickCamHudInput"
          type="checkbox"
          checked={showQuickCamHud}
          onChange={(event) => setShowQuickCamHud(event.target.checked)}
        />
        <label className={styles.Label} htmlFor="showQuickCamHudInput">
          Show quick cam HUD
        </label>
        <div className={styles.Control}>
          <select
            id="quickCamHudPositionInput"
            aria-label="Quick cam HUD position"
            value={quickCamHudPosition}
            disabled={!showQuickCamHud}
            onChange={(event) =>
              setQuickCamHudPosition(event.target.value as HudPosition)
            }
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>
      <div className={styles.CheckboxField}>
        <input
          id="quickCamHideUnassignedSlotsInput"
          type="checkbox"
          checked={quickCamHideUnassignedSlots}
          onChange={(event) =>
            setQuickCamHideUnassignedSlots(event.target.checked)
          }
        />
        <label
          className={styles.Label}
          htmlFor="quickCamHideUnassignedSlotsInput"
        >
          Hide unassigned slots
        </label>
      </div>
      <CameraBindings watching={watching} />
    </>
  );
}

function CameraBindings({ watching }: { watching: boolean }) {
  const { save, restore } = useQuickCams();
  const settings = useCaster((s) => s.settings);
  const liveReady = useLiveSelector((s) => s.liveReady);
  const flags = useFlagCameras();
  if (!settings)
    return (
      <p className={styles.Description}>Waiting for mission information…</p>
    );
  return (
    <fieldset
      className={cameraStyles.Controls}
      disabled={watching && !liveReady}
    >
      <p className={styles.Description}>
        Press Save or <BsShiftFill className={cameraStyles.ShiftIcon} />{" "}
        Shift&ndash;# to assign. Press the button or number key to recall.
      </p>
      <div className={cameraStyles.Cameras}>
        {QUICK_CAM_SLOTS.map((slot) => {
          const camera = settings.quickCams[slot];
          const { label, Icon, empty, flagTeamId } = quickCamDisplay(
            slot,
            camera,
            flags,
          );
          return (
            <div key={slot} className={cameraStyles.Camera}>
              <button
                type="button"
                className={cameraStyles.CameraButton}
                disabled={empty}
                onClick={() => restore(slot)}
                title={`Recall camera ${slot}: ${label}`}
              >
                <kbd>{slot}</kbd>
                {Icon && (
                  <QuickCamIcon
                    camera={camera}
                    Icon={Icon}
                    className={cameraStyles.CameraIcon}
                    flagTeamId={flagTeamId}
                  />
                )}
                <span className={cameraStyles.CameraLabel}>{label}</span>
                {camera?.commandCircuit && (
                  <FaClosedCaptioning
                    className={cameraStyles.CommandCircuitIcon}
                    aria-label="Command circuit"
                  />
                )}
              </button>
              <div className={cameraStyles.CameraActions}>
                <button
                  type="button"
                  className={cameraStyles.SaveButton}
                  onClick={() => save(slot)}
                  aria-label={`Save camera ${slot}`}
                >
                  Save
                </button>
                <button
                  type="button"
                  className={cameraStyles.ClearButton}
                  disabled={!camera}
                  onClick={() => casterStore.getState().saveCamera(slot, null)}
                  aria-label={`Clear camera ${slot}`}
                >
                  Clear
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

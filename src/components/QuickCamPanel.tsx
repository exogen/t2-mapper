import { Checkbox } from "./Checkbox";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { getPlayerResolver } from "../state/playerResolver";
import { BsShiftFill } from "react-icons/bs";
import { FaClosedCaptioning } from "react-icons/fa";
import { casterStore, useCaster, QUICK_CAM_SLOTS } from "../state/casterStore";
import { useIsWatchSpectator } from "./useIsWatchSpectator";
import { useFlagCameras } from "./useFlagCameras";
import { quickCamDisplay } from "./quickCamDisplay";
import { QuickCamIcon } from "./QuickCamIcon";
import { useQuickCams } from "./useQuickCams";
import { useIffView } from "./useIffView";
import { useSettings, type HudPosition } from "./SettingsProvider";
import { Select } from "./Select";
import styles from "./InspectorControls.module.css";
import cameraStyles from "./QuickCamPanel.module.css";

export function QuickCamPanel({ watching }: { watching: boolean }) {
  const {
    clipPlaybackActive,
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
        <Checkbox
          id="showQuickCamHudInput"
          checked={showQuickCamHud}
          disabled={clipPlaybackActive}
          onChange={(event) => setShowQuickCamHud(event.target.checked)}
        />
        <label className={styles.Label} htmlFor="showQuickCamHudInput">
          Quick cam HUD
        </label>
        <div className={styles.Control}>
          <Select
            id="quickCamHudPositionInput"
            disabled={clipPlaybackActive}
            aria-label="Quick cam HUD position"
            value={quickCamHudPosition}
            onChange={(value) => setQuickCamHudPosition(value as HudPosition)}
            options={[
              { value: "left", label: "Left" },
              { value: "right", label: "Right" },
            ]}
          />
        </div>
      </div>
      <div className={styles.CheckboxField}>
        <Checkbox
          id="quickCamHideUnassignedSlotsInput"
          checked={quickCamHideUnassignedSlots}
          disabled={clipPlaybackActive}
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
  const { clipPlaybackActive } = useSettings();
  const { save, restore } = useQuickCams();
  const settings = useCaster((s) => s.settings);
  const spectatorReady = useIsWatchSpectator({ requireReady: true });
  const flags = useFlagCameras();
  const players = useStreamSnapshot(getPlayerResolver);
  const iffView = useIffView();
  if (!settings)
    return (
      <p className={styles.Description}>Waiting for mission information…</p>
    );
  return (
    <fieldset
      className={cameraStyles.Controls}
      disabled={clipPlaybackActive || (watching && !spectatorReady)}
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
            players,
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
                    view={iffView}
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

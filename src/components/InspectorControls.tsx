import {
  useControls,
  useDebug,
  useSettings,
  type TouchMode,
} from "./SettingsProvider";
import { MissionSelect } from "./MissionSelect";
import { useEffect, useState, useRef, RefObject } from "react";
import { CopyCoordinatesButton } from "./CopyCoordinatesButton";
import { LoadDemoButton } from "./LoadDemoButton";
import { JoinServerButton } from "./JoinServerButton";
import { useRecording } from "./RecordingProvider";
import { useLiveConnectionOptional } from "./LiveConnection";
import { FiInfo, FiSettings } from "react-icons/fi";
import { Camera } from "three";
import styles from "./InspectorControls.module.css";
export function InspectorControls({
  missionName,
  missionType,
  onChangeMission,
  onOpenMapInfo,
  onOpenServerBrowser,
  isTouch,
  cameraRef,
}: {
  missionName: string;
  missionType: string;
  onChangeMission: ({
    missionName,
    missionType,
  }: {
    missionName: string;
    missionType: string;
  }) => void;
  onOpenMapInfo: () => void;
  onOpenServerBrowser?: () => void;
  isTouch: boolean | null;
  cameraRef: RefObject<Camera>;
}) {
  const {
    fogEnabled,
    setFogEnabled,
    fov,
    setFov,
    audioEnabled,
    setAudioEnabled,
    animationEnabled,
    setAnimationEnabled,
  } = useSettings();
  const { speedMultiplier, setSpeedMultiplier, touchMode, setTouchMode } =
    useControls();
  const { debugMode, setDebugMode } = useDebug();
  const demoRecording = useRecording();
  const live = useLiveConnectionOptional();
  const isLive = live?.adapter != null;
  const isStreaming = demoRecording != null || isLive;
  // Hide FOV/speed controls during .rec playback (faithfully replaying),
  // but show them in .mis browsing and live observer mode.
  const hideViewControls = isStreaming && !isLive;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusAreaRef = useRef<HTMLDivElement>(null);
  // Focus the panel when it opens.
  useEffect(() => {
    if (settingsOpen) {
      dropdownRef.current?.focus();
    }
  }, [settingsOpen]);
  const handleDropdownBlur = (e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && focusAreaRef.current?.contains(relatedTarget)) {
      return;
    }
    setSettingsOpen(false);
  };
  // Close on Escape and return focus to the gear button.
  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSettingsOpen(false);
      buttonRef.current?.focus();
    }
  };
  return (
    <div
      id="controls"
      className={styles.Controls}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.MissionSelectWrapper}>
        <MissionSelect
          value={missionName}
          missionType={missionType}
          onChange={onChangeMission}
          disabled={isStreaming}
        />
      </div>
      <div ref={focusAreaRef}>
        <button
          ref={buttonRef}
          className={styles.Toggle}
          onClick={() => {
            setSettingsOpen((isOpen) => !isOpen);
          }}
          aria-expanded={settingsOpen}
          aria-controls="settingsPanel"
          aria-label="Settings"
        >
          <FiSettings />
        </button>
        <div
          className={styles.Dropdown}
          ref={dropdownRef}
          id="settingsPanel"
          tabIndex={-1}
          onKeyDown={handlePanelKeyDown}
          onBlur={handleDropdownBlur}
          data-open={settingsOpen}
        >
          <div className={styles.Group}>
            <CopyCoordinatesButton
              missionName={missionName}
              missionType={missionType}
              cameraRef={cameraRef}
            />
            <LoadDemoButton />
            {onOpenServerBrowser && (
              <JoinServerButton onOpenServerBrowser={onOpenServerBrowser} />
            )}
            <button
              type="button"
              className={styles.MapInfoButton}
              aria-label="Show map info"
              onClick={onOpenMapInfo}
            >
              <FiInfo />
              <span className={styles.ButtonLabel}>Show map info</span>
            </button>
          </div>
          <div className={styles.Group}>
            <div className={styles.CheckboxField}>
              <input
                id="fogInput"
                type="checkbox"
                checked={fogEnabled}
                onChange={(event) => {
                  setFogEnabled(event.target.checked);
                }}
              />
              <label htmlFor="fogInput">Fog?</label>
            </div>
            <div className={styles.CheckboxField}>
              <input
                id="audioInput"
                type="checkbox"
                checked={audioEnabled}
                onChange={(event) => {
                  setAudioEnabled(event.target.checked);
                }}
              />
              <label htmlFor="audioInput">Audio?</label>
            </div>
          </div>
          <div className={styles.Group}>
            <div className={styles.CheckboxField}>
              <input
                id="animationInput"
                type="checkbox"
                checked={animationEnabled}
                onChange={(event) => {
                  setAnimationEnabled(event.target.checked);
                }}
              />
              <label htmlFor="animationInput">Animation?</label>
            </div>
            <div className={styles.CheckboxField}>
              <input
                id="debugInput"
                type="checkbox"
                checked={debugMode}
                onChange={(event) => {
                  setDebugMode(event.target.checked);
                }}
              />
              <label htmlFor="debugInput">Debug?</label>
            </div>
          </div>
          <div className={styles.Group}>
            {hideViewControls ? null : (
              <div className={styles.Field}>
                <label htmlFor="fovInput">FOV</label>
                <input
                  id="fovInput"
                  type="range"
                  min={75}
                  max={120}
                  step={5}
                  value={fov}
                  onChange={(event) => setFov(parseInt(event.target.value))}
                />
                <output htmlFor="fovInput">{fov}</output>
              </div>
            )}
            {hideViewControls ? null : (
              <div className={styles.Field}>
                <label htmlFor="speedInput">Speed</label>
                <input
                  id="speedInput"
                  type="range"
                  min={0.1}
                  max={5}
                  step={0.05}
                  value={speedMultiplier}
                  onChange={(event) =>
                    setSpeedMultiplier(parseFloat(event.target.value))
                  }
                />
              </div>
            )}
          </div>
          {isTouch && (
            <div className={styles.Group}>
              <div className={styles.Field}>
                <label htmlFor="touchModeInput">Joystick:</label>{" "}
                <select
                  id="touchModeInput"
                  value={touchMode}
                  onChange={(e) => setTouchMode(e.target.value as TouchMode)}
                >
                  <option value="dualStick">Dual Stick</option>
                  <option value="moveLookStick">Single Stick</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

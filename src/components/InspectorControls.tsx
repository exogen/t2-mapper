import {
  useControls,
  useDebug,
  useSettings,
  type TouchMode,
} from "./SettingsProvider";
import { MissionSelect } from "./MissionSelect";
import { RefObject, useEffect, useState, useRef } from "react";
import { Camera } from "three";
import { CopyCoordinatesButton } from "./CopyCoordinatesButton";
import { FiSettings } from "react-icons/fi";

export function InspectorControls({
  missionName,
  missionType,
  onChangeMission,
  cameraRef,
  isTouch,
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
  cameraRef: RefObject<Camera | null>;
  isTouch: boolean | null;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Focus the panel when it opens.
  useEffect(() => {
    if (settingsOpen) {
      dropdownRef.current?.focus();
    }
  }, [settingsOpen]);

  const handleDropdownBlur = (e: React.FocusEvent) => {
    const related = e.relatedTarget as Node | null;
    if (
      related &&
      (dropdownRef.current?.contains(related) ||
        buttonRef.current?.contains(related))
    ) {
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

  const settingsFields = (
    <>
      <div className="Controls-group">
        <CopyCoordinatesButton cameraRef={cameraRef} />
      </div>
      <div className="Controls-group">
        <div className="CheckboxField">
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
        <div className="CheckboxField">
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
      <div className="Controls-group">
        <div className="CheckboxField">
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
        <div className="CheckboxField">
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
      <div className="Controls-group">
        <div className="Field">
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
        <div className="Field">
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
      </div>
      {isTouch && (
        <div className="Controls-group">
          <div className="Field">
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
    </>
  );

  return (
    <div
      id="controls"
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <MissionSelect
        value={missionName}
        missionType={missionType}
        onChange={onChangeMission}
      />
      <button
        ref={buttonRef}
        className="IconButton Controls-toggle"
        onClick={() => setSettingsOpen((isOpen) => !isOpen)}
        onDoubleClick={(e) => e.preventDefault()}
        aria-expanded={settingsOpen}
        aria-controls="settingsPanel"
        aria-label="Settings"
      >
        <FiSettings />
      </button>
      <div
        className="Controls-dropdown"
        ref={dropdownRef}
        id="settingsPanel"
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
        onBlur={handleDropdownBlur}
        data-open={settingsOpen}
      >
        {settingsFields}
      </div>
    </div>
  );
}

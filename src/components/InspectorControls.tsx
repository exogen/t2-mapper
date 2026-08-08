import { useEffect, useState, useRef, RefObject, memo } from "react";
import { FaRotateRight } from "react-icons/fa6";
import {
  useControls,
  useDebug,
  useSettings,
  type TouchMode,
} from "./SettingsProvider";
import { CopyCoordinatesButton } from "./CopyCoordinatesButton";
import { LoadDemoButton } from "./LoadDemoButton";
import { JoinServerButton } from "./JoinServerButton";
import { Accordion, AccordionGroup } from "./Accordion";
import { useTouchDevice } from "./useTouchDevice";
import { DemoTimeline } from "./DemoTimeline";
import { MapTourPanel } from "./MapTourPanel";
import { CommandCircuitButton } from "./CommandCircuitButton";
import { useRecording } from "./usePlayback";
import { useDataSource, useMissionName } from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { hasMission } from "../manifest";
import { ChooseMapButton } from "./ChooseMapButton";
import { MapInfoButton } from "./MapInfoButton";
import { ShowScoresButton } from "./ShowScoresButton";
import { DebugEntityList } from "./DebugEntityList";
import buttonStyles from "./Button.module.css";
import styles from "./InspectorControls.module.css";

const DEFAULT_PANELS = ["controls", "preferences", "audio", "timeline"];

export const InspectorControls = memo(function InspectorControls({
  missionName,
  missionType,
  onOpenMapInfo,
  onOpenScoreScreen,
  onOpenServerBrowser,
  onChooseMap,
  onCancelChoosingMap,
  choosingMap,
  invalidateRef,
  onClose,
}: {
  missionName: string;
  missionType?: string;
  onOpenMapInfo: () => void;
  onOpenScoreScreen?: () => void;
  onOpenServerBrowser?: () => void;
  onChooseMap?: () => void;
  onCancelChoosingMap?: () => void;
  choosingMap?: boolean;
  invalidateRef: RefObject<(() => void) | null>;
  onClose: () => void;
}) {
  const isTouch = useTouchDevice();
  const dataSource = useDataSource();
  const recording = useRecording();
  const storeMissionName = useMissionName();
  const hasStreamData = dataSource === "demo" || dataSource === "live";
  // When streaming, the URL query param may not reflect the actual map.
  // Use the store's mission name (from the server) for the manifest check.
  const effectiveMissionName = hasStreamData ? storeMissionName : missionName;
  const missionInManifest = effectiveMissionName
    ? hasMission(effectiveMissionName)
    : false;
  const isLiveConnected = useLiveSelector(
    (s) => s.gameStatus === "connected" || s.gameStatus === "authenticating",
  );
  const {
    fogEnabled,
    setFogEnabled,
    fov,
    setFov,
    audioEnabled,
    setAudioEnabled,
    audioVolume,
    setAudioVolume,
    adjustAudioSpeed,
    setAdjustAudioSpeed,
    animationEnabled,
    setAnimationEnabled,
    fpsLimit,
    setFpsLimit,
    showInputOverlay,
    setShowInputOverlay,
    showChat,
    setShowChat,
    showReticle,
    setShowReticle,
  } = useSettings();
  const {
    speedMultiplier,
    setSpeedMultiplier,
    mouseSensitivity,
    setMouseSensitivity,
    touchMode,
    setTouchMode,
    invertScroll,
    setInvertScroll,
    invertDrag,
    setInvertDrag,
    invertJoystick,
    setInvertJoystick,
  } = useControls();
  const { debugMode, setDebugMode, renderOnDemand, setRenderOnDemand } =
    useDebug();
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
    <div id="controls" className={styles.InspectorControls}>
      <div ref={focusAreaRef}>
        <div
          className={styles.Dropdown}
          ref={dropdownRef}
          id="settingsPanel"
          tabIndex={-1}
          onKeyDown={handlePanelKeyDown}
          onBlur={handleDropdownBlur}
          data-open={settingsOpen}
        >
          <div className={styles.Tools}>
            <div className={buttonStyles.ButtonGroup}>
              <ChooseMapButton
                isActive={
                  (dataSource === "map" && !recording) || (choosingMap ?? false)
                }
                onClick={onChooseMap}
              />
              <LoadDemoButton
                isActive={!choosingMap && recording?.source === "demo"}
                choosingMap={choosingMap}
                onCancelChoosingMap={onCancelChoosingMap}
              />
              {onOpenServerBrowser && (
                <JoinServerButton
                  isActive={!choosingMap && isLiveConnected}
                  onOpenServerBrowser={onOpenServerBrowser}
                />
              )}
            </div>
            <CopyCoordinatesButton
              missionName={missionName}
              missionType={missionType}
              disabled={!missionInManifest}
            />
            <MapInfoButton missionName={missionName} onClick={onOpenMapInfo} />
            <CommandCircuitButton />
            {onOpenScoreScreen && (
              <ShowScoresButton onClick={onOpenScoreScreen} />
            )}
          </div>
          <div className={styles.Accordions}>
            <AccordionGroup type="multiple" defaultValue={DEFAULT_PANELS}>
              {recording?.source === "demo" && (
                <Accordion value="timeline" label="Timeline" noPadding>
                  <DemoTimeline />
                </Accordion>
              )}
              {dataSource === "map" && !recording && (
                <Accordion value="mapFeatures" label="Map Features" noPadding>
                  <MapTourPanel />
                </Accordion>
              )}
              <Accordion value="controls" label="Controls">
                <div className={styles.Field}>
                  <label htmlFor="speedInput">Fly speed</label>
                  <div className={styles.Control}>
                    <input
                      id="speedInput"
                      type="range"
                      min={1}
                      max={100}
                      step={1}
                      value={Math.round(speedMultiplier * 100)}
                      onChange={(event) =>
                        setSpeedMultiplier(parseFloat(event.target.value) / 100)
                      }
                    />
                  </div>
                  <p className={styles.Description}>
                    How fast you move in free-flying mode.
                    {isTouch === false
                      ? " Use your scroll wheel or trackpad to adjust while flying."
                      : ""}
                  </p>
                </div>
                {isTouch ? (
                  <div className={styles.Field}>
                    <label htmlFor="touchModeInput">Joystick</label>{" "}
                    <div className={styles.Control}>
                      <select
                        id="touchModeInput"
                        value={touchMode}
                        onChange={(e) =>
                          setTouchMode(e.target.value as TouchMode)
                        }
                      >
                        <option value="dualStick">Dual stick</option>
                        <option value="moveLookStick">Single stick</option>
                      </select>
                    </div>
                    <p className={styles.Description}>
                      Single stick has a unified move + look control. Dual stick
                      has independent move + look.
                    </p>
                  </div>
                ) : null}
                {isTouch === false ? (
                  <div className={styles.CheckboxField}>
                    <input
                      id="invertScroll"
                      type="checkbox"
                      checked={invertScroll}
                      onChange={(event) => {
                        setInvertScroll(event.target.checked);
                      }}
                    />
                    <label className={styles.Label} htmlFor="invertScroll">
                      Invert scroll direction
                    </label>
                    <p className={styles.Description}>
                      Reverse which scroll direction increases and decreases fly
                      speed.
                    </p>
                  </div>
                ) : null}
                {isTouch ? (
                  <div className={styles.CheckboxField}>
                    <input
                      id="invertJoystick"
                      type="checkbox"
                      checked={invertJoystick}
                      onChange={(event) => {
                        setInvertJoystick(event.target.checked);
                      }}
                    />
                    <label className={styles.Label} htmlFor="invertJoystick">
                      Invert joystick direction
                    </label>
                    <p className={styles.Description}>
                      Reverse joystick look direction.
                    </p>
                  </div>
                ) : null}
                <div className={styles.CheckboxField}>
                  <input
                    id="invertDrag"
                    type="checkbox"
                    checked={invertDrag}
                    onChange={(event) => {
                      setInvertDrag(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="invertDrag">
                    Invert drag direction
                  </label>
                  <p className={styles.Description}>
                    Reverse how dragging the viewport aims the camera.
                  </p>
                </div>
                {isTouch === false && (
                  <div className={styles.Field}>
                    <label htmlFor="mouseSensitivityInput">
                      Mouse sensitivity
                    </label>
                    <div className={styles.Control}>
                      <input
                        id="mouseSensitivityInput"
                        type="range"
                        min={1}
                        max={256}
                        step={2}
                        value={Math.round(mouseSensitivity * 16000)}
                        onChange={(event) => {
                          const value = parseInt(event.target.value);
                          const sens = value / 16000;
                          setMouseSensitivity(sens);
                        }}
                      />
                    </div>
                  </div>
                )}
              </Accordion>
              <Accordion value="preferences" label="Preferences">
                <div className={styles.Field}>
                  <label htmlFor="fovInput">FOV</label>
                  <div className={styles.Control}>
                    <output htmlFor="fovInput">{fov}&deg;</output>
                    <input
                      id="fovInput"
                      type="range"
                      min={75}
                      max={120}
                      step={5}
                      value={fov}
                      onChange={(event) => setFov(parseInt(event.target.value))}
                    />
                  </div>
                </div>
                <div className={styles.CheckboxField}>
                  <input
                    id="showInputOverlayInput"
                    type="checkbox"
                    checked={showInputOverlay}
                    onChange={(event) => {
                      setShowInputOverlay(event.target.checked);
                    }}
                  />
                  <label
                    className={styles.Label}
                    htmlFor="showInputOverlayInput"
                  >
                    Show input overlay
                  </label>
                </div>
                {hasStreamData && (
                  <>
                    <div className={styles.CheckboxField}>
                      <input
                        id="showChatInput"
                        type="checkbox"
                        checked={showChat}
                        onChange={(event) => {
                          setShowChat(event.target.checked);
                        }}
                      />
                      <label className={styles.Label} htmlFor="showChatInput">
                        Show chat HUD
                      </label>
                    </div>
                    <div className={styles.CheckboxField}>
                      <input
                        id="showReticleInput"
                        type="checkbox"
                        checked={showReticle}
                        onChange={(event) => {
                          setShowReticle(event.target.checked);
                        }}
                      />
                      <label
                        className={styles.Label}
                        htmlFor="showReticleInput"
                      >
                        Show reticles
                      </label>
                    </div>
                  </>
                )}
              </Accordion>
              <Accordion value="audio" label="Audio">
                <div className={styles.CheckboxField}>
                  <input
                    id="audioInput"
                    type="checkbox"
                    checked={audioEnabled}
                    onChange={(event) => {
                      setAudioEnabled(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="audioInput">
                    Enable audio
                  </label>
                </div>
                <div className={styles.Field}>
                  <label htmlFor="volumeInput">Master volume</label>
                  <div className={styles.Control}>
                    <output htmlFor="volumeInput">
                      {Math.round(audioVolume * 100)}%
                    </output>
                    <input
                      id="volumeInput"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={audioVolume}
                      onChange={(event) =>
                        setAudioVolume(parseFloat(event.target.value))
                      }
                    />
                  </div>
                </div>
                <div className={styles.CheckboxField}>
                  <input
                    id="adjustAudioSpeedInput"
                    type="checkbox"
                    checked={adjustAudioSpeed}
                    onChange={(event) => {
                      setAdjustAudioSpeed(event.target.checked);
                    }}
                  />
                  <label
                    className={styles.Label}
                    htmlFor="adjustAudioSpeedInput"
                  >
                    Adjust audio speed to match demo playback
                  </label>
                </div>
              </Accordion>
              <Accordion value="graphics" label="Graphics">
                <div className={styles.CheckboxField}>
                  <input
                    id="fogInput"
                    type="checkbox"
                    checked={fogEnabled}
                    onChange={(event) => {
                      setFogEnabled(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="fogInput">
                    Enable fog
                  </label>
                </div>
                <div className={styles.CheckboxField}>
                  <input
                    id="animationInput"
                    type="checkbox"
                    checked={animationEnabled}
                    onChange={(event) => {
                      setAnimationEnabled(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="animationInput">
                    Enable animations
                  </label>
                </div>
                <div className={styles.Field}>
                  <label htmlFor="fpsLimitInput">FPS limit</label>
                  <div className={styles.Control}>
                    <select
                      id="fpsLimitInput"
                      value={fpsLimit ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFpsLimit(val === "" ? null : parseInt(val));
                      }}
                    >
                      {import.meta.env.DEV ? (
                        <option value="1">1</option>
                      ) : null}
                      <option value="30">30</option>
                      <option value="60">60</option>
                      <option value="120">120</option>
                      <option value="144">144</option>
                      <option value="">No limit</option>
                    </select>
                  </div>
                  <p className={styles.Description}>
                    Give your device a break by capping the framerate.
                  </p>
                </div>
              </Accordion>
              <Accordion value="debug" label="Debug">
                <div className={styles.CheckboxField}>
                  <input
                    id="debugInput"
                    type="checkbox"
                    checked={debugMode}
                    onChange={(event) => {
                      setDebugMode(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="debugInput">
                    Render debug visuals
                  </label>
                </div>
                <div className={styles.CheckboxField}>
                  <input
                    id="onDemandInput"
                    type="checkbox"
                    checked={renderOnDemand}
                    onChange={(event) => {
                      setRenderOnDemand(event.target.checked);
                    }}
                  />
                  <div className={styles.Label}>
                    <label htmlFor="onDemandInput">Render on demand </label>
                    <button
                      type="button"
                      className={styles.ForceRenderButton}
                      title="Force render"
                      aria-label="Force render"
                      onClick={() => invalidateRef.current?.()}
                    >
                      <FaRotateRight />
                    </button>
                  </div>
                  <p className={styles.Description}>
                    Significantly decreases CPU and GPU usage by only rendering
                    frames when requested. Helpful when developing parts of the
                    app unrelated to rendering.
                  </p>
                </div>
                <DebugEntityList />
              </Accordion>
            </AccordionGroup>
          </div>
          <button className={styles.CloseSidebarButton} onClick={onClose}>
            <span className={buttonStyles.ButtonLabel}>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
});

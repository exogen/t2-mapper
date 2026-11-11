import { CastPanel } from "./CastPanel";
import { QuickCamPanel } from "./QuickCamPanel";
import { Select } from "./Select";
import { RangeSlider } from "./RangeSlider";
import { Checkbox } from "./Checkbox";
import { useCommentaryTracks } from "../state/commentaryTracksStore";
import { memo } from "react";
import { FaRotateRight } from "react-icons/fa6";
import {
  MAX_JOYSTICK_OPACITY,
  MAX_SPEED_MULTIPLIER,
  MIN_JOYSTICK_OPACITY,
  MIN_SPEED_MULTIPLIER,
  RENDER_SCALE_OPTIONS,
  useControls,
  useDebug,
  useSettings,
  type CcPlayerNames,
  type IffVisibility,
  type HudStyle,
  type MatchHudStyle,
  type ScoreStyle,
  type HudPosition,
  type TouchMode,
} from "./SettingsProvider";
import { CopyCoordinatesButton } from "./CopyCoordinatesButton";
import { CopyDemoLinkButton } from "./CopyDemoLinkButton";
import { StartSharedReplayButton } from "./StartSharedReplayButton";
import { CopyReplaySessionLinkButton } from "./CopyReplaySessionLinkButton";
import { EndReplaySessionButton } from "./EndReplaySessionButton";
import { useDemoLoad } from "../state/demoLoadStore";
import { LoadDemoButton } from "./LoadDemoButton";
import { JoinServerButton } from "./JoinServerButton";
import { Accordion, AccordionGroup } from "./Accordion";
import { useTouchDevice } from "./useTouchDevice";
import { DemoTimeline } from "./DemoTimeline";
import { useDemoTimelineFilters } from "./useDemoTimelineFilters";
import { MapTourPanel } from "./MapTourPanel";
import { CommandCircuitButton } from "./CommandCircuitButton";
import { showNewAddressDialog } from "./NewAddressDialog";
import { useFeatures } from "./FeaturesProvider";
import { StatsPanel } from "./StatsPanel";
import { JigglePhysicsPanel } from "./JigglePhysicsPanel";
import { useModeQueryState } from "./useQueryParams";
import { useRecording } from "./usePlayback";
import {
  isStreamingSource,
  useDataSource,
  useMissionName,
} from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useIsWatchSpectator } from "./useIsWatchSpectator";
import { hasMission } from "../manifest";
import { ChooseMapButton } from "./ChooseMapButton";
import { MapInfoButton } from "./MapInfoButton";
import { ShowScoresButton } from "./ShowScoresButton";
import { DebugEntityList } from "./DebugEntityList";
import { DebugNetworkInfo } from "./DebugNetworkInfo";
import { DebugRendererInfo } from "./DebugRendererInfo";
import type { GameEngine } from "../engine/gameEngine";
import { TEAM_COLOR_SCHEMES, type TeamColorScheme } from "../iffTheme";
import buttonStyles from "./Button.module.css";
import styles from "./InspectorControls.module.css";

const DEFAULT_PANELS = [
  "cast",
  "controls",
  "preferences",
  "audio",
  "timeline",
  "stats",
  "jiggle",
];

export const InspectorControls = memo(function InspectorControls({
  missionName,
  missionType,
  onOpenMapInfo,
  onOpenScoreScreen,
  onOpenServerBrowser,
  onEnterDemoMode,
  onChooseMap,
  onCancelChoosingMap,
  choosingMap,
  engine,
  onClose,
}: {
  missionName: string;
  missionType?: string;
  onOpenMapInfo: () => void;
  onOpenScoreScreen?: () => void;
  onOpenServerBrowser?: () => void;
  onEnterDemoMode?: () => void;
  onChooseMap?: () => void;
  onCancelChoosingMap?: () => void;
  choosingMap?: boolean;
  /** The game canvas's engine, once it's mounted. */
  engine: GameEngine | null;
  onClose: () => void;
}) {
  const isTouch = useTouchDevice();
  const dataSource = useDataSource();
  const recording = useRecording();
  const timelineFilters = useDemoTimelineFilters();
  const demoSourceUrl = useDemoLoad((s) => s.sourceUrl);
  const features = useFeatures();
  const storeMissionName = useMissionName();
  const hasStreamData = isStreamingSource(dataSource);
  const hasCommentary = useCommentaryTracks((s) => s.hasCommentary);
  // When streaming, the URL query param may not reflect the actual map.
  // Use the store's mission name (from the server) for the manifest check.
  const effectiveMissionName = hasStreamData ? storeMissionName : missionName;
  const missionInManifest = effectiveMissionName
    ? hasMission(effectiveMissionName)
    : false;
  const isLiveConnected = useLiveSelector(
    (s) =>
      s.gameStatus === "connected" ||
      s.gameStatus === "authenticating" ||
      (s.role === "watcher" &&
        s.watchStatus !== null &&
        s.watchStatus !== "ended"),
  );
  // Live mode without a session shows the server browser in the content
  // area — the Live button reflects that too.
  const [mode] = useModeQueryState();
  const isLiveMode = isLiveConnected || mode === "live";
  const {
    canDisableFog,
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
    shadowsEnabled,
    setShadowsEnabled,
    fpsLimit,
    setFpsLimit,
    renderScale,
    setRenderScale,
    showInputOverlay,
    setShowInputOverlay,
    showChat,
    setShowChat,
    chatHudStyle,
    setChatHudStyle,
    showMatchHud,
    setShowMatchHud,
    matchHudStyle,
    setMatchHudStyle,
    scoreStyle,
    setScoreStyle,
    showScoreHud,
    setShowScoreHud,
    scoreHudPosition,
    setScoreHudPosition,
    scoreHudStyle,
    setScoreHudStyle,
    showReticle,
    setShowReticle,
    showCompass,
    setShowCompass,
    showIffs,
    setShowIffs,
    observerTeamColors,
    setObserverTeamColors,
    ccPlayerNames,
    setCcPlayerNames,
    followBehindPlayer,
    setFollowBehindPlayer,
  } = useSettings();
  const {
    speedMultiplier,
    setSpeedMultiplier,
    mouseSensitivity,
    setMouseSensitivity,
    clickToCycle,
    setClickToCycle,
    touchMode,
    setTouchMode,
    joystickOpacity,
    setJoystickOpacity,
    invertScroll,
    setInvertScroll,
    invertDrag,
    setInvertDrag,
    invertJoystick,
    setInvertJoystick,
  } = useControls();
  const {
    canShowDebugVisuals,
    canShowEntityList,
    debugMode,
    setDebugMode,
    renderOnDemand,
    setRenderOnDemand,
    lodEnabled,
    setLodEnabled,
    showFpsMeter,
    setShowFpsMeter,
    aimCorrection,
    setAimCorrection,
  } = useDebug();
  const watching = useIsWatchSpectator();
  const showCasterControls =
    (dataSource === "live" && watching) || recording?.source === "demo";
  return (
    <div id="controls" className={styles.InspectorControls}>
      <div>
        <div className={styles.Dropdown} id="settingsPanel">
          <div className={styles.Tools}>
            <div className={buttonStyles.ButtonGroup}>
              <ChooseMapButton
                isActive={
                  (dataSource === "map" && !recording) || (choosingMap ?? false)
                }
                onClick={onChooseMap}
              />
              <LoadDemoButton
                isActive={
                  !choosingMap &&
                  (recording?.source === "demo" ||
                    mode === "demo" ||
                    mode === "replay")
                }
                choosingMap={choosingMap}
                onCancelChoosingMap={onCancelChoosingMap}
                onEnterDemoMode={onEnterDemoMode}
              />
              {onOpenServerBrowser && (
                <JoinServerButton
                  isActive={!choosingMap && isLiveMode}
                  onOpenServerBrowser={onOpenServerBrowser}
                />
              )}
            </div>
            {mode === "replay" ? (
              <>
                <EndReplaySessionButton />
                <CopyReplaySessionLinkButton />
              </>
            ) : recording?.source === "demo" ? (
              <StartSharedReplayButton />
            ) : null}
            {recording?.source === "demo" && demoSourceUrl != null ? (
              // An indexed demo is linked by its moment — the second and
              // the camera — since the link can name the demo. A local
              // upload has no URL to link to, so it keeps the coordinates
              // link like any other loaded map.
              <CopyDemoLinkButton />
            ) : mode !== "replay" ? (
              <CopyCoordinatesButton
                missionName={missionName}
                missionType={missionType}
                // Requires an actually loaded map (explore, demo, or live)
                // — the mission URL param alone has a default value.
                disabled={!missionInManifest || dataSource == null}
              />
            ) : null}
            <MapInfoButton missionName={missionName} onClick={onOpenMapInfo} />
            <CommandCircuitButton />
            {onOpenScoreScreen && (
              <ShowScoresButton onClick={onOpenScoreScreen} />
            )}
          </div>
          <div className={styles.Accordions}>
            <AccordionGroup type="multiple" defaultValue={DEFAULT_PANELS}>
              {features.jiggle && (
                <Accordion value="jiggle" label="Flap Genius">
                  <JigglePhysicsPanel />
                </Accordion>
              )}
              {features.stats && recording?.source === "demo" && (
                <Accordion value="stats" label="Stats" noPadding>
                  <StatsPanel />
                </Accordion>
              )}
              {recording?.source === "demo" && hasCommentary && (
                <Accordion value="cast" label="Cast Genius">
                  <CastPanel />
                </Accordion>
              )}
              {recording?.source === "demo" && (
                <Accordion value="timeline" label="Timeline" noPadding>
                  <DemoTimeline filters={timelineFilters} />
                </Accordion>
              )}
              {dataSource === "map" && !recording && (
                <Accordion value="mapFeatures" label="Map Features" noPadding>
                  <MapTourPanel />
                </Accordion>
              )}
              <Accordion value="preferences" label="Preferences">
                <div className={styles.Field}>
                  <label id="fovInput-label" htmlFor="fovInput">
                    FOV
                  </label>
                  <div className={styles.Control}>
                    <output htmlFor="fovInput">{fov}&deg;</output>
                    <RangeSlider
                      id="fovInput"
                      aria-labelledby="fovInput-label"
                      aria-valuetext={`${fov} degrees`}
                      min={75}
                      max={120}
                      step={5}
                      value={fov}
                      onValueChange={setFov}
                    />
                  </div>
                </div>
                {hasStreamData && (
                  <>
                    <div className={styles.CheckboxField}>
                      <Checkbox
                        id="showChatInput"
                        checked={showChat}
                        onChange={(event) => {
                          setShowChat(event.target.checked);
                        }}
                      />
                      <label className={styles.Label} htmlFor="showChatInput">
                        Chat HUD
                      </label>
                      <div className={styles.Control}>
                        <Select
                          id="chatHudStyleInput"
                          aria-label="Chat HUD style"
                          value={chatHudStyle}
                          onChange={(value) =>
                            setChatHudStyle(value as HudStyle)
                          }
                          options={[
                            { value: "solid", label: "Solid" },
                            { value: "transparent", label: "Transparent" },
                          ]}
                        />
                      </div>
                    </div>
                    <div className={styles.CheckboxField}>
                      <Checkbox
                        id="showScoreHudInput"
                        checked={showScoreHud}
                        onChange={(event) =>
                          setShowScoreHud(event.target.checked)
                        }
                      />
                      <label
                        className={styles.Label}
                        htmlFor="showScoreHudInput"
                      >
                        Mini score HUD
                      </label>
                      <div className={styles.Control}>
                        <Select
                          id="scoreHudPositionInput"
                          aria-label="Mini score HUD position"
                          value={scoreHudPosition}
                          onChange={(value) =>
                            setScoreHudPosition(value as HudPosition)
                          }
                          options={[
                            { value: "left", label: "Left" },
                            { value: "right", label: "Right" },
                          ]}
                        />
                        <Select
                          id="scoreHudStyleInput"
                          aria-label="Player scores HUD style"
                          value={scoreHudStyle}
                          onChange={(value) =>
                            setScoreHudStyle(value as HudStyle)
                          }
                          options={[
                            { value: "solid", label: "Solid" },
                            { value: "transparent", label: "Transparent" },
                          ]}
                        />
                      </div>
                    </div>
                    <div className={styles.CheckboxField}>
                      <Checkbox
                        id="showMatchHudInput"
                        checked={showMatchHud}
                        onChange={(event) =>
                          setShowMatchHud(event.target.checked)
                        }
                      />
                      <label
                        className={styles.Label}
                        htmlFor="showMatchHudInput"
                      >
                        Match HUD
                      </label>
                      <div className={styles.Control}>
                        <Select
                          id="matchHudStyleInput"
                          aria-label="Match HUD style"
                          value={matchHudStyle}
                          onChange={(value) =>
                            setMatchHudStyle(value as MatchHudStyle)
                          }
                          options={[
                            { value: "classic", label: "Classic" },
                            { value: "broadcast", label: "Broadcast" },
                          ]}
                        />
                      </div>
                    </div>
                    <div className={styles.Field}>
                      <label
                        id="scoreStyleInput-label"
                        htmlFor="scoreStyleInput"
                      >
                        Score style
                      </label>
                      <div className={styles.Control}>
                        <Select
                          id="scoreStyleInput"
                          aria-labelledby="scoreStyleInput-label"
                          title="Competition shows captures only in CTF games."
                          value={scoreStyle}
                          onChange={(value) =>
                            setScoreStyle(value as ScoreStyle)
                          }
                          options={[
                            { value: "classic", label: "100, 200, 300" },
                            { value: "competition", label: "1, 2, 3" },
                          ]}
                        />
                      </div>
                      <p className={styles.Description}>
                        How team scores are displayed for CTF games: 100 points
                        per cap <em>Tribes 2</em> style, or 1 point per cap.
                      </p>
                    </div>
                  </>
                )}
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="showCompassInput"
                    checked={showCompass}
                    onChange={(event) => {
                      setShowCompass(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="showCompassInput">
                    Show compass
                  </label>
                </div>
                {hasStreamData && (
                  <div className={styles.CheckboxField}>
                    <Checkbox
                      id="showReticleInput"
                      checked={showReticle}
                      onChange={(event) => {
                        setShowReticle(event.target.checked);
                      }}
                    />
                    <label className={styles.Label} htmlFor="showReticleInput">
                      Show reticles
                    </label>
                  </div>
                )}
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="showInputOverlayInput"
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
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="followBehindPlayerInput"
                    checked={followBehindPlayer}
                    onChange={(event) => {
                      setFollowBehindPlayer(event.target.checked);
                    }}
                  />
                  <label
                    className={styles.Label}
                    htmlFor="followBehindPlayerInput"
                  >
                    Keep follow camera behind player
                  </label>
                </div>
                <div className={styles.Field}>
                  <label id="showIffsInput-label" htmlFor="showIffsInput">
                    IFFs &amp; nameplates
                  </label>
                  <div className={styles.Control}>
                    <Select
                      id="showIffsInput"
                      aria-labelledby="showIffsInput-label"
                      value={showIffs}
                      onChange={(value) => setShowIffs(value as IffVisibility)}
                      options={[
                        { value: "always", label: "Always" },
                        { value: "followed", label: "Only followed player" },
                        {
                          value: "exceptFollowed",
                          label: "Except followed player",
                        },
                        { value: "never", label: "Never" },
                      ]}
                    />
                  </div>
                </div>
                <div className={styles.Field}>
                  <label
                    id="ccPlayerNamesInput-label"
                    htmlFor="ccPlayerNamesInput"
                  >
                    Names in command circuit
                  </label>
                  <div className={styles.Control}>
                    <Select
                      id="ccPlayerNamesInput"
                      aria-labelledby="ccPlayerNamesInput-label"
                      value={ccPlayerNames}
                      onChange={(value) =>
                        setCcPlayerNames(value as CcPlayerNames)
                      }
                      options={[
                        { value: "always", label: "Always" },
                        { value: "hover", label: "On hover" },
                        { value: "never", label: "Never" },
                      ]}
                    />
                  </div>
                </div>
                <div className={styles.Field}>
                  <label
                    id="observerTeamColorsInput-label"
                    htmlFor="observerTeamColorsInput"
                  >
                    Observer team colors
                  </label>
                  <div className={styles.Control}>
                    <Select
                      id="observerTeamColorsInput"
                      aria-labelledby="observerTeamColorsInput-label"
                      value={observerTeamColors}
                      onChange={(value) =>
                        setObserverTeamColors(value as TeamColorScheme)
                      }
                      options={Object.entries(TEAM_COLOR_SCHEMES).map(
                        ([value, scheme]) => ({ value, label: scheme.label }),
                      )}
                    />
                  </div>
                  <p className={styles.Description}>
                    Colors that will be used to distinguish teams
                    (Storm&thinsp;/&thinsp;Inferno) when spectating.
                  </p>
                </div>
              </Accordion>
              {showCasterControls && (
                <Accordion value="quickCam" label="Quick cam">
                  <QuickCamPanel watching={dataSource === "live" && watching} />
                </Accordion>
              )}
              <Accordion value="controls" label="Controls">
                <div className={styles.Field}>
                  <label id="speedInput-label" htmlFor="speedInput">
                    Fly speed
                  </label>
                  <div className={styles.Control}>
                    <RangeSlider
                      id="speedInput"
                      aria-labelledby="speedInput-label"
                      aria-describedby="speedInput-description"
                      aria-valuetext={`${Math.round(speedMultiplier * 100)} percent`}
                      min={MIN_SPEED_MULTIPLIER * 100}
                      max={MAX_SPEED_MULTIPLIER * 100}
                      step={1}
                      value={Math.round(speedMultiplier * 100)}
                      onValueChange={(value) => setSpeedMultiplier(value / 100)}
                    />
                  </div>
                  <p id="speedInput-description" className={styles.Description}>
                    How fast you move in free-flying mode.
                    {isTouch === false
                      ? " Use your scroll wheel or trackpad to adjust while flying."
                      : ""}
                  </p>
                </div>
                {isTouch ? (
                  <div className={styles.Field}>
                    <label id="touchModeInput-label" htmlFor="touchModeInput">
                      Joystick
                    </label>{" "}
                    <div className={styles.Control}>
                      <Select
                        id="touchModeInput"
                        aria-labelledby="touchModeInput-label"
                        value={touchMode}
                        onChange={(value) => setTouchMode(value as TouchMode)}
                        options={[
                          { value: "dualStick", label: "Dual stick" },
                          { value: "moveLookStick", label: "Single stick" },
                        ]}
                      />
                    </div>
                    <p className={styles.Description}>
                      Single stick has a unified move + look control. Dual stick
                      has independent move + look.
                    </p>
                  </div>
                ) : null}
                {isTouch ? (
                  <div className={styles.Field}>
                    <label
                      id="joystickOpacityInput-label"
                      htmlFor="joystickOpacityInput"
                    >
                      Joystick opacity
                    </label>
                    <div className={styles.Control}>
                      <output htmlFor="joystickOpacityInput">
                        {Math.round(joystickOpacity * 100)}%
                      </output>
                      <RangeSlider
                        id="joystickOpacityInput"
                        aria-labelledby="joystickOpacityInput-label"
                        aria-valuetext={`${Math.round(joystickOpacity * 100)} percent`}
                        min={MIN_JOYSTICK_OPACITY * 100}
                        max={MAX_JOYSTICK_OPACITY * 100}
                        step={5}
                        value={Math.round(joystickOpacity * 100)}
                        onValueChange={(value) =>
                          setJoystickOpacity(value / 100)
                        }
                      />
                    </div>
                  </div>
                ) : null}
                {isTouch === false ? (
                  <div className={styles.CheckboxField}>
                    <Checkbox
                      id="invertScroll"
                      aria-describedby="invertScroll-description"
                      checked={invertScroll}
                      onChange={(event) => {
                        setInvertScroll(event.target.checked);
                      }}
                    />
                    <label className={styles.Label} htmlFor="invertScroll">
                      Invert scroll direction
                    </label>
                    <p
                      id="invertScroll-description"
                      className={styles.Description}
                    >
                      Reverse which scroll direction increases and decreases fly
                      speed.
                    </p>
                  </div>
                ) : null}
                {isTouch ? (
                  <div className={styles.CheckboxField}>
                    <Checkbox
                      id="invertJoystick"
                      aria-describedby="invertJoystick-description"
                      checked={invertJoystick}
                      onChange={(event) => {
                        setInvertJoystick(event.target.checked);
                      }}
                    />
                    <label className={styles.Label} htmlFor="invertJoystick">
                      Invert joystick direction
                    </label>
                    <p
                      id="invertJoystick-description"
                      className={styles.Description}
                    >
                      Reverse joystick look direction.
                    </p>
                  </div>
                ) : null}
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="invertDrag"
                    aria-describedby="invertDrag-description"
                    checked={invertDrag}
                    onChange={(event) => {
                      setInvertDrag(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="invertDrag">
                    Invert drag direction
                  </label>
                  <p id="invertDrag-description" className={styles.Description}>
                    Reverse how dragging the viewport aims the camera.
                  </p>
                </div>
                {isTouch === false && (
                  <div className={styles.Field}>
                    <label
                      id="mouseSensitivityInput-label"
                      htmlFor="mouseSensitivityInput"
                    >
                      Mouse sensitivity
                    </label>
                    <div className={styles.Control}>
                      <RangeSlider
                        id="mouseSensitivityInput"
                        aria-labelledby="mouseSensitivityInput-label"
                        min={1}
                        max={256}
                        step={2}
                        value={Math.round(mouseSensitivity * 16000)}
                        onValueChange={(value) =>
                          setMouseSensitivity(value / 16000)
                        }
                      />
                    </div>
                  </div>
                )}
                {isTouch === false && (
                  <div className={styles.CheckboxField}>
                    <Checkbox
                      id="clickToCycleInput"
                      aria-describedby="clickToCycleInput-description"
                      checked={clickToCycle}
                      onChange={(event) =>
                        setClickToCycle(event.target.checked)
                      }
                    />
                    <label className={styles.Label} htmlFor="clickToCycleInput">
                      Enable click to cycle
                    </label>
                    <p
                      id="clickToCycleInput-description"
                      className={styles.Description}
                    >
                      With the mouse captured, use left and right mouse buttons
                      to cycle the followed player.
                    </p>
                  </div>
                )}
              </Accordion>
              <Accordion value="audio" label="Audio">
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="audioInput"
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
                  <label id="volumeInput-label" htmlFor="volumeInput">
                    Master volume
                  </label>
                  <div className={styles.Control}>
                    <output htmlFor="volumeInput">
                      {Math.round(audioVolume * 100)}%
                    </output>
                    <RangeSlider
                      id="volumeInput"
                      aria-labelledby="volumeInput-label"
                      aria-valuetext={`${Math.round(audioVolume * 100)} percent`}
                      min={0}
                      max={1}
                      step={0.05}
                      value={audioVolume}
                      onValueChange={setAudioVolume}
                    />
                  </div>
                </div>
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="adjustAudioSpeedInput"
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
                {canDisableFog && (
                  <div className={styles.CheckboxField}>
                    <Checkbox
                      id="fogInput"
                      checked={fogEnabled}
                      onChange={(event) => {
                        setFogEnabled(event.target.checked);
                      }}
                    />
                    <label className={styles.Label} htmlFor="fogInput">
                      Enable fog
                    </label>
                  </div>
                )}
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="animationInput"
                    checked={animationEnabled}
                    onChange={(event) => {
                      setAnimationEnabled(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="animationInput">
                    Enable animations
                  </label>
                </div>
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="shadowsInput"
                    checked={shadowsEnabled}
                    onChange={(event) => {
                      setShadowsEnabled(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="shadowsInput">
                    Enable shadows
                  </label>
                </div>
                <div className={styles.Field}>
                  <label id="renderScaleInput-label" htmlFor="renderScaleInput">
                    Render scale
                  </label>
                  <div className={styles.Control}>
                    <Select
                      id="renderScaleInput"
                      aria-labelledby="renderScaleInput-label"
                      value={String(renderScale)}
                      onChange={(value) => setRenderScale(parseFloat(value))}
                      options={RENDER_SCALE_OPTIONS.map((value) => ({
                        value: String(value),
                        label: `${Math.round(value * 100)}%`,
                      }))}
                    />
                  </div>
                  <p className={styles.Description}>
                    Resolution of the 3D view. Lower percentages render fewer
                    pixels and run faster.
                  </p>
                </div>
                <div className={styles.Field}>
                  <label id="fpsLimitInput-label" htmlFor="fpsLimitInput">
                    FPS limit
                  </label>
                  <div className={styles.Control}>
                    <Select
                      id="fpsLimitInput"
                      aria-labelledby="fpsLimitInput-label"
                      value={fpsLimit == null ? "" : String(fpsLimit)}
                      onChange={(value) =>
                        setFpsLimit(value === "" ? null : parseInt(value))
                      }
                      options={[
                        ...(import.meta.env.DEV
                          ? [{ value: "1", label: "1" }]
                          : []),
                        ...[20, 30, 60, 120, 144].map((value) => ({
                          value: String(value),
                          label: String(value),
                        })),
                        { value: "", label: "No limit" },
                      ]}
                    />
                  </div>
                  <p className={styles.Description}>
                    Give your device a break by capping the framerate.
                  </p>
                </div>
              </Accordion>
              <Accordion value="debug" label="Debug">
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="lodInput"
                    aria-describedby="lodInput-description"
                    checked={lodEnabled}
                    onChange={(event) => {
                      setLodEnabled(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="lodInput">
                    Enable LOD
                  </label>
                  <p id="lodInput-description" className={styles.Description}>
                    Level of detail selection: render simpler shapes when far
                    away. Turn off to always use full detail.
                  </p>
                </div>
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="fpsMeterInput"
                    checked={showFpsMeter}
                    onChange={(event) => {
                      setShowFpsMeter(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="fpsMeterInput">
                    FPS meter
                  </label>
                </div>
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="aimCorrectionInput"
                    aria-describedby="aimCorrectionInput-description"
                    checked={aimCorrection}
                    onChange={(event) => {
                      setAimCorrection(event.target.checked);
                    }}
                  />
                  <label className={styles.Label} htmlFor="aimCorrectionInput">
                    Aim correction
                  </label>
                  <p
                    id="aimCorrectionInput-description"
                    className={styles.Description}
                  >
                    Other players’ angles arrive rounded down in steps of about
                    3°, causing minor discrepancies in aiming. When enabled,
                    this attempts to compensate by rounding differently,
                    pointing closer to where the player was probably aiming in
                    most cases.
                  </p>
                </div>
                {canShowDebugVisuals && (
                  <div className={styles.CheckboxField}>
                    <Checkbox
                      id="debugInput"
                      checked={debugMode}
                      onChange={(event) => {
                        setDebugMode(event.target.checked);
                      }}
                    />
                    <label className={styles.Label} htmlFor="debugInput">
                      Render debug visuals
                    </label>
                  </div>
                )}
                <div className={styles.CheckboxField}>
                  <Checkbox
                    id="onDemandInput"
                    aria-describedby="onDemandInput-description"
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
                      onClick={() => engine?.invalidate()}
                    >
                      <FaRotateRight />
                    </button>
                  </div>
                  <p
                    id="onDemandInput-description"
                    className={styles.Description}
                  >
                    Significantly decreases CPU and GPU usage by only rendering
                    frames when requested. Helpful when developing parts of the
                    app unrelated to rendering.
                  </p>
                </div>
                {engine && <DebugRendererInfo engine={engine} />}
                <DebugNetworkInfo />
                {canShowEntityList && <DebugEntityList />}
                <div className={styles.DebugActionField}>
                  <button
                    type="button"
                    className={buttonStyles.SmallButton}
                    onClick={showNewAddressDialog}
                  >
                    <span className={buttonStyles.ButtonLabel}>
                      Show &ldquo;site moved&rdquo; dialog
                    </span>
                  </button>
                </div>
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

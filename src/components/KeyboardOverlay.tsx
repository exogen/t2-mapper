import {
  ScrollState,
  useInputControls,
  type ActionState,
  type DragState,
  type KeyState,
} from "./InputControls";
import {
  SPEED_OPTIONS,
  useIsPlaying,
  useRecording,
  useSpeed,
} from "./usePlayback";
import { useStore } from "zustand";
import { useInputMode } from "./InputContext";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useCameraTour } from "../state/cameraTourStore";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import {
  useDataSource,
  useGameEntityCountByRenderType,
} from "../state/gameEntityStore";
import { FaAngleDoubleDown, FaAngleDoubleUp } from "react-icons/fa";
import { PiMouseLeftClickFill, PiMouseScroll } from "react-icons/pi";
import { ReactNode, useEffect, useRef, useState } from "react";
import { GrPauseFill, GrPlayFill } from "react-icons/gr";
import { usePointerLocked } from "./usePointerLocked";
import styles from "./KeyboardOverlay.module.css";
import { useControls } from "./SettingsProvider";
import { MdSwipe } from "react-icons/md";

type InputState = Record<string, ActionState>;
type ActionSelector = (state: InputState) => boolean;

function actionPressed(state: InputState, name: string): boolean {
  const s = state[name];
  return s != null && "pressed" in s && (s as KeyState).pressed;
}

function Key({
  action,
  input,
  label,
  labelPosition = "hidden",
  labelSize = "fill",
  inputSize = "fill",
  size = "fill",
  disabled = false,
  debounce,
}: {
  action: string | ActionSelector;
  input: ReactNode;
  label: ReactNode;
  labelPosition?: "left" | "right" | "hidden";
  labelSize?: "auto" | "fill";
  inputSize?: "auto" | "fill";
  size?: "auto" | "fill";
  debounce?: number;
  disabled?: boolean;
}) {
  // Debounce state: when the raw value goes false within the debounce
  // window, the selector keeps returning true (no re-render). A timer
  // triggers one final re-render after the window expires.
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [held, setHeld] = useState(false);

  const baseSelector =
    typeof action === "function"
      ? action
      : (s: InputState) => actionPressed(s, action);

  const rawIsPressed = useInputControls(baseSelector);

  useEffect(() => {
    if (!debounce) return;
    if (rawIsPressed) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
      setHeld(true);
    } else {
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        setHeld(false);
      }, debounce);
      return () => clearTimeout(timerRef.current);
    }
  }, [rawIsPressed, debounce]);

  const isPressed = debounce ? held : rawIsPressed;

  return (
    <div
      className={styles.Key}
      data-pressed={isPressed}
      data-size={size}
      data-disabled={disabled}
    >
      {labelPosition === "left" ? (
        <span className={styles.Label} data-size={labelSize}>
          {label}
        </span>
      ) : null}
      {Array.isArray(input) ? (
        <div className={styles.MultiInput} data-size={inputSize}>
          {input.map((input, i) => (
            <span className={styles.Input} key={i}>
              {input}
            </span>
          ))}
        </div>
      ) : (
        <span className={styles.Input} data-size={inputSize}>
          {input}
        </span>
      )}
      {labelPosition === "right" ? (
        <span className={styles.Label} data-size={labelSize}>
          {label}
        </span>
      ) : null}
    </div>
  );
}

function PointerLockKey() {
  const isPointerLocked = usePointerLocked();
  // When pointer lock exits, briefly keep showing the "Unlock mouse" UI
  // so the Esc key appears highlighted (the browser consumes the keydown
  // so we can't detect it directly).
  const [justUnlocked, setJustUnlocked] = useState(false);
  const wasLockedRef = useRef(false);
  useEffect(() => {
    if (wasLockedRef.current && !isPointerLocked) {
      setJustUnlocked(true);
      const id = setTimeout(() => setJustUnlocked(false), 150);
      return () => clearTimeout(id);
    }
    wasLockedRef.current = isPointerLocked;
  }, [isPointerLocked]);

  const showLockedUI = isPointerLocked || justUnlocked;

  return (
    <Key
      action={showLockedUI ? () => justUnlocked : "canvasClick"}
      label={showLockedUI ? "Unlock mouse" : "Capture mouse"}
      input={
        showLockedUI ? (
          "Esc"
        ) : (
          <PiMouseLeftClickFill className={styles.MouseIcon} />
        )
      }
      labelPosition="right"
      inputSize="auto"
    />
  );
}

function MoveKeys() {
  return (
    <>
      <div className={styles.Column}>
        <div className={styles.Row}>
          <div className={styles.Spacer} />
          <Key action="moveForward" input="W" label="Forward" />
          <div className={styles.Spacer} />
        </div>
        <div className={styles.Row}>
          <Key action="moveLeft" input="A" label="Strafe left" />
          <Key action="moveBackward" input="S" label="Backward" />
          <Key action="moveRight" input="D" label="Strafe right" />
        </div>
      </div>
      <div className={styles.Column}>
        <div className={styles.Row}>
          <Key
            action="moveUp"
            input="E"
            label={<FaAngleDoubleUp />}
            labelPosition="left"
            labelSize="auto"
          />
        </div>
        <div className={styles.Row}>
          <Key
            action="moveDown"
            input="Q"
            label={<FaAngleDoubleDown />}
            labelPosition="left"
            labelSize="auto"
          />
        </div>
      </div>
    </>
  );
}

function FlySpeedKey() {
  const { speedMultiplier } = useControls();
  const [speedMultiplierChanged, setSpeedMultiplierChanged] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    setSpeedMultiplierChanged((value) => (value == null ? false : true));
    const timeoutId = setTimeout(() => {
      setSpeedMultiplierChanged(false);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [speedMultiplier]);

  return (
    <Key
      action={(s) =>
        ((s.adjustSpeed as ScrollState)?.deltaY ?? 0) !== 0 &&
        (speedMultiplierChanged ?? false)
      }
      debounce={50}
      label="Adjust speed"
      input={<PiMouseScroll className={styles.MouseIcon} />}
      labelPosition="right"
      inputSize="auto"
    />
  );
}

function RotateCameraKey() {
  return (
    <Key
      action={(s) => (s.dragLook as DragState | undefined)?.dragging ?? false}
      input={<MdSwipe className={styles.MouseIcon} />}
      label="Rotate camera"
      labelPosition="right"
      inputSize="auto"
    />
  );
}

function SelectCameraKey() {
  const dataSource = useDataSource();
  const isMapMode = dataSource === "map";
  const totalCameras = useGameEntityCountByRenderType("Camera");
  const cameraCount = isMapMode ? totalCameras : 0;

  return (
    <Key
      action={(s) =>
        Array.from({ length: cameraCount }, (_, i) =>
          actionPressed(s, `camera${i + 1}`),
        ).some((pressed) => pressed)
      }
      input={
        cameraCount === 1 ? "1" : <>1&thinsp;&ndash;&thinsp;{cameraCount}</>
      }
      label="Select camera"
      labelPosition="right"
    />
  );
}

function FreeFlyOverlay() {
  const isPointerLocked = usePointerLocked();
  const dataSource = useDataSource();
  const isMapMode = dataSource === "map";
  const totalCameras = useGameEntityCountByRenderType("Camera");
  const cameraCount = isMapMode ? totalCameras : 0;

  return (
    <>
      <MoveKeys />
      <div className={styles.Column} data-height="compact">
        <div className={styles.Row}>
          <FlySpeedKey />
        </div>
        <div className={styles.Row}>
          <PointerLockKey />
        </div>
      </div>
      <div className={styles.Column} data-height="compact">
        {!isPointerLocked ? (
          <div className={styles.Row}>
            <RotateCameraKey />
          </div>
        ) : null}
        {cameraCount > 0 && (
          <div className={styles.Row}>
            <SelectCameraKey />
          </div>
        )}
      </div>
    </>
  );
}

function CommandCircuitOverlay({
  followToggle,
  showObserverCycle,
}: {
  /** Current stream mode when the follow toggle applies (demo/live). */
  followToggle?: "follow" | "free";
  /** Live mode: show the observed-player cycling hint. */
  showObserverCycle?: boolean;
}) {
  return (
    <>
      <div className={styles.Column}>
        <div className={styles.Row}>
          <div className={styles.Spacer} />
          <Key action="commandPanUp" input="W" label="Pan up" />
          <div className={styles.Spacer} />
        </div>
        <div className={styles.Row}>
          <Key action="commandPanLeft" input="A" label="Pan left" />
          <Key action="commandPanDown" input="S" label="Pan down" />
          <Key action="commandPanRight" input="D" label="Pan right" />
        </div>
      </div>
      <div className={styles.Column} data-height="compact">
        <div className={styles.Row}>
          <Key
            action={(s) =>
              (s.commandPanDrag as DragState | undefined)?.dragging ?? false
            }
            input={<MdSwipe className={styles.MouseIcon} />}
            label="Pan"
            labelPosition="right"
            inputSize="auto"
          />
        </div>
        <div className={styles.Row}>
          <Key
            action={(s) => ((s.commandZoom as ScrollState)?.deltaY ?? 0) !== 0}
            debounce={50}
            input={<PiMouseScroll className={styles.MouseIcon} />}
            label="Zoom"
            labelPosition="right"
            inputSize="auto"
          />
        </div>
      </div>
      {followToggle && (
        <div className={styles.Column} data-height="compact">
          {showObserverCycle && (
            <div className={styles.Row}>
              <Key
                action="observeNextPlayer"
                label="Next player"
                input="→"
                labelPosition="right"
                inputSize="auto"
              />
            </div>
          )}
          <div className={styles.Row}>
            <Key
              action="toggleCommandFollow"
              label={followToggle === "follow" ? "Pan mode" : "Follow mode"}
              input="F"
              labelPosition="right"
              inputSize="auto"
            />
          </div>
        </div>
      )}
      <div className={styles.Column} data-height="compact">
        <div className={styles.Row}>
          <Key
            action="toggleCommandCircuit"
            label="Exit"
            input="C / Esc"
            labelPosition="right"
            inputSize="auto"
          />
        </div>
      </div>
    </>
  );
}

function DemoOverlay() {
  const isPlaying = useIsPlaying();
  const speed = useSpeed();

  const nextSpeedIndex = SPEED_OPTIONS.indexOf(speed) + 1;
  const prevSpeedIndex = SPEED_OPTIONS.indexOf(speed) - 1;
  const atMaxSpeed = nextSpeedIndex >= SPEED_OPTIONS.length;
  const atMinSpeed = prevSpeedIndex < 0;

  return (
    <>
      <div className={styles.Column}>
        <div className={styles.Row}>
          <Key
            action="decreasePlaybackSpeed"
            label="Slow down"
            input={["<", ","]}
            labelPosition="right"
            disabled={atMinSpeed}
          />
          <Key
            action="playPause"
            label={
              isPlaying ? (
                <GrPauseFill className={styles.PlayPauseIcon} />
              ) : (
                <GrPlayFill className={styles.PlayPauseIcon} />
              )
            }
            input="Space"
            labelPosition="left"
            size="auto"
          />
          <Key
            action="increasePlaybackSpeed"
            input={[">", "."]}
            label="Speed up"
            labelPosition="left"
            disabled={atMaxSpeed}
          />
        </div>
      </div>
      <div className={styles.Column}>
        <div className={styles.Row}>
          <PointerLockKey />
        </div>
      </div>
    </>
  );
}

function TourOverlay() {
  const isLastStop = useCameraTour(
    (s) =>
      s.animation != null &&
      s.animation.currentIndex >= s.animation.targets.length - 1,
  );
  return (
    <>
      <div className={styles.Column}>
        <div className={styles.Row}>
          {!isLastStop && (
            <Key
              action="nextStop"
              label="Skip to next stop"
              input={<PiMouseLeftClickFill className={styles.MouseIcon} />}
              labelPosition="right"
            />
          )}
          <Key
            action="exitTour"
            label="Exit tour"
            input="Esc"
            labelPosition="right"
          />
        </div>
      </div>
    </>
  );
}

function ObserverOverlay({
  mode,
}: {
  mode?: "fly" | "follow" | "firstPerson";
}) {
  const contextMode = useInputMode();
  // Watch mode's fly state reports inputMode "local" (client-side camera),
  // so the caller passes the effective observer mode explicitly.
  const inputMode = mode ?? contextMode;
  const following = inputMode === "follow" || inputMode === "firstPerson";
  const isPointerLocked = usePointerLocked();
  // The observer key cycles fly → follow → first person (watch mode);
  // the label names the NEXT mode. Live observers only toggle fly↔follow.
  const nextModeLabel =
    inputMode === "fly"
      ? "Follow mode"
      : inputMode === "firstPerson"
        ? "Fly mode"
        : mode != null
          ? "First-person mode"
          : "Fly mode";
  return (
    <>
      {inputMode === "fly" ? <MoveKeys /> : null}
      <div className={styles.Column} data-height="compact">
        {inputMode === "fly" ? (
          <div className={styles.Row}>
            <FlySpeedKey />
          </div>
        ) : null}
        <div className={styles.Row}>
          <PointerLockKey />
        </div>
      </div>
      <div className={styles.Column} data-height="compact">
        {!isPointerLocked ? (
          <div className={styles.Row}>
            <RotateCameraKey />
          </div>
        ) : null}
        {following && isPointerLocked ? (
          <div className={styles.Row}>
            <Key
              action="nextPlayer"
              label="Next player"
              input={<PiMouseLeftClickFill className={styles.MouseIcon} />}
              labelPosition="right"
              inputSize="auto"
            />
          </div>
        ) : null}
        <div className={styles.Row}>
          <Key
            action="toggleObserverMode"
            label={nextModeLabel}
            input="F"
            labelPosition="right"
            inputSize="auto"
          />
        </div>
      </div>
    </>
  );
}

export function KeyboardOverlay() {
  const recording = useRecording();
  const inputMode = useInputMode();

  const isTourActive = useCameraTour((s) => s.animation !== null);
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  const demoFollow = useCommandCircuit((s) => s.follow);
  // Watch mode: client-only free-fly, no server-observer controls.
  const isWatcher = useLiveSelector((s) => s.role === "watcher");

  const isDemo = recording?.source === "demo";
  const isLive = recording?.source === "live";
  const isMap = !recording;

  // Live and demo follow state come from different owners: live mirrors
  // the server-owned observer mode (shared with the 3D view), demos use
  // the local command circuit flag.
  const ccFollow = isLive ? inputMode === "follow" : demoFollow;

  // Watch mode always uses the observer overlay — its client-side camera
  // modes mirror the real observer's (plus first person), but fly state
  // reports inputMode "local", so pass the effective mode explicitly.
  const watchCameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const watcherObserverMode = isWatcher
    ? watchCameraMode === "firstPersonOverride"
      ? ("firstPerson" as const)
      : inputMode === "follow"
        ? ("follow" as const)
        : ("fly" as const)
    : undefined;
  const isLiveObserver =
    isLive && (isWatcher || inputMode === "fly" || inputMode === "follow");

  const showFreeFly = isMap && !isTourActive && !isCommandCircuit;

  return (
    <div className={styles.Root}>
      {showFreeFly && <FreeFlyOverlay />}
      {isCommandCircuit && !isTourActive && (
        <CommandCircuitOverlay
          followToggle={
            isDemo || isLive ? (ccFollow ? "follow" : "free") : undefined
          }
          showObserverCycle={isLive && ccFollow}
        />
      )}
      {isLiveObserver && !isCommandCircuit && (
        <ObserverOverlay mode={watcherObserverMode} />
      )}
      {isDemo && !isCommandCircuit && <DemoOverlay />}
      {isTourActive && <TourOverlay />}
    </div>
  );
}

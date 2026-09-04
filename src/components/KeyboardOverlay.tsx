import {
  ScrollState,
  useInputControls,
  type ActionState,
  type DragState,
  type KeyState,
} from "./InputControls";
import { useRecording } from "./usePlayback";
import { useStore } from "zustand";
import { useInputMode } from "./InputContext";
import {
  MAX_ORBIT_DISTANCE,
  MIN_ORBIT_DISTANCE,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { useCameraTour } from "../state/cameraTourStore";
import { useDirector } from "../state/demoDirectorStore";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import {
  useDataSource,
  useGameEntityCountByRenderType,
} from "../state/gameEntityStore";
import { FaAngleDoubleDown, FaAngleDoubleUp } from "react-icons/fa";
import {
  PiMouseLeftClickFill,
  PiMouseRightClickFill,
  PiMouseScroll,
} from "react-icons/pi";
import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { usePointerLocked } from "./usePointerLocked";
import { countFollowableFlags, isFollowingPlayer } from "../state/watchFollow";
import styles from "./KeyboardOverlay.module.css";
import {
  MAX_SPEED_MULTIPLIER,
  MIN_SPEED_MULTIPLIER,
  useControls,
} from "./SettingsProvider";
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
  actionAfter,
  inputAfter,
  label,
  labelPosition = "hidden",
  labelSize = "fill",
  inputSize = "fill",
  size = "fill",
  disabled = false,
  debounce,
  level,
}: {
  action: string | ActionSelector;
  input: ReactNode;
  /** Second action + input on the far side of a right-positioned label,
   *  making a 3-panel chip (e.g. "[←] Cycle player [→]"). Either action
   *  highlights the chip; each input panel only highlights for its own. */
  actionAfter?: string | ActionSelector;
  inputAfter?: ReactNode;
  label: ReactNode;
  labelPosition?: "left" | "right" | "hidden";
  labelSize?: "auto" | "fill";
  inputSize?: "auto" | "fill";
  size?: "auto" | "fill";
  debounce?: number;
  disabled?: boolean;
  /** Where an adjustable value sits in its range, 0 (bottom) to 1 (top),
   *  shown as a dot riding the divider before a right-positioned label. */
  level?: number;
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
  const afterSelector =
    typeof actionAfter === "function"
      ? actionAfter
      : actionAfter != null
        ? (s: InputState) => actionPressed(s, actionAfter)
        : () => false;
  const afterPressed = useInputControls(afterSelector);

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
  // In a 3-panel chip, each input panel only highlights for its own action.
  const perInput = inputAfter != null;

  return (
    <div
      className={styles.Key}
      data-pressed={isPressed || afterPressed}
      data-per-input={perInput}
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
        <span
          className={styles.Input}
          data-size={inputSize}
          data-pressed={perInput ? isPressed : undefined}
        >
          {input}
        </span>
      )}
      {labelPosition === "right" ? (
        <span
          className={styles.Label}
          data-size={labelSize}
          data-flanked={inputAfter != null}
        >
          {level != null ? (
            <span
              className={styles.LevelDot}
              style={
                {
                  "--level": Math.max(0, Math.min(1, level)),
                } as CSSProperties
              }
            />
          ) : null}
          {label}
        </span>
      ) : null}
      {inputAfter != null ? (
        <span
          className={styles.Input}
          data-size={inputSize}
          data-pressed={afterPressed}
        >
          {inputAfter}
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
      level={
        (speedMultiplier - MIN_SPEED_MULTIPLIER) /
        (MAX_SPEED_MULTIPLIER - MIN_SPEED_MULTIPLIER)
      }
    />
  );
}

function OrbitZoomKey() {
  // Same wheel as fly speed, but in follow mode it zooms orbit distance.
  const distance = useStore(
    streamPlaybackStore,
    (s) => s.orbitOverrideDistance,
  );
  // The wheel scales distance multiplicatively, so place the dot on a log
  // scale; fully zoomed in (min distance) is the top.
  const zoomLevel =
    1 -
    (Math.log(distance) - Math.log(MIN_ORBIT_DISTANCE)) /
      (Math.log(MAX_ORBIT_DISTANCE) - Math.log(MIN_ORBIT_DISTANCE));
  return (
    <Key
      action={(s) => ((s.adjustSpeed as ScrollState)?.deltaY ?? 0) !== 0}
      debounce={50}
      label="Zoom"
      input={<PiMouseScroll className={styles.MouseIcon} />}
      labelPosition="right"
      inputSize="auto"
      level={zoomLevel}
    />
  );
}

function RotateCameraRow() {
  return (
    <div className={styles.Row}>
      <Key
        action={(s) => (s.dragLook as DragState | undefined)?.dragging ?? false}
        input={<MdSwipe className={styles.MouseIcon} />}
        label="Rotate camera"
        labelPosition="right"
        inputSize="auto"
      />
    </div>
  );
}

/** Pointer-locked player cycling: right click = previous, left = next. */
function CyclePlayerRow() {
  return (
    <div className={styles.Row}>
      <Key
        action="prevPlayer"
        input={<PiMouseRightClickFill className={styles.MouseIcon} />}
        actionAfter="nextPlayer"
        inputAfter={<PiMouseLeftClickFill className={styles.MouseIcon} />}
        label="Cycle player"
        labelPosition="right"
        inputSize="auto"
      />
    </div>
  );
}

/**
 * Follow-flag hint row, shaped by how many flags are in scope: a single
 * key, a 3-panel pair (like player cycling), or a 1–n range like map
 * mode's camera select. Flags stand in for the mission's observer camera
 * spots (never sent over the wire) — see FLAG_FOLLOW_INPUT. Flag
 * entities mutate in place without re-renders, so the count is polled.
 * Fills the "Cycle player" slot in its column — callers only render it
 * when that (and other higher-priority hints) are hidden, keeping
 * columns at most two rows tall; `fallback` renders instead when no
 * flags are in scope. The keys work regardless of what's shown.
 */
function FollowFlagKey({ fallback = null }: { fallback?: ReactNode }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(Math.min(countFollowableFlags(), 9));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  if (count === 0) return fallback;
  return (
    <div className={styles.Row}>
      {count === 2 ? (
        <Key
          action="followFlag1"
          input="1"
          actionAfter="followFlag2"
          inputAfter="2"
          label="Follow flag"
          labelPosition="right"
          inputSize="auto"
        />
      ) : (
        <Key
          action={(s) =>
            Array.from({ length: count }, (_, i) =>
              actionPressed(s, `followFlag${i + 1}`),
            ).some(Boolean)
          }
          input={count === 1 ? "1" : <>1&thinsp;&ndash;&thinsp;{count}</>}
          label="Follow flag"
          labelPosition="right"
          inputSize="auto"
        />
      )}
    </div>
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
        {!isPointerLocked ? <RotateCameraRow /> : null}
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
  showFlagFollow,
}: {
  /** Current stream mode when the follow toggle applies (demo/live). */
  followToggle?: "follow" | "free";
  /** Live mode: show the observed-player cycling hint. */
  showObserverCycle?: boolean;
  /** Number-key flag follow available (demo / watch spectate). */
  showFlagFollow?: boolean;
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
          {/* The cycle slot: player cycling while following, else the
              follow-flag hint (columns stay ≤2 rows). */}
          {showObserverCycle ? (
            <div className={styles.Row}>
              <Key
                action="observePrevPlayer"
                input="←"
                actionAfter="observeNextPlayer"
                inputAfter="→"
                label="Cycle player"
                labelPosition="right"
                inputSize="auto"
              />
            </div>
          ) : showFlagFollow ? (
            <FollowFlagKey />
          ) : null}
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

/**
 * Demo-playback camera controls. F cycles original → free-fly → follow →
 * first-person → original; each mode shows only the inputs it uses. (The
 * behavior lives in DemoCameraController — this only visualizes it.)
 */
function DemoCameraOverlay() {
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);
  const followFlagSlot = useStore(streamPlaybackStore, (s) => s.followFlagSlot);
  const isPointerLocked = usePointerLocked();
  const isFly = cameraMode === "freeFly";
  const isFollow = cameraMode === "orbitOverride";
  const following = isFollow || cameraMode === "firstPersonOverride";
  // Label names the mode F switches TO (same copy as ObserverOverlay).
  // Flag follow is a "secret" cycle slot between original and free-fly
  // (number keys only) — from it, F resumes the cycle at free-fly.
  const playerFollow =
    followEntityId != null && followFlagSlot == null && isFollowingPlayer();
  const nextModeLabel =
    cameraMode === "original"
      ? "Free-fly mode"
      : cameraMode === "freeFly"
        ? "Follow mode"
        : cameraMode === "orbitOverride"
          ? playerFollow
            ? "First-person mode"
            : "Free-fly mode"
          : "Original view";
  return (
    <>
      {isFly ? <MoveKeys /> : null}
      {cameraMode !== "original" ? (
        <div className={styles.Column} data-height="compact">
          {isFly ? (
            <div className={styles.Row}>
              <FlySpeedKey />
            </div>
          ) : null}
          {isFollow ? (
            <div className={styles.Row}>
              <OrbitZoomKey />
            </div>
          ) : null}
          <div className={styles.Row}>
            <PointerLockKey />
          </div>
        </div>
      ) : null}
      <div className={styles.Column} data-height="compact">
        {/* One prioritized slot above the F key (columns stay ≤2 rows):
            player cycling while locked on a player; rotate during an
            unlocked player follow; otherwise the follow-flag hint, with
            rotate as its no-flags fallback. */}
        {following && isPointerLocked && followFlagSlot == null ? (
          <CyclePlayerRow />
        ) : following && followFlagSlot == null && !isPointerLocked ? (
          <RotateCameraRow />
        ) : (
          <FollowFlagKey
            fallback={
              (isFly || isFollow) && !isPointerLocked ? (
                <RotateCameraRow />
              ) : null
            }
          />
        )}
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

function DirectorOverlay() {
  return (
    <div className={styles.Column} data-height="compact">
      <div className={styles.Row}>
        <Key
          action="playPause"
          label="Pause"
          input="Space"
          labelPosition="right"
          inputSize="auto"
        />
      </div>
      <div className={styles.Row}>
        <Key
          action="directorInterrupt"
          label="Take control"
          input="F / Esc"
          labelPosition="right"
          inputSize="auto"
        />
      </div>
    </div>
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
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);
  const followFlagSlot = useStore(streamPlaybackStore, (s) => s.followFlagSlot);
  // The observer key cycles fly → follow → first person (watch mode);
  // the label names the NEXT mode. Live observers only toggle fly↔follow.
  // Flag follow is a "secret" cycle slot (number keys only) — from it, F
  // goes back to free-fly, never first person.
  const playerFollow =
    followEntityId != null && followFlagSlot == null && isFollowingPlayer();
  const nextModeLabel =
    inputMode === "fly"
      ? "Follow mode"
      : inputMode === "firstPerson"
        ? "Free-fly mode"
        : mode != null && playerFollow
          ? "First-person mode"
          : "Free-fly mode";
  return (
    <>
      {inputMode === "fly" ? <MoveKeys /> : null}
      <div className={styles.Column} data-height="compact">
        {inputMode === "fly" ? (
          <div className={styles.Row}>
            <FlySpeedKey />
          </div>
        ) : null}
        {inputMode === "follow" ? (
          <div className={styles.Row}>
            <OrbitZoomKey />
          </div>
        ) : null}
        <div className={styles.Row}>
          <PointerLockKey />
        </div>
      </div>
      <div className={styles.Column} data-height="compact">
        {/* One prioritized slot above the F key (columns stay ≤2 rows):
            player cycling while locked on a player; rotate during an
            unlocked player follow; otherwise the follow-flag hint —
            watch spectate only (the sensor-group gate rejects
            AttachCommanderCamera for real observers, so they don't get
            the binding) — with rotate as the no-flags fallback. */}
        {following && isPointerLocked && followFlagSlot == null ? (
          <CyclePlayerRow />
        ) : following && followFlagSlot == null && !isPointerLocked ? (
          <RotateCameraRow />
        ) : mode != null ? (
          <FollowFlagKey
            fallback={!isPointerLocked ? <RotateCameraRow /> : null}
          />
        ) : !isPointerLocked ? (
          <RotateCameraRow />
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
  const isDirecting = useDirector((s) => s.status === "playing");
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  // Watch mode: client-only free-fly, no server-observer controls.
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);

  const isDemo = recording?.source === "demo";
  const isLive = recording?.source === "live";
  const isMap = !recording;

  // Follow state: live mirrors the server-owned observer mode; demo and
  // watch share the 3D camera mode (anything but free-fly is following).
  const ccFollow = isLive
    ? inputMode === "follow"
    : cameraMode === "orbitOverride" || cameraMode === "firstPersonOverride";

  // Watch mode always uses the observer overlay — its client-side camera
  // modes mirror the real observer's (plus first person), but fly state
  // reports inputMode "local", so pass the effective mode explicitly.
  const watcherObserverMode = isWatcher
    ? cameraMode === "firstPersonOverride"
      ? ("firstPerson" as const)
      : inputMode === "follow"
        ? ("follow" as const)
        : ("fly" as const)
    : undefined;
  const isLiveObserver =
    isLive && (isWatcher || inputMode === "fly" || inputMode === "follow");

  const showFreeFly = isMap && !isCommandCircuit;

  // An active tour owns all input — only its overlay shows, matching
  // ActiveInputBindings (only TOUR_MODE_INPUT is mounted).
  if (isTourActive) {
    return (
      <div className={styles.Root}>
        <TourOverlay />
      </div>
    );
  }

  // The auto-director owns all input likewise — F or Escape is the one
  // interrupt (matching ActiveInputBindings' DIRECTOR_MODE_INPUT branch).
  if (isDirecting) {
    return (
      <div className={styles.Root}>
        <DirectorOverlay />
      </div>
    );
  }

  return (
    <div className={styles.Root}>
      {showFreeFly && <FreeFlyOverlay />}
      {isCommandCircuit && (
        <CommandCircuitOverlay
          followToggle={
            isDemo || isLive ? (ccFollow ? "follow" : "free") : undefined
          }
          showObserverCycle={(isLive || isDemo) && ccFollow}
          showFlagFollow={isDemo || (isLive && isWatcher)}
        />
      )}
      {isLiveObserver && !isCommandCircuit && (
        <ObserverOverlay mode={watcherObserverMode} />
      )}
      {isDemo && !isCommandCircuit && <DemoCameraOverlay />}
    </div>
  );
}

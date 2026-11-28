import { parseBinding, type InputBinding } from "../state/inputControls";
import { usesOrbitInput, type InputMode } from "../state/inputModeStore";
import type { DemoCameraMode } from "../state/streamPlaybackStore";
import {
  CAMERA_ZOOM_INPUT,
  CLIP_RECORD_INPUT,
  COMMAND_CIRCUIT_EXIT_INPUT,
  COMMAND_CIRCUIT_INPUT,
  COMMAND_CIRCUIT_STREAM_INPUT,
  COMMAND_CIRCUIT_TOGGLE_INPUT,
  DEMO_MODE_INPUT,
  FOLLOW_KEYBOARD_INPUT,
  FREE_FLY_INPUT,
  LIVE_FOLLOW_INPUT,
  LIVE_OBSERVER_INPUT,
  MAP_MODE_INPUT,
  MOVABLE_CAMERA_INPUT,
  PLAYER_ORBIT_INPUT,
  POINTER_LOCKABLE_INPUT,
  PROJECTILE_FOLLOW_INPUT,
  QUICK_CAM_INPUT,
  REVERSE_OBSERVER_INPUT,
  SCORE_SCREEN_INPUT,
  TARGET_FINDER_INPUT,
  TOUR_MODE_INPUT,
} from "./inputMap";
import type { AppMode } from "./useQueryParams";

export interface ShortcutHelpAvailability {
  actions: ReadonlySet<string>;
  cameraMode: DemoCameraMode;
  inputMode: InputMode;
  pointerLocked: boolean;
  mouseLockBlocked?: boolean;
  observerCameraReady?: boolean;
  localSpectator?: boolean;
  orbitLocked?: boolean;
  hasFollowTarget?: boolean;
  quickCamRecallAvailable?: boolean;
  quickCamSaveAvailable?: boolean;
  canPlayDemo?: boolean;
  canSeekDemo?: boolean;
  canDecreaseDemoSpeed?: boolean;
  canIncreaseDemoSpeed?: boolean;
  canPlayReplay?: boolean;
  canChat?: boolean;
  picker?: "map" | "demo";
  isMac?: boolean;
}

export interface ShortcutHelpKey {
  parts: string[];
  active: boolean;
}

export interface ShortcutHelpRow {
  label: string;
  keys: ShortcutHelpKey[];
}

export interface ShortcutHelpGroup {
  title: string;
  rows: ShortcutHelpRow[];
}

const keyLabels: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Period: ".",
  Escape: "Esc",
};

const inputEntries = [
  ...FREE_FLY_INPUT,
  ...MOVABLE_CAMERA_INPUT,
  ...CAMERA_ZOOM_INPUT,
  ...POINTER_LOCKABLE_INPUT,
  ...DEMO_MODE_INPUT,
  ...CLIP_RECORD_INPUT,
  ...LIVE_OBSERVER_INPUT,
  ...REVERSE_OBSERVER_INPUT,
  ...PLAYER_ORBIT_INPUT,
  ...FOLLOW_KEYBOARD_INPUT,
  ...LIVE_FOLLOW_INPUT,
  ...TARGET_FINDER_INPUT,
  ...PROJECTILE_FOLLOW_INPUT,
  ...SCORE_SCREEN_INPUT,
  ...TOUR_MODE_INPUT,
  ...COMMAND_CIRCUIT_TOGGLE_INPUT,
  ...COMMAND_CIRCUIT_EXIT_INPUT,
  ...COMMAND_CIRCUIT_INPUT,
  ...COMMAND_CIRCUIT_STREAM_INPUT,
];

type ShortcutAction = (typeof inputEntries)[number]["name"];

type ShortcutBinding = {
  parts: string[];
  whenPointerLocked?: boolean;
};

const clickLabels = ["Left click", "Middle click", "Right click"];

function describeBinding(binding: InputBinding): ShortcutBinding[] {
  switch (binding.type) {
    case "key": {
      const label =
        keyLabels[binding.code] ?? binding.code.replace(/^(Key|Digit)/, "");
      return [{ parts: [...(binding.modifiers ?? []), label] }];
    }
    case "click": {
      const button = binding.button ?? 0;
      return [
        {
          parts: [
            ...(binding.modifiers ?? []),
            clickLabels[button] ?? `Mouse button ${button + 1}`,
          ],
          whenPointerLocked: binding.whenPointerLocked,
        },
      ];
    }
    case "drag":
      return [{ parts: ["Drag"], whenPointerLocked: false }];
    case "scroll":
      return [{ parts: ["Scroll"] }];
    default:
      return [];
  }
}

const actionBindings = new Map<ShortcutAction, ShortcutBinding[]>(
  inputEntries.map(({ name, keys }) => [
    name,
    keys.flatMap((shorthand) => describeBinding(parseBinding(shorthand))),
  ]),
);

/** List all shortcuts for the route, preserving keys that are unavailable now. */
export function buildShortcutHelp(
  mode: AppMode,
  availability: ShortcutHelpAvailability,
): ShortcutHelpGroup[] {
  const {
    actions,
    cameraMode,
    inputMode,
    pointerLocked,
    mouseLockBlocked,
    observerCameraReady,
    localSpectator,
    orbitLocked,
    hasFollowTarget,
    quickCamRecallAvailable,
    quickCamSaveAvailable,
    canPlayDemo,
    canSeekDemo,
    canDecreaseDemoSpeed,
    canIncreaseDemoSpeed,
    canPlayReplay,
    canChat,
    picker,
    isMac,
  } = availability;
  const map = mode === "map";
  const demo = mode === "demo";
  const live = mode === "live";
  const replay = mode === "replay";
  const localCamera = demo || replay || !!localSpectator;
  const cameraReady = map || demo || !!observerCameraReady;
  const freeFly =
    map || (localCamera ? cameraMode === "freeFly" : inputMode === "fly");
  const orbit = localCamera
    ? cameraMode === "orbitOverride"
    : inputMode === "follow";
  const canLook = (freeFly || (orbit && !orbitLocked)) && cameraReady;
  const wheelZoom = usesOrbitInput(cameraMode, inputMode);

  const actionKey = (
    action: ShortcutAction,
    enabled = true,
  ): ShortcutHelpKey[] =>
    (actionBindings.get(action) ?? []).map(({ parts, whenPointerLocked }) => ({
      parts,
      active:
        enabled &&
        actions.has(action) &&
        (whenPointerLocked === undefined ||
          whenPointerLocked === pointerLocked),
    }));
  const shortcut = (
    label: string,
    shortcutActions: ShortcutAction | ShortcutAction[],
    enabled = true,
  ): ShortcutHelpRow => ({
    label,
    keys: (Array.isArray(shortcutActions)
      ? shortcutActions
      : [shortcutActions]
    ).flatMap((action) => actionKey(action, enabled)),
  });
  const standalone = (
    label: string,
    parts: string[],
    active = true,
  ): ShortcutHelpRow => ({ label, keys: [{ parts, active }] });
  const group = (
    title: string,
    rows: ShortcutHelpRow[],
  ): ShortcutHelpGroup => ({ title, rows });
  const platformModifier = isMac ? "⌘" : "Ctrl";

  const navigation = [
    standalone("Show shortcuts", ["?"]),
    standalone("Toggle sidebar", [platformModifier, "\\"]),
  ];
  if (demo)
    navigation.push(
      standalone("Choose a demo", [platformModifier, "K"], picker === "demo"),
    );
  if (map || picker === "map")
    navigation.push(
      standalone("Choose a map", [platformModifier, "K"], picker === "map"),
    );

  const result = [
    group("Navigation", navigation),
    group("Camera movement", [
      shortcut(
        "Move forward / back",
        ["moveForward", "moveBackward"],
        freeFly && cameraReady,
      ),
      shortcut(
        "Move left / right",
        ["moveLeft", "moveRight"],
        freeFly && cameraReady,
      ),
      shortcut(
        "Move up / down",
        ["moveUp", "moveDown"],
        freeFly && cameraReady,
      ),
      shortcut(
        "Look around",
        ["lookUp", "lookDown", "lookLeft", "lookRight"],
        canLook,
      ),
      shortcut("Look with mouse", "dragLook", canLook),
      {
        label: "Zoom (hold)",
        keys: actionKey("zoomCamera").slice(0, 1),
      },
      shortcut("Cycle zoom level", "cycleCameraZoom"),
      shortcut("Adjust fly speed", "adjustSpeed", !wheelZoom && cameraReady),
      ...(map
        ? []
        : [
            shortcut(
              "Zoom follow camera",
              "adjustSpeed",
              wheelZoom && cameraReady,
            ),
          ]),
      shortcut("Lock mouse", "canvasClick", cameraReady && !mouseLockBlocked),
      standalone("Release mouse", ["Esc"], pointerLocked),
    ]),
  ];

  if (map) {
    result.push(
      group("Map cameras", [
        standalone(
          "Select a map camera",
          ["1–9"],
          actions.has(MAP_MODE_INPUT[0].name),
        ),
        shortcut("Advance map tour", "nextStop"),
        shortcut("Exit map tour", "exitTour"),
      ]),
    );
  } else {
    const playerCycling = cameraReady && (!localCamera || !!hasFollowTarget);
    const tabAvailable =
      cameraReady &&
      localCamera &&
      pointerLocked &&
      (cameraMode === "firstPersonOverride" ||
        (cameraMode === "orbitOverride" && hasFollowTarget === true));
    result.push(
      group("Camera views", [
        shortcut("Next camera mode", "toggleObserverMode", cameraReady),
        shortcut(
          "Previous camera mode",
          "toggleObserverModeBackward",
          cameraReady,
        ),
        shortcut(
          "Toggle first/third-person",
          "toggleFollowFirstPerson",
          tabAvailable,
        ),
        shortcut("Next player", ["nextPlayerKey", "nextPlayer"], playerCycling),
        shortcut(
          "Previous player",
          ["prevPlayerKey", "prevPlayer"],
          playerCycling,
        ),
        shortcut("Keep camera behind player", "toggleFollowBehindPlayer"),
        shortcut("Find a player or flag", "findTarget", cameraReady),
        shortcut("Follow projectile", "followProjectile", cameraReady),
      ]),
    );
  }

  const scoreScreen = shortcut("Toggle score screen", "toggleScoreScreen");
  if (demo) {
    const playbackKey = actionBindings.get("playPause")?.[0].parts ?? [];
    result.push(
      group("Demo playback", [
        standalone("Play / pause", playbackKey, canPlayDemo === true),
        shortcut(
          "Seek back / forward 5s",
          ["seekBackward", "seekForward"],
          canSeekDemo === true,
        ),
        shortcut(
          "Seek back / forward 30s",
          ["seekBackwardLarge", "seekForwardLarge"],
          canSeekDemo === true,
        ),
        shortcut(
          "Decrease playback speed",
          "decreasePlaybackSpeed",
          canDecreaseDemoSpeed === true,
        ),
        shortcut(
          "Increase playback speed",
          "increasePlaybackSpeed",
          canIncreaseDemoSpeed === true,
        ),
        shortcut("Record clip / stop recording", "recordClip"),
        scoreScreen,
      ]),
    );
  } else if (live) {
    result.push(
      group("Live", [
        standalone("Focus chat", ["Y"], canChat === true),
        scoreScreen,
      ]),
    );
  } else if (replay) {
    result.push(
      group("Shared replay", [
        standalone("Play / pause", ["Space"], canPlayReplay === true),
        scoreScreen,
      ]),
    );
  }

  if (!map) {
    const [recall, save] = QUICK_CAM_INPUT;
    result.push(
      group("Quick cams", [
        standalone(
          "Recall a quick cam",
          ["0–9"],
          quickCamRecallAvailable === true && actions.has(recall.name),
        ),
        standalone(
          "Save a quick cam",
          ["Shift", "0–9"],
          quickCamSaveAvailable === true && actions.has(save.name),
        ),
      ]),
    );
  }

  result.push(
    group("Command circuit", [
      shortcut("Toggle command circuit", "toggleCommandCircuit"),
      shortcut("Close command circuit", "exitCommandCircuit"),
      shortcut("Pan up / down", ["commandPanUp", "commandPanDown"]),
      shortcut("Pan left / right", ["commandPanLeft", "commandPanRight"]),
      shortcut("Pan map", "commandPanDrag"),
      shortcut("Zoom map", "commandZoom"),
      ...(map
        ? []
        : [
            shortcut("Toggle player follow", "toggleCommandFollow"),
            shortcut("Next player", "observeNextPlayer"),
            shortcut("Previous player", "observePrevPlayer"),
          ]),
    ]),
  );

  return result;
}

import type { InputMapEntry } from "./InputControls";

/** WASD movement + speed adjust. Active in free-fly modes only. */
export const FREE_FLY_INPUT = [
  { name: "moveForward", keys: ["KeyW"] },
  { name: "moveBackward", keys: ["KeyS"] },
  { name: "moveLeft", keys: ["KeyA"] },
  { name: "moveRight", keys: ["KeyD"] },
  { name: "moveUp", keys: ["KeyE"] },
  { name: "moveDown", keys: ["KeyQ"] },
  { name: "adjustSpeed", keys: [{ type: "scroll" }] },
] as const satisfies readonly InputMapEntry[];

/** Arrow keys, drag, touch, and pointer-locked look. Active in any mode
 *  with camera control (free-fly, orbit/follow, etc.) — NOT during tours. */
export const MOVABLE_CAMERA_INPUT = [
  { name: "lookUp", keys: ["ArrowUp"] },
  { name: "lookDown", keys: ["ArrowDown"] },
  { name: "lookLeft", keys: ["ArrowLeft"] },
  { name: "lookRight", keys: ["ArrowRight"] },
  { name: "dragLook", keys: [{ type: "drag", button: 0 }] },
  { name: "lockedLook", keys: [{ type: "pointerLockMove" }] },
  { name: "touchLook", keys: [{ type: "touch" }] },
] as const satisfies readonly InputMapEntry[];

export const POINTER_LOCKABLE_INPUT = [
  {
    name: "canvasClick",
    keys: [{ type: "click", button: 0, whenPointerLocked: false }],
  },
] as const satisfies readonly InputMapEntry[];

export const MAP_MODE_INPUT = [
  { name: "camera1", keys: ["Digit1"] },
  { name: "camera2", keys: ["Digit2"] },
  { name: "camera3", keys: ["Digit3"] },
  { name: "camera4", keys: ["Digit4"] },
  { name: "camera5", keys: ["Digit5"] },
  { name: "camera6", keys: ["Digit6"] },
  { name: "camera7", keys: ["Digit7"] },
  { name: "camera8", keys: ["Digit8"] },
  { name: "camera9", keys: ["Digit9"] },
] as const satisfies readonly InputMapEntry[];

export const DEMO_MODE_INPUT = [
  { name: "playPause", keys: ["Space"] },
  { name: "decreasePlaybackSpeed", keys: ["Comma", "Shift-Comma"] },
  { name: "increasePlaybackSpeed", keys: ["Period", "Shift-Period"] },
] as const satisfies readonly InputMapEntry[];

export const LIVE_OBSERVER_INPUT = [
  { name: "toggleObserverMode", keys: ["KeyF"] },
] as const satisfies readonly InputMapEntry[];

/**
 * Flag follow while streaming (demo playback or watch spectate): the
 * number keys orbit the flags (1 = Storm, 2 = Inferno; higher digits for
 * games with more flags). The mission's observer camera spots aren't in
 * the stream (the server never sends them), so the camera-select keys
 * get flags instead.
 */
export const FLAG_FOLLOW_INPUT = [
  { name: "followFlag1", keys: ["Digit1"] },
  { name: "followFlag2", keys: ["Digit2"] },
  { name: "followFlag3", keys: ["Digit3"] },
  { name: "followFlag4", keys: ["Digit4"] },
  { name: "followFlag5", keys: ["Digit5"] },
  { name: "followFlag6", keys: ["Digit6"] },
  { name: "followFlag7", keys: ["Digit7"] },
  { name: "followFlag8", keys: ["Digit8"] },
  { name: "followFlag9", keys: ["Digit9"] },
] as const satisfies readonly InputMapEntry[];

export const LIVE_FOLLOW_INPUT = [
  {
    name: "nextPlayer",
    keys: [{ type: "click", button: 0, whenPointerLocked: true }],
  },
  {
    name: "prevPlayer",
    keys: [{ type: "click", button: 2, whenPointerLocked: true }],
  },
] as const satisfies readonly InputMapEntry[];

export const TOUR_MODE_INPUT = [
  { name: "nextStop", keys: [{ type: "click", button: 0 }] },
  { name: "exitTour", keys: ["Escape"] },
] as const satisfies readonly InputMapEntry[];

/**
 * Auto-director lean-back mode: every camera-ish gesture maps to one
 * interrupt that hands control back (transport stays in DEMO_MODE_INPUT).
 * Drag and touch bindings can't fire one-shot actions, so those two are
 * separate state-only actions the DirectorController polls per frame.
 */
export const DIRECTOR_MODE_INPUT = [
  {
    name: "directorInterrupt",
    keys: [
      "KeyF",
      "Escape",
      "KeyC",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyQ",
      "KeyE",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Digit1",
      "Digit2",
      "Digit3",
      "Digit4",
      "Digit5",
      "Digit6",
      "Digit7",
      "Digit8",
      "Digit9",
    ],
  },
  {
    name: "directorInterruptClick",
    keys: [
      { type: "click", button: 0 },
      { type: "click", button: 2 },
    ],
  },
  { name: "directorInterruptDrag", keys: [{ type: "drag", button: 0 }] },
  { name: "directorInterruptTouch", keys: [{ type: "touch" }] },
] as const satisfies readonly InputMapEntry[];

/**
 * Active whenever command circuit mode is available or active, so the same
 * key toggles in both directions.
 */
export const COMMAND_CIRCUIT_TOGGLE_INPUT = [
  { name: "toggleCommandCircuit", keys: ["KeyC"] },
] as const satisfies readonly InputMapEntry[];

/**
 * Command circuit controls while streaming (demo playback or live): the
 * follow ↔ free-fly toggle (F — Space is play/pause in demos, and the
 * observer's own F toggle is unmounted while the CC is open) and the
 * next/prev player cycle (ArrowRight/ArrowLeft, like the non-CC
 * observer's left/right click).
 */
export const COMMAND_CIRCUIT_STREAM_INPUT = [
  { name: "toggleCommandFollow", keys: ["KeyF"] },
  { name: "observeNextPlayer", keys: ["ArrowRight"] },
  { name: "observePrevPlayer", keys: ["ArrowLeft"] },
] as const satisfies readonly InputMapEntry[];

/**
 * Pan/zoom controls while command circuit mode is active.
 */
export const COMMAND_CIRCUIT_INPUT = [
  { name: "commandPanUp", keys: ["KeyW"] },
  { name: "commandPanDown", keys: ["KeyS"] },
  { name: "commandPanLeft", keys: ["KeyA"] },
  { name: "commandPanRight", keys: ["KeyD"] },
  { name: "commandPanDrag", keys: [{ type: "drag", button: 0 }] },
  { name: "commandPanTouch", keys: [{ type: "touch" }] },
  { name: "commandZoom", keys: [{ type: "scroll" }] },
  { name: "commandPinchZoom", keys: [{ type: "pinch" }] },
] as const satisfies readonly InputMapEntry[];

/**
 * Escape closes the command circuit — separate from the pan/zoom map
 * because during a tour Escape belongs to the tour (exitTour) and only
 * the C toggle switches the command circuit.
 */
export const COMMAND_CIRCUIT_EXIT_INPUT = [
  { name: "exitCommandCircuit", keys: ["Escape"] },
] as const satisfies readonly InputMapEntry[];

/** Union of all action names across all input maps. */
export type ActionName =
  | (typeof FREE_FLY_INPUT)[number]["name"]
  | (typeof MOVABLE_CAMERA_INPUT)[number]["name"]
  | (typeof POINTER_LOCKABLE_INPUT)[number]["name"]
  | (typeof MAP_MODE_INPUT)[number]["name"]
  | (typeof DEMO_MODE_INPUT)[number]["name"]
  | (typeof LIVE_OBSERVER_INPUT)[number]["name"]
  | (typeof FLAG_FOLLOW_INPUT)[number]["name"]
  | (typeof LIVE_FOLLOW_INPUT)[number]["name"]
  | (typeof TOUR_MODE_INPUT)[number]["name"]
  | (typeof DIRECTOR_MODE_INPUT)[number]["name"]
  | (typeof COMMAND_CIRCUIT_TOGGLE_INPUT)[number]["name"]
  | (typeof COMMAND_CIRCUIT_STREAM_INPUT)[number]["name"]
  | (typeof COMMAND_CIRCUIT_INPUT)[number]["name"];

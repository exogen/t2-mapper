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
  { name: "toggleObserverMode", keys: ["Space"] },
] as const satisfies readonly InputMapEntry[];

export const LIVE_FOLLOW_INPUT = [
  {
    name: "nextPlayer",
    keys: [{ type: "click", button: 0, whenPointerLocked: true }],
  },
] as const satisfies readonly InputMapEntry[];

export const TOUR_MODE_INPUT = [
  { name: "nextStop", keys: [{ type: "click", button: 0 }] },
  { name: "exitTour", keys: ["Escape"] },
] as const satisfies readonly InputMapEntry[];

/** Union of all action names across all input maps. */
export type ActionName =
  | (typeof FREE_FLY_INPUT)[number]["name"]
  | (typeof MOVABLE_CAMERA_INPUT)[number]["name"]
  | (typeof POINTER_LOCKABLE_INPUT)[number]["name"]
  | (typeof MAP_MODE_INPUT)[number]["name"]
  | (typeof DEMO_MODE_INPUT)[number]["name"]
  | (typeof LIVE_OBSERVER_INPUT)[number]["name"]
  | (typeof LIVE_FOLLOW_INPUT)[number]["name"]
  | (typeof TOUR_MODE_INPUT)[number]["name"];

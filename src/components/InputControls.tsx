import { useEffect, useEffectEvent, useMemo } from "react";
import { createStore } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";

// ── Types ──

export type Modifier = "Ctrl" | "Shift" | "Alt";

export type InputBinding =
  | { type: "key"; code: string; modifiers?: Modifier[] }
  | {
      type: "click";
      button?: number;
      modifiers?: Modifier[];
      whenPointerLocked?: boolean;
    }
  | { type: "drag"; button?: number; whenPointerLocked?: boolean }
  | { type: "pointerLockMove" }
  | { type: "scroll" }
  | { type: "touch" }
  | { type: "pinch" };

/** String shorthand: `"KeyW"`, `"Shift-KeyA"`, or an InputBinding object. */
export type BindingShorthand = string | InputBinding;

export type InputMapEntry<T extends string = string> = {
  name: T;
  keys: BindingShorthand | BindingShorthand[];
};

export interface KeyState {
  pressed: boolean;
}

export interface DragState {
  dragging: boolean;
  deltaX: number;
  deltaY: number;
  startX: number;
  startY: number;
}

export interface ScrollState {
  deltaX: number;
  deltaY: number;
  /**
   * Pointer position of the latest wheel event, relative to the canvas.
   */
  x: number;
  y: number;
}

export interface TouchState {
  touching: boolean;
  dragging: boolean;
  deltaX: number;
  deltaY: number;
}

export interface PinchState {
  pinching: boolean;
  /**
   * Accumulated movement of the midpoint between the two touch points, in
   * pixels, since the deltas were last cleared.
   */
  deltaX: number;
  deltaY: number;
  /**
   * Current midpoint between the two touch points, relative to the canvas.
   */
  x: number;
  y: number;
  /**
   * Accumulated change in distance between the two touch points, in pixels,
   * since the deltas were last cleared. Positive = fingers moving apart.
   */
  deltaDistance: number;
}

export type ActionState =
  KeyState | DragState | ScrollState | TouchState | PinchState;

/** The full store state: raw keys + derived action state. */
export interface InputStoreState {
  /** Physical key codes currently held down. */
  keys: Set<string>;
  /** Derived action state, keyed by action name. */
  actions: Record<string, ActionState>;
}

// ── Modifier parsing ──

const MODIFIER_NAMES = new Set<string>(["Ctrl", "Shift", "Alt"]);

/** All physical key codes that are modifier keys (including Meta for
 *  key-tracking purposes, even though Meta bindings are not supported). */
const MODIFIER_CODE_SET = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
]);

export function parseBinding(shorthand: BindingShorthand): InputBinding {
  if (typeof shorthand !== "string") return shorthand;
  const parts = shorthand.split("-");
  const code = parts.pop()!;
  const modifiers: Modifier[] = [];
  for (const part of parts) {
    if (MODIFIER_NAMES.has(part)) {
      modifiers.push(part as Modifier);
    }
  }
  return {
    type: "key",
    code,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
  };
}

/** Check if the required modifiers match the pressed key set. */
export function keySetModifiersMatch(
  keys: Set<string>,
  required?: Modifier[],
): boolean {
  const hasCtrl = keys.has("ControlLeft") || keys.has("ControlRight");
  const hasShift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const hasAlt = keys.has("AltLeft") || keys.has("AltRight");
  return (
    hasCtrl === (required?.includes("Ctrl") ?? false) &&
    hasShift === (required?.includes("Shift") ?? false) &&
    hasAlt === (required?.includes("Alt") ?? false)
  );
}

/** Check if the required modifiers match a DOM event's modifier flags. */
export function eventModifiersMatch(
  e: KeyboardEvent | MouseEvent,
  required?: Modifier[],
): boolean {
  const wantCtrl = required?.includes("Ctrl") ?? false;
  const wantShift = required?.includes("Shift") ?? false;
  const wantAlt = required?.includes("Alt") ?? false;
  return (
    e.ctrlKey === wantCtrl && e.shiftKey === wantShift && e.altKey === wantAlt
  );
}

// ── Default state factories ──

export function defaultKeyState(): KeyState {
  return { pressed: false };
}

export function defaultDragState(): DragState {
  return { dragging: false, deltaX: 0, deltaY: 0, startX: 0, startY: 0 };
}

export function defaultScrollState(): ScrollState {
  return { deltaX: 0, deltaY: 0, x: 0, y: 0 };
}

export function defaultTouchState(): TouchState {
  return { touching: false, dragging: false, deltaX: 0, deltaY: 0 };
}

export function defaultPinchState(): PinchState {
  return {
    pinching: false,
    deltaX: 0,
    deltaY: 0,
    x: 0,
    y: 0,
    deltaDistance: 0,
  };
}

export function defaultStateForBinding(binding: InputBinding): ActionState {
  switch (binding.type) {
    case "key":
    case "click":
      return defaultKeyState();
    case "drag":
    case "pointerLockMove":
      return defaultDragState();
    case "scroll":
      return defaultScrollState();
    case "touch":
      return defaultTouchState();
    case "pinch":
      return defaultPinchState();
  }
}

// ── Internal types ──

type ActionCallback = () => void;

export interface ParsedAction {
  name: string;
  bindings: InputBinding[];
}

// ── Module-level store and subscriber registry ──

export const inputControlsStore = createStore<InputStoreState>()(
  subscribeWithSelector(() => ({
    keys: new Set<string>(),
    actions: {} as Record<string, ActionState>,
  })),
);

const actionSubscribers = new Map<string, Set<ActionCallback>>();

export function subscribeAction(
  action: string,
  callback: ActionCallback,
): () => void {
  let set = actionSubscribers.get(action);
  if (!set) {
    set = new Set();
    actionSubscribers.set(action, set);
  }
  set.add(callback);
  return () => {
    set!.delete(callback);
    if (set!.size === 0) actionSubscribers.delete(action);
  };
}

export function notifySubscribers(action: string) {
  const set = actionSubscribers.get(action);
  if (set) {
    for (const cb of set) cb();
  }
}

// ── Centralized key tracking ──
// A single pair of keydown/keyup listeners manages the `keys` Set.
// InputBindings instances subscribe to key changes to derive actions,
// instead of each attaching their own keyboard listeners.

// Input types that accept text entry — all keys should be ignored.
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

// Keys that interactive (non-text) elements use natively.
const INTERACTIVE_KEYS = new Set([
  "Space",
  "Enter",
  "NumpadEnter",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function shouldIgnoreForFocus(e: KeyboardEvent): boolean {
  // Tab: capture when pointer is locked (prevent focus shift), otherwise
  // let the browser handle focus navigation.
  if (e.code === "Tab") {
    if (document.pointerLockElement) {
      e.preventDefault();
      return false;
    }
    return true;
  }

  const el = document.activeElement;
  if (!el || el === document.body) return false;

  const tag = el.tagName;
  if ((el as HTMLElement).isContentEditable) return true;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type.toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) return true;
    return INTERACTIVE_KEYS.has(e.code);
  }
  if (
    tag === "BUTTON" ||
    tag === "SELECT" ||
    tag === "A" ||
    tag === "SUMMARY"
  ) {
    return INTERACTIVE_KEYS.has(e.code);
  }
  return false;
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  // Meta (Cmd) is not supported as a modifier — macOS doesn't fire
  // reliable keyup events while it's held, causing stale input state.
  if (e.metaKey) return;
  if (shouldIgnoreForFocus(e)) return;

  const { keys: prevKeys } = inputControlsStore.getState();
  if (prevKeys.has(e.code)) return; // Already tracked (repeat).

  const nextKeys = new Set(prevKeys);
  nextKeys.add(e.code);
  inputControlsStore.setState((prev) => ({ ...prev, keys: nextKeys }));
}

function handleGlobalKeyUp(e: KeyboardEvent) {
  const { keys: prevKeys } = inputControlsStore.getState();
  if (!prevKeys.has(e.code)) return;

  const nextKeys = new Set(prevKeys);
  nextKeys.delete(e.code);

  // macOS Cocoa quirk: keyup not fired for keys released while Cmd held.
  // Clear non-modifier keys since we can't trust their state.
  if (e.code === "MetaLeft" || e.code === "MetaRight") {
    for (const code of nextKeys) {
      if (!MODIFIER_CODE_SET.has(code)) {
        nextKeys.delete(code);
      }
    }
  }

  inputControlsStore.setState((prev) => ({ ...prev, keys: nextKeys }));
}

function handleGlobalBlur() {
  const { keys } = inputControlsStore.getState();
  if (keys.size === 0) return;
  inputControlsStore.setState((prev) => ({
    ...prev,
    keys: new Set<string>(),
  }));
}

// Attach once at module load.
window.addEventListener("keydown", handleGlobalKeyDown);
window.addEventListener("keyup", handleGlobalKeyUp);
window.addEventListener("blur", handleGlobalBlur);

// ── Public hooks ──

/** Reactive selector for input action state. */
export function useInputControls<T>(
  selector: (state: Record<string, ActionState>) => T,
): T {
  return useStoreWithEqualityFn(inputControlsStore, (s) => selector(s.actions));
}

/** Imperative access to input state for useFrame callbacks. */
export function useInputState() {
  return useMemo(
    () =>
      [
        inputControlsStore.subscribe,
        () => inputControlsStore.getState().actions,
      ] as const,
    [],
  );
}

/** Zero accumulated deltas for drag, scroll, and touch actions.
 *  Does NOT reset `dragging` — that is managed by binding lifecycle.
 *  Call after reading deltas in your useFrame. */
export function clearInputDeltas() {
  const { actions } = inputControlsStore.getState();
  const updates: Record<string, ActionState> = {};
  for (const [name, s] of Object.entries(actions)) {
    const hasMoveDeltas = "deltaX" in s && (s.deltaX !== 0 || s.deltaY !== 0);
    const hasDistanceDelta = "deltaDistance" in s && s.deltaDistance !== 0;
    if (hasMoveDeltas || hasDistanceDelta) {
      updates[name] = {
        ...s,
        ...(hasMoveDeltas ? { deltaX: 0, deltaY: 0 } : null),
        ...(hasDistanceDelta ? { deltaDistance: 0 } : null),
      };
    }
  }
  if (Object.keys(updates).length > 0) {
    inputControlsStore.setState((prev) => ({
      ...prev,
      actions: { ...prev.actions, ...updates },
    }));
  }
}

/**
 * Register a callback for a one-shot action (key press, click, etc.).
 * The callback always sees current closure state via useEffectEvent.
 */
export function useInputAction(action: string, callback: () => void) {
  const stableCallback = useEffectEvent(callback);

  useEffect(() => {
    return subscribeAction(action, stableCallback);
  }, [action]);
}

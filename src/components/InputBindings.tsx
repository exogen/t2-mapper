import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import {
  inputControlsStore,
  notifySubscribers,
  keySetModifiersMatch,
  eventModifiersMatch,
  parseBinding,
  defaultStateForBinding,
  defaultDragState,
  defaultTouchState,
  defaultPinchState,
  type InputMapEntry,
  type ActionState,
  type DragState,
  type KeyState,
  type PinchState,
  type ScrollState,
  type TouchState,
  type ParsedAction,
  type Modifier,
} from "./InputControls";

const DRAG_THRESHOLD = 3;

/**
 * Parses the input map and attaches event listeners that write to the
 * InputControls store. Place inside the r3f Canvas.
 * Multiple InputBindings instances can coexist.
 *
 * Keyboard state is tracked centrally in InputControls (module-level
 * keydown/keyup listeners). This component subscribes to key changes
 * and derives its action state from them.
 */
export function InputBindings<T extends string = string>({
  map,
}: {
  map: readonly InputMapEntry<T>[] | InputMapEntry<T>[];
}) {
  const store = inputControlsStore;
  const canvas = useThree((state) => state.gl.domElement);

  const bindings = useMemo(() => {
    // Parse the map.
    const actions: ParsedAction[] = map.map((entry) => {
      const keys = Array.isArray(entry.keys) ? entry.keys : [entry.keys];
      return { name: entry.name, bindings: keys.map(parseBinding) };
    });

    // Build default action state (applied in useEffect, not here).
    const initialActions: Record<string, ActionState> = {};
    for (const action of actions) {
      initialActions[action.name] = defaultStateForBinding(action.bindings[0]);
    }

    // Build lookup indices.
    const keyBindings = new Map<
      string,
      {
        action: ParsedAction;
        binding: { type: "key"; code: string; modifiers?: Modifier[] };
      }[]
    >();
    const clickBindings: {
      action: ParsedAction;
      binding: {
        type: "click";
        button?: number;
        modifiers?: Modifier[];
        whenPointerLocked?: boolean;
      };
    }[] = [];
    const dragBindings: {
      action: ParsedAction;
      binding: { type: "drag"; button?: number; whenPointerLocked?: boolean };
    }[] = [];
    const pointerLockMoveBindings: { action: ParsedAction }[] = [];
    const scrollBindings: { action: ParsedAction }[] = [];
    const touchBindings: { action: ParsedAction }[] = [];
    const pinchBindings: { action: ParsedAction }[] = [];

    for (const action of actions) {
      for (const binding of action.bindings) {
        switch (binding.type) {
          case "key": {
            let list = keyBindings.get(binding.code);
            if (!list) {
              list = [];
              keyBindings.set(binding.code, list);
            }
            list.push({ action, binding });
            break;
          }
          case "click":
            clickBindings.push({ action, binding });
            break;
          case "drag":
            dragBindings.push({ action, binding });
            break;
          case "pointerLockMove":
            pointerLockMoveBindings.push({ action });
            break;
          case "scroll":
            scrollBindings.push({ action });
            break;
          case "touch":
            touchBindings.push({ action });
            break;
          case "pinch":
            pinchBindings.push({ action });
            break;
        }
      }
    }

    /** Check if a binding's whenPointerLocked constraint is satisfied. */
    function pointerLockMatches(whenPointerLocked?: boolean): boolean {
      if (whenPointerLocked == null) return true;
      return whenPointerLocked === !!document.pointerLockElement;
    }

    // ── Key action derivation ──

    /**
     * Derive key action state from the raw pressed-key set.
     * Called whenever the global key set changes.
     */
    function deriveKeyActions(keys: Set<string>) {
      const { actions } = store.getState();
      const updates: Record<string, ActionState> = {};

      for (const [, entries] of keyBindings) {
        for (const { action, binding } of entries) {
          const shouldBePressed =
            keys.has(binding.code) &&
            keySetModifiersMatch(keys, binding.modifiers);
          const prev = actions[action.name] as KeyState | undefined;
          const wasPressed = prev?.pressed ?? false;
          if (shouldBePressed && !wasPressed) {
            updates[action.name] = { pressed: true };
            notifySubscribers(action.name);
          } else if (!shouldBePressed && wasPressed) {
            updates[action.name] = { pressed: false };
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        store.setState((prev) => ({
          ...prev,
          actions: { ...prev.actions, ...updates },
        }));
      }
    }

    // ── Mouse handlers ──

    let mouseDownButton = -1;
    let mouseDownX = 0;
    let mouseDownY = 0;
    let isDragging = false;

    function setAction(name: string, state: ActionState) {
      store.setState((prev) => ({
        ...prev,
        actions: { ...prev.actions, [name]: state },
      }));
    }

    function handleMouseDown(e: MouseEvent) {
      const isLocked = !!document.pointerLockElement;

      // Click bindings: set pressed on mousedown.
      for (const { action, binding } of clickBindings) {
        if (!pointerLockMatches(binding.whenPointerLocked)) continue;
        const button = binding.button ?? 0;
        if (e.button !== button) continue;
        if (!eventModifiersMatch(e, binding.modifiers)) continue;
        setAction(action.name, { pressed: true } satisfies KeyState);
      }

      // Drag tracking only when not pointer-locked (locked movement
      // is handled by pointerLockMove bindings in handleMouseMove).
      if (!isLocked) {
        mouseDownButton = e.button;
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
        isDragging = false;
      }
    }

    function handleMouseMove(e: MouseEvent) {
      // Pointer lock: accumulate deltas for pointerLockMove bindings.
      // Mutate in place and batch into a single setState.
      if (document.pointerLockElement) {
        if (pointerLockMoveBindings.length > 0) {
          const { actions } = store.getState();
          const updates: Record<string, ActionState> = {};
          for (const { action } of pointerLockMoveBindings) {
            const prev = actions[action.name] as DragState;
            updates[action.name] = {
              ...prev,
              deltaX: prev.deltaX + e.movementX,
              deltaY: prev.deltaY + e.movementY,
            };
          }
          store.setState((prev) => ({
            ...prev,
            actions: { ...prev.actions, ...updates },
          }));
        }
        return;
      }

      // Non-locked: check drag threshold.
      if (mouseDownButton < 0) return;

      if (!isDragging) {
        const dx = e.clientX - mouseDownX;
        const dy = e.clientY - mouseDownY;
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
          return;
        }
        isDragging = true;

        // Crossed drag threshold — cancel matching click bindings.
        for (const { action, binding } of clickBindings) {
          if (!pointerLockMatches(binding.whenPointerLocked)) continue;
          if ((binding.button ?? 0) !== mouseDownButton) continue;
          const prev = store.getState().actions[action.name] as KeyState;
          if (prev.pressed) {
            setAction(action.name, { pressed: false } satisfies KeyState);
          }
        }

        for (const { action, binding } of dragBindings) {
          if (!pointerLockMatches(binding.whenPointerLocked)) continue;
          if ((binding.button ?? 0) !== mouseDownButton) continue;
          setAction(action.name, {
            dragging: true,
            deltaX: 0,
            deltaY: 0,
            startX: mouseDownX,
            startY: mouseDownY,
          } satisfies DragState);
        }
      }

      // Accumulate drag deltas — batch into a single setState.
      const { actions } = store.getState();
      const dragUpdates: Record<string, ActionState> = {};
      for (const { action, binding } of dragBindings) {
        if (!pointerLockMatches(binding.whenPointerLocked)) continue;
        if ((binding.button ?? 0) !== mouseDownButton) continue;
        const prev = actions[action.name] as DragState;
        dragUpdates[action.name] = {
          ...prev,
          deltaX: prev.deltaX + e.movementX,
          deltaY: prev.deltaY + e.movementY,
        };
      }
      if (Object.keys(dragUpdates).length > 0) {
        store.setState((prev) => ({
          ...prev,
          actions: { ...prev.actions, ...dragUpdates },
        }));
      }
    }

    function handleMouseUp(e: MouseEvent) {
      const isLocked = !!document.pointerLockElement;

      // Click bindings: if still pressed (not cancelled by drag),
      // this is a confirmed click — notify subscribers then release.
      for (const { action, binding } of clickBindings) {
        if (!pointerLockMatches(binding.whenPointerLocked)) continue;
        const button = binding.button ?? 0;
        if (e.button !== button) continue;
        const prev = store.getState().actions[action.name] as KeyState;
        if (prev.pressed) {
          notifySubscribers(action.name);
          setAction(action.name, { pressed: false } satisfies KeyState);
        }
      }

      // Drag bindings: end dragging (only relevant when not locked).
      if (!isLocked && e.button === mouseDownButton) {
        for (const { action, binding } of dragBindings) {
          if (!pointerLockMatches(binding.whenPointerLocked)) continue;
          if ((binding.button ?? 0) !== mouseDownButton) continue;
          const prev = store.getState().actions[action.name] as DragState;
          if (prev.dragging) {
            setAction(action.name, defaultDragState());
          }
        }
        mouseDownButton = -1;
        isDragging = false;
      }
    }

    function handleWheel(e: WheelEvent) {
      for (const { action } of scrollBindings) {
        setAction(action.name, {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
        } satisfies ScrollState);
        notifySubscribers(action.name);
      }
    }

    // ── Touch handlers ──

    let touchId: number | null = null;
    let lastTouchX = 0;
    let lastTouchY = 0;
    // A second concurrent touch drives pinch bindings (distance changes
    // between the two points). Pan deltas keep following the primary touch.
    let pinchTouchId: number | null = null;
    let pinchTouchX = 0;
    let pinchTouchY = 0;

    function touchDistance(): number {
      return Math.hypot(pinchTouchX - lastTouchX, pinchTouchY - lastTouchY);
    }

    function handleTouchStart(e: TouchEvent) {
      if (touchBindings.length === 0 && pinchBindings.length === 0) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touchId === null) {
          touchId = touch.identifier;
          lastTouchX = touch.clientX;
          lastTouchY = touch.clientY;
          for (const { action } of touchBindings) {
            setAction(action.name, {
              touching: true,
              dragging: false,
              deltaX: 0,
              deltaY: 0,
            } satisfies TouchState);
          }
        } else if (
          pinchTouchId === null &&
          pinchBindings.length > 0 &&
          touch.identifier !== touchId
        ) {
          pinchTouchId = touch.identifier;
          pinchTouchX = touch.clientX;
          pinchTouchY = touch.clientY;
          for (const { action } of pinchBindings) {
            setAction(action.name, {
              pinching: true,
              deltaDistance: 0,
            } satisfies PinchState);
          }
        }
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (touchId === null) return;
      // The gesture started on the canvas and is ours: stop the browser
      // from also scrolling/zooming/rubber-banding the page with it.
      e.preventDefault();
      const prevDistance = pinchTouchId !== null ? touchDistance() : 0;
      let pinchMoved = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === touchId) {
          const dx = touch.clientX - lastTouchX;
          const dy = touch.clientY - lastTouchY;
          lastTouchX = touch.clientX;
          lastTouchY = touch.clientY;
          pinchMoved = true;
          for (const { action } of touchBindings) {
            const prev = store.getState().actions[action.name] as TouchState;
            setAction(action.name, {
              touching: true,
              dragging: true,
              deltaX: prev.deltaX + dx,
              deltaY: prev.deltaY + dy,
            } satisfies TouchState);
          }
        } else if (touch.identifier === pinchTouchId) {
          pinchTouchX = touch.clientX;
          pinchTouchY = touch.clientY;
          pinchMoved = true;
        }
      }
      if (pinchTouchId !== null && pinchMoved) {
        const delta = touchDistance() - prevDistance;
        if (delta !== 0) {
          for (const { action } of pinchBindings) {
            const prev = store.getState().actions[action.name] as PinchState;
            setAction(action.name, {
              pinching: true,
              deltaDistance: prev.deltaDistance + delta,
            } satisfies PinchState);
          }
        }
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const id = e.changedTouches[i].identifier;
        if (id === pinchTouchId) {
          pinchTouchId = null;
          for (const { action } of pinchBindings) {
            setAction(action.name, defaultPinchState());
          }
        } else if (id === touchId) {
          touchId = null;
          pinchTouchId = null;
          for (const { action } of touchBindings) {
            setAction(action.name, defaultTouchState());
          }
          for (const { action } of pinchBindings) {
            setAction(action.name, defaultPinchState());
          }
        }
      }
    }

    const actionNames = actions.map((a) => a.name);
    const hasKeyBindings = keyBindings.size > 0;

    return {
      actionNames,
      initialActions,
      deriveKeyActions,
      hasKeyBindings,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleWheel,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      hasMouseBindings:
        clickBindings.length > 0 ||
        dragBindings.length > 0 ||
        pointerLockMoveBindings.length > 0,
      hasScrollBindings: scrollBindings.length > 0,
      hasTouchBindings: touchBindings.length > 0 || pinchBindings.length > 0,
    };
  }, [map, store]);

  // Initialize action state, subscribe to key changes, and attach
  // mouse/touch/scroll listeners.
  useEffect(() => {
    store.setState((prev) => ({
      ...prev,
      actions: { ...prev.actions, ...bindings.initialActions },
    }));

    // Subscribe to global key set changes to derive key actions.
    let unsubKeys: (() => void) | undefined;
    if (bindings.hasKeyBindings) {
      // Derive immediately from current key state.
      bindings.deriveKeyActions(store.getState().keys);

      unsubKeys = store.subscribe(
        (state) => state.keys,
        (keys) => bindings.deriveKeyActions(keys),
      );
    }

    if (bindings.hasMouseBindings) {
      canvas.addEventListener("mousedown", bindings.handleMouseDown);
      document.addEventListener("mousemove", bindings.handleMouseMove);
      document.addEventListener("mouseup", bindings.handleMouseUp);
    }

    if (bindings.hasScrollBindings) {
      canvas.addEventListener("wheel", bindings.handleWheel, {
        passive: true,
      });
    }

    if (bindings.hasTouchBindings) {
      canvas.addEventListener("touchstart", bindings.handleTouchStart, {
        passive: true,
      });
      // Not passive: the handler calls preventDefault while it is tracking
      // a gesture that started on the canvas.
      document.addEventListener("touchmove", bindings.handleTouchMove, {
        passive: false,
      });
      document.addEventListener("touchend", bindings.handleTouchEnd, {
        passive: true,
      });
      document.addEventListener("touchcancel", bindings.handleTouchEnd, {
        passive: true,
      });
    }

    return () => {
      unsubKeys?.();

      if (bindings.hasMouseBindings) {
        canvas.removeEventListener("mousedown", bindings.handleMouseDown);
        document.removeEventListener("mousemove", bindings.handleMouseMove);
        document.removeEventListener("mouseup", bindings.handleMouseUp);
      }

      if (bindings.hasScrollBindings) {
        canvas.removeEventListener("wheel", bindings.handleWheel);
      }

      if (bindings.hasTouchBindings) {
        canvas.removeEventListener("touchstart", bindings.handleTouchStart);
        document.removeEventListener("touchmove", bindings.handleTouchMove);
        document.removeEventListener("touchend", bindings.handleTouchEnd);
        document.removeEventListener("touchcancel", bindings.handleTouchEnd);
      }

      // Remove this instance's actions from the store.
      store.setState((prev) => {
        const nextActions = { ...prev.actions };
        for (const name of bindings.actionNames) {
          delete nextActions[name];
        }
        return { ...prev, actions: nextActions };
      });
    };
  }, [bindings, store, canvas]);

  return null;
}

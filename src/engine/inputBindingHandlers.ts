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
  type InputBinding,
  type ActionState,
  type DragState,
  type KeyState,
  type PinchState,
  type ScrollState,
  type TouchState,
  type ParsedAction,
} from "../state/inputControls";

const DRAG_THRESHOLD = 3;

type BoundAction<T extends InputBinding["type"]> = {
  action: ParsedAction;
  binding: Extract<InputBinding, { type: T }>;
};

/** Per-mount input handlers and mutable gesture state. */
export function createInputBindingHandlers(map: readonly InputMapEntry[]) {
  const store = inputControlsStore;
  // Parse the map.
  const actions: ParsedAction[] = map.map((entry) => {
    const keys = Array.isArray(entry.keys) ? entry.keys : [entry.keys];
    return { name: entry.name, bindings: keys.map(parseBinding) };
  });

  // Build initial action state for the owner to install.
  const initialActions: Record<string, ActionState> = {};
  for (const action of actions) {
    initialActions[action.name] = defaultStateForBinding(action.bindings[0]);
  }

  // Build lookup indices.
  const keyBindings = new Map<string, BoundAction<"key">[]>();
  const clickBindings: BoundAction<"click">[] = [];
  const dragBindings: BoundAction<"drag">[] = [];
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
   * Modifier changes update held actions, but only a fresh press of the
   * bound key notifies one-shot subscribers. At mount, treat all current
   * keys as already held so remounting bindings doesn't retrigger them.
   */
  function deriveKeyActions(keys: Set<string>, previousKeys = keys) {
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
          if (!previousKeys.has(binding.code)) notifySubscribers(action.name);
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
  let skipNextLockedMove = true;

  function setAction(name: string, state: ActionState) {
    store.setState((prev) => ({
      ...prev,
      actions: { ...prev.actions, [name]: state },
    }));
  }

  function handlePointerLockChange() {
    skipNextLockedMove = true;
    for (const { action } of pointerLockMoveBindings) {
      setAction(action.name, defaultDragState());
    }
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
        // Chrome can include cursor repositioning in the first relative
        // movement after recapture. Start a fresh input sample on each
        // lock (including bindings remounting after Target Finder closes).
        if (skipNextLockedMove) {
          if (e.movementX !== 0 || e.movementY !== 0) {
            skipNextLockedMove = false;
          }
          return;
        }
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

  // Right-button click bindings must not pop the browser context menu
  // (some browsers still fire contextmenu during pointer lock).
  function handleContextMenu(e: MouseEvent) {
    for (const { binding } of clickBindings) {
      if ((binding.button ?? 0) !== 2) continue;
      if (!pointerLockMatches(binding.whenPointerLocked)) continue;
      e.preventDefault();
      return;
    }
  }

  function handleWheel(e: WheelEvent) {
    for (const { action } of scrollBindings) {
      setAction(action.name, {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        x: e.offsetX,
        y: e.offsetY,
      } satisfies ScrollState);
      notifySubscribers(action.name);
    }
  }

  // ── Touch handlers ──

  // Keep only contacts that started on this canvas. Insertion order gives
  // stable pinch fingers and naturally promotes a survivor when one lifts.
  const touches = new Map<number, { x: number; y: number }>();
  let touchSurface: HTMLElement | null = null;

  function touchPoints() {
    return Array.from(touches.values()).slice(0, 2);
  }

  function updateTouchActivity() {
    const points = touchPoints();
    for (const { action } of touchBindings) {
      const prev = store.getState().actions[action.name] as TouchState;
      setAction(action.name, {
        ...prev,
        touching: points.length > 0,
        dragging: points.length === 1 && prev.dragging,
      } satisfies TouchState);
    }
    for (const { action } of pinchBindings) {
      const prev = store.getState().actions[action.name] as PinchState;
      const pinching = points.length === 2;
      const rect = pinching ? touchSurface?.getBoundingClientRect() : null;
      setAction(action.name, {
        ...prev,
        pinching,
        ...(rect && pinching
          ? {
              x: (points[0].x + points[1].x) / 2 - rect.left,
              y: (points[0].y + points[1].y) / 2 - rect.top,
            }
          : null),
      } satisfies PinchState);
    }
  }

  function handleTouchStart(e: TouchEvent) {
    if (touchBindings.length === 0 && pinchBindings.length === 0) return;
    touchSurface = e.currentTarget as HTMLElement;
    for (const touch of Array.from(e.changedTouches)) {
      if (!touches.has(touch.identifier)) {
        touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      }
    }
    // Active flags and baselines change here; queued movement belongs to
    // the next frame even when several gestures occur between frames.
    updateTouchActivity();
  }

  function sampleTouchPositions(changedTouches: TouchList): boolean {
    const before = touchPoints();
    let moved = false;
    for (const touch of Array.from(changedTouches)) {
      if (!touches.has(touch.identifier)) continue;
      touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      moved = true;
    }
    if (!moved) return false;
    const after = touchPoints();
    if (before.length === 1) {
      const dx = after[0].x - before[0].x;
      const dy = after[0].y - before[0].y;
      if (dx !== 0 || dy !== 0) {
        for (const { action } of touchBindings) {
          const prev = store.getState().actions[action.name] as TouchState;
          setAction(action.name, {
            ...prev,
            touching: true,
            dragging: true,
            deltaX: prev.deltaX + dx,
            deltaY: prev.deltaY + dy,
          } satisfies TouchState);
        }
      }
    } else if (before.length === 2 && touchSurface) {
      const previousSpan = Math.hypot(
        before[1].x - before[0].x,
        before[1].y - before[0].y,
      );
      const span = Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y);
      // OrbitControls scales zoom by the ratio of successive finger spans.
      // Ignore near-zero spans instead of dividing by a degenerate baseline.
      const scale = previousSpan >= 1 && span >= 1 ? span / previousSpan : 1;
      const midX = (after[0].x + after[1].x) / 2;
      const midY = (after[0].y + after[1].y) / 2;
      const rect = touchSurface.getBoundingClientRect();
      for (const { action } of pinchBindings) {
        const prev = store.getState().actions[action.name] as PinchState;
        setAction(action.name, {
          ...prev,
          pinching: true,
          deltaX: prev.deltaX + midX - (before[0].x + before[1].x) / 2,
          deltaY: prev.deltaY + midY - (before[0].y + before[1].y) / 2,
          x: midX - rect.left,
          y: midY - rect.top,
          deltaDistance: prev.deltaDistance + span - previousSpan,
          deltaScale: prev.deltaScale * scale,
        } satisfies PinchState);
      }
    }
    return true;
  }

  function handleTouchMove(e: TouchEvent) {
    // Document-level listeners also see sidebar and other overlay touches.
    // Only prevent browser handling when one of our own contacts moved.
    if (sampleTouchPositions(e.changedTouches)) e.preventDefault();
  }

  function handleTouchEnd(e: TouchEvent) {
    // A normal release commits its last position and leaves pending movement
    // for the frame consumer. Cancellation follows the separate reset path.
    sampleTouchPositions(e.changedTouches);
    for (const touch of Array.from(e.changedTouches)) {
      touches.delete(touch.identifier);
    }
    updateTouchActivity();
    if (touches.size === 0) touchSurface = null;
  }

  function resetTouch() {
    touches.clear();
    touchSurface = null;
    for (const { action } of touchBindings) {
      setAction(action.name, defaultTouchState());
    }
    for (const { action } of pinchBindings) {
      setAction(action.name, defaultPinchState());
    }
  }

  function handleTouchCancel(e: TouchEvent) {
    if (
      Array.from(e.changedTouches).some((touch) =>
        touches.has(touch.identifier),
      )
    ) {
      resetTouch();
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
    handlePointerLockChange,
    handleContextMenu,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    resetTouch,
    hasMouseBindings:
      clickBindings.length > 0 ||
      dragBindings.length > 0 ||
      pointerLockMoveBindings.length > 0,
    hasRightClickBindings: clickBindings.some(
      ({ binding }) => (binding.button ?? 0) === 2,
    ),
    hasPointerLockMoveBindings: pointerLockMoveBindings.length > 0,
    hasScrollBindings: scrollBindings.length > 0,
    hasTouchBindings: touchBindings.length > 0 || pinchBindings.length > 0,
  };
}

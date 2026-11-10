import type { GameEngine } from "./gameEngine";
import { inputControlsStore, type InputMapEntry } from "../state/inputControls";
import { createInputBindingHandlers } from "./inputBindingHandlers";

/**
 * Parse an input map and attach event listeners that write to the input
 * controls store, on the engine's canvas. Several maps can be bound at
 * once.
 *
 * Keyboard state is tracked centrally in the input controls store
 * (module-level keydown/keyup listeners); a binding subscribes to key
 * changes and derives its action state from them.
 */
export function installInputBindings<T extends string = string>(
  engine: GameEngine,
  map: readonly InputMapEntry<T>[],
): () => void {
  return engine.withHost(({ renderer }) => {
    const canvas = renderer.domElement;
    const store = inputControlsStore;
    const bindings = createInputBindingHandlers(map);
    store.setState((prev) => ({
      ...prev,
      actions: { ...prev.actions, ...bindings.initialActions },
    }));

    // Subscribe to global key set changes to derive key actions.
    let unsubKeys: (() => void) | undefined;
    if (bindings.hasKeyBindings) {
      // Derive immediately from current key state, without treating
      // already-held keys as fresh presses.
      bindings.deriveKeyActions(store.getState().keys);

      unsubKeys = store.subscribe(
        (state) => state.keys,
        (keys, previousKeys) => bindings.deriveKeyActions(keys, previousKeys),
      );
    }

    if (bindings.hasMouseBindings) {
      canvas.addEventListener("mousedown", bindings.handleMouseDown);
      document.addEventListener("mousemove", bindings.handleMouseMove);
      document.addEventListener("mouseup", bindings.handleMouseUp);
    }

    if (bindings.hasPointerLockMoveBindings) {
      bindings.handlePointerLockChange();
      document.addEventListener(
        "pointerlockchange",
        bindings.handlePointerLockChange,
      );
    }

    if (bindings.hasRightClickBindings) {
      canvas.addEventListener("contextmenu", bindings.handleContextMenu);
    }

    if (bindings.hasScrollBindings) {
      canvas.addEventListener("wheel", bindings.handleWheel, {
        passive: true,
      });
    }

    const onVisibilityChange = () => {
      if (document.hidden) bindings.resetTouch();
    };
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
      document.addEventListener("touchcancel", bindings.handleTouchCancel, {
        passive: true,
      });
      window.addEventListener("blur", bindings.resetTouch);
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      unsubKeys?.();

      if (bindings.hasMouseBindings) {
        canvas.removeEventListener("mousedown", bindings.handleMouseDown);
        document.removeEventListener("mousemove", bindings.handleMouseMove);
        document.removeEventListener("mouseup", bindings.handleMouseUp);
      }

      if (bindings.hasPointerLockMoveBindings) {
        document.removeEventListener(
          "pointerlockchange",
          bindings.handlePointerLockChange,
        );
      }

      if (bindings.hasRightClickBindings) {
        canvas.removeEventListener("contextmenu", bindings.handleContextMenu);
      }

      if (bindings.hasScrollBindings) {
        canvas.removeEventListener("wheel", bindings.handleWheel);
      }

      if (bindings.hasTouchBindings) {
        canvas.removeEventListener("touchstart", bindings.handleTouchStart);
        document.removeEventListener("touchmove", bindings.handleTouchMove);
        document.removeEventListener("touchend", bindings.handleTouchEnd);
        document.removeEventListener("touchcancel", bindings.handleTouchCancel);
        window.removeEventListener("blur", bindings.resetTouch);
        document.removeEventListener("visibilitychange", onVisibilityChange);
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
  });
}

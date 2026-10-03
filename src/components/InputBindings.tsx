import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { inputControlsStore, type InputMapEntry } from "./InputControls";
import { createInputBindingHandlers } from "./inputBindingHandlers";

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
  map: readonly InputMapEntry<T>[];
}) {
  const canvas = useThree((state) => state.gl.domElement);

  // Initialize action state, subscribe to key changes, and attach
  // mouse/touch/scroll listeners.
  useEffect(() => {
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
  }, [map, canvas]);

  return null;
}

import { useCallback, useEffect } from "react";
import { isTypingOrSelecting } from "../keyboard";
import { inputControlsStore } from "../state/inputControls";

const modalSelector =
  'dialog[open], [aria-modal="true"][role="dialog"], [aria-modal="true"][role="alertdialog"]';

export function useShortcutHelpTrigger(
  onOpen: (wasPointerLocked: boolean) => void,
  dialogPendingOrOpen = false,
) {
  const open = useCallback(() => {
    if (dialogPendingOrOpen) return false;
    const dialogs = document.querySelectorAll(modalSelector);
    if (Array.from(dialogs).some((dialog) => dialog.getClientRects().length)) {
      return false;
    }

    const wasPointerLocked = Boolean(document.pointerLockElement);
    inputControlsStore.setState({ keys: new Set() });
    if (wasPointerLocked) document.exitPointerLock();
    onOpen(wasPointerLocked);
    return true;
  }, [dialogPendingOrOpen, onOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "?" ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        event.metaKey ||
        (event.ctrlKey && !event.getModifierState("AltGraph")) ||
        isTypingOrSelecting(event.target) ||
        isTypingOrSelecting(document.activeElement)
      ) {
        return;
      }

      if (!open()) return;
      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return open;
}

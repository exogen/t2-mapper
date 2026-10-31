import { useEffect, type RefObject } from "react";
import type { ComboboxStore } from "@ariakit/react";

/**
 * ⌘K / Ctrl+K anywhere on the page focuses the combobox's input and opens
 * its popover.
 */
export function useComboboxShortcut(
  inputRef: RefObject<HTMLInputElement | null>,
  combobox: ComboboxStore,
): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyK" && (e.metaKey || e.ctrlKey)) {
        e.stopPropagation();
        e.preventDefault();
        inputRef.current?.focus();
        combobox.show();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [inputRef, combobox]);
}

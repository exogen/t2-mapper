import { createContext, useContext, type ReactNode } from "react";

export const ClipControlsContext = createContext<{
  recordButton: ReactNode;
  recordAvailable: boolean;
  editorPanel: ReactNode;
  saving: boolean;
}>({
  recordButton: null,
  recordAvailable: false,
  editorPanel: null,
  saving: false,
});

export function useClipDraftSaving(): boolean {
  return useContext(ClipControlsContext).saving;
}

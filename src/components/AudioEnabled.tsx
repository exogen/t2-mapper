import { ReactNode, Suspense } from "react";
import { useSettings } from "./SettingsProvider";

export function AudioEnabled({ children }: { children: ReactNode }) {
  const { audioEnabled } = useSettings();
  return audioEnabled ? <Suspense>{children}</Suspense> : null;
}

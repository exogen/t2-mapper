import { ReactNode, Suspense } from "react";
import { useDebug } from "./SettingsProvider";

export function DebugEnabled({ children }: { children: ReactNode }) {
  const { debugMode } = useDebug();

  return debugMode ? <Suspense>{children}</Suspense> : null;
}

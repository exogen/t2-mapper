import { Suspense, useEffect, type ReactNode } from "react";
import { createLogger } from "../logger";

const log = createLogger("DebugSuspense");

/**
 * Suspense wrapper that logs when a component suspends and resolves.
 * Use in place of `<Suspense>` during debugging to track async loading.
 */
export function DebugSuspense({
  name,
  fallback = null,
  children,
}: {
  name: string;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense
      name={name}
      fallback={
        <DebugSuspenseFallback name={name}>{fallback}</DebugSuspenseFallback>
      }
    >
      <DebugSuspenseResolved name={name} />
      {children}
    </Suspense>
  );
}

function DebugSuspenseFallback({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  useEffect(() => {
    log.debug("🛑 SUSPENDED: %s", name);
  }, [name]);
  return children;
}

function DebugSuspenseResolved({ name }: { name: string }) {
  useEffect(() => {
    log.debug("✅ RESOLVED: %s", name);
  }, [name]);
  return null;
}

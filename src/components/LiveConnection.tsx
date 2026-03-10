import { useEffect } from "react";
import { disposeLiveConnection } from "../state/liveConnectionStore";

/** Cleanup-only provider — disposes the relay connection on unmount. */
export function LiveConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    return () => disposeLiveConnection();
  }, []);

  return children;
}

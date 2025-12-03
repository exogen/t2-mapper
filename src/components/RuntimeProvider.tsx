import { createContext, ReactNode, useContext } from "react";
import type { TorqueRuntime } from "../torqueScript";
import { TickProvider } from "./TickProvider";

const RuntimeContext = createContext<TorqueRuntime | null>(null);

interface RuntimeProviderProps {
  runtime: TorqueRuntime;
  children: ReactNode;
}

export function RuntimeProvider({ runtime, children }: RuntimeProviderProps) {
  return (
    <RuntimeContext.Provider value={runtime}>
      <TickProvider>{children}</TickProvider>
    </RuntimeContext.Provider>
  );
}

export function useRuntime(): TorqueRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error("useRuntime must be used within a RuntimeProvider");
  }
  return runtime;
}

import { createContext, ReactNode, useContext } from "react";
import type { TorqueRuntime } from "../torqueScript";


const RuntimeContext = createContext<TorqueRuntime | null>(null);

export interface RuntimeProviderProps {
  runtime: TorqueRuntime;
  children?: ReactNode;
}

export function RuntimeProvider({ runtime, children }: RuntimeProviderProps) {
  return (
    <RuntimeContext.Provider value={runtime}>
      {children}
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


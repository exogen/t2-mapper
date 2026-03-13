import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useFrame } from "@react-three/fiber";

/** Ticks per second, matching the Torque engine tick rate. */
export const TICK_RATE = 32;
const TICK_INTERVAL = 1 / TICK_RATE;

export type TickCallback = (tick: number) => void;

interface TickContextValue {
  subscribe: (callback: TickCallback) => () => void;
  getTick: () => number;
  /** Fraction [0, 1) of the current tick elapsed since the last tick fired. */
  getTickFraction: () => number;
}

const TickContext = createContext<TickContextValue | null>(null);

interface TickProviderProps {
  children: ReactNode;
}

export function TickProvider({ children }: TickProviderProps) {
  const callbacksRef = useRef<Set<TickCallback> | undefined>(undefined);
  const accumulatorRef = useRef(0);
  const tickRef = useRef(0);

  useFrame((_, delta) => {
    accumulatorRef.current += delta;

    while (accumulatorRef.current >= TICK_INTERVAL) {
      accumulatorRef.current -= TICK_INTERVAL;
      tickRef.current++;

      if (callbacksRef.current) {
        for (const callback of callbacksRef.current) {
          callback(tickRef.current);
        }
      }
    }
  });

  const subscribe = useCallback((callback: TickCallback) => {
    callbacksRef.current ??= new Set();
    callbacksRef.current.add(callback);
    return () => {
      callbacksRef.current!.delete(callback);
    };
  }, []);

  const getTick = useCallback(() => tickRef.current, []);

  const getTickFraction = useCallback(
    () => accumulatorRef.current / TICK_INTERVAL,
    [],
  );

  const context = useMemo(
    () => ({ subscribe, getTick, getTickFraction }),
    [subscribe, getTick, getTickFraction],
  );

  return (
    <TickContext.Provider value={context}>{children}</TickContext.Provider>
  );
}

export function useTick(callback: TickCallback) {
  const context = useContext(TickContext);
  if (!context) {
    throw new Error("useTick must be used within a TickProvider");
  }
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return context.subscribe((tick) => callbackRef.current(tick));
  }, [context]);
}

export function useGetTick() {
  const context = useContext(TickContext);
  if (!context) {
    throw new Error("useGetTick must be used within a TickProvider");
  }
  return context.getTick;
}

export function useGetTickFraction() {
  const context = useContext(TickContext);
  if (!context) {
    throw new Error("useGetTickFraction must be used within a TickProvider");
  }
  return context.getTickFraction;
}

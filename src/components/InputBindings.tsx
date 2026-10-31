import { useEffect } from "react";
import { useEngine } from "./useEngine";
import type { InputMapEntry } from "./InputControls";
import { installInputBindings } from "../engine/inputBindings";

/**
 * Binds an input map on the engine's canvas while mounted (see
 * installInputBindings). Multiple InputBindings instances can coexist.
 */
export function InputBindings<T extends string = string>({
  map,
}: {
  map: readonly InputMapEntry<T>[];
}) {
  const engine = useEngine();

  // Initialize action state, subscribe to key changes, and attach
  // mouse/touch/scroll listeners.
  useEffect(() => installInputBindings(engine, map), [map, engine]);

  return null;
}

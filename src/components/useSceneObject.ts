import type { TorqueObject } from "../torqueScript";
import { useRuntime } from "./RuntimeProvider";

/**
 * Look up a scene object by name from the runtime.
 *
 * FIXME: This is not currently reactive! If the object is created after
 * this hook runs, it won't be found. We'd need to add an event/subscription
 * system to the runtime that fires when objects are created.
 */
export function useSceneObject(name: string): TorqueObject | undefined {
  const runtime = useRuntime();
  return runtime.getObjectByName(name);
}

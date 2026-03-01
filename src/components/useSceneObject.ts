import type { TorqueObject } from "../torqueScript";
import { useRuntimeObjectByName } from "../state";

/**
 * Look up a scene object by name from the runtime.
 */
export function useSceneObject(name: string): TorqueObject | undefined {
  return useRuntimeObjectByName(name);
}

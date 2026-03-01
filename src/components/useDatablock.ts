import type { TorqueObject } from "../torqueScript";
import { useDatablockByName } from "../state";

/** Look up a datablock by name from runtime state (reactive). */
export function useDatablock(
  name: string | undefined,
): TorqueObject | undefined {
  return useDatablockByName(name);
}

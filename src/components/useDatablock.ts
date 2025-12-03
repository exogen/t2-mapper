import type { TorqueObject } from "../torqueScript";
import { useRuntime } from "./RuntimeProvider";

/**
 * Look up a datablock by name from the runtime. Use with getProperty/getInt/getFloat.
 *
 * FIXME: This is not currently reactive! If new datablocks are defined, this
 * won't find them. We'd need to add an event/subscription system to the runtime
 * that fires when new datablocks are defined. Technically we should do the same
 * for the scene graph.
 */
export function useDatablock(
  name: string | undefined,
): TorqueObject | undefined {
  const runtime = useRuntime();
  if (!name) return undefined;
  return runtime.state.datablocks.get(name);
}

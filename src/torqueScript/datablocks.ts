import type { TorqueObject, TorqueRuntime } from "./types";

/** Native datablock pointer fields accept names, object handles and ids. */
export function resolveDatablock(
  reference: unknown,
  runtime: TorqueRuntime,
): TorqueObject | undefined {
  let object: TorqueObject | undefined;
  if (typeof reference === "object" && reference != null) {
    object = reference as TorqueObject;
  } else if (typeof reference === "number") {
    object = runtime.state.objectsById.get(reference);
  } else if (typeof reference === "string") {
    object = runtime.state.datablocks.get(reference);
    if (!object && /^\d+$/.test(reference)) {
      object = runtime.state.objectsById.get(Number(reference));
    }
  }
  return object?._isDatablock ? object : undefined;
}

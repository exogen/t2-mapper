import type { PlayerReference } from "../../relay/playerReference";

/** Validate the session-storage boundary without trusting arbitrary IDs. */
export function readPlayerReference(value: unknown): PlayerReference | null {
  if (!value || typeof value !== "object") return null;
  const ref = value as Record<string, unknown>;
  if (typeof ref.rawName !== "string") return null;
  if (ref.kind === "name")
    return ref.rawName.trim() &&
      (ref.match === undefined || ref.match === "base")
      ? {
          kind: "name",
          rawName: ref.rawName,
          ...(ref.match === "base" && { match: "base" }),
        }
      : null;
  if (ref.kind !== "player" || typeof ref.scope !== "string") return null;
  for (const key of [
    "clientId",
    "clientGeneration",
    "targetId",
    "targetGeneration",
  ])
    if (
      ref[key] !== undefined &&
      (typeof ref[key] !== "number" ||
        !Number.isSafeInteger(ref[key]) ||
        ref[key] < 0)
    )
      return null;
  if (ref.clientId === undefined && ref.targetId === undefined) return null;
  if (
    ref.guid !== undefined &&
    (typeof ref.guid !== "string" || !/^[1-9]\d*$/.test(ref.guid))
  )
    return null;
  return {
    kind: "player",
    scope: ref.scope,
    rawName: ref.rawName,
    clientId: ref.clientId as number | undefined,
    clientGeneration: ref.clientGeneration as number | undefined,
    targetId: ref.targetId as number | undefined,
    targetGeneration: ref.targetGeneration as number | undefined,
    guid: ref.guid as string | undefined,
  };
}

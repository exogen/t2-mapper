import type { ParsedData } from "t2-demo-parser";

/**
 * Helpers shared between the relay (Node) and the browser stream engine.
 * Keep this file environment-agnostic — no Node- or DOM-only APIs, no
 * imports from src/ — since both sides import from here (the same
 * contract as types.ts and watchSerialize.ts).
 */

/** T2csri auth commands answered with relay-side crypto responses. */
export const AUTH_COMMANDS: readonly string[] = [
  "t2csri_pokeClient",
  "t2csri_getChallengeChunk",
  "t2csri_decryptChallenge",
];

/** Auto-reconnect policy for retryable game-server disconnects. */
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 6000;
const RETRYABLE_REASONS = ["Server is cycling mission"];

export function isRetryableDisconnect(message: string | undefined): boolean {
  return (
    !!message && RETRYABLE_REASONS.some((reason) => message.includes(reason))
  );
}

/** All projectile class names. */
export const projectileClassNames = new Set([
  "BombProjectile",
  "EnergyProjectile",
  "FlareProjectile",
  "GrenadeProjectile",
  "LinearFlareProjectile",
  "LinearProjectile",
  "Projectile",
  "SeekerProjectile",
  "TracerProjectile",
]);

/**
 * Resolve the DTS shape path from a datablock's parsed data.
 * Accepts either a ghost className (e.g. "LinearProjectile") or a datablock
 * className (e.g. "LinearProjectileData") to determine which field holds the
 * shape path.
 */
export function resolveShapeName(
  className: string,
  data: ParsedData | undefined,
): string | undefined {
  if (!data) return undefined;

  let value: unknown;
  if (
    projectileClassNames.has(className) ||
    className.endsWith("ProjectileData")
  ) {
    value = data.projectileShapeName;
  } else {
    // DebrisData's shape also lives in `shapeName` (binary-verified; a
    // previous parser field mislabel required a special case here).
    value = data.shapeName;
  }
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Assemble the datablock list for CRC computation over game shape files
 * (the CRCChallengeEvent response required before mission Phase 2).
 */
export function buildCRCDataBlockList(
  dbMap: Map<number, ParsedData> | undefined,
  classNames: ReadonlyMap<number, string>,
): { objectId: number; className: string; shapeName: string }[] {
  const datablocks: {
    objectId: number;
    className: string;
    shapeName: string;
  }[] = [];
  if (dbMap) {
    for (const [id, block] of dbMap) {
      const className = classNames.get(id);
      if (!className) continue;
      datablocks.push({
        objectId: id,
        className,
        shapeName: resolveShapeName(className, block) ?? "",
      });
    }
  }
  return datablocks;
}

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

/** Remove T2 tagged-string display markup (control bytes like
 *  \x10\x0e…\x11 wrapping player names). */
export function stripTaggedStringMarkup(s: string): string {
  let stripped = "";
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 0x20) stripped += s[i];
  }
  return stripped;
}
/** Emitted when the receive window deadlocks (see gameConnection). */
export const STALLED_DISCONNECT_REASON = "Connection stalled";
const RETRYABLE_REASONS = [
  "Server is cycling mission",
  STALLED_DISCONNECT_REASON,
];

export function isRetryableDisconnect(message: string | undefined): boolean {
  return (
    !!message && RETRYABLE_REASONS.some((reason) => message.includes(reason))
  );
}

/** Whether a disconnect should trigger an auto-reconnect: retryable reason
 *  and the attempt budget isn't exhausted. Callers add their own guard
 *  (watchers present / same address) and own the retry counter. */
export function shouldRetryDisconnect(
  message: string | undefined,
  retryCount: number,
): boolean {
  return isRetryableDisconnect(message) && retryCount < MAX_RETRIES;
}

/** The client-facing "…retrying (n/N)…" status text — one place so the
 *  watcher and player reconnect paths stay identical. `attempt` is the
 *  post-increment count. */
export function retryStatusMessage(reason: string, attempt: number): string {
  return `${reason} — retrying (${attempt}/${MAX_RETRIES})...`;
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

/**
 * A player entry parsed from a live in-game score-HUD line (`SetLineHud`).
 * The relay/browser match `name` to the roster to apply `score`/`kills`.
 */
export interface ScoreHudEntry {
  name: string;
  score: number;
  kills?: number;
}

/**
 * Parse the data args of a `SetLineHud` score-screen line into player
 * entries. `SetLineHud` wire args are `[msgType, "", tag, index, format,
 * d1, d2, d3, d4, …]`; pass the resolved data args (`d1…`) starting at
 * index 5. Two known layouts, distinguished by whether the 3rd value is
 * numeric — both handled so a stock server and a TacoServer/dtStats one
 * parse the same way:
 *   TacoServer CTFHud (1 player/line): d1=name, d2=score, d3=kills, …
 *   stock updateScoreHud (2 players/line): d1=name1, d2=score1, d3=name2, d4=score2
 * Non-player lines (team headers, totals, blanks) yield names that match
 * no roster entry and are dropped by the caller.
 */
export function parseScoreHudLine(dataArgs: string[]): ScoreHudEntry[] {
  const out: ScoreHudEntry[] = [];
  const name1 = stripTaggedStringMarkup(dataArgs[0] ?? "").trim();
  const score1 = parseInt(dataArgs[1] ?? "", 10);
  if (!name1 || isNaN(score1)) return out;
  const third = dataArgs[2] ?? "";
  if (/^-?\d+$/.test(third.trim())) {
    // TacoServer layout: third value is this player's kills.
    out.push({ name: name1, score: score1, kills: parseInt(third, 10) });
  } else {
    out.push({ name: name1, score: score1 });
    const name2 = stripTaggedStringMarkup(third).trim();
    const score2 = parseInt(dataArgs[3] ?? "", 10);
    if (name2 && !isNaN(score2)) out.push({ name: name2, score: score2 });
  }
  return out;
}

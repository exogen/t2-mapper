/**
 * Comparing two upgrades of the same relay recording (upgradeRelayDemo.ts),
 * for replacing an applied upgrade with one made by newer converter code.
 */
import type { RelayDemoUpgrade } from "./upgradeRelayDemo.js";

/**
 * The report fields that place the upgrade's moments on its clock: casts,
 * commentary and the demo's index record are timed by them.
 */
export const TIMING_FIELDS = [
  "cutMs",
  "droppedTicks",
  "droppedRuns",
  "newLengthMs",
] as const satisfies readonly (keyof RelayDemoUpgrade)[];

function formatValue(value: unknown): string {
  if (value === undefined) return "none";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/**
 * The fields two upgrade reports disagree on (all of them, or `fields`),
 * as "field before → after". A field one report lacks counts as 0: older
 * converter code made no such rewrite.
 */
export function upgradeChanges(
  before: RelayDemoUpgrade,
  after: RelayDemoUpgrade,
  fields: readonly string[] = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ],
): string[] {
  const changes: string[] = [];
  for (const field of fields) {
    const a = (before as unknown as Record<string, unknown>)[field];
    const b = (after as unknown as Record<string, unknown>)[field];
    if (JSON.stringify(a ?? 0) === JSON.stringify(b ?? 0)) continue;
    changes.push(`${field} ${formatValue(a)} → ${formatValue(b)}`);
  }
  return changes;
}

/**
 * How a re-upgrade would move the applied upgrade's clock; empty when it
 * keeps every moment where it was.
 */
export function timingChanges(
  applied: RelayDemoUpgrade,
  reupgraded: RelayDemoUpgrade,
): string[] {
  return upgradeChanges(applied, reupgraded, TIMING_FIELDS);
}

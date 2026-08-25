import { findMissionInfo } from "../manifest";
import type { DemoIndexEntry } from "../stream/demoIndex";

/**
 * Coarse length like "56m" or "1h 15m" — deliberately not clock-shaped,
 * so it can't be confused with the recording's time of day.
 */
export function formatDuration(durationMs: number): string {
  const totalMin = Math.round(durationMs / 60_000);
  if (totalMin < 1) return "<1m";
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hours === 0) return `${min}m`;
  return min === 0 ? `${hours}h` : `${hours}h ${min}m`;
}

export function formatRecordedTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function recordedDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The sidecar stores the mission's internal name (e.g. "DX_Ice"); resolve
 * it to the display name ("Dangerous Crossing (Ice)") via the manifest,
 * falling back to the raw name for missions we don't ship.
 */
export function missionDisplayName(mission: string): string {
  return findMissionInfo(mission)?.displayName || mission;
}

export function demoTitle(demo: DemoIndexEntry): string {
  return (
    demo.games.map((game) => missionDisplayName(game.mission)).join(" → ") ||
    "Warmup only"
  );
}

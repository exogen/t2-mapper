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

/**
 * Playhead time like "4:07", growing an hours field only once the demo
 * runs that long.
 */
export function formatPlayheadTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * formatPlayheadTime, but padded to the field width `template` would
 * render at (the demo's duration). The transport label must NEVER change
 * width as the playhead crosses 10 minutes or an hour: the label shares a
 * flex row with the seek bar, so a width change resizes the bar and
 * visibly shifts every percentage-positioned marker on it.
 */
export function formatPlayheadTimeAligned(
  seconds: number,
  template: number,
): string {
  const templateH = Math.floor(template / 3600);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  if (templateH > 0) {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(templateH.toString().length, "0");
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  const templateM = Math.floor(template / 60);
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(templateM.toString().length, "0");
  return `${m}:${s}`;
}

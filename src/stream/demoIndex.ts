/**
 * The published demo index: DEMOS_BASE_URL serves `index.json` (one
 * record per demo, written by the relay's uploader / backfill script)
 * with the `.rec` files alongside it under the same base.
 */
import type { DemoGame, DemoMetadata } from "../../relay/demoRecorder";

/**
 * The index record shape is the relay's sidecar/index record (type-only
 * import — no relay runtime reaches the bundle).
 */
export type DemoIndexEntry = DemoMetadata;
export type DemoIndexGame = DemoGame;

export const DEMOS_BASE_URL = (process.env.DEMOS_BASE_URL || "").replace(
  /\/+$/,
  "",
);

export function demoDownloadUrl(filename: string): string {
  return `${DEMOS_BASE_URL}/${encodeURIComponent(filename)}`;
}

/**
 * Tolerate records written by older relay versions: pre-`games` entries
 * carried top-level {mission, gameType} instead (such demos always
 * described a single started match).
 */
function normalizeEntry(raw: unknown): DemoIndexEntry {
  const entry = raw as DemoIndexEntry & {
    mission?: string;
    gameType?: string;
  };
  const players = Array.isArray(entry.players) ? entry.players : [];
  if (Array.isArray(entry.games)) {
    return { ...entry, players };
  }
  return {
    ...entry,
    players,
    games: entry.mission
      ? [{ mission: entry.mission, gameType: entry.gameType ?? "", startMs: 0 }]
      : [],
  };
}

export async function fetchDemoIndex(): Promise<DemoIndexEntry[]> {
  const response = await fetch(`${DEMOS_BASE_URL}/index.json`);
  if (!response.ok) {
    throw new Error(`Demo index fetch failed: HTTP ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Demo index is not an array");
  }
  return data.map(normalizeEntry);
}

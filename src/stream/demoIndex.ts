/**
 * The published demo index: DEMOS_BASE_URL serves `index.json` (one
 * record per demo, written by the relay's uploader / backfill script)
 * with the `.rec` files alongside it under the same base.
 */
import type { DemoMetadata } from "../../relay/demoRecorder";
import type { CastCommentaryTrack } from "../director/castSidecar";

/**
 * The index record shape is the relay's sidecar/index record (type-only
 * import — no relay runtime reaches the bundle).
 */
export type DemoIndexEntry = DemoMetadata;
/** A commentary track as the cast sidecar lists it. */
export type DemoCommentaryTrack = CastCommentaryTrack;

export const DEMOS_BASE_URL = (process.env.DEMOS_BASE_URL || "").replace(
  /\/+$/,
  "",
);

export function demoDownloadUrl(filename: string): string {
  return `${DEMOS_BASE_URL}/${encodeURIComponent(filename)}`;
}

/**
 * Where a demo's sidecars live: `<name>.rec.cast.json` (which also
 * lists the commentary tracks) and the commentary pairs
 * `[.<suffix>].commentary.json` and `.m4a`, all named after the demo.
 * The bucket keeps them beside the recording; CAST_BASE_URL points
 * somewhere else — a folder the dev server serves — so casts and
 * commentary generated locally can be tried against demos still
 * streamed from R2.
 */
export const CAST_BASE_URL = (
  process.env.CAST_BASE_URL || DEMOS_BASE_URL
).replace(/\/+$/, "");

export type SidecarKind = "cast.json";

/** The sidecar URL for a demo loaded from `sourceUrl`. */
export function sidecarUrl(sourceUrl: string, kind: SidecarKind): string {
  return `${CAST_BASE_URL}/${demoFileName(sourceUrl)}.${kind}`;
}

/**
 * A commentary track's file: `commentary.json` for the default pair,
 * `<suffix>.commentary.json` for a labelled one. `null` is the default
 * pair — what a demo with no track list is assumed to have.
 */
export function commentaryFileName(
  track: Pick<DemoCommentaryTrack, "suffix"> | null,
  ext: "json" | "m4a" | "mp3",
): string {
  const suffix = track?.suffix;
  return `${suffix ? `${suffix}.` : ""}commentary.${ext}`;
}

/** A commentary file's URL for a demo loaded from `sourceUrl`. */
export function commentarySidecarUrl(
  sourceUrl: string,
  track: Pick<DemoCommentaryTrack, "suffix"> | null,
  ext: "json" | "m4a" | "mp3",
): string {
  return `${CAST_BASE_URL}/${demoFileName(sourceUrl)}.${commentaryFileName(track, ext)}`;
}

function demoFileName(sourceUrl: string): string {
  return sourceUrl.slice(sourceUrl.lastIndexOf("/") + 1);
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
    // Coerce `tournament` for records written before it existed.
    const games = entry.games.map((g) => ({
      ...g,
      tournament: g.tournament === true,
    }));
    return { ...entry, players, games };
  }
  return {
    ...entry,
    players,
    games: entry.mission
      ? [
          {
            mission: entry.mission,
            gameType: entry.gameType ?? "",
            startMs: 0,
            tournament: false,
          },
        ]
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

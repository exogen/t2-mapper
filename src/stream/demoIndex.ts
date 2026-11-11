/**
 * The published demo index: DEMOS_BASE_URL serves `index.json` (one
 * record per demo, written by the relay's uploader / backfill script)
 * with the `.rec` files alongside it under the same base.
 */
import { type DemoMetadata, readDemoGames } from "../../relay/demoMetadata";
import {
  encodedDemoKey,
  isUserDemoKey,
  publishedDemoKeyFromUrl,
} from "../../relay/demoKeys";
import { isRelayRecording } from "./demoDate";

import type { CastCommentaryTrack } from "../director/castSidecar";

/** Index entries use the same metadata contract as demo sidecars. */
export type DemoIndexEntry = DemoMetadata;

/**
 * Whether MapGenius recorded a published demo. User uploads never qualify,
 * even when their header names MapGenius as the recorder.
 */
export function isMapGeniusDemo(
  demo: Pick<DemoIndexEntry, "filename" | "recorder">,
): boolean {
  return !isUserDemoKey(demo.filename) && isRelayRecording(demo.recorder);
}

/** Legacy sidecars only have full names; new counts deduplicate tag-less names. */
export function demoPlayerCount(
  demo: Pick<DemoIndexEntry, "players" | "playerCount">,
): number {
  return demo.playerCount ?? demo.players.length;
}
/** A commentary track as the cast sidecar lists it. */
export type DemoCommentaryTrack = CastCommentaryTrack;

export const DEMOS_BASE_URL = (process.env.DEMOS_BASE_URL || "").replace(
  /\/+$/,
  "",
);

export function demoDownloadUrl(filename: string): string {
  return `${DEMOS_BASE_URL}/${encodedDemoKey(filename)}`;
}

/** Escape legacy immutable JSON cache entries while keeping stable cache keys. */
export function versionedDemoMetadataUrl(metadataUrl: string): string {
  if (!DEMOS_BASE_URL) return metadataUrl;
  const origin =
    (globalThis as { location?: { href: string } }).location?.href ??
    "http://localhost/";
  const base = new URL(`${DEMOS_BASE_URL}/`, origin);
  const url = new URL(metadataUrl, origin);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
    return metadataUrl;
  url.searchParams.set("metadata", "2");
  return url.href;
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
  const published = publishedDemoKeyFromUrl(sourceUrl, DEMOS_BASE_URL);
  if (published) return encodedDemoKey(published);
  // Local cast previews may use another base URL, but retain user directories.
  try {
    const path = new URL(sourceUrl, "http://localhost/").pathname;
    const candidate = path
      .split("/")
      .slice(-3)
      .map(decodeURIComponent)
      .join("/");
    if (isUserDemoKey(candidate)) return encodedDemoKey(candidate);
    return path.slice(path.lastIndexOf("/") + 1);
  } catch {
    return sourceUrl.slice(sourceUrl.lastIndexOf("/") + 1);
  }
}

function normalizeEntry(raw: unknown): DemoIndexEntry {
  const entry = raw as DemoIndexEntry & {
    mission?: string;
    gameType?: string;
  };
  const players = Array.isArray(entry.players) ? entry.players : [];
  return {
    ...entry,
    players,
    games: readDemoGames(entry),
  };
}

export async function fetchDemoIndex(
  signal?: AbortSignal,
): Promise<DemoIndexEntry[]> {
  const deadline = AbortSignal.timeout(20_000);
  const response = await fetch(
    versionedDemoMetadataUrl(`${DEMOS_BASE_URL}/index.json`),
    {
      cache: "no-cache",
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    },
  );
  if (!response.ok) {
    throw new Error(`Demo index fetch failed: HTTP ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Demo index is not an array");
  }
  return data.map(normalizeEntry);
}

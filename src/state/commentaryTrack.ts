/**
 * The commentary cue file (`<demo>.commentary.json`, a sidecar like the
 * cast plan), loaded once per demo and shared by everything that reads
 * it: the audio player (where the broadcast begins, where the track's
 * first sample sits on the demo clock) and the subtitle overlay (every
 * line, at its air time).
 */
import { createStore } from "zustand/vanilla";
import {
  commentarySidecarUrl,
  type DemoCommentaryTrack,
} from "../stream/demoIndex";
import { trackKey } from "./commentaryTracksStore";

/**
 * Whether subtitles are actually being shown for the current demo: the
 * setting is on AND a cue file with lines in it was found. Other HUD
 * pieces that would fight for the same screen space (the input
 * overlay) yield only in that case — a demo with no commentary keeps
 * its overlay however the setting is set.
 */
export const subtitlesStore = createStore<{ showing: boolean }>(() => ({
  showing: false,
}));

export interface CommentaryCue {
  /** Demo time the line airs. */
  atSec: number;
  speaker: string;
  text: string;
  kind?: string;
  energy?: string;
}

export interface CommentaryTrack {
  /** In air order. */
  cues: CommentaryCue[];
  /** Demo time at the audio track's first sample: zero for a batch
   *  render, the slice start for a live-loop stitch. */
  audioStartSec: number;
}

const COMMENTARY_FORMAT = "castgenius-commentary";

const loads = new Map<string, Promise<CommentaryTrack | null>>();

/** A track's cue file, or null when it has none. Cached per demo URL
 *  and track; `null` is the unlabelled default pair. */
/** The cache and arming key for a demo plus one of its tracks. */
export function commentaryTrackKey(
  sourceUrl: string,
  track: Pick<DemoCommentaryTrack, "suffix"> | null,
): string {
  return `${sourceUrl}#${track ? trackKey(track) : ""}`;
}

export function loadCommentaryTrack(
  sourceUrl: string,
  track: Pick<DemoCommentaryTrack, "suffix"> | null,
): Promise<CommentaryTrack | null> {
  const key = commentaryTrackKey(sourceUrl, track);
  let load = loads.get(key);
  if (!load) {
    load = fetchTrack(sourceUrl, track).catch(() => null);
    loads.set(key, load);
  }
  return load;
}

async function fetchTrack(
  sourceUrl: string,
  track: Pick<DemoCommentaryTrack, "suffix"> | null,
): Promise<CommentaryTrack | null> {
  const res = await fetch(commentarySidecarUrl(sourceUrl, track, "json"));
  if (!res.ok) return null;
  const doc = (await res.json()) as {
    format?: string;
    cues?: CommentaryCue[];
    livesim?: { audioStartSec?: number };
  };
  if (doc.format !== COMMENTARY_FORMAT || !Array.isArray(doc.cues)) {
    return null;
  }
  const cues = doc.cues
    .filter((c) => typeof c.atSec === "number" && typeof c.text === "string")
    .sort((a, b) => a.atSec - b.atSec);
  return { cues, audioStartSec: doc.livesim?.audioStartSec ?? 0 };
}

/** Words per second the booth is scripted at; a line is on screen for
 *  about as long as it takes to say. */
const SPOKEN_WORDS_PER_SEC = 2.6;
const MIN_ON_SCREEN_SEC = 1.5;
const LINGER_SEC = 0.6;

/** How long a cue stays up, from its air time. */
export function cueDurationSec(cue: CommentaryCue): number {
  const words = cue.text.trim().split(/\s+/).length;
  return Math.max(MIN_ON_SCREEN_SEC, words / SPOKEN_WORDS_PER_SEC + LINGER_SEC);
}

/** The cues on screen at demo time `t`, oldest first. */
export function cuesAt(track: CommentaryTrack, t: number): CommentaryCue[] {
  const out: CommentaryCue[] = [];
  for (const cue of track.cues) {
    if (cue.atSec > t) break;
    if (t < cue.atSec + cueDurationSec(cue)) out.push(cue);
  }
  return out;
}

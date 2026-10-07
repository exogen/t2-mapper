/**
 * Which commentary tracks the loaded demo has, and which one is chosen.
 *
 * The list comes from the cast sidecar (`<demo>.rec.cast.json`,
 * `commentary`), in the order the tracks were generated; the first is
 * what plays unless the viewer picks another. The choice is a
 * per-session whim, not a preference: it is never saved.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { sidecarUrl, type DemoCommentaryTrack } from "../stream/demoIndex";
import {
  commentaryFromSidecar,
  planFromSidecar,
} from "../director/castSidecar";

/** The map key for a track: its suffix, or "" for the default pair. */
export function trackKey(track: Pick<DemoCommentaryTrack, "suffix">): string {
  return track.suffix ?? "";
}

export interface CommentaryTracksState {
  /** The demo the list belongs to. */
  sourceUrl: string | null;
  /** The sidecar lists commentary, or is a legacy cast using the default pair. */
  hasCommentary: boolean;
  tracks: DemoCommentaryTrack[];
  /** `trackKey` of the viewer's pick, or null for the list's first. */
  selectedKey: string | null;
  /**
   * The track to play: the viewer's pick if it is still in the list,
   * else the first listed, else null — the unlabelled default pair a
   * demo with no record is assumed to have.
   */
  selected(): DemoCommentaryTrack | null;
  select(key: string | null): void;
  /** Read the demo's cast sidecar for its track list. */
  load(sourceUrl: string | null): Promise<void>;
}

export const commentaryTracksStore = createStore<CommentaryTracksState>(
  (set, get) => ({
    sourceUrl: null,
    hasCommentary: false,
    tracks: [],
    selectedKey: null,
    selected() {
      const { tracks, selectedKey } = get();
      return (
        (selectedKey != null
          ? tracks.find((t) => trackKey(t) === selectedKey)
          : undefined) ??
        tracks[0] ??
        null
      );
    },
    select(key) {
      set({ selectedKey: key });
    },
    async load(sourceUrl) {
      set({
        sourceUrl,
        hasCommentary: false,
        tracks: [],
        selectedKey: null,
      });
      if (!sourceUrl) return;
      const sidecar = await fetchSidecar(sourceUrl);
      // A newer load wins.
      if (get().sourceUrl === sourceUrl) set(sidecar);
    },
  }),
);

async function fetchSidecar(
  sourceUrl: string,
): Promise<Pick<CommentaryTracksState, "hasCommentary" | "tracks">> {
  try {
    const res = await fetch(sidecarUrl(sourceUrl, "cast.json"));
    if (!res.ok) return { hasCommentary: false, tracks: [] };
    const doc: unknown = await res.json();
    const tracks = commentaryFromSidecar(doc);
    return {
      // Older sidecars predate track lists and use the default audio pair.
      hasCommentary:
        tracks.length > 0 ||
        (planFromSidecar(doc) != null &&
          !Object.hasOwn(doc as object, "commentary") &&
          [1, 2].includes((doc as { version?: number }).version ?? 0)),
      tracks,
    };
  } catch {
    return { hasCommentary: false, tracks: [] };
  }
}

export function useCommentaryTracks<T>(
  selector: (state: CommentaryTracksState) => T,
): T {
  return useStore(commentaryTracksStore, selector);
}

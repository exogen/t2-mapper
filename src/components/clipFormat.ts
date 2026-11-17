import type { ClipView } from "../../relay/clipTypes";
import { demoGameIndexAt } from "../../relay/demoMetadata";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { demoSummary } from "./demoFormat";

/** A clip's match belongs to its starting map, including in multi-map demos. */
export function clipSummary(clip: ClipView, demo?: DemoIndexEntry) {
  const game =
    demo?.games[Math.max(0, demoGameIndexAt(demo.games, clip.startSec * 1000))];
  const { matchTitle, matchups } = demoSummary({ games: game ? [game] : [] });
  return {
    mission: game?.mission ?? "",
    matchTitle,
    matchups,
    createdAt: new Date(clip.createdAt).toISOString(),
    duration:
      clip.durationMs == null
        ? null
        : `${Math.max(1, Math.round(clip.durationMs / 1000))}s`,
  };
}

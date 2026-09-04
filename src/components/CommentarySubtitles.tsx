import { useEffect, useState } from "react";
import { useDemoLoad } from "../state/demoLoadStore";
import { streamClock } from "../state/streamPlaybackStore";
import {
  cuesAt,
  loadCommentaryTrack,
  subtitlesStore,
  type CommentaryCue,
  type CommentaryTrack,
} from "../state/commentaryTrack";
import { useCommentaryTracks } from "../state/commentaryTracksStore";
import { useSettings } from "./SettingsProvider";
import styles from "./CommentarySubtitles.module.css";

/** How often the overlay re-reads the stream clock. */
const TICK_MS = 100;

/**
 * The commentary as subtitles, scheduled off the stream clock from the
 * cue file alone — so a transcript can be checked against playback
 * before any audio for it exists.
 */
export function CommentarySubtitles() {
  const { commentarySubtitles } = useSettings();
  const sourceUrl = useDemoLoad((s) => s.sourceUrl);
  // The chosen track, re-read whenever the list or the pick changes.
  const chosen = useCommentaryTracks((s) => s.selected());
  const [track, setTrack] = useState<CommentaryTrack | null>(null);
  const [cues, setCues] = useState<CommentaryCue[]>([]);

  useEffect(() => {
    setTrack(null);
    subtitlesStore.setState({ showing: false });
    if (!sourceUrl || !commentarySubtitles) return;
    let current = true;
    void loadCommentaryTrack(sourceUrl, chosen).then((loaded) => {
      if (!current) return;
      setTrack(loaded);
      subtitlesStore.setState({ showing: (loaded?.cues.length ?? 0) > 0 });
    });
    return () => {
      current = false;
      subtitlesStore.setState({ showing: false });
    };
  }, [sourceUrl, chosen, commentarySubtitles]);

  useEffect(() => {
    if (!track) {
      setCues([]);
      return;
    }
    const timer = setInterval(() => {
      const next = cuesAt(track, streamClock.time);
      setCues((prev) =>
        prev.length === next.length && prev.every((c, i) => c === next[i])
          ? prev
          : next,
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [track]);

  if (cues.length === 0) return null;
  return (
    <div className={styles.Subtitles} aria-live="polite">
      {cues.map((cue) => (
        <div key={`${cue.atSec}:${cue.speaker}`} className={styles.Line}>
          <span
            className={
              cue.speaker === "rip" ? styles.SpeakerRip : styles.SpeakerDoc
            }
          >
            {cue.speaker.toUpperCase()}
            <span className={styles.Separator}>:</span>
          </span>{" "}
          {cue.text}
        </div>
      ))}
    </div>
  );
}

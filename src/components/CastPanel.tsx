import { useSettings } from "./SettingsProvider";
import { trackKey, useCommentaryTracks } from "../state/commentaryTracksStore";
import styles from "./InspectorControls.module.css";

/**
 * Which of the demo's commentary tracks to play, when it has any. A
 * session choice, not a preference: it is never saved, and a new demo
 * starts on its own first-listed track.
 */
function CommentaryTrackPicker() {
  const tracks = useCommentaryTracks((s) => s.tracks);
  const selected = useCommentaryTracks((s) => s.selected());
  const select = useCommentaryTracks((s) => s.select);
  if (tracks.length < 2) return null;
  return (
    <div className={styles.Field}>
      <label htmlFor="commentaryTrackInput">Commentary track</label>
      <div className={styles.Control}>
        <select
          id="commentaryTrackInput"
          value={selected ? trackKey(selected) : ""}
          onChange={(event) => select(event.target.value)}
        >
          {tracks.map((track) => (
            <option key={trackKey(track)} value={trackKey(track)}>
              {track.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * The demo's cast: commentary playback, subtitles, and which track.
 * Shown only when the demo has a cast sidecar.
 */
function CommentaryPanel() {
  const {
    commentaryEnabled,
    setCommentaryEnabled,
    commentarySubtitles,
    setCommentarySubtitles,
  } = useSettings();
  return (
    <>
      <div className={styles.CheckboxField}>
        <input
          id="commentaryInput"
          type="checkbox"
          checked={commentaryEnabled}
          onChange={(event) => {
            setCommentaryEnabled(event.target.checked);
          }}
        />
        <label className={styles.Label} htmlFor="commentaryInput">
          Play audio commentary
        </label>
      </div>
      <div className={styles.CheckboxField}>
        <input
          id="commentarySubtitlesInput"
          type="checkbox"
          checked={commentarySubtitles}
          onChange={(event) => {
            setCommentarySubtitles(event.target.checked);
          }}
        />
        <label className={styles.Label} htmlFor="commentarySubtitlesInput">
          Show commentary subtitles
        </label>
      </div>
      <CommentaryTrackPicker />
    </>
  );
}

export function CastPanel() {
  const hasCommentary = useCommentaryTracks((s) => s.hasCommentary);
  return hasCommentary ? <CommentaryPanel /> : null;
}

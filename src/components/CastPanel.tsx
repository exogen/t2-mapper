import { Checkbox } from "./Checkbox";
import { useSettings } from "./SettingsProvider";
import { trackKey, useCommentaryTracks } from "../state/commentaryTracksStore";
import { Select } from "./Select";
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
      <label id="commentaryTrackLabel" htmlFor="commentaryTrackInput">
        Commentary track
      </label>
      <div className={styles.Control}>
        <Select
          id="commentaryTrackInput"
          aria-labelledby="commentaryTrackLabel"
          value={selected ? trackKey(selected) : ""}
          onChange={select}
          options={tracks.map((track) => ({
            value: trackKey(track),
            label: track.label,
          }))}
        />
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
        <Checkbox
          id="commentaryInput"
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
        <Checkbox
          id="commentarySubtitlesInput"
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

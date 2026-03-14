import { useKeyboardControls } from "@react-three/drei";
import { Controls } from "./MouseAndKeyboardHandler";
import { useRecording } from "./RecordingProvider";
import styles from "./KeyboardOverlay.module.css";

export function KeyboardOverlay() {
  const recording = useRecording();
  const forward = useKeyboardControls<Controls>((s) => s.forward);
  const backward = useKeyboardControls<Controls>((s) => s.backward);
  const left = useKeyboardControls<Controls>((s) => s.left);
  const right = useKeyboardControls<Controls>((s) => s.right);
  const up = useKeyboardControls<Controls>((s) => s.up);
  const down = useKeyboardControls<Controls>((s) => s.down);
  const lookUp = useKeyboardControls<Controls>((s) => s.lookUp);
  const lookDown = useKeyboardControls<Controls>((s) => s.lookDown);
  const lookLeft = useKeyboardControls<Controls>((s) => s.lookLeft);
  const lookRight = useKeyboardControls<Controls>((s) => s.lookRight);

  // Show when no recording (map browsing) or during live mode.
  // Hidden during demo playback (recording with finite duration).
  if (recording && recording.source !== "live") return null;

  return (
    <div className={styles.Root}>
      <div className={styles.Column}>
        <div className={styles.Row}>
          <div className={styles.Spacer} />
          <div className={styles.Key} data-pressed={forward}>
            W
          </div>
          <div className={styles.Spacer} />
        </div>
        <div className={styles.Row}>
          <div className={styles.Key} data-pressed={left}>
            A
          </div>
          <div className={styles.Key} data-pressed={backward}>
            S
          </div>
          <div className={styles.Key} data-pressed={right}>
            D
          </div>
        </div>
      </div>
      <div className={styles.Column}>
        <div className={styles.Row}>
          <div className={styles.Key} data-pressed={up}>
            <span className={styles.Arrow}>&uarr;</span> Space
          </div>
        </div>
        <div className={styles.Row}>
          <div className={styles.Key} data-pressed={down}>
            <span className={styles.Arrow}>&darr;</span> Shift
          </div>
        </div>
      </div>
      <div className={styles.Column}>
        <div className={styles.Row}>
          <div className={styles.Spacer} />
          <div className={styles.Key} data-pressed={lookUp}>
            &uarr;
          </div>
          <div className={styles.Spacer} />
        </div>
        <div className={styles.Row}>
          <div className={styles.Key} data-pressed={lookLeft}>
            &larr;
          </div>
          <div className={styles.Key} data-pressed={lookDown}>
            &darr;
          </div>
          <div className={styles.Key} data-pressed={lookRight}>
            &rarr;
          </div>
        </div>
      </div>
    </div>
  );
}

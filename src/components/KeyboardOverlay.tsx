import { useKeyboardControls } from "@react-three/drei";
import { type ControlName } from "./MouseAndKeyboardHandler";
import { useRecording } from "./RecordingProvider";
import { useLiveSelector } from "../state/liveConnectionStore";
import styles from "./KeyboardOverlay.module.css";

export function KeyboardOverlay() {
  const recording = useRecording();
  const liveReady = useLiveSelector((s) => s.liveReady);
  const forward = useKeyboardControls<ControlName>((s) => s.forward);
  const backward = useKeyboardControls<ControlName>((s) => s.backward);
  const left = useKeyboardControls<ControlName>((s) => s.left);
  const right = useKeyboardControls<ControlName>((s) => s.right);
  const up = useKeyboardControls<ControlName>((s) => s.up);
  const down = useKeyboardControls<ControlName>((s) => s.down);
  const lookUp = useKeyboardControls<ControlName>((s) => s.lookUp);
  const lookDown = useKeyboardControls<ControlName>((s) => s.lookDown);
  const lookLeft = useKeyboardControls<ControlName>((s) => s.lookLeft);
  const lookRight = useKeyboardControls<ControlName>((s) => s.lookRight);

  // Show when no recording (map browsing) or during live mode once ready.
  // Hidden during demo playback and during live map transitions.
  if (recording && recording.source !== "live") return null;
  if (recording?.source === "live" && !liveReady) return null;

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

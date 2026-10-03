import { useState } from "react";
import { MdFastForward, MdFastRewind } from "react-icons/md";
import { isCurrentPlayback } from "../state/engineStore";
import { useInputAction } from "./InputControls";
import { usePlaybackActions, useRecording } from "./usePlayback";
import styles from "./DemoSeekFeedback.module.css";

export function DemoSeekFeedback() {
  const recording = useRecording();
  const { seekBy } = usePlaybackActions();
  const [flash, setFlash] = useState<{
    id: number;
    seconds: number;
    recording: typeof recording;
  } | null>(null);

  const jump = (seconds: number) => {
    if (
      recording?.source !== "demo" ||
      !Number.isFinite(recording.duration) ||
      !isCurrentPlayback(recording)
    )
      return;
    seekBy(seconds);
    setFlash((previous) => ({
      id: (previous?.id ?? 0) + 1,
      seconds,
      recording,
    }));
  };

  useInputAction("seekBackward", () => jump(-5));
  useInputAction("seekForward", () => jump(5));
  useInputAction("seekBackwardLarge", () => jump(-30));
  useInputAction("seekForwardLarge", () => jump(30));

  if (flash && flash.recording !== recording) setFlash(null);

  const visible = flash != null && flash.recording === recording;
  const Icon = flash && flash.seconds < 0 ? MdFastRewind : MdFastForward;
  return (
    <div className={styles.Root} role="status" aria-atomic="true">
      {visible && (
        <div
          key={flash.id}
          className={styles.Flash}
          onAnimationEnd={() =>
            setFlash((current) => (current === flash ? null : current))
          }
          role="img"
          aria-label={`${flash.seconds < 0 ? "Rewind" : "Forward"} ${Math.abs(flash.seconds)} seconds`}
        >
          <Icon className={styles.Icon} aria-hidden="true" />
          <span className={styles.Amount} aria-hidden="true">
            {flash.seconds < 0 ? "−" : "+"}
            {Math.abs(flash.seconds)}
            <span className={styles.Unit}>s</span>
          </span>
        </div>
      )}
    </div>
  );
}

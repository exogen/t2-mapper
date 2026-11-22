import { GrPauseFill, GrPlayFill } from "react-icons/gr";
import styles from "./PlaybackControls.module.css";

export function PlayPauseIcon({
  seeking,
  playing,
}: {
  seeking: boolean;
  playing: boolean;
}) {
  if (seeking)
    return <span className={styles.PlaySpinner} aria-hidden="true" />;
  return playing ? <GrPauseFill /> : <GrPlayFill />;
}

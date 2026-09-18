import styles from "./ScanProgress.module.css";

/** Shared scanner state for sidebar accordions, which supply no extra padding. */
export function ScanProgress({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className={styles.ProgressWrap}>
      <span className={styles.ProgressLabel}>Scanning… {percent}%</span>
      <div
        className={styles.ProgressBar}
        role="progressbar"
        aria-label="Demo scan progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={styles.ProgressFill}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

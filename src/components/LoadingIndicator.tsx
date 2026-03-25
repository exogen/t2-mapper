import styles from "./LoadingIndicator.module.css";

export function LoadingIndicator({
  isLoading,
  progress = null,
}: {
  isLoading: boolean;
  progress?: number | null;
}) {
  const percent = (progress ?? 0) * 100;

  return (
    <div
      className={styles.LoadingIndicator}
      data-complete={!isLoading}
      data-indeterminate={progress == null}
    >
      <div className={styles.Spinner} />
      <div className={styles.Progress}>
        <div className={styles.ProgressBar} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.ProgressText}>{Math.round(percent)}%</div>
    </div>
  );
}

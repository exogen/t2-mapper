import styles from "./LoadingIndicator.module.css";

export function LoadingIndicator({
  isLoading,
  progress,
}: {
  isLoading: boolean;
  progress: number;
}) {
  return (
    <div className={styles.LoadingIndicator} data-complete={!isLoading}>
      <div className={styles.Spinner} />
      <div className={styles.Progress}>
        <div
          className={styles.ProgressBar}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className={styles.ProgressText}>{Math.round(progress * 100)}%</div>
    </div>
  );
}

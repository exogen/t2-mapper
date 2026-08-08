import styles from "./LoadingIndicator.module.css";

export function LoadingIndicator({
  isLoading,
  progress = null,
  id,
}: {
  isLoading: boolean;
  progress?: number | null;
  id?: string;
}) {
  const percent = (progress ?? 0) * 100;

  return (
    <div
      id={id}
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

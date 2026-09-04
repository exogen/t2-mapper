import styles from "./LoadingIndicator.module.css";

export function LoadingIndicator({
  isLoading,
  progress = null,
  id,
  inline = false,
}: {
  isLoading: boolean;
  progress?: number | null;
  id?: string;
  /**
   * Compact single-row form (small spinner, then the bar filling the
   * rest of the width) that flows in a dialog footer instead of
   * centering itself over the content area.
   */
  inline?: boolean;
}) {
  const percent = (progress ?? 0) * 100;

  return (
    <div
      id={id}
      className={inline ? styles.InlineIndicator : styles.LoadingIndicator}
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

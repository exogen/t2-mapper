import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./GameDialog.module.css";
import spinnerStyles from "./GameDialogSpinner.module.css";

export function GameDialogSpinner({
  onClose,
  contained = false,
}: {
  onClose?: () => void;
  /** Center within the content area (nearest positioned ancestor)
   *  instead of the viewport. */
  contained?: boolean;
}) {
  return (
    <div
      className={contained ? spinnerStyles.ContainedOverlay : styles.Overlay}
      onClick={(event) => {
        onClose?.();
      }}
    >
      <div className={styles.Dialog}>
        <LoadingIndicator isLoading />
      </div>
    </div>
  );
}

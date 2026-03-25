import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./GameDialog.module.css";

export function GameDialogSpinner({ onClose }: { onClose?: () => void }) {
  return (
    <div
      className={styles.Overlay}
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

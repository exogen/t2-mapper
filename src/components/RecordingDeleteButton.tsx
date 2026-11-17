import { LuTrash2 } from "react-icons/lu";
import styles from "./DemoCard.module.css";

export function RecordingDeleteButton({
  kind,
  label,
  deleting,
  onDelete,
}: {
  kind: "demo" | "clip";
  label: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.DeleteButton}
      title={`Delete ${kind}`}
      aria-label={`Delete ${kind}: ${label}`}
      aria-busy={deleting}
      disabled={deleting}
      onClick={onDelete}
    >
      <LuTrash2 aria-hidden />
    </button>
  );
}

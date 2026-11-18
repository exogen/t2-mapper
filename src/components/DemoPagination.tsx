import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import styles from "./DemoPagination.module.css";

export function DemoPagination({
  page,
  pageCount,
  onPageChange,
  label = "Demo pages",
  disabled = false,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className={styles.Root} aria-label={label}>
      <button
        type="button"
        className={styles.Button}
        aria-label="Previous page"
        disabled={disabled || page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        <LuChevronLeft />
      </button>
      <button
        type="button"
        className={styles.Button}
        aria-label="Next page"
        disabled={disabled || page >= pageCount - 1}
        onClick={() => onPageChange(page + 1)}
      >
        <LuChevronRight />
      </button>
    </nav>
  );
}

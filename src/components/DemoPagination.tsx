import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import styles from "./DemoPagination.module.css";

export function DemoPagination({
  page,
  pageCount,
  onPageChange,
  label = "Demo pages",
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className={styles.Root} aria-label={label}>
      <button
        type="button"
        className={styles.Button}
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        <LuChevronLeft />
      </button>
      <button
        type="button"
        className={styles.Button}
        aria-label="Next page"
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(page + 1)}
      >
        <LuChevronRight />
      </button>
    </nav>
  );
}

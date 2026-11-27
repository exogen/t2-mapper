import { Dialog } from "@ariakit/react";
import type { ReactNode } from "react";
import styles from "./ClipControls.module.css";

export function ClipDialog({
  children,
  onClose,
  saving = false,
  label,
  className = "",
}: {
  children: ReactNode;
  onClose(): void;
  saving?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <Dialog
      open
      portal
      backdrop={<div className={styles.DialogBackdrop} />}
      hideOnInteractOutside={false}
      hideOnEscape={!saving}
      className={`${styles.Dialog} ${className}`}
      onClose={onClose}
      aria-label={label}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      {children}
    </Dialog>
  );
}

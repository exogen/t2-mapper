import type { ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import styles from "./PlaybackNotice.module.css";

export function PlaybackNotice({
  failed,
  children,
}: {
  failed: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.Notice} role={failed ? "alert" : "status"}>
      {!failed && <LuLoaderCircle className={styles.Spinner} aria-hidden />}
      {children}
    </div>
  );
}

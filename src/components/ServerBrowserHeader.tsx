import { IoMdRefresh } from "react-icons/io";
import { useLiveSelector } from "../state/liveConnectionStore";
import styles from "./ServerBrowser.module.css";

/**
 * Toolbar header shown while the server browser fills the content area:
 * title, server count, and the refresh button.
 */
export function ServerBrowserHeader({
  title = "Join a Tribes 2 Game",
}: {
  title?: string;
}) {
  const servers = useLiveSelector((s) => s.servers);
  const serversLoading = useLiveSelector((s) => s.serversLoading);
  const listServers = useLiveSelector((s) => s.listServers);

  return (
    <div className={styles.ToolbarHeader}>
      <h2 className={styles.Title}>{title}</h2>
      <span className={styles.ServerCount}>
        {servers.length} server{servers.length !== 1 ? "s" : ""}
      </span>
      <button
        className={styles.RefreshButton}
        onClick={listServers}
        disabled={serversLoading}
        aria-label="Refresh"
      >
        <span className={styles.RefreshLabel}>Refresh</span>
        <IoMdRefresh className={styles.RefreshIcon} aria-hidden />
      </button>
    </div>
  );
}

import { IoMdRefresh } from "react-icons/io";
import { FaList } from "react-icons/fa";
import { BsFillGridFill } from "react-icons/bs";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useSettings } from "./SettingsProvider";
import styles from "./ServerBrowser.module.css";

/**
 * Toolbar header shown while the server browser fills the content area:
 * title, server count, list/tile view toggle, and the refresh button.
 */
export function ServerBrowserHeader({
  title = "Join a Tribes 2 Game",
}: {
  title?: string;
}) {
  const servers = useLiveSelector((s) => s.servers);
  const serversLoading = useLiveSelector((s) => s.serversLoading);
  const listServers = useLiveSelector((s) => s.listServers);
  const { serverBrowserView, setServerBrowserView } = useSettings();

  return (
    <div className={styles.ToolbarHeader}>
      <h2 className={styles.Title}>{title}</h2>
      <span className={styles.ServerCount}>
        {servers.length} server{servers.length !== 1 ? "s" : ""}
      </span>
      <div
        className={styles.ViewToggle}
        role="group"
        aria-label="Browser layout"
      >
        <button
          type="button"
          className={styles.ViewToggleButton}
          data-active={serverBrowserView === "list"}
          title="List view"
          aria-label="List view"
          onClick={() => setServerBrowserView("list")}
        >
          <FaList />
        </button>
        <button
          type="button"
          className={styles.ViewToggleButton}
          data-active={serverBrowserView === "tiles"}
          title="Tile view"
          aria-label="Tile view"
          onClick={() => setServerBrowserView("tiles")}
        >
          <BsFillGridFill />
        </button>
      </div>
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

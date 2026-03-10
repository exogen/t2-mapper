import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ServerInfo } from "../../relay/types";
import styles from "./ServerBrowser.module.css";
export function ServerBrowser({
  open,
  onClose,
  servers,
  loading,
  onRefresh,
  onJoin,
  wsPing,
  warriorName,
  onWarriorNameChange,
}: {
  open: boolean;
  onClose: () => void;
  servers: ServerInfo[];
  loading: boolean;
  onRefresh: () => void;
  onJoin: (address: string) => void;
  /** Browser↔relay RTT to add to server pings for effective latency. */
  wsPing?: number | null;
  warriorName: string;
  onWarriorNameChange: (name: string) => void;
}) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof ServerInfo>("ping");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const dialogRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const didAutoRefreshRef = useRef(false);
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
      try {
        document.exitPointerLock();
      } catch {
        /* expected */
      }
    } else {
      didAutoRefreshRef.current = false;
    }
  }, [open]);
  // Refresh on open if no servers cached
  useEffect(() => {
    if (open && servers.length === 0 && !didAutoRefreshRef.current) {
      didAutoRefreshRef.current = true;
      onRefreshRef.current();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Block keyboard events from reaching Three.js while open
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);
  const handleSort = useCallback(
    (key: keyof ServerInfo) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  const sorted = useMemo(() => {
    return [...servers].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [servers, sortDir, sortKey]);

  const handleJoin = useCallback(() => {
    if (selectedAddress) {
      onJoin(selectedAddress);
      onClose();
    }
  }, [selectedAddress, onJoin, onClose]);

  if (!open) return null;

  return (
    <div className={styles.Overlay} onClick={onClose}>
      <div
        className={styles.Dialog}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.Header}>
          <h2 className={styles.Title}>Server Browser</h2>
          <span className={styles.ServerCount}>
            {servers.length} server{servers.length !== 1 ? "s" : ""}
          </span>
          <button
            className={styles.RefreshButton}
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className={styles.TableWrapper}>
          <table className={styles.Table}>
            <thead>
              <tr>
                <th onClick={() => handleSort("name")}>Server Name</th>
                <th onClick={() => handleSort("playerCount")}>Players</th>
                <th onClick={() => handleSort("ping")}>Ping</th>
                <th onClick={() => handleSort("mapName")}>Map</th>
                <th onClick={() => handleSort("gameType")}>Type</th>
                <th onClick={() => handleSort("mod")}>Mod</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((server) => (
                <tr
                  key={server.address}
                  className={
                    selectedAddress === server.address
                      ? styles.Selected
                      : undefined
                  }
                  onClick={() => setSelectedAddress(server.address)}
                  onDoubleClick={() => {
                    setSelectedAddress(server.address);
                    onJoin(server.address);
                    onClose();
                  }}
                >
                  <td>
                    {server.passwordRequired && (
                      <span className={styles.PasswordIcon}>&#x1F512;</span>
                    )}
                    {server.name}
                  </td>
                  <td>
                    {server.playerCount}/{server.maxPlayers}
                  </td>
                  <td>
                    {wsPing != null
                      ? (server.ping + wsPing).toLocaleString()
                      : "\u2014"}
                  </td>
                  <td>{server.mapName}</td>
                  <td>{server.gameType}</td>
                  <td>{server.mod}</td>
                </tr>
              ))}
              {sorted.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className={styles.Empty}>
                    No servers found
                  </td>
                </tr>
              )}
              {loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.Empty}>
                    Querying master server...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className={styles.Footer}>
          <div className={styles.WarriorField}>
            <label className={styles.WarriorLabel} htmlFor="warriorName">
              Warrior
            </label>
            <input
              id="warriorName"
              className={styles.WarriorInput}
              type="text"
              value={warriorName}
              onChange={(e) => onWarriorNameChange(e.target.value)}
              placeholder="Name thyself…"
              maxLength={24}
            />
          </div>
          <span className={styles.Hint}>Double-click a server to join</span>
          <button onClick={onClose} className={styles.CloseButton}>
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={!selectedAddress}
            className={styles.JoinButton}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

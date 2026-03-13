import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ServerInfo } from "../../relay/types";
import styles from "./ServerBrowser.module.css";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useSettings } from "./SettingsProvider";

export function ServerBrowser({ onClose }: { onClose: () => void }) {
  const servers = useLiveSelector((s) => s.servers);
  const serversLoading = useLiveSelector((s) => s.serversLoading);
  const browserToRelayPing = useLiveSelector((s) => s.browserToRelayPing);
  const listServers = useLiveSelector((s) => s.listServers);
  const joinServer = useLiveSelector((s) => s.joinServer);
  const { warriorName, setWarriorName } = useSettings();
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const handleJoinSelected = () => {
    if (selectedAddress) {
      joinServer(selectedAddress, warriorName);
      onClose();
    }
  };

  const handleJoin = (address: string) => {
    joinServer(address, warriorName);
    onClose();
  };
  const [sortKey, setSortKey] = useState<keyof ServerInfo>("ping");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    try {
      document.exitPointerLock();
    } catch {
      /* expected */
    }
  }, []);

  useEffect(() => {
    listServers();
  }, [listServers]);

  // Block keyboard events from reaching Three.js while open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

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
            onClick={listServers}
            disabled={serversLoading}
          >
            Refresh
          </button>
        </div>
        <div className={styles.TableWrapper}>
          <form name="serverList" onSubmit={handleJoinSelected}>
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
                    onClick={() => {
                      setSelectedAddress(server.address);
                      const form = document.forms["serverList"];
                      const inputs: RadioNodeList =
                        form.elements["serverAddress"];
                      const input = Array.from(inputs).find(
                        (input) => input.value === server.address,
                      );
                      input.focus();
                    }}
                    onDoubleClick={() => {
                      setSelectedAddress(server.address);
                      handleJoin(server.address);
                      onClose();
                    }}
                  >
                    <td>
                      <input
                        type="radio"
                        className={styles.HiddenRadio}
                        name="serverAddress"
                        value={server.address}
                        checked={selectedAddress === server.address}
                        onChange={(event) => {
                          setSelectedAddress(event.target.value);
                        }}
                      />
                      {server.passwordRequired && (
                        <span className={styles.PasswordIcon}>&#x1F512;</span>
                      )}
                      {server.name}
                    </td>
                    <td
                      className={
                        server.playerCount === 0
                          ? styles.EmptyServer
                          : undefined
                      }
                    >
                      {server.playerCount}&thinsp;/&thinsp;{server.maxPlayers}
                    </td>
                    <td>
                      {browserToRelayPing != null
                        ? (server.ping + browserToRelayPing).toLocaleString()
                        : "\u2014"}
                    </td>
                    <td>{server.mapName}</td>
                    <td>{server.gameType}</td>
                    <td>{server.mod}</td>
                  </tr>
                ))}
                {sorted.length === 0 && !serversLoading && (
                  <tr className={styles.Empty}>
                    <td colSpan={6}>No servers found</td>
                  </tr>
                )}
                {serversLoading && sorted.length === 0 && (
                  <tr className={styles.Empty}>
                    <td colSpan={6}>Querying master server…</td>
                  </tr>
                )}
              </tbody>
            </table>
          </form>
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
              onChange={(e) => setWarriorName(e.target.value)}
              placeholder="Name thyself…"
              maxLength={24}
            />
          </div>
          <span className={styles.Hint}>Double-click a server to join</span>
          <div className={styles.Actions}>
            <button onClick={onClose} className={styles.CloseButton}>
              Cancel
            </button>
            <button
              onClick={handleJoinSelected}
              disabled={!selectedAddress}
              className={styles.JoinButton}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

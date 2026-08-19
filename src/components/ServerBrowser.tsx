import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ServerInfo } from "../../relay/types";
import styles from "./ServerBrowser.module.css";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useSettings } from "./SettingsProvider";
import { LuUsers } from "react-icons/lu";
import { IoMdRefresh } from "react-icons/io";

export function ServerBrowser({
  onClose,
  onJoin,
  title = "Server Browser",
  joinLabel = "Join",
  fullScreen = false,
  showWarriorField = true,
  dismissable = true,
}: {
  onClose: () => void;
  /** Override the join action (default: joinServer with warrior name). */
  onJoin?: (address: string) => void;
  title?: string;
  joinLabel?: string;
  /** Fill the viewport instead of rendering as a dialog. */
  fullScreen?: boolean;
  showWarriorField?: boolean;
  /** When false, hide Cancel and ignore Escape/backdrop dismissal. */
  dismissable?: boolean;
}) {
  const servers = useLiveSelector((s) => s.servers);
  const serversLoading = useLiveSelector((s) => s.serversLoading);
  const browserToRelayPing = useLiveSelector((s) => s.browserToRelayPing);
  const listServers = useLiveSelector((s) => s.listServers);
  const joinServer = useLiveSelector((s) => s.joinServer);
  const { warriorName, setWarriorName } = useSettings();
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const handleJoin = (address: string) => {
    if (onJoin) {
      onJoin(address);
    } else {
      joinServer(address, warriorName);
    }
    onClose();
  };

  const handleJoinSelected = () => {
    if (selectedAddress) {
      handleJoin(selectedAddress);
    }
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
      if (e.key === "Escape" && dismissable) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, dismissable]);

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
    <div className={styles.Overlay} onClick={dismissable ? onClose : undefined}>
      <div
        className={fullScreen ? styles.FullScreenDialog : styles.Dialog}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.Header}>
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
        <div className={styles.TableWrapper}>
          <form name="serverList" onSubmit={handleJoinSelected}>
            <table className={styles.Table}>
              <thead>
                <tr>
                  <th data-column="server" onClick={() => handleSort("name")}>
                    Server Name
                  </th>
                  <th
                    data-column="players"
                    onClick={() => handleSort("playerCount")}
                  >
                    <LuUsers
                      className={styles.PlayersIcon}
                      title="Players"
                      aria-label="Players"
                    />
                  </th>
                  <th data-column="ping" onClick={() => handleSort("ping")}>
                    Ping
                  </th>
                  <th data-column="map" onClick={() => handleSort("mapName")}>
                    Map
                  </th>
                  <th
                    data-column="gameType"
                    onClick={() => handleSort("gameType")}
                  >
                    Type
                  </th>
                  <th data-column="mod" onClick={() => handleSort("mod")}>
                    Mod
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((server) => (
                  <tr
                    key={server.address}
                    onClick={() => {
                      setSelectedAddress(server.address);
                      const form = document.forms.namedItem("serverList")!;
                      const inputs = form.elements.namedItem(
                        "serverAddress",
                      ) as RadioNodeList;
                      const input = Array.from(inputs).find(
                        (input) => input.value === server.address,
                      );
                      input!.focus();
                    }}
                    onDoubleClick={() => {
                      setSelectedAddress(server.address);
                      handleJoin(server.address);
                      onClose();
                    }}
                  >
                    <td data-column="server">
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
                      data-column="players"
                    >
                      {server.playerCount}
                      <span className={styles.CompactHidden}>
                        &thinsp;/&thinsp;{server.maxPlayers}
                      </span>
                    </td>
                    <td data-column="ping">
                      {browserToRelayPing != null
                        ? (server.ping + browserToRelayPing).toLocaleString()
                        : "\u2014"}
                    </td>
                    <td data-column="map">{server.mapName}</td>
                    <td data-column="gameType">{server.gameType}</td>
                    <td data-column="mod">{server.mod}</td>
                  </tr>
                ))}
                {/* {sorted.length === 0 && !serversLoading && (
                  <tr className={styles.Empty}>
                    <td colSpan={6}>No servers found</td>
                  </tr>
                )}
                {serversLoading && sorted.length === 0 && (
                  <tr className={styles.Empty}>
                    <td colSpan={6}>Querying master server…</td>
                  </tr>
                )} */}
              </tbody>
            </table>
          </form>
        </div>
        <div className={styles.Footer}>
          {showWarriorField ? (
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
          ) : null}
          <span className={styles.Hint}>
            Double-click a server to {joinLabel.toLowerCase()}
          </span>
          <div className={styles.Actions}>
            {dismissable ? (
              <button onClick={onClose} className={styles.CloseButton}>
                Cancel
              </button>
            ) : null}
            <button
              onClick={handleJoinSelected}
              disabled={!selectedAddress}
              className={styles.JoinButton}
            >
              {joinLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

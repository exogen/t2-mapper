import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ServerInfo } from "../../relay/types";
import styles from "./ServerBrowser.module.css";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useSettings } from "./SettingsProvider";
import { LuUsers } from "react-icons/lu";

/**
 * Server selector panel, filling the content area (not a modal). The
 * title / count / refresh header lives in the toolbar — see
 * ServerBrowserHeader.
 */
export function ServerBrowser({
  onJoin,
  joinLabel = "Join",
  showWarriorField = true,
}: {
  /** Override the join action (default: joinServer with warrior name). */
  onJoin?: (address: string) => void;
  joinLabel?: string;
  showWarriorField?: boolean;
}) {
  const servers = useLiveSelector((s) => s.servers);
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
  };

  const handleJoinSelected = () => {
    if (selectedAddress) {
      handleJoin(selectedAddress);
    }
  };
  const [sortKey, setSortKey] = useState<keyof ServerInfo>("ping");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    try {
      document.exitPointerLock();
    } catch {
      /* expected */
    }
  }, []);

  useEffect(() => {
    listServers();
  }, [listServers]);

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
    <div className={styles.Panel} ref={panelRef} tabIndex={-1}>
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
                      server.playerCount === 0 ? styles.EmptyServer : undefined
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
                      : "—"}
                  </td>
                  <td data-column="map">{server.mapName}</td>
                  <td data-column="gameType">{server.gameType}</td>
                  <td data-column="mod">{server.mod}</td>
                </tr>
              ))}
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
        <div className={styles.Actions}>
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
  );
}

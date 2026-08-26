import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ServerInfo } from "../../relay/types";
import styles from "./ServerBrowser.module.css";
import tileStyles from "./PreviewTile.module.css";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { useSettings } from "./SettingsProvider";
import { LuUsers } from "react-icons/lu";
import { TbLaurelWreathFilled } from "react-icons/tb";
import { BsPinAngleFill } from "react-icons/bs";
import { WifiSignalIcon } from "./WifiSignalIcon";
import { normalizeMissionType } from "../mission";
import { mapNameGalleryArtUrl, mapNameLoadScreenUrl } from "./missionPreview";
import { PreviewTileArt } from "./PreviewTileArt";

function ServerTile({
  server,
  ping,
  pingMs,
  selected,
  onSelect,
  onJoin,
}: {
  server: ServerInfo;
  ping: string;
  /** Numeric total ping for quality coloring, or null when unknown. */
  pingMs: number | null;
  selected: boolean;
  onSelect: () => void;
  onJoin: () => void;
}) {
  const hasHumans = server.playerCount - server.botCount > 0;
  // Same thresholds as the toolbar's connection indicator.
  const pingQuality =
    pingMs == null
      ? undefined
      : pingMs < 150
        ? "good"
        : pingMs < 300
          ? "fine"
          : "poor";
  return (
    <button
      type="button"
      className={tileStyles.Tile}
      data-selected={selected}
      onClick={onSelect}
      onDoubleClick={onJoin}
    >
      {/* Local load-screen art, then the t2-maps gallery screenshot (a
          fetch decides if it exists), then the generic background. */}
      <PreviewTileArt
        variant="server"
        candidates={[
          mapNameLoadScreenUrl(server.mapName),
          mapNameGalleryArtUrl(server.mapName),
        ]}
      >
        {server.isPatrolled && (
          <span
            className={styles.TilePinIcon}
            title="Patrolled server"
            aria-label="Patrolled server"
          >
            <BsPinAngleFill />
          </span>
        )}
      </PreviewTileArt>
      <span className={tileStyles.TileBody}>
        <span className={tileStyles.TileTitle}>
          {server.passwordRequired && (
            <span className={styles.PasswordIcon}>&#x1F512;</span>
          )}
          <span className={tileStyles.TileServerName}>{server.name}</span>
        </span>
        <span className={tileStyles.TileMission}>
          <span className={tileStyles.TileMapName}>{server.mapName}</span>
          {server.gameType && (
            <span
              className={tileStyles.TileTag}
              data-mission-type={normalizeMissionType(server.gameType)}
            >
              {normalizeMissionType(server.gameType)}
            </span>
          )}
          {server.tournament && (
            <TbLaurelWreathFilled
              className={tileStyles.TileTournamentIcon}
              title="Tournament mode"
              aria-label="Tournament mode"
            />
          )}
        </span>
        <span className={tileStyles.TileMeta}>
          {server.mod && (
            <>
              <span className={styles.TileMod}>{server.mod}</span> ·{" "}
            </>
          )}
          <WifiSignalIcon
            className={styles.TilePingIcon}
            data-quality={pingQuality}
            aria-label="Ping"
          />{" "}
          {ping} ms ·{" "}
          <span className={hasHumans ? styles.TileHumanPlayers : undefined}>
            <LuUsers className={tileStyles.TileMetaIcon} aria-label="Players" />{" "}
            {server.playerCount}
          </span>
          &thinsp;/&thinsp;{server.maxPlayers} players
          {server.botCount > 0 ? <> ({server.botCount} bots)</> : null}
        </span>
      </span>
    </button>
  );
}

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
  const liveBrowserToRelayPing = useLiveSelector((s) => s.browserToRelayPing);
  const listServers = useLiveSelector((s) => s.listServers);
  const joinServer = useLiveSelector((s) => s.joinServer);
  const { warriorName, setWarriorName, serverBrowserView } = useSettings();
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
      // Patrolled servers always sort first, regardless of the column.
      if (a.isPatrolled !== b.isPatrolled) return a.isPatrolled ? -1 : 1;
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [servers, sortDir, sortKey]);

  // The WS ping keeps re-measuring in the background; latch the value so
  // displayed pings only change on a list (re)fetch — rows/tiles must
  // never churn without user interaction. Also fills in once when the
  // first measurement lands after the list ("—" → value).
  const [browserToRelayPing, setBrowserToRelayPing] = useState(
    liveBrowserToRelayPing,
  );
  useEffect(() => {
    setBrowserToRelayPing(liveConnectionStore.getState().browserToRelayPing);
  }, [servers]);
  useEffect(() => {
    if (browserToRelayPing == null && liveBrowserToRelayPing != null) {
      setBrowserToRelayPing(liveBrowserToRelayPing);
    }
  }, [browserToRelayPing, liveBrowserToRelayPing]);

  const formatPing = (server: ServerInfo) =>
    browserToRelayPing != null
      ? (server.ping + browserToRelayPing).toLocaleString()
      : "—";

  const footer = (
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
  );

  if (serverBrowserView === "tiles") {
    return (
      <div className={styles.Panel} ref={panelRef} tabIndex={-1}>
        <div className={styles.TileWrapper}>
          <div className={styles.TileGrid}>
            {sorted.map((server) => (
              <ServerTile
                key={server.address}
                server={server}
                ping={formatPing(server)}
                pingMs={
                  browserToRelayPing != null
                    ? server.ping + browserToRelayPing
                    : null
                }
                selected={selectedAddress === server.address}
                onSelect={() => setSelectedAddress(server.address)}
                onJoin={() => {
                  setSelectedAddress(server.address);
                  handleJoin(server.address);
                }}
              />
            ))}
          </div>
        </div>
        {footer}
      </div>
    );
  }

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
                    {server.isPatrolled && (
                      <span
                        className={styles.PinIcon}
                        title="Patrolled server"
                        aria-label="Patrolled server"
                      >
                        <BsPinAngleFill />
                      </span>
                    )}
                    {server.passwordRequired && (
                      <span className={styles.PasswordIcon}>&#x1F512;</span>
                    )}
                    {server.name}
                    {server.tournament && (
                      <span
                        className={styles.TournamentIcon}
                        title="Tournament mode"
                        aria-label="Tournament mode"
                      >
                        <TbLaurelWreathFilled />
                      </span>
                    )}
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
                  <td data-column="ping">{formatPing(server)}</td>
                  <td data-column="map">{server.mapName}</td>
                  <td data-column="gameType">{server.gameType}</td>
                  <td data-column="mod">{server.mod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </form>
      </div>
      {footer}
    </div>
  );
}

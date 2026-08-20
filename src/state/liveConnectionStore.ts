import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createLogger } from "../logger";
import { RelayClient } from "../stream/relayClient";
import { LiveStreamAdapter } from "../stream/liveStreaming";
import { gameEntityStore } from "./gameEntityStore";
import type {
  ClientMove,
  ServerInfo,
  ConnectionStatus,
  WatchStatus,
} from "../../relay/types";

const log = createLogger("liveConnectionStore");

export interface LiveConnectionState {
  relayConnected: boolean;
  gameStatus: ConnectionStatus | null;
  gameStatusMessage?: string;
  /** Mission name from the server (updated on map cycle). */
  mapName?: string;
  /** Display name of the joined server. */
  serverName?: string;
  /** Relay↔T2 server RTT in ms. */
  relayToGameServerPing: number | null;
  /** Browser↔relay WebSocket RTT in ms. */
  browserToRelayPing: number | null;
  /** URL of the connected relay (distinguishes local dev vs deployed). */
  relayUrl: string | null;
  /** Address (ip:port) of the joined game server. */
  serverAddress: string | null;
  servers: ServerInfo[];
  serversLoading: boolean;
  adapter: LiveStreamAdapter | null;
  /** True once the first ghost entity arrives (game is rendering). */
  liveReady: boolean;
  /** Warrior name used when joining the server. */
  warriorName?: string;
  /** How this socket is using the relay (first join/watch claims it). */
  role: "player" | "watcher" | null;
  /** Watch-session status (watcher role only). */
  watchStatus: WatchStatus | null;
  watchStatusMessage?: string;
  /** Why the last session ended — drives the disconnect messaging. */
  disconnectReason: "voluntary" | "ended" | null;
  /** Number of watchers on the shared session (including us). */
  watcherCount: number;
  /** Catch-up download progress in [0, 1], or null when not syncing. */
  catchupProgress: number | null;
}

export interface LiveConnectionStore extends LiveConnectionState {
  // Non-reactive refs.
  _relay: RelayClient | null;
  _adapter: LiveStreamAdapter | null;
  _pending: Array<() => void>;
  _listInFlight: boolean;

  connectRelay(url?: string): void;
  disconnectRelay(): void;
  listServers(): void;
  joinServer(address: string, warriorName?: string): void;
  watchServer(address: string): void;
  leaveServer(): void;
  disconnectServer(): void;
  sendMoves(moves: ClientMove[], moveStartIndex: number): void;
  sendCommand(command: string, ...args: string[]): void;
}

const DEFAULT_RELAY_URL = process.env.RELAY_URL || "ws://localhost:8765";

export const liveConnectionStore = createStore<LiveConnectionStore>(
  (set, get) => ({
    relayConnected: false,
    gameStatus: null,
    gameStatusMessage: undefined,
    mapName: undefined,
    serverName: undefined,
    relayToGameServerPing: null,
    browserToRelayPing: null,
    relayUrl: null,
    serverAddress: null,
    servers: [],
    serversLoading: false,
    adapter: null,
    liveReady: false,
    role: null,
    watchStatus: null,
    watchStatusMessage: undefined,
    disconnectReason: null,
    watcherCount: 0,
    catchupProgress: null,

    _relay: null,
    _adapter: null,
    _pending: [],
    _listInFlight: false,

    connectRelay(url = DEFAULT_RELAY_URL) {
      const s = get();
      if (s._relay) {
        s._relay.close();
      }

      const relay = new RelayClient(url, {
        onOpen() {
          set({ relayConnected: true });
          const s = get();
          for (const fn of s._pending) fn();
          s._pending = [];
        },
        onStatus(status, message, statusMapName) {
          log.info(
            "game status: %s%s%s",
            status,
            message ? ` — ${message}` : "",
            statusMapName ? ` map=${statusMapName}` : "",
          );
          set({
            gameStatus: status,
            gameStatusMessage: message,
            ...(statusMapName ? { mapName: statusMapName } : {}),
          });
        },
        onServerList(list) {
          get()._listInFlight = false;
          set({ servers: list, serversLoading: false });
        },
        onGamePacket(data) {
          const a = get()._adapter;
          if (!a) {
            log.warn("received game packet but no adapter is active");
          }
          a?.feedPacket(data);
        },
        onPing(ms) {
          set({ relayToGameServerPing: ms });
        },
        onWsPing(ms) {
          set({ browserToRelayPing: ms });
        },
        onSessionStatus(status, message, info, watcherCount) {
          log.info(
            "session status: %s%s map=%s watchers=%d",
            status,
            message ? ` — ${message}` : "",
            info.mapName ?? "?",
            watcherCount,
          );
          set({
            watchStatus: status,
            watchStatusMessage: message,
            watcherCount,
            ...(status === "ended"
              ? { disconnectReason: "ended" as const }
              : {}),
            ...(info.mapName ? { mapName: info.mapName } : {}),
            ...(info.serverName ? { serverName: info.serverName } : {}),
            ...(status !== "syncing" ? { catchupProgress: null } : {}),
          });
        },
        onWatcherCount(count) {
          set({ watcherCount: count });
        },
        onCatchupProgress(receivedBytes, totalBytes) {
          set({
            catchupProgress: totalBytes > 0 ? receivedBytes / totalBytes : 0,
          });
        },
        onCatchup(payload) {
          const a = get()._adapter;
          if (!a) {
            log.warn("received catch-up payload but no adapter is active");
            return;
          }
          set({ liveReady: false });
          a.hydrate(payload);
        },
        onError(message) {
          log.error("error: %s", message);
          get()._listInFlight = false;
          set({ serversLoading: false });
        },
        onClose() {
          const s = get();
          if (s._relay === relay) {
            s._relay = null;
            s._adapter = null;
            s._pending = [];
            s._listInFlight = false;
            // A socket loss during an active session is involuntary;
            // voluntary paths set their reason before closing.
            const sessionWasLive =
              (s.watchStatus !== null && s.watchStatus !== "ended") ||
              s.gameStatus === "connected";
            set({
              disconnectReason:
                s.disconnectReason ?? (sessionWasLive ? "ended" : null),
              relayConnected: false,
              gameStatus: null,
              gameStatusMessage: undefined,
              mapName: undefined,
              serverName: undefined,
              relayToGameServerPing: null,
              browserToRelayPing: null,
              relayUrl: null,
              serverAddress: null,
              adapter: null,
              liveReady: false,
              role: null,
              watchStatus: null,
              watchStatusMessage: undefined,
              watcherCount: 0,
              catchupProgress: null,
            });
          }
        },
      });

      relay.connect();
      get()._relay = relay;
      set({ relayUrl: url });
    },

    disconnectRelay() {
      const s = get();
      s._relay?.close();
      s._relay = null;
      s._adapter = null;
      s._pending = [];
      s._listInFlight = false;
      set({
        relayConnected: false,
        gameStatus: null,
        gameStatusMessage: undefined,
        mapName: undefined,
        serverName: undefined,
        relayToGameServerPing: null,
        browserToRelayPing: null,
        relayUrl: null,
        serverAddress: null,
        adapter: null,
        liveReady: false,
        role: null,
        watchStatus: null,
        watchStatusMessage: undefined,
        watcherCount: 0,
        catchupProgress: null,
      });
    },

    listServers() {
      const s = get();
      if (s._listInFlight) return;
      s._listInFlight = true;

      const doList = () => {
        const s = get();
        s._relay?.sendWsPing();
        s._relay?.listServers();
      };

      set({ serversLoading: true });

      if (s._relay?.connected) {
        doList();
      } else {
        s._pending.push(doList);
        if (!s._relay) {
          get().connectRelay();
        }
      }
    },

    joinServer(address, warriorName) {
      const s = get();
      if (!s._relay) return;

      const cachedServer = s.servers.find((sv) => sv.address === address);
      const newAdapter = new LiveStreamAdapter(s._relay);
      newAdapter.onReady = () => set({ liveReady: true });
      newAdapter.onMissionChange = (missionName) => {
        log.info("mission changed: %s", missionName);
        set({ mapName: missionName, liveReady: false });
        // Set the new mission name and clear stale fields — they'll be
        // re-populated when MsgClientReady / MsgMissionDropInfo arrive.
        gameEntityStore.getState().setMissionInfo({
          missionName,
          missionType: null,
          missionTypeDisplayName: null,
          missionDisplayName: null,
          gameClassName: null,
        });
      };
      newAdapter.onMissionInfoChange = () => {
        gameEntityStore.getState().setMissionInfo({
          missionDisplayName: newAdapter.missionDisplayName ?? undefined,
          missionTypeDisplayName:
            newAdapter.missionTypeDisplayName ?? undefined,
          gameClassName: newAdapter.gameClassName ?? undefined,
          serverDisplayName: newAdapter.serverDisplayName ?? undefined,
          // connectedPlayerName is derived from the control object's target
          // info, which reflects the server-assigned name (not warriorName).
          recorderName: newAdapter.connectedPlayerName ?? undefined,
        });
      };
      s._adapter = newAdapter;

      set({
        mapName: cachedServer?.mapName ?? s.mapName,
        serverName: cachedServer?.name,
        serverAddress: address,
        warriorName,
        liveReady: false,
        gameStatus: null,
        adapter: newAdapter,
        role: "player",
        disconnectReason: null,
      });

      // Set initial mission info from the server browser's cached data.
      gameEntityStore.getState().setMissionInfo({
        missionName: cachedServer?.mapName ?? undefined,
        missionTypeDisplayName: cachedServer?.gameType ?? undefined,
        serverDisplayName: cachedServer?.name ?? undefined,
        recorderName: warriorName ?? undefined,
      });

      s._relay.joinServer(address, warriorName);
    },

    watchServer(address) {
      const s = get();
      if (!s._relay) return;

      const cachedServer = s.servers.find((sv) => sv.address === address);
      const newAdapter = new LiveStreamAdapter(s._relay, { mode: "watch" });
      newAdapter.onReady = () => set({ liveReady: true });
      newAdapter.onMissionChange = (missionName) => {
        log.info("mission changed: %s", missionName);
        set({ mapName: missionName, liveReady: false });
        gameEntityStore.getState().setMissionInfo({
          missionName,
          missionType: null,
          missionTypeDisplayName: null,
          missionDisplayName: null,
          gameClassName: null,
        });
      };
      newAdapter.onMissionInfoChange = () => {
        gameEntityStore.getState().setMissionInfo({
          missionDisplayName: newAdapter.missionDisplayName ?? undefined,
          missionTypeDisplayName:
            newAdapter.missionTypeDisplayName ?? undefined,
          gameClassName: newAdapter.gameClassName ?? undefined,
          serverDisplayName: newAdapter.serverDisplayName ?? undefined,
        });
      };
      s._adapter = newAdapter;

      set({
        mapName: cachedServer?.mapName ?? s.mapName,
        serverName: cachedServer?.name,
        serverAddress: address,
        liveReady: false,
        gameStatus: null,
        adapter: newAdapter,
        role: "watcher",
        watchStatus: "connecting",
        watchStatusMessage: undefined,
        disconnectReason: null,
        watcherCount: 0,
        catchupProgress: null,
      });

      gameEntityStore.getState().setMissionInfo({
        missionName: cachedServer?.mapName ?? undefined,
        missionTypeDisplayName: cachedServer?.gameType ?? undefined,
        serverDisplayName: cachedServer?.name ?? undefined,
      });

      s._relay.watchServer(address);
    },

    leaveServer() {
      const s = get();
      // Only an actual departure records a reason — leaveServer is also
      // called as a no-op safety net when no session exists.
      const hadSession = s.watchStatus !== null || s.role !== null;
      s._relay?.leaveServer();
      s._adapter = null;
      set({
        adapter: null,
        liveReady: false,
        serverAddress: null,
        serverName: undefined,
        mapName: undefined,
        watchStatus: null,
        watchStatusMessage: undefined,
        ...(hadSession ? { disconnectReason: "voluntary" as const } : {}),
        watcherCount: 0,
        catchupProgress: null,
        role: null,
      });
    },

    disconnectServer() {
      if (get().gameStatus === "connected") {
        set({ disconnectReason: "voluntary" });
      }
      // Close the WebSocket — the relay's ws.on("close") handler will
      // automatically send the disconnect packet to the game server.
      get().disconnectRelay();
    },

    sendMoves(moves, moveStartIndex) {
      // Watchers never send moves — the shared session has no driver.
      if (get().role === "watcher") return;
      get()._relay?.sendMoves(moves, moveStartIndex);
    },

    sendCommand(command, ...args) {
      // Watchers are read-only spectators except for chat (sent through
      // the relay's shared identity); the relay drops anything else
      // anyway, but don't even send it.
      if (get().role === "watcher" && command !== "messageSent") return;
      get()._relay?.sendCommand(command, args);
    },
  }),
);

/** Select state from the live connection store with optional equality fn. */
export function useLiveSelector<T>(
  selector: (state: LiveConnectionStore) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(liveConnectionStore, selector, equality);
}

/** Effective RTT to the game server (relay↔T2 + browser↔relay). */
export function selectPing(s: LiveConnectionStore): number | null {
  return s.relayToGameServerPing != null && s.browserToRelayPing != null
    ? s.relayToGameServerPing + s.browserToRelayPing
    : (s.relayToGameServerPing ?? null);
}

/** Dispose the relay connection (for cleanup on unmount). */
export function disposeLiveConnection(): void {
  const s = liveConnectionStore.getState();
  s._relay?.close();
  s._relay = null;
}

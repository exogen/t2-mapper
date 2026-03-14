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
  servers: ServerInfo[];
  serversLoading: boolean;
  adapter: LiveStreamAdapter | null;
  /** True once the first ghost entity arrives (game is rendering). */
  liveReady: boolean;
  /** Warrior name used when joining the server. */
  warriorName?: string;
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
  disconnectServer(): void;
  sendMoves(moves: ClientMove[], moveStartIndex: number): void;
  sendCommand(command: string, ...args: string[]): void;
}

const DEFAULT_RELAY_URL =
  import.meta.env.NEXT_PUBLIC_RELAY_URL || "ws://localhost:8765";

export const liveConnectionStore = createStore<LiveConnectionStore>(
  (set, get) => ({
    relayConnected: false,
    gameStatus: null,
    gameStatusMessage: undefined,
    mapName: undefined,
    serverName: undefined,
    relayToGameServerPing: null,
    browserToRelayPing: null,
    servers: [],
    serversLoading: false,
    adapter: null,
    liveReady: false,

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
        onStatus(status, message, _connectSequence, statusMapName) {
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
            set({
              relayConnected: false,
              gameStatus: null,
              gameStatusMessage: undefined,
              mapName: undefined,
              serverName: undefined,
              relayToGameServerPing: null,
              browserToRelayPing: null,
              adapter: null,
              liveReady: false,
            });
          }
        },
      });

      relay.connect();
      get()._relay = relay;
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
        adapter: null,
        liveReady: false,
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
        warriorName,
        liveReady: false,
        gameStatus: null,
        adapter: newAdapter,
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

    disconnectServer() {
      const s = get();
      s._relay?.disconnectServer();
      s._adapter = null;
      set({
        adapter: null,
        liveReady: false,
        gameStatus: null,
        mapName: undefined,
        serverName: undefined,
        relayToGameServerPing: null,
      });
    },

    sendMoves(moves, moveStartIndex) {
      get()._relay?.sendMoves(moves, moveStartIndex);
    },

    sendCommand(command, ...args) {
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

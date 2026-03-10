import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { RelayClient } from "../stream/relayClient";
import { LiveStreamAdapter } from "../stream/liveStreaming";
import type {
  ClientMove,
  ServerInfo,
  ConnectionStatus,
} from "../../relay/types";

export interface LiveConnectionState {
  relayConnected: boolean;
  gameStatus: ConnectionStatus | null;
  gameStatusMessage?: string;
  /** Map name from the server being joined (from GameInfoResponse or status). */
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
  sendMove(move: ClientMove): void;
  sendCommand(command: string, ...args: string[]): void;
}

const DEFAULT_RELAY_URL =
  process.env.NEXT_PUBLIC_RELAY_URL || "ws://localhost:8765";

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
          console.log(
            `[relay] game status: ${status}${message ? ` — ${message}` : ""}${statusMapName ? ` map=${statusMapName}` : ""}`,
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
            console.warn(
              "[relay] received game packet but no adapter is active",
            );
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
          console.error("Relay error:", message);
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
      s._adapter = newAdapter;

      set({
        mapName: cachedServer?.mapName ?? s.mapName,
        serverName: cachedServer?.name,
        liveReady: false,
        gameStatus: null,
        adapter: newAdapter,
      });

      s._relay.joinServer(address, warriorName);
    },

    disconnectServer() {
      const s = get();
      s._relay?.disconnectServer();
      s._adapter?.reset();
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

    sendMove(move) {
      get()._relay?.sendMove(move);
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
    : s.relayToGameServerPing ?? null;
}

/** Dispose the relay connection (for cleanup on unmount). */
export function disposeLiveConnection(): void {
  const s = liveConnectionStore.getState();
  s._relay?.close();
  s._relay = null;
}

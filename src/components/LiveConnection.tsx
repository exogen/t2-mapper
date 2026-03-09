import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { RelayClient } from "../stream/relayClient";
import { LiveStreamAdapter } from "../stream/liveStreaming";
import type {
  ClientMove,
  ServerInfo,
  ConnectionStatus,
} from "../../relay/types";

interface LiveConnectionState {
  relayConnected: boolean;
  gameStatus: ConnectionStatus | null;
  gameStatusMessage?: string;
  /** Map name from the server being joined (from GameInfoResponse or status). */
  mapName?: string;
  /** Effective RTT to the game server (relay↔T2 + browser↔relay). */
  ping: number | null;
  /** Browser↔relay WebSocket RTT in ms. */
  wsPing: number | null;
  servers: ServerInfo[];
  serversLoading: boolean;
  adapter: LiveStreamAdapter | null;
  /** True once the first ghost entity arrives (game is rendering). */
  liveReady: boolean;
}

interface LiveConnectionActions {
  connectRelay: (url?: string) => void;
  disconnectRelay: () => void;
  listServers: () => void;
  joinServer: (address: string) => void;
  disconnectServer: () => void;
  sendMove: (move: ClientMove) => void;
  sendCommand: (command: string, ...args: string[]) => void;
}

const LiveConnectionContext = createContext<
  (LiveConnectionState & LiveConnectionActions) | null
>(null);

export function useLiveConnection() {
  const ctx = useContext(LiveConnectionContext);
  if (!ctx) {
    throw new Error("useLiveConnection must be used within LiveConnectionProvider");
  }
  return ctx;
}

export function useLiveConnectionOptional() {
  return useContext(LiveConnectionContext);
}

const DEFAULT_RELAY_URL =
  process.env.NEXT_PUBLIC_RELAY_URL || "ws://localhost:8765";

export function LiveConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const relayRef = useRef<RelayClient | null>(null);
  const adapterRef = useRef<LiveStreamAdapter | null>(null);
  // Queue of actions to run once the relay WebSocket opens.
  const pendingRef = useRef<Array<() => void>>([]);
  const listInFlightRef = useRef(false);

  const [relayConnected, setRelayConnected] = useState(false);
  const [gameStatus, setGameStatus] = useState<ConnectionStatus | null>(null);
  const [gameStatusMessage, setGameStatusMessage] = useState<
    string | undefined
  >();
  const [mapName, setMapName] = useState<string | undefined>();
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [adapter, setAdapter] = useState<LiveStreamAdapter | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [relayPing, setRelayPing] = useState<number | null>(null);
  const [wsPing, setWsPing] = useState<number | null>(null);

  const connectRelay = useCallback((url: string = DEFAULT_RELAY_URL) => {
    if (relayRef.current) {
      relayRef.current.close();
      relayRef.current = null;
    }

    const relay = new RelayClient(url, {
      onOpen() {
        setRelayConnected(true);
        // Flush any queued actions (e.g. listServers called before open).
        for (const fn of pendingRef.current) fn();
        pendingRef.current = [];
      },
      onStatus(status, message, _connectSequence, statusMapName) {
        console.log(
          `[relay] game status: ${status}${message ? ` — ${message}` : ""}${statusMapName ? ` map=${statusMapName}` : ""}`,
        );
        setGameStatus(status);
        setGameStatusMessage(message);
        if (statusMapName) {
          setMapName(statusMapName);
        }
      },
      onServerList(list) {
        setServers(list);
        setServersLoading(false);
        listInFlightRef.current = false;
      },
      onGamePacket(data) {
        if (!adapterRef.current) {
          console.warn("[relay] received game packet but no adapter is active");
        }
        adapterRef.current?.feedPacket(data);
      },
      onPing(ms) {
        setRelayPing(ms);
      },
      onWsPing(ms) {
        setWsPing(ms);
      },
      onError(message) {
        console.error("Relay error:", message);
        setServersLoading(false);
        listInFlightRef.current = false;
      },
      onClose() {
        // Only update state if this is still the active relay.
        if (relayRef.current === relay) {
          relayRef.current = null;
          setRelayConnected(false);
          setGameStatus(null);
          setMapName(undefined);
          setRelayPing(null);
          setWsPing(null);
          setAdapter(null);
          setLiveReady(false);
          adapterRef.current = null;
          pendingRef.current = [];
          listInFlightRef.current = false;
        }
      },
    });

    relay.connect();
    relayRef.current = relay;
  }, []);

  const disconnectRelay = useCallback(() => {
    relayRef.current?.close();
    relayRef.current = null;
    adapterRef.current = null;
    pendingRef.current = [];
    setRelayConnected(false);
    setGameStatus(null);
    setMapName(undefined);
    setAdapter(null);
    setLiveReady(false);
  }, []);

  const listServers = useCallback(() => {
    if (listInFlightRef.current) return;
    listInFlightRef.current = true;

    const doList = () => {
      relayRef.current?.sendWsPing();
      relayRef.current?.listServers();
    };

    setServersLoading(true);

    if (relayRef.current?.connected) {
      doList();
    } else {
      // Connect first, then list once the socket opens.
      pendingRef.current.push(doList);
      if (!relayRef.current) {
        connectRelay();
      }
    }
  }, [connectRelay]);

  const joinServer = useCallback((address: string) => {
    if (!relayRef.current) return;

    // Set mapName from the cached server list immediately so the browser
    // can start loading the mission before the relay even connects to the
    // game server.
    const cachedServer = servers.find((s) => s.address === address);
    if (cachedServer?.mapName) {
      setMapName(cachedServer.mapName);
    }

    const newAdapter = new LiveStreamAdapter(relayRef.current);
    newAdapter.onReady = () => setLiveReady(true);
    adapterRef.current = newAdapter;
    setLiveReady(false);
    setGameStatus(null);
    setAdapter(newAdapter);

    relayRef.current.joinServer(address);
  }, [servers]);

  const disconnectServer = useCallback(() => {
    relayRef.current?.disconnectServer();
    adapterRef.current?.reset();
    adapterRef.current = null;
    setAdapter(null);
    setLiveReady(false);
    setGameStatus(null);
    setMapName(undefined);
    setRelayPing(null);
  }, []);

  const sendMove = useCallback((move: ClientMove) => {
    relayRef.current?.sendMove(move);
  }, []);

  const sendCommand = useCallback((command: string, ...args: string[]) => {
    relayRef.current?.sendCommand(command, args);
  }, []);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      relayRef.current?.close();
    };
  }, []);

  // Effective RTT = relay↔T2 RTT + browser↔relay RTT.
  const ping =
    relayPing != null && wsPing != null
      ? relayPing + wsPing
      : relayPing ?? null;

  const value: LiveConnectionState & LiveConnectionActions = {
    relayConnected,
    gameStatus,
    gameStatusMessage,
    mapName,
    ping,
    wsPing,
    servers,
    serversLoading,
    adapter,
    liveReady,
    connectRelay,
    disconnectRelay,
    listServers,
    joinServer,
    disconnectServer,
    sendMove,
    sendCommand,
  };

  return (
    <LiveConnectionContext.Provider value={value}>
      {children}
    </LiveConnectionContext.Provider>
  );
}

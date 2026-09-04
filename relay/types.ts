import type {
  ConnectionProtocolState,
  GhostUpdate,
  NetEventInfo,
  ParsedData,
  SensorGroupColor,
} from "t2-demo-parser";

/** Messages from browser client to relay server. */
export type ClientMessage =
  | { type: "listServers" }
  | { type: "joinServer"; address: string; warriorName?: string }
  | { type: "watchServer"; address: string }
  | { type: "leaveServer" }
  | { type: "sendMoves"; moves: ClientMove[]; moveStartIndex: number }
  | { type: "sendCommand"; command: string; args: string[] }
  | {
      type: "sendCRCCompute";
      seed: number;
      field2: number;
      includeTextures: boolean;
      datablocks: { objectId: number; className: string; shapeName: string }[];
    }
  | { type: "sendGhostAck"; sequence: number; ghostCount: number }
  | { type: "wsPing"; ts: number };

/** Messages from relay server to browser client. */
export type ServerMessage =
  | { type: "serverList"; servers: ServerInfo[] }
  | {
      type: "status";
      status: ConnectionStatus;
      message?: string;
      mapName?: string;
    }
  | {
      type: "sessionStatus";
      status: WatchStatus;
      message?: string;
      address: string;
      serverName?: string;
      mapName?: string;
      watcherCount: number;
      /** The relay is recording this session to a demo file. */
      recording?: boolean;
      /** Watcher-facing stream delay in ms (tournament anti-screen-peek);
       *  0/absent = live. */
      streamDelayMs?: number;
      /** While a delayed session is still buffering its first `delayMs`
       *  (no delayed frames available yet), the rough ms until the
       *  delayed stream begins — for a client-side "live in ~Xs". */
      streamDelayReadyInMs?: number;
    }
  | { type: "watcherCount"; count: number }
  /** The relay is shutting down for a restart/deploy — clients should
   *  auto-reattach with backoff rather than treat the session as ended. */
  | { type: "relayRestarting" }
  | {
      type: "catchupBegin";
      epoch: number;
      /** Compressed payload size, for determinate progress UI. */
      totalBytes: number;
      chunkCount: number;
      encoding: "gzip";
    }
  | { type: "catchupEnd" }
  | { type: "ping"; ms: number }
  | { type: "wsPong"; ts: number }
  | { type: "error"; message: string };

/** Watch-session status, sent only to watcher sockets. */
export type WatchStatus =
  "connecting" | "authenticating" | "syncing" | "live" | "ended";

/** Roster/score/clock state a late joiner can't recover from the live
 *  stream (MsgPlayerScore only updates existing roster entries).
 *  Structured stand-in for a .rec's demoValues sections. */
export interface WatchHudStatePayload {
  playerRoster: Array<{
    clientId: number;
    name: string;
    rawName: string;
    targetId?: number;
    teamId: number;
    score: number;
    ping: number;
    packetLoss: number;
    kills?: number;
  }>;
  teamScores: Array<{
    teamId: number;
    name: string;
    score: number;
    flagStatus?: "home" | "field" | "held";
    flagCarrier?: string;
  }>;
  /** MsgSystemClock replay: original duration (0 ⇒ count-up clock) and
   *  wall-clock ms elapsed since it was received. */
  clock?: { durationMs: number; elapsedMs: number };
  missionDisplayName?: string;
  missionTypeDisplayName?: string;
  gameClassName?: string;
  serverDisplayName?: string;
  /** Match-over interval: gameOver debrief seen, next MsgClientReady not. */
  matchEnded?: boolean;
  matchStarted?: boolean;
  /**
   * The mission's loading-screen text (MsgLoadInfo … MsgLoadInfoDone),
   * sent once per client at join — a late joiner never sees it live.
   */
  loadInfo?: ServerLoadInfo;
}

/**
 * Loading-screen content the server sends to every joining client
 * (loadingGui.cs sendLoadInfoToClient) — the same MissionInfo text the
 * map library parses from the .mis, but authoritative for the server's
 * copy of the map. Lines are Torque GUI markup.
 */
export interface ServerLoadInfo {
  quoteLines: string[];
  objectiveLines: string[];
  rulesLines: string[];
}

/** Target-system entry mirroring InitialBlockData's TargetEntry, with
 *  net-string references already resolved to strings. */
export interface WatchTargetEntry {
  targetId: number;
  name?: string;
  skin?: string;
  skinPref?: string;
  /** Omitted (not defaulted) when the relay never saw the value, so
   *  hydration matches a from-start client exactly. */
  sensorGroup?: number;
  targetData?: number;
}

/**
 * Catch-up payload for a late-joining watcher. Mirrors the parsed
 * InitialBlockData a `.rec` recorded mid-match starts with, so the
 * browser hydrates through the same code paths as demo playback, plus
 * live-only parser state so its parser continues the raw packet stream
 * in lockstep with the relay's.
 */
export interface WatchCatchupPayload {
  epoch: number;
  serverAddress: string;

  // ── InitialBlockData-aligned ──
  taggedStrings: Array<[number, string]>;
  dataBlocks: Array<[number, { className: string; data: ParsedData }]>;
  targetEntries: WatchTargetEntry[];
  sensorGroupColors: SensorGroupColor[];
  connectionState: ConnectionProtocolState;
  nextRecvEventSeq: number;
  /** Full merged state per ghost, shaped like demo initialGhosts. */
  initialGhosts: GhostUpdate[];
  controlObjectGhostIndex: number;
  controlObjectData?: ParsedData;
  missionName: string | null;

  // ── Live-only extensions (no .rec equivalent) ──
  compressionPoint: { x: number; y: number; z: number };
  pendingGuaranteedEvents: Array<{
    absoluteSequenceNumber: number;
    event: NetEventInfo;
  }>;
  playerSensorGroup: number;
  hudState: WatchHudStatePayload;
}

export interface ServerInfo {
  address: string;
  name: string;
  mod: string;
  gameType: string;
  mapName: string;
  playerCount: number;
  maxPlayers: number;
  botCount: number;
  ping: number;
  buildVersion: number;
  passwordRequired: boolean;
  /** Tournament mode — the "medal" the stock client shows in the server
   *  list. From the info-response status byte (bit 0x08). */
  tournament: boolean;
  /** The server name matches a configured patrol name-pattern — i.e. one
   *  of the servers we consider important/active. Purely a name match:
   *  true even when patrol is disabled, the server is type-excluded (e.g.
   *  LakRabbit), or it isn't currently pinned. */
  isPatrolled: boolean;
  /** Roster from the info-response status tail (getServerStatusString);
   *  absent when the tail was missing, truncated, or mod-mangled. */
  teams?: Array<{ name: string; score: number }>;
  players?: Array<{ name: string; team: string; score: number }>;
}

export type ConnectionStatus =
  | "connecting"
  | "challenging"
  | "authenticating"
  | "connected"
  | "disconnected";

export interface ClientMove {
  /** Movement axes: float [-1, 1]. 0 = no movement. */
  x: number;
  y: number;
  z: number;
  /** Rotation deltas: float (radians per tick). 0 = no rotation change. */
  yaw: number;
  pitch: number;
  roll: number;
  trigger: boolean[];
  freeLook: boolean;
}

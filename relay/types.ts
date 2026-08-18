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
    }
  | { type: "watcherCount"; count: number }
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
    targetId?: number;
    teamId: number;
    score: number;
    ping: number;
    packetLoss: number;
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

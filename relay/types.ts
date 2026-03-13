/** Messages from browser client to relay server. */
export type ClientMessage =
  | { type: "listServers" }
  | { type: "joinServer"; address: string; warriorName?: string }
  | { type: "disconnect" }
  | { type: "sendMoves"; moves: ClientMove[]; moveStartIndex: number }
  | { type: "sendCommand"; command: string; args: string[] }
  | {
      type: "sendCRCResponse";
      crcValue: number;
      field1: number;
      field2: number;
    }
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
      connectSequence?: number;
      mapName?: string;
    }
  | { type: "gamePacket"; data: Uint8Array }
  | { type: "ping"; ms: number }
  | { type: "wsPong"; ts: number }
  | { type: "error"; message: string };

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

export interface RelayConfig {
  port: number;
  accountName: string;
  accountPassword: string;
  accountCertificate: string;
  accountEncryptedKey: string;
  authServerAddress: string;
  masterServerAddress: string;
}

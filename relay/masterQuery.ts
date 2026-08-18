import dgram from "node:dgram";
import { BitStream } from "t2-demo-parser";
import type { ServerInfo } from "./types.js";
import { buildGamePingRequest, buildGameInfoRequest } from "./protocol.js";
import { masterLog } from "./logger.js";

const QUERY_TIMEOUT_MS = 5000;
const PHASE_TIMEOUT_MS = 3000;

/** Required build version for client compatibility. */
const REQUIRED_BUILD_VERSION = 25034;

/** Parse a "host:port" string into components. */
function parseAddress(addr: string): { host: string; port: number } {
  const [host, portStr] = addr.split(":");
  return { host, port: parseInt(portStr, 10) };
}

/**
 * Query the TribesNext master server for a list of active game servers,
 * then ping each one for details via UDP.
 *
 * Two-phase query matching the real Tribes 2 client:
 * 1. GamePingRequest (type 14) -> server name, version, protocol
 * 2. GameInfoRequest (type 18) -> mod, map, game type, players
 */
export async function queryServerList(
  masterAddress: string,
): Promise<ServerInfo[]> {
  masterLog.info({ master: masterAddress }, "Querying master server");
  const addresses = await queryMasterHTTP(masterAddress);
  masterLog.info(
    { count: addresses.length },
    "Master returned server addresses",
  );
  if (addresses.length === 0) return [];

  const servers = await queryServers(addresses);
  masterLog.info(
    { compatible: servers.length, total: addresses.length },
    "Server query complete",
  );
  return servers;
}

/** Query the TribesNext master server via HTTP GET /list, with retries. */
async function queryMasterHTTP(masterAddress: string): Promise<string[]> {
  const maxAttempts = 3;
  const url = `http://${masterAddress}/list`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      masterLog.debug({ url, attempt }, "Fetching server list");
      const res = await fetch(url, {
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });
      const body = await res.text();
      return body
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter((addr) => addr.includes(":") && addr.includes("."));
    } catch (err) {
      masterLog.warn(
        { err: err instanceof Error ? err.message : err, attempt, maxAttempts },
        "Master HTTP query failed",
      );
      if (attempt < maxAttempts) {
        const delay = attempt * 1000;
        masterLog.info({ delayMs: delay }, "Retrying master query");
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  masterLog.error("Master HTTP query failed after all retries");
  return [];
}

/**
 * Probe a single (possibly unlisted) host with the same two-phase UDP
 * query used for the master list. Resolves with the server's info when
 * it answers as a compatible Tribes 2 server, null otherwise — the
 * cheap "is this really a T2 server?" check before the relay opens a
 * game connection to an arbitrary address.
 */
export async function queryServerInfo(
  address: string,
): Promise<ServerInfo | null> {
  const servers = await queryServers([address]);
  return servers[0] ?? null;
}

/** Ping info from GamePingResponse (type 16). */
interface PingInfo {
  name: string;
  buildVersion: number;
  ping: number;
}

/** Info from GameInfoResponse (type 20). */
interface GameInfo {
  mod: string;
  gameType: string;
  mapName: string;
  status: number;
  playerCount: number;
  maxPlayers: number;
  botCount: number;
}

/** Two-phase UDP query: ping first, then info request. */
async function queryServers(addresses: string[]): Promise<ServerInfo[]> {
  const socket = dgram.createSocket("udp4");
  const pingResults = new Map<string, PingInfo>();
  const infoResults = new Map<string, GameInfo>();
  const pingTimes = new Map<string, number>();

  /** Resolve an rinfo address back to a queried address. The fallback
   *  exists for DNS-named queries (rinfo reports the resolved IP), so it
   *  only considers non-IP-literal entries — matching by port alone
   *  could attribute a response to a different queried IP. */
  function resolveAddr(rinfo: dgram.RemoteInfo): string {
    const addr = `${rinfo.address}:${rinfo.port}`;
    if (!pingTimes.has(addr)) {
      for (const [key] of pingTimes) {
        const { host, port } = parseAddress(key);
        if (port === rinfo.port && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
          return key;
        }
      }
    }
    return addr;
  }

  // Phase 1: Send pings, collect responses
  masterLog.debug(
    { count: addresses.length },
    "Phase 1: sending GamePingRequests",
  );
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), PHASE_TIMEOUT_MS);

    socket.on("message", (msg, rinfo) => {
      const addr = resolveAddr(rinfo);
      const type = msg[0];

      if (type === 16) {
        const info = parsePingResponse(msg, pingTimes.get(addr));
        if (info) {
          pingResults.set(addr, info);
          masterLog.debug(
            {
              addr,
              name: info.name,
              build: info.buildVersion,
              ping: info.ping,
            },
            "Ping response",
          );
        }
        if (pingResults.size >= addresses.length) {
          clearTimeout(timeout);
          resolve();
        }
      }
    });

    socket.on("error", (err) => {
      masterLog.warn({ err }, "Socket error during Phase 1");
      clearTimeout(timeout);
      resolve();
    });

    for (const addr of addresses) {
      const { host, port } = parseAddress(addr);
      pingTimes.set(addr, Date.now());
      socket.send(buildGamePingRequest(), port, host);
    }
  });

  masterLog.debug(
    { responded: pingResults.size, total: addresses.length },
    "Phase 1 complete",
  );

  // Phase 2: Send info requests to servers that responded to ping
  // and are running the correct version.
  const compatibleAddrs = [...pingResults.entries()]
    .filter(([, info]) => info.buildVersion === REQUIRED_BUILD_VERSION)
    .map(([addr]) => addr);

  if (compatibleAddrs.length > 0) {
    // Clear all Phase 1 listeners (including stale error handler).
    socket.removeAllListeners();

    masterLog.debug(
      { count: compatibleAddrs.length },
      "Phase 2: sending GameInfoRequests",
    );

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), PHASE_TIMEOUT_MS);

      socket.on("error", (err) => {
        masterLog.warn({ err }, "Socket error during Phase 2");
        clearTimeout(timeout);
        resolve();
      });

      socket.on("message", (msg, rinfo) => {
        const addr = resolveAddr(rinfo);
        if (msg[0] === 20) {
          const info = parseInfoResponse(msg);
          if (info) infoResults.set(addr, info);
          if (infoResults.size >= compatibleAddrs.length) {
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      for (const addr of compatibleAddrs) {
        if (infoResults.has(addr)) continue;
        const { host, port } = parseAddress(addr);
        socket.send(buildGameInfoRequest(), port, host);
      }

      const remaining = compatibleAddrs.filter((a) => !infoResults.has(a));
      if (remaining.length === 0) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  socket.removeAllListeners();
  socket.close();

  // Combine results
  const servers: ServerInfo[] = [];
  for (const [addr, ping] of pingResults) {
    if (ping.buildVersion !== REQUIRED_BUILD_VERSION) continue;
    const info = infoResults.get(addr);
    servers.push({
      address: addr,
      name: ping.name,
      mod: info?.mod ?? "",
      gameType: info?.gameType ?? "",
      mapName: info?.mapName ?? "",
      playerCount: info?.playerCount ?? 0,
      maxPlayers: info?.maxPlayers ?? 0,
      botCount: info?.botCount ?? 0,
      ping: ping.ping,
      buildVersion: ping.buildVersion,
      passwordRequired: info ? (info.status & 0x02) !== 0 : false,
    });
  }

  return servers;
}

/**
 * Parse a GamePingResponse (type 16).
 *
 * Format (from decompiled Tribes2.exe):
 *   U8   type (16)
 *   U8   flags
 *   U32  key
 *   HuffString  versionString (e.g. "VER5")
 *   U32  protocolVersion
 *   U32  minProtocolVersion
 *   U32  buildVersion (e.g. 25034)
 *   HuffString  serverName (24 chars max)
 */
function parsePingResponse(data: Buffer, sendTime?: number): PingInfo | null {
  if (data.length < 7 || data[0] !== 16) return null;
  try {
    const bs = new BitStream(
      new Uint8Array(data.buffer, data.byteOffset + 6, data.length - 6),
    );
    bs.readString(); // versionString
    bs.readU32(); // protocolVersion
    bs.readU32(); // minProtocolVersion
    const buildVersion = bs.readU32();
    const name = bs.readString();
    return {
      name,
      buildVersion,
      ping: sendTime ? Date.now() - sendTime : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a GameInfoResponse (type 20).
 *
 * Format (from decompiled Tribes2.exe):
 *   U8   type (20)
 *   U8   flags
 *   U32  key
 *   HuffString  mod (mod paths, e.g. "Classic")
 *   HuffString  missionTypeDisplayName (e.g. "Capture the Flag")
 *   HuffString  missionDisplayName (map name)
 *   U8   status flags
 *   U8   playerCount
 *   U8   maxPlayers
 *   U8   botCount
 *   U16  cpuMhz
 *   HuffString  serverInfo ($Host::Info — description, NOT the name)
 */
function parseInfoResponse(data: Buffer): GameInfo | null {
  if (data.length < 7 || data[0] !== 20) return null;
  try {
    const bs = new BitStream(
      new Uint8Array(data.buffer, data.byteOffset + 6, data.length - 6),
    );
    const mod = bs.readString();
    const gameType = bs.readString();
    const mapName = bs.readString();
    const status = bs.readU8();
    const playerCount = bs.readU8();
    const maxPlayers = bs.readU8();
    const botCount = bs.readU8();
    return {
      mod,
      gameType,
      mapName,
      status,
      playerCount,
      maxPlayers,
      botCount,
    };
  } catch {
    return null;
  }
}

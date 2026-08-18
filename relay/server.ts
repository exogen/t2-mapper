import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { queryServerList, queryServerInfo } from "./masterQuery.js";
import { GameConnection } from "./gameConnection.js";
import { loadCredentials } from "./auth.js";
import { WatchSessionManager, normalizeAddress } from "./watchSession.js";
import {
  AUTH_COMMANDS,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  isRetryableDisconnect,
} from "./shared.js";
import { relayLog } from "./logger.js";
import type { ClientMessage, ServerMessage, ServerInfo } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Base path for game files (extracted VL2 contents). */
const GAME_BASE_PATH =
  process.env.GAME_BASE_PATH || path.resolve(__dirname, "..", "docs", "base");

const MANIFEST_PATH =
  process.env.MANIFEST_PATH ||
  path.resolve(GAME_BASE_PATH, "..", "..", "src", "manifest.json");

const RELAY_PORT = parseInt(process.env.RELAY_PORT || "8765", 10);
const MASTER_SERVER = process.env.T2_MASTER_SERVER || "master.tribesnext.com";

/** HTTP server for health checks; WebSocket upgrades are handled separately. */
const httpServer = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    // Check game assets directory.
    try {
      const stat = await fs.stat(GAME_BASE_PATH);
      const entries = await fs.readdir(GAME_BASE_PATH);
      checks.gameAssets = {
        ok: stat.isDirectory() && entries.length > 0,
        detail: `${entries.length} entries in ${GAME_BASE_PATH}`,
      };
    } catch {
      checks.gameAssets = { ok: false, detail: `${GAME_BASE_PATH} not found` };
    }

    // Check manifest.
    try {
      const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
      const manifest = JSON.parse(raw);
      const count = Object.keys(manifest.resources ?? {}).length;
      checks.manifest = { ok: count > 0, detail: `${count} resources` };
    } catch {
      checks.manifest = { ok: false, detail: `${MANIFEST_PATH} not found` };
    }

    // Check credentials.
    const creds = loadCredentials();
    checks.credentials = {
      ok: creds !== null,
      detail: creds ? "loaded" : "missing or incomplete",
    };

    const allOk = Object.values(checks).every((c) => c.ok);
    res.writeHead(allOk ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ status: allOk ? "ok" : "degraded", checks }, null, 2),
    );
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(RELAY_PORT, "0.0.0.0", () => {
  relayLog.info({ port: RELAY_PORT }, "Relay server listening");
});

/** Cached server list from the most recent master query. */
let cachedServers: ServerInfo[] = [];

/** All active game connections (for status logging). */
const activeGameConnections = new Set<GameConnection>();

/** How long direct-probe results (success AND failure) stay valid. */
const PROBE_TTL_MS = 2 * 60_000;

/** Unlisted-server probe results: info for real T2 servers, null for
 *  hosts that didn't answer. Failures are cached too, so repeated
 *  watch requests can't be used to spray ping traffic at a non-T2 host
 *  through the relay — they reject instantly within the TTL. */
const probeCache = new Map<string, { info: ServerInfo | null; at: number }>();

function getFreshProbe(
  address: string,
): { info: ServerInfo | null; at: number } | undefined {
  const entry = probeCache.get(address);
  if (!entry) return undefined;
  if (Date.now() - entry.at > PROBE_TTL_MS) {
    probeCache.delete(address);
    return undefined;
  }
  return entry;
}

/** Look up a server by address in the master list or the probe cache. */
function findKnownServer(address: string): ServerInfo | undefined {
  const [host, port] = normalizeAddress(address).split(":");
  return (
    cachedServers.find((s) => {
      const [sHost, sPort] = s.address.toLowerCase().split(":");
      return sHost === host && (sPort ?? "28000") === (port ?? "28000");
    }) ??
    getFreshProbe(`${host}:${port}`)?.info ??
    undefined
  );
}

/** Shared watch sessions (one game connection per server, N watchers). */
const watchSessions = new WatchSessionManager({
  gameBasePath: GAME_BASE_PATH,
  getCachedServer: findKnownServer,
});

setInterval(() => {
  const wsClients = wss.clients.size;
  const gameConns = activeGameConnections.size;
  const sessions = watchSessions.getStatusSummary();
  relayLog.info(
    { wsClients, gameConnections: gameConns, watchSessions: sessions },
    "Relay status: %d WebSocket client(s), %d game connection(s), %d watch session(s)",
    wsClients,
    gameConns,
    sessions.length,
  );
  if (gameConns > 0) {
    const addrs = [...activeGameConnections].map((c) => c.address);
    relayLog.debug(
      { connections: addrs },
      "Active game connections: %s",
      addrs.join(", "),
    );
  }
}, 60_000);

// Liveness sweep: half-open sockets would otherwise pin watch sessions
// (and their game connections) forever. Browsers answer protocol pings
// automatically, so healthy clients are unaffected.
const liveSockets = new WeakSet<WebSocket>();
setInterval(() => {
  for (const ws of wss.clients) {
    if (!liveSockets.has(ws)) {
      relayLog.warn("Terminating unresponsive WebSocket client");
      ws.terminate();
      continue;
    }
    liveSockets.delete(ws);
    ws.ping();
  }
}, 30_000);

// ── Exit diagnostics ──
// The relay should only ever exit because something told it to; log the
// exact reason so an unexpected shutdown is attributable. writeSync
// because pino/stdout writes are async on pipes (e.g. under
// concurrently) and can be lost during exit.
function logExit(message: string): void {
  try {
    fsSync.writeSync(process.stderr.fd, `[relay] ${message}\n`);
  } catch {
    // stderr gone — nothing else to do
  }
}

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => {
    logExit(`received ${signal} — shutting down watch sessions and exiting`);
    watchSessions.shutdown();
    process.exit(0);
  });
}

process.on("exit", (code) => {
  logExit(`process exiting with code ${code}`);
});

process.on("uncaughtException", (err) => {
  logExit(`uncaught exception: ${err?.stack ?? err}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const detail =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  logExit(`unhandled rejection: ${detail}`);
  process.exit(1);
});

wss.on("connection", (ws) => {
  relayLog.info("Browser client connected");
  liveSockets.add(ws);
  ws.on("pong", () => liveSockets.add(ws));

  /** First joinServer/watchServer claims the socket for that mode. */
  let role: "idle" | "player" | "watcher" = "idle";
  let warnedWatcherCommand = false;
  /** One unlisted-server probe at a time per socket. */
  let probeInFlight = false;

  let gameConnection: GameConnection | null = null;
  let lastJoinAddress: string | null = null;
  let lastWarriorName: string | undefined;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function connectToServer(
    ws: WebSocket,
    address: string,
    warriorName?: string,
  ): Promise<void> {
    if (gameConnection) {
      gameConnection.disconnect();
    }

    gameConnection = new GameConnection(address, { warriorName });
    activeGameConnections.add(gameConnection);

    // Set mapName from the cached server list if available.
    const cachedServer = cachedServers.find((s) => s.address === address);
    if (cachedServer?.mapName) {
      gameConnection.setMapName(cachedServer.mapName);
    }

    const conn = gameConnection;
    gameConnection.on("status", (status, statusMessage) => {
      relayLog.info(
        {
          status,
          statusMessage,
          mapName: conn.mapName,
        },
        "Game connection status changed",
      );

      // Auto-retry on retryable disconnect reasons.
      if (
        status === "disconnected" &&
        isRetryableDisconnect(statusMessage) &&
        retryCount < MAX_RETRIES &&
        lastJoinAddress === address
      ) {
        retryCount++;
        relayLog.info(
          {
            attempt: retryCount,
            maxRetries: MAX_RETRIES,
            delay: RETRY_DELAY_MS,
          },
          "Retryable disconnect — will reconnect",
        );
        sendToClient(ws, {
          type: "status",
          status: "connecting",
          message: `${statusMessage} — retrying (${retryCount}/${MAX_RETRIES})...`,
          mapName: conn.mapName,
        });
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (lastJoinAddress === address && ws.readyState === WebSocket.OPEN) {
            connectToServer(ws, address, lastWarriorName).catch((err) => {
              relayLog.error({ err }, "Retry connection failed");
              sendToClient(ws, {
                type: "error",
                message: `Reconnect failed: ${err instanceof Error ? err.message : err}`,
              });
            });
          }
        }, RETRY_DELAY_MS);
        return;
      }

      sendToClient(ws, {
        type: "status",
        status,
        message: statusMessage,
        mapName: conn.mapName,
      });
    });

    gameConnection.on("ping", (ms) => {
      sendToClient(ws, { type: "ping", ms });
    });

    let forwardedPackets = 0;
    gameConnection.on("packet", (packetData) => {
      forwardedPackets++;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(packetData, { binary: true });
      } else {
        relayLog.warn(
          { wsState: ws.readyState, total: forwardedPackets },
          "Dropped game packet — WebSocket not open",
        );
      }
      if (forwardedPackets <= 5 || forwardedPackets % 500 === 0) {
        relayLog.debug(
          { bytes: packetData.length, total: forwardedPackets },
          "Forwarded game packet to browser",
        );
      }
    });

    gameConnection.on("error", (err) => {
      relayLog.error({ err }, "Game connection error");
      sendToClient(ws, {
        type: "error",
        message: err.message,
      });
    });

    gameConnection.on("close", () => {
      relayLog.info("Game connection closed");
      activeGameConnections.delete(conn);
      if (gameConnection === conn) {
        gameConnection = null;
      }
    });

    await gameConnection.connect();
  }

  ws.on("message", async (data, isBinary) => {
    try {
      if (isBinary) {
        return;
      }

      const message: ClientMessage = JSON.parse(data.toString());
      await handleClientMessage(ws, message);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      relayLog.error({ err: e }, "Error handling client message");
      sendToClient(ws, { type: "error", message: err });
    }
  });

  ws.on("close", () => {
    relayLog.info("Browser client disconnected");
    // Clear retry state so we never auto-reconnect without a browser client.
    lastJoinAddress = null;
    retryCount = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (gameConnection) {
      gameConnection.disconnect();
    }
    watchSessions.detachSocket(ws);
  });

  async function handleClientMessage(
    ws: WebSocket,
    message: ClientMessage,
  ): Promise<void> {
    // Watcher sockets are read-only spectators, with one exception: chat,
    // sent through the session's shared identity. Every other
    // game-mutating message is dropped (the session owns the protocol).
    if (role === "watcher") {
      if (message.type === "sendCommand" && message.command === "messageSent") {
        watchSessions.sendChat(ws, message.args[0] ?? "");
        return;
      }
      const allowed = ["listServers", "watchServer", "leaveServer", "wsPing"];
      if (!allowed.includes(message.type)) {
        relayLog.debug(
          { type: message.type },
          "Dropping game message from watcher socket",
        );
        if (!warnedWatcherCommand) {
          warnedWatcherCommand = true;
          sendToClient(ws, {
            type: "error",
            message: `Watchers are read-only; "${message.type}" ignored`,
          });
        }
        return;
      }
    }

    switch (message.type) {
      case "watchServer": {
        if (role === "player") {
          sendToClient(ws, {
            type: "error",
            message: "Socket already joined as a player; reconnect to watch",
          });
          return;
        }
        role = "watcher";
        const address = normalizeAddress(message.address);
        relayLog.info({ address }, "Watch server requested");

        // Unlisted addresses are probed first (GamePing/GameInfo request,
        // the same two-packet handshake the server browser uses), so the
        // relay only ever opens game connections to real, compatible
        // Tribes 2 servers — while still supporting private servers that
        // aren't published on the master list. An already-active session
        // is proof enough; otherwise both probe outcomes are cached for
        // PROBE_TTL_MS, and a cached failure rejects with no traffic at
        // all toward the target.
        if (!watchSessions.has(address) && !findKnownServer(address)) {
          if (getFreshProbe(address)?.info === null) {
            sendToClient(ws, {
              type: "sessionStatus",
              status: "ended",
              address,
              message: `No compatible Tribes 2 server responded at ${address}.`,
              watcherCount: 0,
            });
            return;
          }
          if (probeInFlight) return;
          probeInFlight = true;
          relayLog.info({ address }, "Probing unlisted server");
          let info: ServerInfo | null = null;
          try {
            info = await queryServerInfo(address);
          } finally {
            probeInFlight = false;
          }
          probeCache.set(address, { info, at: Date.now() });
          if (!info) {
            relayLog.info({ address }, "Probe failed — not a T2 server");
            sendToClient(ws, {
              type: "sessionStatus",
              status: "ended",
              address,
              message: `No compatible Tribes 2 server responded at ${address}.`,
              watcherCount: 0,
            });
            return;
          }
          relayLog.info(
            { address, name: info.name, mapName: info.mapName },
            "Probe succeeded — unlisted T2 server",
          );
        }

        // The socket may have closed during the probe; a dead watcher in
        // a session would pin it until the liveness sweep.
        if (ws.readyState === WebSocket.OPEN) {
          watchSessions.watch(ws, address);
        }
        break;
      }

      case "leaveServer": {
        watchSessions.detachSocket(ws);
        break;
      }

      case "listServers": {
        relayLog.info("Querying master server for server list");
        try {
          const servers = await queryServerList(MASTER_SERVER);
          cachedServers = servers;
          relayLog.info(
            { count: servers.length },
            "Returning server list to browser",
          );
          sendToClient(ws, { type: "serverList", servers });
        } catch (e) {
          relayLog.error({ err: e }, "Master query failed");
          sendToClient(ws, {
            type: "error",
            message: `Master query failed: ${e}`,
          });
        }
        break;
      }

      case "joinServer": {
        if (role === "watcher") {
          sendToClient(ws, {
            type: "error",
            message: "Socket is watching; reconnect to join as a player",
          });
          return;
        }
        role = "player";
        relayLog.info(
          { address: message.address, warriorName: message.warriorName },
          "Join server requested",
        );
        if (gameConnection) {
          relayLog.info("Disconnecting existing game connection");
          gameConnection.disconnect();
        }
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        retryCount = 0;
        lastJoinAddress = message.address;
        lastWarriorName = message.warriorName;

        await connectToServer(ws, message.address, message.warriorName);
        break;
      }

      case "sendCommand": {
        if (gameConnection) {
          if (AUTH_COMMANDS.includes(message.command)) {
            relayLog.debug(
              { event: message.command },
              "Forwarding auth event from browser",
            );
            gameConnection.handleAuthEvent(message.command, message.args);
          } else {
            relayLog.debug(
              { command: message.command },
              "Forwarding command to server",
            );
            gameConnection.sendCommand(message.command, ...message.args);
          }
        }
        break;
      }

      case "sendCRCCompute": {
        if (gameConnection) {
          relayLog.info(
            {
              datablocks: message.datablocks.length,
              includeTextures: message.includeTextures,
            },
            "Computing CRC from game files",
          );
          // Fire-and-forget: computeAndSendCRC has its own try/catch.
          gameConnection.computeAndSendCRC(
            message.seed,
            message.field2,
            message.datablocks,
            message.includeTextures,
            GAME_BASE_PATH,
          );
        }
        break;
      }

      case "sendGhostAck": {
        if (gameConnection) {
          relayLog.debug("Forwarding ghost ack from browser");
          gameConnection.handleGhostAlwaysDone(
            message.sequence,
            message.ghostCount,
          );
        }
        break;
      }

      case "wsPing": {
        sendToClient(ws, { type: "wsPong", ts: message.ts });
        break;
      }

      case "sendMoves": {
        if (gameConnection) {
          gameConnection.sendMoves(
            message.moves.map((m) => ({
              x: m.x,
              y: m.y,
              z: m.z,
              yaw: m.yaw,
              pitch: m.pitch,
              roll: m.roll,
              freeLook: m.freeLook,
              trigger: m.trigger,
            })),
            message.moveStartIndex,
          );
        }
        break;
      }
    }
  }
});

function sendToClient(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

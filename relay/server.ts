import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { queryServerList } from "./masterQuery.js";
import { GameConnection } from "./gameConnection.js";
import { loadCredentials } from "./auth.js";
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

setInterval(() => {
  const wsClients = wss.clients.size;
  const gameConns = activeGameConnections.size;
  relayLog.info(
    { wsClients, gameConnections: gameConns },
    "Relay status: %d WebSocket client(s), %d game connection(s)",
    wsClients,
    gameConns,
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

wss.on("connection", (ws) => {
  relayLog.info("Browser client connected");

  let gameConnection: GameConnection | null = null;
  let lastJoinAddress: string | null = null;
  let lastWarriorName: string | undefined;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 6000;
  const RETRYABLE_REASONS = ["Server is cycling mission"];

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
          connectSequence: conn.connectSequence,
          mapName: conn.mapName,
        },
        "Game connection status changed",
      );

      // Auto-retry on retryable disconnect reasons.
      if (
        status === "disconnected" &&
        statusMessage &&
        RETRYABLE_REASONS.some((r) => statusMessage.includes(r)) &&
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
          connectSequence: conn.connectSequence,
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
        connectSequence: conn.connectSequence,
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
  });

  async function handleClientMessage(
    ws: WebSocket,
    message: ClientMessage,
  ): Promise<void> {
    switch (message.type) {
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
          const authEvents = [
            "t2csri_pokeClient",
            "t2csri_getChallengeChunk",
            "t2csri_decryptChallenge",
          ];
          if (authEvents.includes(message.command)) {
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

      case "sendCRCResponse": {
        if (gameConnection) {
          relayLog.debug("Forwarding CRC response from browser (legacy echo)");
          gameConnection.handleCRCChallenge(
            message.crcValue,
            message.field1,
            message.field2,
          );
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

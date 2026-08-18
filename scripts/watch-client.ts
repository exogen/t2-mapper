/**
 * E2E watcher client: joins a live server through the relay's watch
 * session, validates the catch-up payload, and counts live packets.
 * Usage: npx tsx scripts/watch-client.ts <relayUrl> [label]
 */
import { WebSocket } from "ws";
import { gunzipSync } from "node:zlib";
import { deserializeCatchupPayload } from "../relay/watchSerialize.js";

const url = process.argv[2] ?? "ws://localhost:18770";
const label = process.argv[3] ?? "watcher";

const ws = new WebSocket(url);
ws.binaryType = "arraybuffer";

let mode: "live" | "collecting" = "live";
let chunks: Buffer[] = [];
let livePackets = 0;
let catchupDone = false;

const timeout = setTimeout(() => {
  console.log(`[${label}] TIMEOUT`);
  process.exit(1);
}, 90_000);

function done(code: number) {
  clearTimeout(timeout);
  try {
    ws.send(JSON.stringify({ type: "leaveServer" }));
  } catch {}
  ws.close();
  process.exit(code);
}

ws.on("open", () => {
  console.log(`[${label}] connected to relay`);
  ws.send(JSON.stringify({ type: "listServers" }));
});

ws.on("message", (data, isBinary) => {
  if (isBinary || data instanceof ArrayBuffer) {
    const buf = Buffer.from(data as ArrayBuffer);
    if (mode === "collecting") {
      chunks.push(buf);
    } else {
      livePackets++;
    }
    return;
  }
  const msg = JSON.parse(data.toString());
  switch (msg.type) {
    case "serverList": {
      const populated = msg.servers
        .filter(
          (s: { playerCount: number; passwordRequired: boolean }) =>
            s.playerCount > 0 && !s.passwordRequired,
        )
        .sort(
          (a: { playerCount: number }, b: { playerCount: number }) =>
            b.playerCount - a.playerCount,
        );
      const target = populated[0] ?? msg.servers[0];
      if (!target) {
        console.log(`[${label}] no servers available`);
        done(1);
        return;
      }
      console.log(
        `[${label}] watching ${target.name} (${target.address}) — ${target.playerCount} players on ${target.mapName}`,
      );
      ws.send(JSON.stringify({ type: "watchServer", address: target.address }));
      break;
    }
    case "sessionStatus":
      console.log(
        `[${label}] session: ${msg.status}${msg.message ? ` — ${msg.message}` : ""} (watchers=${msg.watcherCount})`,
      );
      if (msg.status === "ended") done(1);
      break;
    case "catchupBegin":
      console.log(
        `[${label}] catchupBegin: epoch=${msg.epoch} bytes=${msg.totalBytes} chunks=${msg.chunkCount}`,
      );
      mode = "collecting";
      chunks = [];
      break;
    case "catchupEnd": {
      mode = "live";
      const gz = Buffer.concat(chunks);
      const json = gunzipSync(gz).toString("utf8");
      const payload = deserializeCatchupPayload(json);
      console.log(
        `[${label}] catch-up OK: ${payload.initialGhosts.length} ghosts, ` +
          `${payload.dataBlocks.length} datablocks, ` +
          `${payload.taggedStrings.length} netStrings, ` +
          `${payload.targetEntries.length} targets, ` +
          `roster=${payload.hudState.playerRoster.length}, ` +
          `mission=${payload.missionName}, ` +
          `control=#${payload.controlObjectGhostIndex}, ` +
          `eventSeq=${payload.nextRecvEventSeq}`,
      );
      catchupDone = true;
      livePackets = 0;
      setTimeout(() => {
        console.log(`[${label}] live packets in 8s: ${livePackets}`);
        done(catchupDone && livePackets > 50 ? 0 : 1);
      }, 8000);
      break;
    }
    case "error":
      console.log(`[${label}] relay error: ${msg.message}`);
      break;
  }
});

ws.on("error", (err) => {
  console.log(`[${label}] ws error:`, err.message);
  done(1);
});

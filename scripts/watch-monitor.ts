/**
 * Headless watch-mode monitor: attaches to a relay watch session with a
 * real LiveStreamAdapter (the browser engine, running under Node), and
 * reports entity/datablock/parser health — especially across in-place
 * mission changes, where shape resolution has been observed to fail.
 * Usage: npx tsx scripts/watch-monitor.ts [relayUrl]
 */
import { WebSocket } from "ws";
import { gunzipSync } from "node:zlib";
import { LiveStreamAdapter } from "../src/stream/liveStreaming";
import type { RelayClient } from "../src/stream/relayClient";
import { deserializeCatchupPayload } from "../relay/watchSerialize";

const url = process.argv[2] ?? "ws://localhost:18775";

const fakeRelay = {} as unknown as RelayClient;
const adapter = new LiveStreamAdapter(fakeRelay, { mode: "watch" });

interface AdapterInternals {
  entities: Map<
    string,
    {
      className: string;
      type: string;
      ghostIndex?: number;
      dataBlockId?: number;
      dataBlock?: string;
      shapeHint?: string;
      visual?: unknown;
      position?: [number, number, number];
    }
  >;
  ghostTracker: { size(): number };
  packetParser: {
    getDataBlockDataMap(): Map<number, unknown> | undefined;
    protocolRejected: number;
    protocolNoDispatch: number;
    ghostsTrackerDiverged: number;
    ghostsFailed: number;
    eventsFailed: number;
    ghostCreatesParsed: number;
    ghostUpdatesParsed: number;
    ghostDeletes: number;
  };
}
const internals = adapter as unknown as AdapterInternals;

/** Player positions at the previous report, keyed by entity id — a
 *  frozen-entity detector (updates misattributed or lost). */
let lastPlayerPositions = new Map<string, string>();

function playerMovement(): { total: number; moved: number } {
  const current = new Map<string, string>();
  let moved = 0;
  let total = 0;
  for (const [id, e] of internals.entities) {
    if (e.type !== "Player") continue;
    total++;
    const key = e.position ? e.position.map((v) => v.toFixed(1)).join(",") : "";
    current.set(id, key);
    const prev = lastPlayerPositions.get(id);
    if (prev !== undefined && prev !== key) moved++;
  }
  lastPlayerPositions = current;
  return { total, moved };
}

/** Shape-bearing entities whose shape never resolved (the sphere bug). */
function unresolvedEntities() {
  const out: {
    className: string;
    dataBlockId?: number;
    inDbMap: boolean;
  }[] = [];
  const dbMap = internals.packetParser.getDataBlockDataMap();
  for (const e of internals.entities.values()) {
    // Mirror EntityScene's placeholder condition: shape-ish entity with
    // no resolved shape name. Scene/effect types resolve differently.
    const shapeish = !["terrain", "interior", "sky", "sun", "water"].includes(
      e.type.toLowerCase(),
    );
    if (shapeish && !e.dataBlock && !e.shapeHint && !e.visual) {
      out.push({
        className: e.className,
        dataBlockId: e.dataBlockId,
        inDbMap: e.dataBlockId != null && !!dbMap?.has(e.dataBlockId),
      });
    }
  }
  return out;
}

function report(label: string) {
  const p = internals.packetParser;
  const unresolved = unresolvedEntities();
  const movement = playerMovement();
  console.log(
    `[${new Date().toISOString()}] ${label}: mission=${adapter.missionName} ` +
      `entities=${internals.entities.size} tracker=${internals.ghostTracker.size()} ` +
      `players=${movement.moved}/${movement.total}moving unresolved=${unresolved.length} ` +
      `datablocks=${p.getDataBlockDataMap()?.size ?? 0} ` +
      `creates=${p.ghostCreatesParsed} updates=${p.ghostUpdatesParsed} deletes=${p.ghostDeletes} ` +
      `rejected=${p.protocolRejected} noDispatch=${p.protocolNoDispatch} ` +
      `diverged=${p.ghostsTrackerDiverged} ghostsFailed=${p.ghostsFailed} ` +
      `eventsFailed=${p.eventsFailed}`,
  );
  if (unresolved.length > 0) {
    const byClass = new Map<string, { count: number; inDbMap: number }>();
    for (const u of unresolved) {
      const key = `${u.className}#db${u.dataBlockId}`;
      const entry = byClass.get(key) ?? { count: 0, inDbMap: 0 };
      entry.count++;
      if (u.inDbMap) entry.inDbMap++;
      byClass.set(key, entry);
    }
    for (const [key, { count, inDbMap }] of byClass) {
      console.log(
        `    unresolved ${key} ×${count} (datablock now in map: ${inDbMap})`,
      );
    }
  }
}

let lastMission: string | null = null;
adapter.onMissionChange = (name) => {
  console.log(`\n===== MISSION CHANGE: ${lastMission} → ${name} =====\n`);
  lastMission = name;
  // Dump state shortly after the new mission loads in.
  setTimeout(() => report("POST-CHANGE +30s"), 30_000);
  setTimeout(() => report("POST-CHANGE +90s"), 90_000);
};

const ws = new WebSocket(url);
ws.binaryType = "arraybuffer";
let mode: "live" | "collecting" = "live";
let chunks: Buffer[] = [];

ws.on("open", () => ws.send(JSON.stringify({ type: "listServers" })));
ws.on("message", (data, isBinary) => {
  if (isBinary || data instanceof ArrayBuffer) {
    const buf = Buffer.from(data as ArrayBuffer);
    if (mode === "collecting") {
      chunks.push(buf);
    } else {
      adapter.feedPacket(new Uint8Array(buf));
    }
    return;
  }
  const msg = JSON.parse(data.toString());
  if (msg.type === "serverList") {
    const server = msg.servers
      .filter(
        (s: { playerCount: number; passwordRequired: boolean }) =>
          s.playerCount > 0 && !s.passwordRequired,
      )
      .sort(
        (a: { playerCount: number }, b: { playerCount: number }) =>
          b.playerCount - a.playerCount,
      )[0];
    if (!server) {
      console.log("no populated servers");
      process.exit(1);
    }
    console.log(`watching ${server.name} (${server.address})`);
    ws.send(JSON.stringify({ type: "watchServer", address: server.address }));
  } else if (msg.type === "sessionStatus") {
    console.log(
      `session: ${msg.status}${msg.message ? ` — ${msg.message}` : ""}`,
    );
    if (msg.status === "ended") process.exit(2);
  } else if (msg.type === "catchupBegin") {
    mode = "collecting";
    chunks = [];
  } else if (msg.type === "catchupEnd") {
    mode = "live";
    const payload = deserializeCatchupPayload(
      gunzipSync(Buffer.concat(chunks)).toString("utf8"),
    );
    adapter.hydrate(payload);
    lastMission = adapter.missionName;
    console.log(`hydrated: epoch=${payload.epoch} mission=${lastMission}`);
    console.log(
      `payload indexes (${payload.initialGhosts.length}): ` +
        payload.initialGhosts.map((g) => g.index).join(","),
    );
    report("POST-HYDRATE");
  }
});
ws.on("error", (err) => {
  console.log("ws error", err);
  process.exit(1);
});

setInterval(() => report("periodic"), 60_000);

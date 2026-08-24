/**
 * Empirical probe: does a live server's serverCmdAttachCommanderCamera
 * accept flag targets from an observer? Joins the server through a full
 * WatchSession (real observer connection with complete protocol
 * handling), waits for flag-marked targets (renderFlags bit 0x2), sends
 * AttachCommanderCamera for each, and prints every CameraAttachResponse
 * plus control-object changes.
 *
 * Usage:
 *   node --env-file-if-exists=.env.development.local --import=tsx/esm \
 *     scripts/attach-camera-probe.ts [serverNameFilter]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { queryServerList } from "../relay/masterQuery.js";
import { WatchSession } from "../relay/watchSession.js";
import type { GameConnection } from "../relay/gameConnection.js";
import type { WatchStateAccumulator } from "../relay/watchState.js";
import type { ServerInfo } from "../relay/types.js";

const filter = (process.argv[2] ?? "blair").toLowerCase();
const MASTER = process.env.T2_MASTER_SERVER || "master.tribesnext.com";
const dirname = path.dirname(fileURLToPath(import.meta.url));
const gameBasePath = path.resolve(dirname, "..", "docs", "base");

/** Private-member access for probing; mirrors the real field types. */
interface SessionInternals {
  connection: GameConnection | null;
  watchState: Pick<WatchStateAccumulator, "resolveNetString"> & {
    targetRenderFlags: Map<number, number>;
    targetNames: Map<number, string>;
    targetTeams: Map<number, number>;
  };
  handleResponderEvent: (data: Record<string, unknown>) => void;
}

function log(...args: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

const servers = await queryServerList(MASTER);
const server = servers.find((s) => s.name?.toLowerCase().includes(filter));
if (!server) {
  console.error(
    `No server matching "${filter}". Servers:`,
    servers.map((s) => `${s.name} (${s.playerCount})`),
  );
  process.exit(1);
}
log(
  `Target: ${server.name} @ ${server.address}`,
  `map=${server.mapName} players=${server.playerCount}`,
);

const cache = new Map<string, ServerInfo>([[server.address, server]]);
const session = new WatchSession(
  server.address,
  { gameBasePath, getCachedServer: (a) => cache.get(a) },
  () => {
    log("session destroyed");
    process.exit(1);
  },
);
const internals = session as unknown as SessionInternals;

// Wrap the responder to see every resolved RemoteCommandEvent.
const origResponder = internals.handleResponderEvent.bind(session);
internals.handleResponderEvent = (data) => {
  if (data.type === "RemoteCommandEvent") {
    const ws = internals.watchState;
    const funcName = ws.resolveNetString((data.funcName as string) ?? "");
    if (/camera|attach|observe|control/i.test(funcName)) {
      const args = ((data.args as string[]) ?? []).map((a) =>
        ws.resolveNetString(a),
      );
      log(`<< commandToClient ${funcName}(${args.join(", ")})`);
    }
  }
  origResponder(data);
};

session.start();

const flagName = (id: number) => {
  const ws = internals.watchState;
  const team = ws.targetTeams.get(id);
  return `target ${id} "${ws.targetNames.get(id) ?? "?"}" sensorGroup=${team}`;
};

/** Flag-marked target ids (renderFlags bit 0x2). */
function flagTargets(): number[] {
  const out: number[] = [];
  for (const [id, flags] of internals.watchState.targetRenderFlags) {
    if (flags & 0x2) out.push(id);
  }
  return out.sort((a, b) => a - b);
}

const startedAt = Date.now();
const probed = new Set<number>();
let probing = false;

const timer = setInterval(async () => {
  const conn = internals.connection;
  const elapsed = Date.now() - startedAt;
  if (elapsed > 120_000) {
    log("TIMEOUT — no probe completed");
    clearInterval(timer);
    session.destroy();
    process.exit(1);
  }
  if (!conn || conn.status !== "connected" || probing) return;
  const flags = flagTargets().filter((id) => !probed.has(id));
  // Give ghosting a beat to settle before probing.
  if (flags.length === 0 || elapsed < 15_000) return;

  probing = true;
  // Control group: a couple of non-flag team targets (players/assets have
  // canObserve datablocks) to separate the canObserve gate from the
  // sensor-group gate.
  const ws = internals.watchState;
  const controls: number[] = [];
  for (const [id, group] of ws.targetTeams) {
    if (controls.length >= 3) break;
    if ((group === 1 || group === 2) && !flags.includes(id)) controls.push(id);
  }
  for (const id of [...flags, ...controls]) {
    probed.add(id);
    log(`>> AttachCommanderCamera ${id} — ${flagName(id)}`);
    conn.sendCommand("AttachCommanderCamera", String(id));
    await new Promise((r) => setTimeout(r, 4000));
  }
  log("probes sent; watching for 10s more...");
  await new Promise((r) => setTimeout(r, 10_000));
  clearInterval(timer);
  session.destroy();
  log("done");
  process.exit(0);
}, 1000);

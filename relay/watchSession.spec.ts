import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { WebSocket } from "ws";
import {
  WatchSessionManager,
  type WatchSessionManagerOptions,
} from "./watchSession";
import { DemoCoordinator } from "./demoCoordinator";
import type { GameConnection } from "./gameConnection";
import type { ServerMessage } from "./types";

class FakeGameConnection extends EventEmitter {
  address: string;
  status = "connecting";
  mapName: string | undefined;
  connectSequence = 0x0badf00d;
  connectCalls = 0;
  disconnectCalls = 0;
  commands: Array<{ command: string; args: string[] }> = [];

  constructor(address: string) {
    super();
    this.address = address;
  }

  async connect(): Promise<void> {
    this.connectCalls++;
  }

  disconnect(): void {
    this.disconnectCalls++;
    this.status = "disconnected";
  }

  sendCommand(command: string, ...args: string[]): void {
    this.commands.push({ command, args });
  }

  setMapName(mapName: string): void {
    this.mapName = mapName;
  }

  setStatus(status: string, message?: string): void {
    this.status = status;
    this.emit("status", status, message);
  }

  noAuthPromotions = 0;

  /** Mirrors GameConnection: an unpoked auth wait ends at Phase1. */
  missionStartedWithoutAuth(): void {
    if (this.status !== "authenticating") return;
    this.noAuthPromotions++;
    this.setStatus("connected");
  }
}

interface SentFrame {
  binary: boolean;
  data: Uint8Array | string;
}

class FakeWebSocket {
  OPEN = 1;
  readyState = 1;
  sent: SentFrame[] = [];

  send(data: Uint8Array | string, opts?: { binary?: boolean }): void {
    this.sent.push({ binary: opts?.binary ?? false, data });
  }

  jsonMessages(): ServerMessage[] {
    return this.sent
      .filter((f) => !f.binary)
      .map((f) => JSON.parse(f.data as string) as ServerMessage);
  }

  binaryFrames(): Uint8Array[] {
    return this.sent.filter((f) => f.binary).map((f) => f.data as Uint8Array);
  }

  /** Message types in send order (catch-up chunks appear as "<binary>"). */
  frameTypes(): string[] {
    return this.sent.map((f) =>
      f.binary
        ? "<binary>"
        : (JSON.parse(f.data as string) as ServerMessage).type,
    );
  }
}

function createManager(extra: Partial<WatchSessionManagerOptions> = {}) {
  const connections: FakeGameConnection[] = [];
  const manager = new WatchSessionManager({
    gameBasePath: "/nonexistent",
    getCachedServer: () => undefined,
    createConnection: (address) => {
      const conn = new FakeGameConnection(address);
      connections.push(conn);
      return conn as unknown as GameConnection;
    },
    ...extra,
  });
  return { manager, connections };
}

describe("WatchSessionManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one game connection between two watchers", () => {
    const { manager, connections } = createManager();
    const ws1 = new FakeWebSocket();
    const ws2 = new FakeWebSocket();

    manager.watch(ws1 as unknown as WebSocket, "1.2.3.4:28000");
    manager.watch(ws2 as unknown as WebSocket, "1.2.3.4");

    expect(connections).toHaveLength(1);
    expect(connections[0].connectCalls).toBe(1);
    expect(manager.getStatusSummary()).toEqual([
      {
        address: "1.2.3.4:28000",
        status: "connecting",
        watchers: 2,
        recording: false,
        pinned: false,
        delayMs: 0,
      },
    ]);
  });

  it("treats a server that starts the mission without T2csri auth as connected", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("authenticating");
    const session = (manager as any).sessions.get("1.2.3.4:28000");
    session.handleResponderEvent({
      type: "RemoteCommandEvent",
      funcName: "MissionStartPhase1",
      args: ["1", "Galadon"],
    });
    expect(conn.noAuthPromotions).toBe(1);
    expect(conn.status).toBe("connected");
    expect(manager.getStatusSummary()[0].status).not.toBe("authenticating");
  });

  it("queues watchers during handshake and delivers ordered catch-up on connect", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];

    // Pending watcher sees status updates but no catch-up yet.
    conn.setStatus("authenticating");
    expect(ws.frameTypes()).toEqual([
      "sessionStatus",
      "watcherCount",
      "sessionStatus",
    ]);

    conn.setStatus("connected");
    // syncing → catchupBegin → chunk(s) → catchupEnd → live.
    const types = ws.frameTypes();
    const begin = types.indexOf("catchupBegin");
    expect(begin).toBeGreaterThan(-1);
    expect(types[begin - 1]).toBe("sessionStatus"); // syncing
    expect(types[begin + 1]).toBe("<binary>");
    expect(types.slice(begin).filter((t) => t === "catchupEnd")).toHaveLength(
      1,
    );
    expect(types[types.length - 1]).toBe("sessionStatus"); // live

    // ScopeCommanderMap + getScores fired on connect.
    expect(conn.commands.map((c) => c.command)).toContain("ScopeCommanderMap");
    expect(conn.commands.map((c) => c.command)).toContain("getScores");

    // Live packets arrive only after the catch-up boundary.
    const packetsBefore = ws.binaryFrames().length;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(ws.binaryFrames()).toHaveLength(packetsBefore + 1);
  });

  it("holds the stream delayed until a server is confirmed non-tournament", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: 1000 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    // Fail-safe: the epoch starts delayed, so nothing is delivered or
    // forwarded yet — the tournament probe went out with connect.
    expect(conn.commands.map((c) => c.command)).toContain("GetVoteMenu");
    expect(ws.frameTypes()).not.toContain("catchupEnd");
    const beforeDelay = ws.binaryFrames().length;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(ws.binaryFrames()).toHaveLength(beforeDelay);
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);

    // The delay elapses: the watcher hydrates from the (past) replica and
    // then receives the buffered packet — one shared connection, no
    // reconnect, so the live pipeline never waited.
    vi.advanceTimersByTime(1000);
    expect(ws.frameTypes()).toContain("catchupEnd");
    expect(ws.binaryFrames().at(-1)).toEqual(new Uint8Array([1, 2, 3]));
    expect(connections).toHaveLength(1);
  });

  it("lifts the delay to live once a server is confirmed non-tournament", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: 1000 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    // Pending during the cold-start window (delayed, nothing delivered).
    expect(ws.frameTypes()).not.toContain("catchupEnd");

    // Not a tournament server: lift the provisional delay, no reconnect.
    const session = manager.getSession("1.2.3.4:28000")!;
    session.setTournamentMode(false);
    expect(manager.getStatusSummary()[0].delayMs).toBe(0);
    expect(connections).toHaveLength(1);
    // The watcher now gets a live catch-up and live-forwarded packets.
    expect(ws.frameTypes()).toContain("catchupEnd");
    const beforeLive = ws.binaryFrames().length;
    conn.emit("packet", new Uint8Array([7, 7, 7]));
    expect(ws.binaryFrames()).toHaveLength(beforeLive + 1);
  });

  it("resolves non-tournament after the mission-drop grace when no banner arrives", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: 1000 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    const session = manager.getSession("1.2.3.4:28000")!;
    // Provisional delay while the decision is pending.
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);

    // The mission-drop burst (MsgClientReady) lands with no tournament
    // banner; a following packet arms the post-drop grace.
    (
      session as unknown as { watchState: { sawMissionDropReady: boolean } }
    ).watchState.sawMissionDropReady = true;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);

    // Grace elapses with no banner → resolved non-tournament → live.
    vi.advanceTimersByTime(4000);
    expect(manager.getStatusSummary()[0].delayMs).toBe(0);
  });

  it("stays delayed when the tournament banner rides the mission-drop burst", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: 1000 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    const session = manager.getSession("1.2.3.4:28000")!;

    // Banner + drop burst in the same packet → resolves tournament at once,
    // so the grace is never armed and the delay holds.
    const ws2 = session as unknown as {
      watchState: { sawMissionDropReady: boolean; tournamentMode: boolean };
    };
    ws2.watchState.sawMissionDropReady = true;
    ws2.watchState.tournamentMode = true;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);

    vi.advanceTimersByTime(10_000);
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);
  });

  it("does not forward pre-attach packets to a late watcher", () => {
    const { manager, connections } = createManager();
    const ws1 = new FakeWebSocket();
    manager.watch(ws1 as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    conn.emit("packet", new Uint8Array([9, 9, 9]));

    const ws2 = new FakeWebSocket();
    manager.watch(ws2 as unknown as WebSocket, "1.2.3.4:28000");
    const catchupChunks = ws2.binaryFrames().length;
    conn.emit("packet", new Uint8Array([4, 4, 4]));

    // ws2 got its catch-up chunks plus exactly the one post-attach packet.
    expect(ws2.binaryFrames()).toHaveLength(catchupChunks + 1);
    const last = ws2.binaryFrames().at(-1)!;
    expect([...last]).toEqual([4, 4, 4]);
  });

  it("disconnects after the idle grace period, cancelled by a new watcher", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");

    manager.detachSocket(ws as unknown as WebSocket);
    expect(conn.disconnectCalls).toBe(0);

    // A new watcher during the grace period cancels the teardown.
    vi.advanceTimersByTime(60_000);
    const ws2 = new FakeWebSocket();
    manager.watch(ws2 as unknown as WebSocket, "1.2.3.4:28000");
    vi.advanceTimersByTime(10 * 60_000);
    expect(conn.disconnectCalls).toBe(0);
    expect(connections).toHaveLength(1);

    // Grace expiry with no watchers tears the session down.
    manager.detachSocket(ws2 as unknown as WebSocket);
    vi.advanceTimersByTime(5 * 60_000);
    expect(conn.disconnectCalls).toBe(1);
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("reconnects on mission cycle and re-delivers catch-up on a new epoch", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn1 = connections[0];
    conn1.setStatus("connected");
    const firstBegin = ws.jsonMessages().find((m) => m.type === "catchupBegin");
    expect(firstBegin).toBeDefined();

    conn1.setStatus("disconnected", "Server is cycling mission");
    // Watcher is re-pended and told we're reconnecting.
    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ status: "connecting" });

    vi.advanceTimersByTime(6000);
    expect(connections).toHaveLength(2);
    const conn2 = connections[1];
    conn2.setStatus("connected");

    const begins = ws
      .jsonMessages()
      .filter((m) => m.type === "catchupBegin") as Array<{ epoch: number }>;
    expect(begins).toHaveLength(2);
    expect(begins[1].epoch).toBe(begins[0].epoch + 1);
  });

  it("relays watcher chat through the shared identity", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    const wsPending = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];

    // Not connected yet: chat is dropped.
    manager.sendChat(ws as unknown as WebSocket, "too early");
    conn.setStatus("connected");

    const chats = () =>
      conn.commands.filter((c) => c.command === "messageSent");

    manager.sendChat(ws as unknown as WebSocket, "  hello observers  ");
    manager.sendChat(ws as unknown as WebSocket, "second");
    expect(chats()).toEqual([
      { command: "messageSent", args: ["hello observers"] },
      { command: "messageSent", args: ["second"] },
    ]);

    // Empty and unknown-socket messages are ignored; long text truncated.
    manager.sendChat(ws as unknown as WebSocket, "   ");
    manager.sendChat(wsPending as unknown as WebSocket, "not attached");
    manager.sendChat(ws as unknown as WebSocket, "x".repeat(400));
    expect(chats()).toHaveLength(3);
    expect(chats()[2].args[0]).toHaveLength(255);
  });

  it("re-syncs from a fresh connection when packet parsing fails", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");

    const session = (manager as any).sessions.get("1.2.3.4:28000");
    const conn1 = connections[0];
    conn1.setStatus("connected");

    session.parserKit.packetParser.parsePacket = () => {
      throw new Error("bad packet");
    };
    const binBefore = ws.binaryFrames().length;
    conn1.emit("packet", new Uint8Array([1, 2, 3]));

    // The bad packet is not forwarded, the watcher is re-pended, and a
    // fresh connection replaces the diverged one.
    expect(ws.binaryFrames()).toHaveLength(binBefore);
    expect(conn1.disconnectCalls).toBe(1);
    expect(connections).toHaveLength(2);
    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ status: "connecting" });

    // The new connection delivers a fresh catch-up on a new epoch.
    connections[1].setStatus("connected");
    const begins = ws
      .jsonMessages()
      .filter((m) => m.type === "catchupBegin") as Array<{ epoch: number }>;
    expect(begins).toHaveLength(2);
    expect(begins[1].epoch).toBe(begins[0].epoch + 1);
  });

  it("re-syncs when the parser reports a fault it swallowed", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");

    const session = (manager as any).sessions.get("1.2.3.4:28000");
    const conn1 = connections[0];
    conn1.setStatus("connected");

    // A ghost the parser could not read: parsePacket returns normally,
    // but its tracker no longer mirrors the server.
    session.parserKit.packetParser.parsePacket = () => ({
      dnetHeader: {},
      rateInfo: {},
      gameState: {},
      events: [],
      ghosts: [
        {
          index: 9,
          type: "create",
          classId: 25,
          updateBitsStart: 0,
          updateBitsEnd: 0,
          failed: true,
        },
      ],
      parseFault: { stage: "ghost", message: "ghost 9 failed" },
    });
    const binBefore = ws.binaryFrames().length;
    conn1.emit("packet", new Uint8Array([1, 2, 3]));

    expect(ws.binaryFrames()).toHaveLength(binBefore);
    expect(conn1.disconnectCalls).toBe(1);
    expect(connections).toHaveLength(2);
    expect(session.resyncCount).toBe(1);
  });

  it("ends the session when re-syncs repeat without a healthy stretch", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");

    const session = (manager as any).sessions.get("1.2.3.4:28000");
    connections[0].setStatus("connected");

    // Each re-sync builds a fresh parser, so re-break it every round.
    for (let i = 0; i < 4; i++) {
      session.parserKit.packetParser.parsePacket = () => {
        throw new Error("bad packet");
      };
      connections.at(-1)!.emit("packet", new Uint8Array([1]));
    }

    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ status: "ended" });
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("ends the session on non-retryable disconnect", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    connections[0].setStatus("connected");
    connections[0].setStatus("disconnected", "You have been kicked");

    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ status: "ended" });
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("retries retryable disconnects for pinned sessions with no watchers", () => {
    const { manager, connections } = createManager();
    manager.pin("1.2.3.4:28000");
    expect(connections).toHaveLength(1);
    connections[0].setStatus("connected");

    // A disconnect-style mission cycle must not destroy a patrol
    // session — the next mission's recording depends on the retry.
    connections[0].setStatus("disconnected", "Server is cycling mission");
    expect(manager.getStatusSummary()).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(connections).toHaveLength(2);
  });

  it("keeps polling scores while a pinned session records without watchers", () => {
    const { manager, connections } = createManager();
    manager.pin("1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    expect(manager.getStatusSummary()[0]).toMatchObject({
      watchers: 0,
      pinned: true,
    });
    const requests = () =>
      conn.commands.filter((c) => c.command === "getScores");
    expect(requests()).toHaveLength(1);
    vi.advanceTimersByTime(12_000);
    expect(requests()).toHaveLength(4);

    conn.setStatus("disconnected", "Server is cycling mission");
    vi.advanceTimersByTime(6_000);
    expect(requests()).toHaveLength(4);
    const reconnected = connections[1];
    reconnected.setStatus("connected");
    vi.advanceTimersByTime(4_000);
    expect(
      reconnected.commands.filter((c) => c.command === "getScores"),
    ).toHaveLength(2);

    manager.shutdown();
    const count = reconnected.commands.length;
    vi.advanceTimersByTime(12_000);
    expect(reconnected.commands).toHaveLength(count);
  });

  it("keeps polling scores after the last watcher leaves during recording grace", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    manager.detachSocket(ws as unknown as WebSocket);
    expect(manager.getStatusSummary()[0].watchers).toBe(0);
    vi.advanceTimersByTime(8_000);
    expect(conn.commands.filter((c) => c.command === "getScores")).toHaveLength(
      3,
    );
    manager.shutdown();
  });

  it("announces relayRestarting to watchers before shutdown teardown", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    connections[0].setStatus("connected");

    manager.shutdown();
    const types = ws.frameTypes();
    const restartIndex = types.indexOf("relayRestarting");
    expect(restartIndex).toBeGreaterThan(-1);
    // The restart notice precedes the session's "ended" teardown status.
    const messages = ws.jsonMessages();
    const endedIndex = messages.findIndex(
      (m) => m.type === "sessionStatus" && m.status === "ended",
    );
    expect(endedIndex).toBeGreaterThan(-1);
    expect(types.indexOf("sessionStatus", restartIndex)).toBeGreaterThan(
      restartIndex,
    );
  });

  it("warm-starts sessions that expire via idle grace if nobody returns", () => {
    const changes: string[][] = [];
    const { manager, connections } = createManager({
      onSessionsChanged: (addresses) => changes.push(addresses),
    });

    manager.warmStart("1.2.3.4");
    expect(connections).toHaveLength(1);
    expect(connections[0].connectCalls).toBe(1);
    expect(changes.at(-1)).toEqual(["1.2.3.4:28000"]);

    // A returning watcher cancels the grace timer and attaches normally.
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    expect(connections).toHaveLength(1);
    vi.advanceTimersByTime(10 * 60_000);
    expect(connections[0].disconnectCalls).toBe(0);

    // With no watchers, a warm-started session expires on its own.
    manager.detachSocket(ws as unknown as WebSocket);
    vi.advanceTimersByTime(5 * 60_000);
    expect(connections[0].disconnectCalls).toBe(1);
    expect(changes.at(-1)).toEqual([]);
  });
});

describe("WatchSession delayed transitions", () => {
  const address = "1.2.3.4:28000";
  const delayMs = 60_000;
  const managers: WatchSessionManager[] = [];

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const manager of managers.splice(0)) manager.shutdown();
    vi.useRealTimers();
  });

  function start() {
    const { manager, connections } = createManager({ tourneyDelayMs: delayMs });
    managers.push(manager);
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    connections[0].setStatus("connected");
    session.setTournamentMode(true);
    vi.advanceTimersByTime(delayMs);
    return { manager, connections, ws, session };
  }

  function statuses(ws: FakeWebSocket) {
    return ws.jsonMessages().filter((m) => m.type === "sessionStatus");
  }

  function catchup(ws: FakeWebSocket) {
    const begin = ws.sent.findIndex(
      (f) => !f.binary && JSON.parse(f.data as string).type === "catchupBegin",
    );
    expect(begin).toBeGreaterThanOrEqual(0);
    const chunks: Uint8Array[] = [];
    for (const frame of ws.sent.slice(begin + 1)) {
      if (!frame.binary) break;
      chunks.push(frame.data as Uint8Array);
    }
    return JSON.parse(gunzipSync(Buffer.concat(chunks)).toString());
  }

  // Seed a mission already parsed on both timelines, then exercise the
  // real packet queue, connection events, socket framing, and catch-up.
  function recordedMission(session: any, name = "OldMap") {
    session.watchState.missionName = name;
    session.replica.watchState.missionName = name;
    session.cachedPayload = null;
    session.recorder = { state: "recording", onPacket: () => false };
    session.fanOutSessionStatus();
    vi.advanceTimersByTime(delayMs);
  }

  function cycle(
    connections: FakeGameConnection[],
    session: ReturnType<WatchSessionManager["getSession"]>,
    tournament: boolean,
  ) {
    connections.at(-1)!.setStatus("disconnected", "Server is cycling mission");
    vi.advanceTimersByTime(6_000);
    connections.at(-1)!.setStatus("connected");
    session!.setTournamentMode(tournament);
  }

  it("moves live viewers to the tournament countdown without sending early packets", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: delayMs });
    managers.push(manager);
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    connections[0].setStatus("connected");
    session.setTournamentMode(false);
    ws.sent = [];
    cycle(connections, session, true);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "syncing",
      streamDelayMs: delayMs,
      streamDelayReadyInMs: delayMs,
    });
    const packet = new Uint8Array([7, 7, 7]);
    connections[1].emit("packet", packet);
    vi.advanceTimersByTime(delayMs - 1);
    expect(ws.binaryFrames()).not.toContainEqual(packet);
    vi.advanceTimersByTime(1);
    expect(ws.binaryFrames()).toContainEqual(packet);
    expect(catchup(ws).epoch).toBe(2);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      streamDelayMs: delayMs,
    });
  });

  it("serves old and new viewers on separate channels until the tournament tail finishes", () => {
    const { manager, connections, ws, session } = start();
    recordedMission(session);
    const oldChannel = statuses(ws).at(-1)!.channelId;
    ws.sent = [];
    const tail = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", tail);
    vi.advanceTimersByTime(100);
    cycle(connections, session, false);
    const state = session as any;
    state.watchState.missionName = "NormalMap";
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(catchup(joiner)).toMatchObject({
      epoch: 2,
      missionName: "NormalMap",
    });
    expect(statuses(joiner).at(-1)).toMatchObject({
      streamDelayMs: 0,
      recording: false,
    });
    expect(statuses(joiner).at(-1)!.channelId).not.toBe(oldChannel);
    joiner.sent = [];
    const current = new Uint8Array([7, 7, 7]);
    connections[1].emit("packet", current);
    expect(joiner.binaryFrames()).toEqual([current]);
    expect(ws.binaryFrames()).toHaveLength(0);
    vi.advanceTimersByTime(delayMs);
    expect(ws.binaryFrames()[0]).toEqual(tail);
    expect(catchup(ws)).toMatchObject({ epoch: 2, missionName: "NormalMap" });
    expect(statuses(ws).at(-1)).toMatchObject({
      streamDelayMs: 0,
      status: "live",
    });
    expect(joiner.binaryFrames()).toEqual([current]);
    expect(statuses(joiner)).toEqual([]);
  });

  it("waits for the mode decision before placing a new arrival on either channel", () => {
    const { manager, connections, session } = start();
    connections[0].setStatus("disconnected", "Server is cycling mission");
    vi.advanceTimersByTime(6_000);
    connections[1].setStatus("connected");
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(joiner.frameTypes()).not.toContain("catchupBegin");
    session.setTournamentMode(false);
    expect(catchup(joiner).epoch).toBe(2);
    expect(statuses(joiner).at(-1)).toMatchObject({ streamDelayMs: 0 });
  });

  it.each(["disconnect", "in-place"])(
    "does not put a new arrival on the old channel during a %s mission change",
    (transition) => {
      const { manager, connections, session } = start();
      if (transition === "disconnect") {
        connections[0].setStatus("disconnected", "Server is cycling mission");
      } else {
        const state = session as any;
        state.watchState.missionName = "OldMap";
        state.handleResponderEvent({
          type: "GhostingMessageEvent",
          message: 2,
        });
      }
      const joiner = new FakeWebSocket();
      manager.watch(joiner as unknown as WebSocket, address);
      expect(joiner.frameTypes()).not.toContain("catchupBegin");
      vi.advanceTimersByTime(6_000);
      connections[1].setStatus("connected");
      session.setTournamentMode(false);
      expect(catchup(joiner).epoch).toBe(2);
      expect(statuses(joiner).at(-1)).toMatchObject({
        streamDelayMs: 0,
        status: "live",
      });
    },
  );

  it("switches a drained channel to the latest normal mission after multiple rapid map cycles", () => {
    const { manager, connections, ws, session } = start();
    ws.sent = [];
    cycle(connections, session, false);
    const normalViewer = new FakeWebSocket();
    manager.watch(normalViewer as unknown as WebSocket, address);
    normalViewer.sent = [];
    cycle(connections, session, false);
    expect(catchup(normalViewer).epoch).toBe(3);
    const snapshotCount = normalViewer
      .frameTypes()
      .filter((t) => t === "catchupEnd").length;
    vi.advanceTimersByTime(delayMs - 6_000);
    expect(catchup(ws).epoch).toBe(3);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      streamDelayMs: 0,
    });
    // Old delayed epoch markers must not rehydrate viewers already live.
    vi.advanceTimersByTime(6_000);
    expect(
      normalViewer.frameTypes().filter((t) => t === "catchupEnd"),
    ).toHaveLength(snapshotCount);
    expect(session.streamDelayMs).toBe(0);
  });

  it("keeps a same-socket catch-up retry on its existing delayed channel", () => {
    const { manager, connections, ws, session } = start();
    cycle(connections, session, false);
    ws.sent = [];
    manager.watch(ws as unknown as WebSocket, address);
    expect(catchup(ws).epoch).toBe(1);
    expect(statuses(ws).at(-1)?.streamDelayMs).toBe(delayMs);
  });

  it.each([false, true])(
    "restarts a dormant connection when a viewer returns after the retry was skipped (tournament=%s)",
    (tournament) => {
      const { manager, connections } = createManager({
        tourneyDelayMs: delayMs,
      });
      managers.push(manager);
      const ws = new FakeWebSocket();
      manager.watch(ws as unknown as WebSocket, address);
      const session = manager.getSession(address)!;
      connections[0].setStatus("connected");
      session.setTournamentMode(tournament);
      if (tournament) vi.advanceTimersByTime(delayMs);
      const channelId = session.getChannelId(ws as unknown as WebSocket);
      connections[0].setStatus("disconnected", "Server is cycling mission");
      manager.detachSocket(ws as unknown as WebSocket);
      vi.advanceTimersByTime(10_000);
      expect(connections).toHaveLength(1);
      const resumed = new FakeWebSocket();
      manager.watch(resumed as unknown as WebSocket, address, channelId);
      expect(connections).toHaveLength(2);
      connections[1].setStatus("connected");
      session.setTournamentMode(false);
      if (tournament) {
        expect(catchup(resumed).epoch).toBe(1);
        expect(statuses(resumed).at(-1)?.streamDelayMs).toBe(delayMs);
        vi.advanceTimersByTime(delayMs);
      }
      expect(statuses(resumed).at(-1)).toMatchObject({
        status: "live",
        streamDelayMs: 0,
      });
      expect(
        resumed
          .jsonMessages()
          .filter((m) => m.type === "catchupBegin")
          .at(-1),
      ).toMatchObject({ epoch: 2 });
    },
  );

  it("reconnects only once when EndGhosting is followed by a server disconnect", () => {
    const { connections, session } = start();
    const state = session as any;
    state.watchState.missionName = "OldMap";
    state.handleResponderEvent({ type: "GhostingMessageEvent", message: 2 });
    connections[0].setStatus("disconnected", "Server is cycling mission");
    vi.advanceTimersByTime(6_000);
    expect(connections).toHaveLength(2);
    connections[1].setStatus("connected");
    session.setTournamentMode(false);
    vi.advanceTimersByTime(delayMs);
    expect(connections).toHaveLength(2);
    expect(connections[1].disconnectCalls).toBe(0);
  });

  it("rejects channel continuity from a destroyed session", () => {
    const { manager, ws, session, connections } = start();
    const oldId = session.getChannelId(ws as unknown as WebSocket);
    manager.shutdown();
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address, oldId);
    connections.at(-1)!.setStatus("connected");
    manager.getSession(address)!.setTournamentMode(false);
    expect(catchup(joiner).epoch).toBe(1);
    expect(statuses(joiner).at(-1)).toMatchObject({ streamDelayMs: 0 });
    expect(statuses(joiner).at(-1)!.channelId).not.toBe(oldId);
  });

  it("resumes a draining channel after socket loss, but cannot resume it after it finishes", () => {
    const { manager, connections, ws, session } = start();
    const channelId = statuses(ws).at(-1)!.channelId;
    cycle(connections, session, false);
    manager.detachSocket(ws as unknown as WebSocket);
    const resumed = new FakeWebSocket();
    manager.watch(resumed as unknown as WebSocket, address, channelId);
    expect(catchup(resumed).epoch).toBe(1);
    expect(statuses(resumed).at(-1)).toMatchObject({
      channelId,
      streamDelayMs: delayMs,
    });
    vi.advanceTimersByTime(delayMs);
    manager.detachSocket(resumed as unknown as WebSocket);
    const returned = new FakeWebSocket();
    manager.watch(returned as unknown as WebSocket, address, channelId);
    expect(catchup(returned).epoch).toBe(2);
    expect(statuses(returned).at(-1)?.streamDelayMs).toBe(0);
  });

  it("keeps the original countdown when a tournament mission ends before its first delayed frame", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: delayMs });
    managers.push(manager);
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    connections[0].setStatus("connected");
    session.setTournamentMode(true);
    const channelId = statuses(ws).at(-1)!.channelId;
    cycle(connections, session, false);
    connections[1].setMapName("FutureMap");
    manager.detachSocket(ws as unknown as WebSocket);
    const resumed = new FakeWebSocket();
    manager.watch(resumed as unknown as WebSocket, address, channelId);
    expect(statuses(resumed).at(-1)).toMatchObject({
      streamDelayMs: delayMs,
      streamDelayReadyInMs: delayMs - 6_000,
    });
    expect(statuses(resumed).at(-1)!.mapName).not.toBe("FutureMap");
    vi.advanceTimersByTime(delayMs - 6_000);
    expect(catchup(resumed).epoch).toBe(1);
    vi.advanceTimersByTime(6_000);
    expect(statuses(resumed).at(-1)).toMatchObject({
      streamDelayMs: 0,
      status: "live",
    });
  });

  it("does not replay old tournament packets or leak new ones during a rapid tournament-normal-tournament switch", () => {
    const { manager, connections, ws, session } = start();
    ws.sent = [];
    const oldPacket = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", oldPacket);
    cycle(connections, session, false);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(catchup(joiner).epoch).toBe(2);
    joiner.sent = [];
    cycle(connections, session, true);
    const newPacket = new Uint8Array([7, 7, 7]);
    connections[2].emit("packet", newPacket);
    vi.advanceTimersByTime(delayMs - 1);
    expect(ws.binaryFrames()).toEqual([oldPacket]);
    expect(joiner.binaryFrames()).toHaveLength(0);
    expect(statuses(ws).at(-1)).toMatchObject({
      streamDelayMs: delayMs,
      status: "syncing",
    });
    vi.advanceTimersByTime(1);
    expect(catchup(ws).epoch).toBe(3);
    expect(catchup(joiner).epoch).toBe(3);
    expect(joiner.binaryFrames()).not.toContainEqual(oldPacket);
    expect(ws.binaryFrames().at(-1)).toEqual(newPacket);
    expect(joiner.binaryFrames().at(-1)).toEqual(newPacket);
  });

  it("ends the live channel immediately but drains the delayed channel on terminal disconnect", () => {
    const { manager, connections, ws, session } = start();
    ws.sent = [];
    const packet = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", packet);
    cycle(connections, session, false);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    joiner.sent = [];
    connections[1].setStatus("disconnected", "You have been kicked");
    expect(statuses(joiner).at(-1)).toMatchObject({
      status: "ended",
      streamDelayMs: 0,
    });
    expect(statuses(ws)).toHaveLength(0);
    vi.advanceTimersByTime(delayMs);
    expect(ws.binaryFrames()).toContainEqual(packet);
    expect(joiner.binaryFrames()).toHaveLength(0);
    expect(manager.has(address)).toBe(false);
  });

  it("keeps status, recording and catch-ups on the old timeline while the upstream reconnects", () => {
    const { manager, connections, ws, session } = start();
    recordedMission(session);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      recording: true,
      streamDelayMs: delayMs,
    });
    ws.sent = [];
    const tail = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", tail);
    vi.advanceTimersByTime(100);
    connections[0].setStatus("disconnected", "Server is cycling mission");
    // The recording stopped upstream, but nothing changed at the playhead.
    expect(ws.sent).toHaveLength(0);

    const joiner = new FakeWebSocket();
    manager.watch(
      joiner as unknown as WebSocket,
      address,
      session.getChannelId(ws as unknown as WebSocket),
    );
    expect(catchup(joiner)).toMatchObject({ epoch: 1, missionName: "OldMap" });
    expect(statuses(joiner).at(-1)).toMatchObject({
      status: "live",
      mapName: "OldMap",
      recording: true,
      streamDelayMs: delayMs,
    });

    vi.advanceTimersByTime(6_000);
    connections[1].setMapName("FutureMap");
    connections[1].setStatus("authenticating");
    connections[1].setStatus("connected");
    // Even the next epoch's unresolved tournament decision stays private.
    expect(statuses(ws)).toHaveLength(0);
    const laterJoiner = new FakeWebSocket();
    manager.watch(laterJoiner as unknown as WebSocket, address);
    expect(laterJoiner.frameTypes()).not.toContain("catchupBegin");
    session.setTournamentMode(true);
    expect(statuses(laterJoiner).at(-1)).toMatchObject({
      mapName: "OldMap",
      recording: true,
      streamDelayMs: delayMs,
    });

    vi.advanceTimersByTime(delayMs - 6_100);
    expect(ws.binaryFrames()).toEqual([tail]);
    expect(statuses(ws)).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "connecting",
      streamDelayMs: delayMs,
    });
    expect(statuses(ws).some((s) => s.status === "ended")).toBe(false);
    vi.advanceTimersByTime(6_000);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      mapName: "FutureMap",
      streamDelayMs: delayMs,
    });
  });

  it("drains a terminal disconnect and still accepts catch-ups until the delayed end", () => {
    const { manager, connections, ws, session } = start();
    recordedMission(session);
    ws.sent = [];
    const tail = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", tail);
    vi.advanceTimersByTime(100);
    connections[0].setStatus("disconnected", "You have been kicked");
    expect(manager.has(address)).toBe(true);
    expect(ws.sent).toHaveLength(0);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(catchup(joiner).epoch).toBe(1);
    expect(statuses(joiner).at(-1)).toMatchObject({
      recording: true,
      streamDelayMs: delayMs,
    });
    vi.advanceTimersByTime(delayMs - 100);
    expect(ws.binaryFrames()).toEqual([tail]);
    expect(manager.has(address)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "ended",
      message: "You have been kicked",
    });
    expect(manager.has(address)).toBe(false);
    expect(connections).toHaveLength(1);
  });

  it("finishes the tournament tail before lifting delay on the next normal-mode epoch", () => {
    const { connections, ws, session } = start();
    ws.sent = [];
    const tail = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", tail);
    vi.advanceTimersByTime(100);
    connections[0].setStatus("disconnected", "Server is cycling mission");
    vi.advanceTimersByTime(6_000);
    connections[1].setStatus("connected");
    session.setTournamentMode(false);
    expect(session.streamDelayMs).toBe(delayMs);
    expect(ws.sent).toHaveLength(0);
    vi.advanceTimersByTime(delayMs - 6_100);
    expect(ws.binaryFrames()).toEqual([tail]);
    vi.advanceTimersByTime(6_100);
    expect(session.streamDelayMs).toBe(0);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      streamDelayMs: 0,
    });
    expect(catchup(ws).epoch).toBe(2);
    const before = ws.binaryFrames().length;
    connections[1].emit("packet", new Uint8Array([7, 7, 7]));
    expect(ws.binaryFrames()).toHaveLength(before + 1);
  });

  it("lifts provisional delays promptly across ordinary non-tournament cycles", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: delayMs });
    managers.push(manager);
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    expect(statuses(ws).at(-1)?.streamDelayMs).toBe(0);
    connections[0].setStatus("connected");
    session.setTournamentMode(false);
    expect(session.streamDelayMs).toBe(0);
    connections[0].setStatus("disconnected", "Server is cycling mission");
    vi.advanceTimersByTime(6_000);
    connections[1].setStatus("connected");
    expect(statuses(ws).at(-1)?.streamDelayMs).toBe(0);
    session.setTournamentMode(false);
    // There is no old delayed tail, so the next mission need not wait a minute.
    expect(session.streamDelayMs).toBe(0);
    expect(
      ws.frameTypes().filter((type) => type === "catchupEnd"),
    ).toHaveLength(2);
  });

  it("rotates unrecorded missions too, without cutting off the delayed stream", () => {
    const { manager, connections, ws, session } = start();
    const state = session as any;
    state.watchState.missionName = "OldMap";
    state.replica.watchState.missionName = "OldMap";
    ws.sent = [];
    state.handleResponderEvent({ type: "GhostingMessageEvent", message: 2 });
    vi.advanceTimersByTime(5_000);
    expect(connections).toHaveLength(2);
    expect(ws.sent).toHaveLength(0);
    const joiner = new FakeWebSocket();
    manager.watch(
      joiner as unknown as WebSocket,
      address,
      session.getChannelId(ws as unknown as WebSocket),
    );
    expect(catchup(joiner)).toMatchObject({ epoch: 1, missionName: "OldMap" });
  });

  it("includes delayed mission-phase metadata in reconnect snapshots", () => {
    const { manager, connections, session } = start();
    const state = session as any;
    const parsed = {
      gameState: {},
      ghosts: [],
      events: [
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "MissionStartPhase1",
            args: ["1", "DelayedMap"],
          },
        },
      ],
    };
    state.parserKit.packetParser.parsePacket = () => parsed;
    state.replica.kit.packetParser.parsePacket = () => parsed;
    connections[0].emit("packet", new Uint8Array([1, 2, 3]));
    vi.advanceTimersByTime(delayMs);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(catchup(joiner).missionName).toBe("DelayedMap");
    expect(statuses(joiner).at(-1)).toMatchObject({ mapName: "DelayedMap" });
  });

  it.each([0, delayMs])(
    "hydrates at the complete packet boundary when handshake/delay resolves inside a packet (delay=%d)",
    (tourneyDelayMs) => {
      const { manager, connections } = createManager({ tourneyDelayMs });
      managers.push(manager);
      const ws = new FakeWebSocket();
      manager.watch(ws as unknown as WebSocket, address);
      const session = manager.getSession(address) as any;
      connections[0].setStatus(tourneyDelayMs ? "connected" : "authenticating");
      session.watchState.tournamentMode = false;
      session.parserKit.packetParser.parsePacket = () => ({
        gameState: {},
        ghosts: [],
        events: [
          {
            parsedData: {
              type: "RemoteCommandEvent",
              funcName: "MissionStartPhase1",
              args: ["1", "NewMap"],
            },
          },
        ],
      });
      connections[0].emit("packet", new Uint8Array([1, 2, 3]));
      expect(catchup(ws).missionName).toBe("NewMap");
      // One compressed snapshot; its packet must not also be raw-forwarded.
      expect(ws.binaryFrames()).toHaveLength(1);
    },
  );

  it("still drains to completion if the upstream ends while a delay lift is pending", () => {
    const { manager, connections, ws, session } = start();
    connections[0].emit("packet", new Uint8Array([1, 2, 3]));
    vi.advanceTimersByTime(100);
    connections[0].setStatus("disconnected", "Server is cycling mission");
    vi.advanceTimersByTime(6_000);
    connections[1].setStatus("connected");
    session.setTournamentMode(false);
    connections[1].emit("packet", new Uint8Array([7, 7, 7]));
    connections[1].setStatus("disconnected", "You have been kicked");
    vi.advanceTimersByTime(delayMs);
    expect(ws.binaryFrames()).toContainEqual(new Uint8Array([1, 2, 3]));
    expect(ws.binaryFrames()).toContainEqual(new Uint8Array([7, 7, 7]));
    expect(statuses(ws).at(-1)).toMatchObject({ status: "ended" });
    expect(manager.has(address)).toBe(false);
  });

  it("stops forwarding a failed replica and repairs it with a fresh epoch", () => {
    const { manager, connections, ws, session } = start();
    ws.sent = [];
    const state = session as any;
    const parse = vi.fn(() => ({ parseFault: { message: "bad ghost" } }));
    state.replica.kit.packetParser.parsePacket = parse;
    connections[0].emit("packet", new Uint8Array([1, 2, 3]));
    connections[0].emit("packet", new Uint8Array([1, 2, 3]));
    vi.advanceTimersByTime(delayMs);
    expect(parse).toHaveBeenCalledOnce();
    expect(ws.binaryFrames()).toHaveLength(0);
    expect(connections).toHaveLength(2);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(joiner.frameTypes()).not.toContain("catchupBegin");
    connections[1].setStatus("connected");
    vi.advanceTimersByTime(delayMs);
    expect(statuses(ws).at(-1)).toMatchObject({ status: "live" });
    expect(catchup(joiner).epoch).toBe(2);
  });
});

describe("WatchSession demo recording", () => {
  // Real timers: recorder finalize does real fs work. The mission-cycle
  // linger is zeroed so rotations happen on the next timer tick.
  beforeEach(() => {
    process.env.WATCH_CYCLE_LINGER_MS = "0";
  });
  afterEach(() => {
    delete process.env.WATCH_CYCLE_LINGER_MS;
  });
  const flushImmediate = () => new Promise((r) => setImmediate(r));

  async function createRecordingManager(
    overrides: { minPlayers?: number } = {},
  ) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "watch-demo-"));
    const finalized: string[] = [];
    const coordinator = new DemoCoordinator({
      enabled: true,
      dir,
      minFreeBytes: 0,
      maxBytes: 512 * 1024 * 1024,
      minLengthMs: 0,
      minPlayers: overrides.minPlayers ?? 0,
      recorderName: "Observer",
      onFinalized: (filePath) => finalized.push(filePath),
    });
    const connections: FakeGameConnection[] = [];
    const manager = new WatchSessionManager({
      gameBasePath: "/nonexistent",
      getCachedServer: () => undefined,
      demoCoordinator: coordinator,
      createConnection: (address) => {
        const conn = new FakeGameConnection(address);
        connections.push(conn);
        return conn as unknown as GameConnection;
      },
    });
    return { manager, connections, coordinator, finalized, dir };
  }

  function getSession(manager: WatchSessionManager) {
    return (manager as any).sessions.get("1.2.3.4:28000");
  }

  function firePhase1(session: any, missionName: string): void {
    session.handleResponderEvent({
      type: "RemoteCommandEvent",
      funcName: "MissionStartPhase1",
      args: ["1", missionName],
    });
  }

  function fireEndGhosting(session: any): void {
    session.handleResponderEvent({
      type: "GhostingMessageEvent",
      message: 2,
      sequence: 0,
      ghostCount: 0,
    });
  }

  it("starts recording at Phase1 and broadcasts the recording flag", async () => {
    const { manager, connections } = await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");

    expect(session.recorder).not.toBeNull();
    expect(session.recorder.state).toBe("buffering");
    expect(manager.getStatusSummary()[0].recording).toBe(false);

    firePhase1(session, "Katabatic");
    expect(session.recorder.state).toBe("recording");
    expect(manager.getStatusSummary()[0].recording).toBe(true);
    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ recording: true });

    manager.shutdown();
  });

  it("records roster events before a same-packet mission cycle finalizes the demo", async () => {
    const { manager, connections, finalized, coordinator, dir } =
      await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");
    const commands = [
      ["MsgClientJoin", "Welcome", "Actual observer name", "7", "1"],
      ["MsgMissionStart", "Match started"],
      ["MsgClientJoin", "", "Alice", "10", "2"],
      ["MsgClientNameChanged", "", "Alice", "Bob", "10"],
      ["MsgClientDrop", "", "Bob", "10"],
    ];
    session.parserKit.packetParser.parsePacket = () => ({
      gameState: {},
      ghosts: [],
      events: [
        ...commands.map((args) => ({
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args,
          },
        })),
        {
          parsedData: {
            type: "GhostingMessageEvent",
            message: 2,
            sequence: 0,
            ghostCount: 0,
          },
        },
      ],
    });
    try {
      connections[0].emit("packet", new Uint8Array([1, 2, 3]));
      expect(session.recorder).toBeNull();
      await vi.waitFor(() => expect(finalized).toHaveLength(1));
      const sidecar = JSON.parse(
        await fsp.readFile(`${finalized[0]}.json`, "utf8"),
      );
      expect(sidecar.players).toEqual(["Alice", "Bob"]);
      expect(sidecar.playerCount).toBe(2);
    } finally {
      manager.shutdown();
      await coordinator.shutdown(5000);
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it("rotates the recording on EndGhosting via a reconnect that skips the resync budget", async () => {
    const { manager, connections, finalized, coordinator } =
      await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");
    // Satisfy the keep gates (players gate is 0 in these tests).
    session.watchState.matchStarted = true;
    const firstRecorder = session.recorder;

    fireEndGhosting(session);
    expect(session.recorder).toBeNull();
    await vi.waitFor(() => expect(connections).toHaveLength(2));
    expect(connections[0].disconnectCalls).toBe(1);
    expect(session.resyncCount).toBe(0);
    connections[1].setStatus("connected");
    expect(session.recorder).not.toBeNull();
    expect(session.recorder).not.toBe(firstRecorder);

    // The mission-N demo was finalized and handed to the upload queue.
    // No cached server info in this fake, so the slug is the address.
    await vi.waitFor(() => expect(finalized).toHaveLength(1));
    expect(finalized[0]).toMatch(
      /1-2-3-4-28000_\d{8}T\d{4}_katabatic_[0-9a-f]{6}\.rec$/,
    );
    expect(coordinator.getStats()).toMatchObject({
      enabled: true,
      buffering: 1, // the new epoch's recorder, pre-Phase1
      recording: 0,
      started: 2,
      kept: 1,
      dropped: 0,
      failed: 0,
    });

    manager.shutdown();
  });

  it("keeps buffering through a cycle that arrives before Phase1", async () => {
    const { manager, connections } = await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    const recorder = session.recorder;
    expect(recorder.state).toBe("buffering");

    // Joined mid-cycle: EndGhosting before any Phase1. The from-connect
    // stream stays valid — no rotation, no reconnect.
    fireEndGhosting(session);
    await flushImmediate();
    await flushImmediate();
    expect(connections).toHaveLength(1);
    expect(session.recorder).toBe(recorder);

    // The new mission's Phase1 flushes the buffer under its name.
    firePhase1(session, "Damnation");
    expect(recorder.state).toBe("recording");

    manager.shutdown();
  });

  it("reconnects on every mission cycle, however short the previous map", async () => {
    const { manager, connections } = await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");

    fireEndGhosting(session);
    await vi.waitFor(() => expect(connections).toHaveLength(2));
    connections[1].setStatus("connected");
    firePhase1(session, "Damnation");
    const secondRecorder = session.recorder;

    // A second cycle right after the first: no "ride in place" any more,
    // so every map change reconnects into a fresh epoch (which is what
    // re-decides tournament mode per mission).
    fireEndGhosting(session);
    await vi.waitFor(() => expect(connections).toHaveLength(3));
    // The Damnation recording was rotated out; the new epoch buffers.
    expect(session.recorder).not.toBe(secondRecorder);
    expect(session.recorder?.state).toBe("buffering");

    manager.shutdown();
  });

  it("finalizes the recording on disconnect-style mission cycles and session end", async () => {
    const { manager, connections, coordinator } =
      await createRecordingManager();
    const finalizeSpy = vi.spyOn(coordinator, "finalize");
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");

    connections[0].setStatus("disconnected", "Server is cycling mission");
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
    expect(session.recorder).toBeNull();

    manager.shutdown();
  });

  it("drops recordings from sessions that never had enough players", async () => {
    const { manager, connections, coordinator, finalized } =
      await createRecordingManager({ minPlayers: 2 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");
    expect(session.recorder.state).toBe("recording");

    // Empty roster the whole session → peak 0 < 2 → dropped at the end.
    connections[0].setStatus("disconnected", "You have been kicked");
    await vi.waitFor(() =>
      expect(coordinator.getStats()).toMatchObject({ dropped: 1, kept: 0 }),
    );
    expect(finalized).toEqual([]);

    manager.shutdown();
  });

  it("does not reconnect before the first mission is known when recording is disabled", async () => {
    const connections: FakeGameConnection[] = [];
    const manager = new WatchSessionManager({
      gameBasePath: "/nonexistent",
      getCachedServer: () => undefined,
      createConnection: (address) => {
        const conn = new FakeGameConnection(address);
        connections.push(conn);
        return conn as unknown as GameConnection;
      },
    });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");

    expect(session.recorder).toBeNull();
    fireEndGhosting(session);
    await flushImmediate();
    await flushImmediate();
    expect(connections).toHaveLength(1);
    expect(connections[0].disconnectCalls).toBe(0);

    manager.shutdown();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

  it("rides a second mission cycle in place within the reconnect guard window", async () => {
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

    fireEndGhosting(session);
    await flushImmediate();
    await new Promise((r) => setTimeout(r, 25));
    // No third connection — but the recording still stopped.
    expect(connections).toHaveLength(2);
    expect(session.recorder).toBeNull();

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

  it("creates no recorder and keeps in-place mission cycles when disabled", async () => {
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

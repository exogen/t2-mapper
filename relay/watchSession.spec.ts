import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { WatchSessionManager } from "./watchSession";
import type { GameConnection } from "./gameConnection";
import type { ServerMessage } from "./types";

class FakeGameConnection extends EventEmitter {
  address: string;
  status = "connecting";
  mapName: string | undefined;
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

function createManager() {
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
      { address: "1.2.3.4:28000", status: "connecting", watchers: 2 },
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
});

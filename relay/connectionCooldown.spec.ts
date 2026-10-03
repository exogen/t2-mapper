import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { BitStreamWriter } from "./BitStreamWriter";
import { writeString } from "./HuffmanWriter";
import { ConnectionCooldowns } from "./connectionCooldown";
import { GameConnection } from "./gameConnection";
import { WatchSessionManager } from "./watchSession";
import { getReconnectDelayMs, isRetryableDisconnect } from "./shared";
import { connLog } from "./logger";

vi.mock("./auth", () => ({ loadCredentials: () => null }));

const address = "192.0.2.1:28000";
const missionCyclingReason =
  "Server is cycling missions.  Please try to connect in a moment.";

class Socket extends EventEmitter {
  send = vi.fn();
  close = vi.fn();
}

function reject(socket: Socket, type: 28 | 34 | 38, reason: string) {
  const challenge = socket.send.mock.calls[0][0] as Uint8Array;
  const clientSeq = Buffer.from(challenge).readUInt32LE(5);
  const packet = new BitStreamWriter();
  packet.writeU8(type);
  if (type !== 28) packet.writeU32(0);
  packet.writeU32(clientSeq);
  writeString(packet, reason);
  socket.emit("message", Buffer.from(packet.getBuffer()));
}

describe("relay connection cooldowns", () => {
  let cooldowns: ConnectionCooldowns;
  let sockets: Socket[];
  let connections: GameConnection[];
  let managers: WatchSessionManager[];

  beforeEach(() => {
    vi.useFakeTimers();
    cooldowns = new ConnectionCooldowns();
    sockets = [];
    connections = [];
    managers = [];
    vi.spyOn(dgram, "createSocket").mockImplementation(() => {
      const socket = new Socket();
      sockets.push(socket);
      return socket as unknown as dgram.Socket;
    });
  });

  afterEach(() => {
    for (const manager of managers) manager.shutdown();
    for (const conn of connections) conn.disconnect();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function connection(
    server = address,
    options: ConstructorParameters<typeof GameConnection>[1] = {},
  ) {
    const conn = new GameConnection(server, { cooldowns, ...options });
    connections.push(conn);
    return conn;
  }

  it.each([
    [28, missionCyclingReason, 5_000, true],
    [34, "CR_YOUAREBANNED", 30_000, false],
    [38, "Connection stalled", 30_000, true],
  ] as const)(
    "logs the exact reason and selected policy for packet %s",
    async (type, reason, cooldownMs, autoRetry) => {
      const info = vi.spyOn(connLog, "info").mockImplementation(() => {});
      await connection().connect();
      reject(sockets[0], type, reason);
      expect(info).toHaveBeenCalledWith(
        { address, status: "challenging", reason, cooldownMs, autoRetry },
        "Game connection failed — retry policy selected",
      );
      info.mockClear();
      await connection().connect();
      expect(info).toHaveBeenCalledWith(
        { address, reason },
        "Connection blocked by failure cooldown",
      );
      expect(sockets).toHaveLength(1);
    },
  );

  it.each([28, 34, 38] as const)(
    "blocks fresh connections for 30s after rejection/disconnect packet %s",
    async (type) => {
      await connection().connect();
      reject(sockets[0], type, "You are banned");
      for (let i = 0; i < 10; i++) {
        const retry = connection(i % 2 ? "192.0.2.1" : address);
        const status = vi.fn();
        const close = vi.fn();
        retry.on("status", status);
        retry.on("close", close);
        await retry.connect();
        expect(status).toHaveBeenCalledWith("disconnected", "You are banned");
        expect(close).toHaveBeenCalledOnce();
        expect(retry.cooldownBlocked).toBe(true);
      }
      vi.advanceTimersByTime(29_999);
      await connection().connect();
      expect(sockets).toHaveLength(1);
      vi.advanceTimersByTime(1);
      await connection().connect();
      expect(sockets).toHaveLength(2);
      expect(sockets[1].send).toHaveBeenCalledOnce();
    },
  );

  it("allows a new connection exactly 5s after the binary's mission-cycle ChallengeReject", async () => {
    await connection().connect();
    reject(sockets[0], 28, missionCyclingReason);
    vi.advanceTimersByTime(4_999);
    await connection().connect();
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await connection().connect();
    expect(sockets).toHaveLength(2);
    expect(isRetryableDisconnect(missionCyclingReason)).toBe(true);
  });

  it("does not delay other servers or ordinary intentional disconnects", async () => {
    const first = connection();
    await first.connect();
    first.disconnect();
    await connection().connect();
    expect(sockets).toHaveLength(2);
    reject(sockets[1], 28, "Banned");
    await connection("192.0.2.2:28000").connect();
    expect(sockets).toHaveLength(3);
  });

  it("shares cooldowns by default without caller-specific configuration", async () => {
    await connection(address, { cooldowns: undefined }).connect();
    reject(sockets[0], 28, "Banned");
    await connection(address, { cooldowns: undefined }).connect();
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    await connection(address, { cooldowns: undefined }).connect();
    expect(sockets).toHaveLength(2);
  });

  it("applies a 10-second cooldown after a silent handshake timeout", async () => {
    await connection().connect();
    vi.advanceTimersByTime(30_000);
    await connection().connect();
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(9_999);
    await connection().connect();
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await connection().connect();
    expect(sockets).toHaveLength(2);
  });

  it("applies cooldown after socket errors", async () => {
    const conn = connection();
    conn.on("error", () => {});
    await conn.connect();
    sockets[0].emit("error", new Error("Network unreachable"));
    await connection().connect();
    expect(sockets).toHaveLength(1);
    expect(cooldowns.getMessage(address)).toBe("Network unreachable");
  });

  it("fails immediately with the UDP send error instead of waiting for a generic timeout", async () => {
    const conn = connection();
    const error = vi.fn();
    const status = vi.fn();
    conn.on("error", error);
    conn.on("status", status);
    await conn.connect();
    const sendError = Object.assign(
      new Error("getaddrinfo ENOTFOUND server.invalid"),
      {
        code: "ENOTFOUND",
      },
    );
    const onSent = sockets[0].send.mock.calls[0][3];
    onSent(sendError);
    expect(status).toHaveBeenLastCalledWith("disconnected", sendError.message);
    expect(error).toHaveBeenCalledExactlyOnceWith(sendError);
    expect(sockets[0].close).toHaveBeenCalledOnce();
    await connection().connect();
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(10_000);
    await connection().connect();
    expect(sockets).toHaveLength(2);
    expect(sockets[0].send).toHaveBeenCalledOnce();
  });

  it("ignores late socket and send errors after an intentional disconnect", async () => {
    const conn = connection();
    const error = vi.fn();
    conn.on("error", error);
    await conn.connect();
    const onSent = sockets[0].send.mock.calls[0][3];
    conn.disconnect();
    const lateError = Object.assign(new Error("send EHOSTUNREACH"), {
      code: "EHOSTUNREACH",
    });
    onSent(lateError);
    sockets[0].emit("error", lateError);
    expect(error).not.toHaveBeenCalled();
    expect(cooldowns.getMessage(address)).toBeUndefined();
    await connection().connect();
    expect(sockets).toHaveLength(2);
  });

  it("cleans up retry timers when a UDP send throws synchronously", async () => {
    const socket = new Socket();
    const sendError = Object.assign(new Error("send EHOSTUNREACH"), {
      code: "EHOSTUNREACH",
    });
    socket.send.mockImplementation(() => {
      throw sendError;
    });
    vi.mocked(dgram.createSocket).mockReturnValueOnce(
      socket as unknown as dgram.Socket,
    );
    const conn = connection();
    const error = vi.fn();
    conn.on("error", error);
    await conn.connect();
    expect(error).toHaveBeenCalledExactlyOnceWith(sendError);
    expect(conn.status).toBe("disconnected");
    expect(socket.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1); // Only the cooldown remains.
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(socket.send).toHaveBeenCalledOnce();
  });

  it("uses the OS error code to apply a 10-second unreachable-server cooldown", async () => {
    const info = vi.spyOn(connLog, "info").mockImplementation(() => {});
    const conn = connection();
    conn.on("error", () => {});
    const status = vi.fn();
    conn.on("status", status);
    await conn.connect();
    sockets[0].emit(
      "error",
      Object.assign(new Error("Destination unavailable"), {
        code: "EHOSTUNREACH",
      }),
    );
    expect(status).toHaveBeenLastCalledWith(
      "disconnected",
      "EHOSTUNREACH: Destination unavailable",
    );
    expect(info).toHaveBeenCalledWith(
      {
        address,
        status: "challenging",
        reason: "EHOSTUNREACH: Destination unavailable",
        cooldownMs: 10_000,
        autoRetry: false,
      },
      "Game connection failed — retry policy selected",
    );
    vi.advanceTimersByTime(9_999);
    await connection().connect();
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await connection().connect();
    expect(sockets).toHaveLength(2);
  });

  it("applies cooldown after credential lookup fails", async () => {
    const conn = connection(address, {
      getJoinPassword: async () => {
        throw new Error("Lookup failed");
      },
    });
    await expect(conn.connect()).rejects.toThrow("Lookup failed");
    await connection().connect();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].send).not.toHaveBeenCalled();
  });

  it("checks again after an asynchronous lookup to prevent a late handshake", async () => {
    let resolve!: (password: undefined) => void;
    const pending = connection(address, {
      getJoinPassword: () =>
        new Promise((done) => {
          resolve = done;
        }),
    }).connect();
    await connection().connect();
    reject(sockets[1], 28, "Banned");
    resolve(undefined);
    await pending;
    expect(sockets[0].send).not.toHaveBeenCalled();
    expect(sockets[0].close).toHaveBeenCalledOnce();
  });

  it("does not let a mission-cycle failure shorten an existing failure cooldown", () => {
    cooldowns.recordFailure("EXAMPLE.COM", "Banned");
    vi.advanceTimersByTime(1_000);
    cooldowns.recordFailure("example.com:28000", missionCyclingReason);
    vi.advanceTimersByTime(28_999);
    expect(cooldowns.getMessage("example.com")).toBe(missionCyclingReason);
    vi.advanceTimersByTime(1);
    expect(cooldowns.getMessage("example.com")).toBeUndefined();
    expect(getReconnectDelayMs("Connection stalled")).toBe(30_000);
    expect(getReconnectDelayMs(undefined)).toBe(30_000);
  });

  it.each(["Banned", missionCyclingReason, "Connection stalled"])(
    "retains cooldown and reason %s after a watch session is destroyed",
    async (reason) => {
      const manager = new WatchSessionManager({
        gameBasePath: "/nonexistent",
        getCachedServer: () => undefined,
        createConnection: (server) => connection(server),
      });
      managers.push(manager);
      function watch() {
        const ws = { OPEN: 1, readyState: 1, send: vi.fn() };
        manager.watch(ws as unknown as WebSocket, address);
        return ws;
      }
      const firstViewer = watch();
      // Simulate a failed warm-start with no attached viewers to auto-retry for.
      manager.detachSocket(firstViewer as unknown as WebSocket);
      reject(sockets[0], 28, reason);
      expect(manager.has(address)).toBe(false);
      for (let i = 0; i < 3; i++) {
        const viewer = watch();
        await Promise.resolve();
        const statuses = viewer.send.mock.calls.map(([data]) =>
          JSON.parse(data),
        );
        expect(statuses.at(-1)).toMatchObject({
          type: "sessionStatus",
          status: "ended",
          message: reason,
        });
        expect(manager.has(address)).toBe(false);
      }
      expect(sockets).toHaveLength(1);
      vi.advanceTimersByTime(30_000);
      expect(sockets).toHaveLength(1);
      watch();
      expect(sockets).toHaveLength(2);
    },
  );

  it.each([undefined, "", "   "])(
    "uses a generic failure message when no reason is available (%s)",
    (reason) => {
      cooldowns.recordFailure(address, reason);
      expect(cooldowns.getMessage(address)).toBe(
        "Unable to connect to this server. Please try again later.",
      );
      vi.advanceTimersByTime(29_999);
      expect(cooldowns.getMessage(address)).toBe(
        "Unable to connect to this server. Please try again later.",
      );
      vi.advanceTimersByTime(1);
      expect(cooldowns.getMessage(address)).toBeUndefined();
    },
  );
});

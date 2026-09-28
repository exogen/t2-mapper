import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "./types";

const harness = vi.hoisted(() => ({
  server: null as EventEmitter | null,
  sendCommand: vi.fn(),
  sendChat: vi.fn(),
  sendMoves: vi.fn(),
  handleGhostAlwaysDone: vi.fn(),
  computeAndSendCRC: vi.fn(),
  logs: [] as Record<string, any>[],
}));

vi.mock("node:http", () => ({
  default: { createServer: () => ({ listen: vi.fn() }) },
}));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    WebSocket: { OPEN: 1 },
    WebSocketServer: class extends EventEmitter {
      clients = new Set();
      constructor() {
        super();
        harness.server = this;
      }
    },
  };
});
vi.mock("./gameConnection", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    GameConnection: class extends EventEmitter {
      setMapName() {}
      async connect() {
        this.emit("status", "connected");
      }
      disconnect() {
        this.emit("close");
      }
      sendCommand = harness.sendCommand;
      sendMoves = harness.sendMoves;
      handleGhostAlwaysDone = harness.handleGhostAlwaysDone;
      computeAndSendCRC = harness.computeAndSendCRC;
    },
  };
});
vi.mock("./watchSession", async () => {
  const { normalizeAddress } = await import("./shared");
  return {
    normalizeAddress,
    WatchSessionManager: class {
      has() {
        return true;
      }
      watch() {}
      detachSocket() {}
      getSession() {
        return undefined;
      }
      sendChat = harness.sendChat;
    },
  };
});
vi.mock("./demoUpload", () => ({
  loadUploadConfig: () => undefined,
  DemoUploader: class {
    enabled = false;
  },
}));
vi.mock("./demoCoordinator", () => ({ DemoCoordinator: class {} }));
vi.mock("./logger", async () => {
  const { default: pino } = await import("pino");
  const log = pino(
    { level: "debug" },
    {
      write(line) {
        harness.logs.push(JSON.parse(line));
      },
    },
  );
  return {
    relayLog: log,
    connLog: log,
    demoLog: log,
    authLog: log,
    masterLog: log,
    crcLog: log,
  };
});

/** Real relay message dispatch with fake transports; no network or account. */
class Browser extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  async request(message: ClientMessage) {
    const listener = this.listeners("message")[0];
    await listener(Buffer.from(JSON.stringify(message)), false);
  }
}

describe("relay browser input", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.logs.length = 0;
    vi.useFakeTimers();
    vi.stubEnv("DEMO_RECORD_ENABLED", "0");
    vi.stubEnv("DEMO_PATROL_ENABLED", "0");
    vi.stubEnv("T2_SERVER_PASSWORDS", "{}");
    vi.stubEnv("RELAY_TRUST_FLY_PROXY", "false");
    vi.stubEnv("WATCH_STATE_PATH", "/nonexistent/chat-policy-watch-state.json");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function connect(
    role: "player" | "watcher",
    enabled: string | undefined,
    clientIp = "192.0.2.10",
  ) {
    vi.stubEnv("RELAY_CHAT_ENABLED", enabled);
    // Importing the entry point must not register process exit/crash hooks.
    const processOn = vi.spyOn(process, "on").mockReturnValue(process);
    try {
      await import("./server");
    } finally {
      processOn.mockRestore();
    }
    const browser = new Browser();
    harness.server!.emit("connection", browser, {
      headers: {},
      socket: { remoteAddress: clientIp, remotePort: 50000 },
    });
    await browser.request({
      type: role === "player" ? "joinServer" : "watchServer",
      address: "192.0.2.1:28000",
    });
    return browser;
  }

  it.each(["player", "watcher"] as const)(
    "silently drops every stock chat command from a %s when disabled",
    async (role) => {
      const browser = await connect(role, "false");
      if (role === "player") {
        expect(browser.send).toHaveBeenCalledWith(
          expect.stringContaining('"chatEnabled":false'),
        );
      }
      browser.send.mockClear();
      for (const command of [
        "messageSent",
        "MESSAGESENT",
        "teamMessageSent",
        "TeAmMeSsAgEsEnT",
        "CannedChat",
        "cannedchat",
        "\u016dessageSent",
        "messageSent\0ignored",
      ]) {
        await browser.request({
          type: "sendCommand",
          command,
          args: ["blocked"],
        });
      }
      expect(harness.sendCommand).not.toHaveBeenCalled();
      expect(harness.sendChat).not.toHaveBeenCalled();
      expect(browser.send).not.toHaveBeenCalled();
      await browser.request({ type: "wsPing", ts: 123 });
      expect(browser.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "wsPong", ts: 123 }),
      );
      const inputs = harness.logs.filter(
        (log) => log.event === "browser_input",
      );
      expect(inputs).toHaveLength(10);
      expect(inputs[0]).toMatchObject({ role: "idle", inputSeq: 1 });
      for (const entry of inputs.slice(1)) {
        expect(entry).toMatchObject({
          role,
          serverAddress: "192.0.2.1:28000",
          clientIp: "192.0.2.10",
          connectionId: inputs[0].connectionId,
        });
      }
      expect(inputs[1].input).toMatchObject({
        command: "messageSent",
        args: ["blocked"],
      });
    },
  );

  it.each([undefined, "true"])(
    "preserves player chat when enabled (%j)",
    async (enabled) => {
      const browser = await connect("player", enabled);
      expect(browser.send).toHaveBeenCalledWith(
        expect.stringContaining('"chatEnabled":true'),
      );
      for (const command of ["messageSent", "teamMessageSent", "CannedChat"]) {
        await browser.request({
          type: "sendCommand",
          command,
          args: ["hello"],
        });
        expect(harness.sendCommand).toHaveBeenCalledWith(command, "hello");
      }
    },
  );

  it("preserves enabled watcher chat", async () => {
    const browser = await connect("watcher", "true");
    await browser.request({
      type: "sendCommand",
      command: "messageSent",
      args: ["hello"],
    });
    expect(harness.sendChat).toHaveBeenCalledWith(browser, "hello");
  });

  it("attributes shared-session chat to distinct browser connections", async () => {
    const first = await connect("watcher", "true", "192.0.2.10");
    const second = await connect("watcher", "true", "192.0.2.11");
    for (const browser of [first, second]) {
      await browser.request({
        type: "sendCommand",
        command: "messageSent",
        args: ["hello"],
      });
    }
    const chat = harness.logs.filter(
      (log) => log.input?.command === "messageSent",
    );
    expect(chat).toHaveLength(2);
    expect(chat.map((log) => log.clientIp)).toEqual([
      "192.0.2.10",
      "192.0.2.11",
    ]);
    expect(chat[0].connectionId).not.toBe(chat[1].connectionId);
    expect(chat.map((log) => log.inputSeq)).toEqual([2, 2]);
    expect(harness.sendChat).toHaveBeenCalledTimes(2);
  });

  it("audits movement, protocol, and unknown inputs before dispatch", async () => {
    const browser = await connect("player", "true");
    const messages: ClientMessage[] = [
      { type: "sendMoves", moves: [], moveStartIndex: 4 },
      { type: "sendGhostAck", sequence: 2, ghostCount: 3 },
      {
        type: "sendCRCCompute",
        seed: 12,
        field2: 0,
        datablocks: [],
        includeTextures: false,
      },
      { type: "wsPing", ts: 456 },
    ];
    for (const message of messages) await browser.request(message);
    await browser.request({ type: "unknown" } as unknown as ClientMessage);
    const entries = harness.logs.filter((log) => log.event === "browser_input");
    expect(entries.map((log) => log.input)).toEqual([
      { type: "joinServer", address: "192.0.2.1:28000" },
      ...messages,
      { type: "unknown" },
    ]);
    expect(harness.sendMoves).toHaveBeenCalledWith([], 4);
    expect(harness.handleGhostAlwaysDone).toHaveBeenCalledWith(2, 3);
    expect(harness.computeAndSendCRC).toHaveBeenCalledWith(
      12,
      0,
      [],
      false,
      expect.any(String),
    );
    for (const entry of entries) {
      expect(entry).toMatchObject({
        clientIp: "192.0.2.10",
        connectionId: entries[0].connectionId,
      });
    }
  });

  it("attributes malformed/binary inputs, control frames, errors, and disconnects", async () => {
    const browser = await connect("watcher", "true");
    const listener = browser.listeners("message")[0];
    await listener(Buffer.from("invalid json"), false);
    await listener(Buffer.from([255]), true);
    browser.emit("ping", Buffer.from("ping"));
    browser.emit("pong", Buffer.alloc(0));
    browser.emit("error", new Error("test socket error"));
    browser.emit("close", 1000, Buffer.from("bye"));
    const entries = harness.logs.filter((log) => log.event === "browser_input");
    expect(entries.map((log) => log.frameType)).toEqual([
      "text",
      "text",
      "binary",
      "ping",
      "pong",
    ]);
    const connectionId = entries[0].connectionId;
    for (const entry of harness.logs) {
      expect(entry).toMatchObject({ connectionId, clientIp: "192.0.2.10" });
    }
    expect(harness.logs).toContainEqual(
      expect.objectContaining({
        msg: "Error handling client message",
        inputSeq: 2,
      }),
    );
    expect(harness.logs).toContainEqual(
      expect.objectContaining({
        event: "browser_disconnected",
        code: 1000,
        reason: "bye",
      }),
    );
  });
});

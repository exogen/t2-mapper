import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "./types";
import type { WatchSessionManagerOptions } from "./watchSession";
import type { DemoCoordinatorOptions } from "./demoCoordinator";

const harness = vi.hoisted(() => ({
  server: null as EventEmitter | null,
  sendCommand: vi.fn(),
  sendChat: vi.fn(),
  sendMoves: vi.fn(),
  handleGhostAlwaysDone: vi.fn(),
  computeAndSendCRC: vi.fn(),
  logs: [] as Record<string, any>[],
  connections: [] as EventEmitter[],
  connectStatus: "connected",
  watchOptions: null as WatchSessionManagerOptions | null,
  warmStart: vi.fn(),
  listen: vi.fn(),
  coordinatorOptions: null as DemoCoordinatorOptions | null,
  sweepPending: vi.fn(),
  shutdownCoordinator: vi.fn().mockResolvedValue(undefined),
  lifecycleHandlers: new Map<string | symbol, (...args: any[]) => void>(),
}));

vi.mock("node:http", () => ({
  default: { createServer: () => ({ listen: harness.listen }) },
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
      constructor() {
        super();
        harness.connections.push(this);
      }
      setMapName() {}
      async connect() {
        this.emit("status", harness.connectStatus);
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
      constructor(options: WatchSessionManagerOptions) {
        harness.watchOptions = options;
      }
      warmStart = harness.warmStart;
      shutdown() {
        harness.watchOptions?.onSessionsChanged?.([], {});
      }
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
vi.mock("./demoCoordinator", () => ({
  DemoCoordinator: class {
    constructor(options: DemoCoordinatorOptions) {
      harness.coordinatorOptions = options;
    }
    async restorePending() {}
    sweepPending = harness.sweepPending;
    shutdown = harness.shutdownCoordinator;
  },
}));
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
    harness.connections.length = 0;
    harness.connectStatus = "connected";
    harness.watchOptions = null;
    harness.lifecycleHandlers.clear();
    harness.warmStart.mockReset();
    vi.useFakeTimers();
    vi.stubEnv("DEMO_RECORD_ENABLED", "0");
    vi.stubEnv("DEMO_PATROL_ENABLED", "0");
    vi.stubEnv("T2_SERVER_PASSWORDS", "{}");
    vi.stubEnv("RELAY_TRUST_FLY_PROXY", "false");
    vi.stubEnv("RELAY_ADMIN_VOTE_POLICIES", undefined);
    vi.stubEnv("ALWAYS_ADMIN_PLAYERS", undefined);
    vi.stubEnv("DEMO_DIR", undefined);
    vi.stubEnv("DEMO_UPLOAD_RETRY_MS", "300000");
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
    const processOn = vi
      .spyOn(process, "on")
      .mockImplementation((event, listener) => {
        harness.lifecycleHandlers.set(event, listener);
        return process;
      });
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

  it("loads mission restrictions before listening or warm-starting, then persists changes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "watch-controls-"));
    const file = path.join(dir, "watch-state.json");
    const address = "192.0.2.1:28000";
    const controls = {
      [address]: {
        mission: ["1", "Katabatic"] as [string, string],
        recording: false,
        watching: false,
      },
    };
    await fs.writeFile(
      file,
      JSON.stringify({ addresses: [address], missionControls: controls }),
    );
    vi.stubEnv("WATCH_STATE_PATH", file);
    harness.warmStart.mockImplementation((address: string) => {
      expect(harness.listen).not.toHaveBeenCalled();
      expect(harness.watchOptions?.initialMissionControls).toEqual(controls);
      harness.watchOptions?.onSessionsChanged?.([address], controls);
    });
    try {
      await connect("watcher", "false");
      expect(harness.warmStart).toHaveBeenCalledWith(address);
      expect(harness.listen).toHaveBeenCalled();
      harness.watchOptions?.onSessionsChanged?.([address], {});
      await vi.waitFor(async () => {
        expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
          addresses: [address],
          missionControls: {},
        });
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves the default storage paths when environment variables are unset", async () => {
    vi.stubEnv("WATCH_STATE_PATH", undefined);
    await connect("watcher", "false");
    expect(harness.coordinatorOptions?.dir).toBe("/data/demos");
    expect(harness.logs).toContainEqual(
      expect.objectContaining({
        msg: "Relay storage configured",
        watchStatePath: "/data/watch-state.json",
      }),
    );
  });

  it.each([false, true])(
    "creates storage parents and restores controls after restart (relative env paths: %s)",
    async (relativePaths) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "relay-storage-"));
      const demoDir = path.join(dir, "recordings");
      const file = path.join(dir, "state", "watch.json");
      vi.stubEnv(
        "DEMO_DIR",
        relativePaths ? path.relative(process.cwd(), demoDir) : demoDir,
      );
      vi.stubEnv(
        "WATCH_STATE_PATH",
        relativePaths ? path.relative(process.cwd(), file) : file,
      );
      const controls = {
        "192.0.2.1:28000": {
          mission: ["1", "Katabatic"] as [string, string],
          recording: false,
          watching: false,
        },
      };
      try {
        await connect("watcher", "false");
        expect(harness.coordinatorOptions?.dir).toBe(demoDir);
        harness.watchOptions!.onSessionsChanged!([], controls);
        await vi.waitFor(async () => {
          expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
            addresses: [],
            missionControls: controls,
          });
        });
        vi.resetModules();
        await connect("watcher", "false");
        expect(harness.watchOptions?.initialMissionControls).toEqual(controls);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  );

  it("keeps sweeping held recordings when new recording and uploads are disabled", async () => {
    vi.stubEnv("DEMO_UPLOAD_RETRY_MS", "1000");
    await connect("watcher", "false");
    expect(harness.coordinatorOptions?.enabled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(harness.sweepPending).toHaveBeenCalledOnce();
  });

  it.each(["SIGTERM", "uncaughtException"])(
    "drains the latest watch state and preserves the warm-start list on %s",
    async (event) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "relay-exit-"));
      const file = path.join(dir, "watch-state.json");
      vi.stubEnv("WATCH_STATE_PATH", file);
      await connect("watcher", "false");
      let releaseWrite!: () => void;
      let started!: () => void;
      const blocked = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const writing = new Promise<void>((resolve) => {
        started = resolve;
      });
      const writeFile = fs.writeFile;
      vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
        if (args[0] === `${file}.tmp`) {
          started();
          await blocked;
        }
        return writeFile(...args);
      });
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      const address = "192.0.2.1:28000";
      const controls = {
        [address]: {
          mission: ["1", "Katabatic"] as [string, string],
          recording: false,
          watching: false,
        },
      };
      try {
        harness.watchOptions!.onSessionsChanged!([address], controls);
        await writing;
        harness.lifecycleHandlers.get(event)!(new Error("injected crash"));
        await vi.advanceTimersByTimeAsync(0);
        expect(exit).not.toHaveBeenCalled();
        releaseWrite();
        await vi.waitFor(async () => {
          expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
            addresses: [address],
            missionControls: controls,
          });
        });
        await vi.advanceTimersByTimeAsync(300);
        expect(exit).toHaveBeenCalledWith(event === "SIGTERM" ? 0 : 1);
      } finally {
        releaseWrite();
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  );

  it("passes the configured admin vote policies to shared watch sessions", async () => {
    const policies = [
      { tournament: true, minPlayerCount: 20, adminVotes: 2 },
      { tournament: true, minPlayerCount: 1, adminVotes: 1 },
      { tournament: false, minPlayerCount: 1, adminVotes: 1 },
    ];
    vi.stubEnv("RELAY_ADMIN_VOTE_POLICIES", JSON.stringify(policies));
    await connect("watcher", "false");
    expect(harness.watchOptions?.adminVotePolicies).toEqual(policies);
  });

  it("passes exact always-admin player names from the environment to watch sessions", async () => {
    vi.stubEnv("ALWAYS_ADMIN_PLAYERS", '["Alice","Some Player"]');
    await connect("watcher", "false");
    expect(harness.watchOptions?.alwaysAdminPlayers).toEqual(
      new Set(["Alice", "Some Player"]),
    );
  });

  it("coalesces a burst of control changes while a disk write is in flight and saves the latest state", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "watch-control-burst-"),
    );
    const file = path.join(dir, "watch-state.json");
    vi.stubEnv("WATCH_STATE_PATH", file);
    await connect("watcher", "false");
    let releaseWrite!: () => void;
    let signalWriteStarted!: () => void;
    const blockedWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const writeStarted = new Promise<void>((resolve) => {
      signalWriteStarted = resolve;
    });
    const writeFile = fs.writeFile;
    let writes = 0;
    const spy = vi
      .spyOn(fs, "writeFile")
      .mockImplementation(async (...args) => {
        if (args[0] === `${file}.tmp` && ++writes === 1) {
          signalWriteStarted();
          await blockedWrite;
        }
        return writeFile(...args);
      });
    const address = "192.0.2.1:28000";
    const persist = harness.watchOptions!.onSessionsChanged!;
    const final = {
      [address]: {
        mission: ["1", "Katabatic"] as [string, string],
        recording: false,
        watching: false,
      },
    };
    try {
      persist([address], {});
      await writeStarted;
      for (let i = 0; i < 500; i++) persist([address], i % 2 ? final : {});
      releaseWrite();
      await vi.waitFor(async () => {
        expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
          addresses: [address],
          missionControls: final,
        });
      });
      expect(writes).toBe(2);
      // A later burst starts a new writer after the previous one drains.
      persist([address], {});
      await vi.waitFor(async () => {
        expect(
          JSON.parse(await fs.readFile(file, "utf8")).missionControls,
        ).toEqual({});
      });
      expect(writes).toBe(3);
    } finally {
      releaseWrite();
      spy.mockRestore();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("defaults admin controls to disabled when no policies are configured", async () => {
    await connect("watcher", "false");
    expect(harness.watchOptions?.adminVotePolicies).toEqual([]);
  });

  it("logs the player retry policy and whether another attempt is scheduled", async () => {
    harness.connectStatus = "challenging";
    await connect("player", "false");
    const reason =
      "Server is cycling missions.  Please try to connect in a moment.";
    for (let retriesUsed = 0; retriesUsed <= 3; retriesUsed++) {
      harness.connections.at(-1)!.emit("status", "disconnected", reason);
      const retryScheduled = retriesUsed < 3;
      expect(harness.logs).toContainEqual(
        expect.objectContaining({
          level: 30,
          address: "192.0.2.1:28000",
          reason,
          cooldownMs: 5_000,
          autoRetry: true,
          retryScheduled,
          retriesUsed,
          maxRetries: 3,
          cooldownBlocked: false,
          msg: retryScheduled
            ? "Player connection will reconnect"
            : "Player connection will not reconnect",
        }),
      );
      await vi.advanceTimersByTimeAsync(5_000);
    }
    expect(harness.connections).toHaveLength(4);
  });

  it("resets the player retry budget after a successful connection", async () => {
    harness.connectStatus = "challenging";
    await connect("player", "false");
    const reason =
      "Server is cycling missions.  Please try to connect in a moment.";
    for (let i = 0; i < 3; i++) {
      harness.connections.at(-1)!.emit("status", "disconnected", reason);
      await vi.advanceTimersByTimeAsync(5_000);
    }
    expect(harness.connections).toHaveLength(4);
    harness.connections.at(-1)!.emit("status", "connected");
    harness.connections
      .at(-1)!
      .emit("status", "disconnected", "Connection stalled");
    expect(harness.logs).toContainEqual(
      expect.objectContaining({
        reason: "Connection stalled",
        retryScheduled: true,
        retriesUsed: 0,
      }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(harness.connections).toHaveLength(5);
  });

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
    for (const entry of harness.logs.filter(
      (entry) => entry.msg !== "Relay storage configured",
    )) {
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

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "./types";

const harness = vi.hoisted(() => ({
  server: null as EventEmitter | null,
  sendCommand: vi.fn(),
  sendChat: vi.fn(),
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
vi.mock("./logger", () => {
  const log = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
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

describe("relay browser chat enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubEnv("DEMO_RECORD_ENABLED", "0");
    vi.stubEnv("DEMO_PATROL_ENABLED", "0");
    vi.stubEnv("T2_SERVER_PASSWORDS", "{}");
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
    harness.server!.emit("connection", browser);
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
});

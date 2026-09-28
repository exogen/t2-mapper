import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayEventHandler } from "../stream/relayClient";
import type { ServerInfo } from "../../relay/types";

vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../stream/relayClient", () => ({
  RelayClient: class {
    connected = true;
    readonly handlers: RelayEventHandler;
    constructor(_url: string, handlers: RelayEventHandler) {
      this.handlers = handlers;
    }
    connect() {}
    close() {
      this.connected = false;
    }
    watchServer = vi.fn();
    joinServer = vi.fn();
    sendCommand = vi.fn();
    leaveServer() {}
  },
}));
vi.mock("../stream/liveStreaming", () => ({ LiveStreamAdapter: class {} }));

import { liveConnectionStore } from "./liveConnectionStore";

describe("watch connection metadata", () => {
  const address = "test:28000";
  const state = () => liveConnectionStore.getState();
  const handlers = () =>
    (state()._relay as unknown as { handlers: RelayEventHandler }).handlers;

  beforeEach(() => {
    vi.useFakeTimers();
    liveConnectionStore.setState(
      { ...liveConnectionStore.getInitialState(), _pending: [] },
      true,
    );
    state().connectRelay("ws://test");
    handlers().onOpen!();
    state().watchServer(address);
    handlers().onSessionStatus!(
      "live",
      undefined,
      {
        address,
        mapName: "DelayedMap",
        recording: true,
        chatEnabled: true,
        streamDelayMs: 60_000,
        channelId: "session:delayed-channel",
      },
      2,
    );
  });
  afterEach(() => {
    state().leaveServer();
    state().disconnectRelay();
    vi.useRealTimers();
  });

  it("does not erase recording or delay on partial transition notices", () => {
    handlers().onSessionStatus!(
      "connecting",
      "Mission changing",
      { address },
      2,
    );
    expect(state()).toMatchObject({
      recording: true,
      streamDelayMs: 60_000,
      mapName: "DelayedMap",
      watchChannelId: "session:delayed-channel",
    });
    handlers().onSessionStatus!(
      "live",
      undefined,
      { address, recording: false, streamDelayMs: 0 },
      2,
    );
    expect(state()).toMatchObject({ recording: false, streamDelayMs: 0 });
  });

  it("blocks outgoing chat until the relay enables it and resets it across reconnects", () => {
    const relay = state()._relay!;
    state().sendCommand("messageSent", "hello");
    expect(relay.sendCommand).toHaveBeenCalledWith("messageSent", ["hello"]);
    vi.mocked(relay.sendCommand).mockClear();
    handlers().onSessionStatus!(
      "live",
      undefined,
      { address, chatEnabled: false },
      1,
    );
    state().sendCommand("messageSent", "blocked");
    expect(relay.sendCommand).not.toHaveBeenCalled();
    handlers().onSessionStatus!(
      "live",
      undefined,
      { address, chatEnabled: true },
      1,
    );
    expect(state().chatEnabled).toBe(true);
    handlers().onClose!();
    expect(state().chatEnabled).toBe(false);
    vi.advanceTimersByTime(2_000);
    handlers().onOpen!();
    handlers().onSessionStatus!("live", undefined, { address }, 1);
    expect(state().chatEnabled).toBe(false);
  });

  it("honors the player's advertised capability for all chat commands", () => {
    state().joinServer(address);
    const relay = state()._relay!;
    expect(state().chatEnabled).toBe(false);
    handlers().onStatus!("connected", undefined, undefined, false);
    for (const command of ["messageSent", "TEAMMESSAGESENT", "CannedChat"])
      state().sendCommand(command, "blocked");
    expect(relay.sendCommand).not.toHaveBeenCalled();
    state().sendCommand("getScores");
    expect(relay.sendCommand).toHaveBeenCalledWith("getScores", []);
    handlers().onStatus!("connected", undefined, undefined, true);
    state().sendCommand("messageSent", "hello");
    expect(relay.sendCommand).toHaveBeenCalledWith("messageSent", ["hello"]);
    handlers().onStatus!("disconnected");
    expect(state().chatEnabled).toBe(false);
  });

  it.each(["connecting", "syncing"] as const)(
    "does not send watcher chat while %s even when advertised as enabled",
    (status) => {
      const relay = state()._relay!;
      handlers().onSessionStatus!(
        status,
        undefined,
        { address, chatEnabled: true },
        1,
      );
      state().sendCommand("messageSent", "too early");
      expect(relay.sendCommand).not.toHaveBeenCalled();
      handlers().onSessionStatus!(
        "live",
        undefined,
        { address, chatEnabled: true },
        1,
      );
      state().sendCommand("messageSent", "ready");
      expect(relay.sendCommand).toHaveBeenCalledWith("messageSent", ["ready"]);
    },
  );

  it("does not let a previous watcher's live status enable chat during a player handshake", () => {
    state().joinServer(address);
    const relay = state()._relay!;
    handlers().onStatus!("authenticating", undefined, undefined, true);
    state().sendCommand("messageSent", "too early");
    expect(relay.sendCommand).not.toHaveBeenCalled();
    handlers().onStatus!("connected", undefined, undefined, true);
    state().sendCommand("messageSent", "ready");
    expect(relay.sendCommand).toHaveBeenCalledWith("messageSent", ["ready"]);
  });

  it.each(["player", "watcher"] as const)(
    "stops %s chat as soon as the relay announces a restart",
    (role) => {
      if (role === "player") {
        state().joinServer(address);
        handlers().onStatus!("connected", undefined, undefined, true);
      }
      const relay = state()._relay!;
      handlers().onRelayRestarting!();
      expect(state().chatEnabled).toBe(false);
      state().sendCommand("messageSent", "too late");
      expect(relay.sendCommand).not.toHaveBeenCalled();
    },
  );

  it("preserves the playhead's metadata through socket reconnects and reattachment", () => {
    liveConnectionStore.setState({
      servers: [
        { address, mapName: "FutureMap", name: "Server" } as ServerInfo,
      ],
    });
    handlers().onClose!();
    expect(state()).toMatchObject({
      reconnecting: true,
      recording: true,
      streamDelayMs: 60_000,
      mapName: "DelayedMap",
    });
    vi.advanceTimersByTime(2_000);
    handlers().onOpen!();
    expect(state()._relay!.watchServer).toHaveBeenLastCalledWith(
      address,
      "session:delayed-channel",
    );
    expect(state()).toMatchObject({
      serverAddress: address,
      recording: true,
      streamDelayMs: 60_000,
      mapName: "DelayedMap",
    });
  });

  it("does not use the present-day server-list map when explicitly rewatching", () => {
    liveConnectionStore.setState({
      servers: [
        { address, mapName: "FutureMap", name: "Server" } as ServerInfo,
      ],
    });
    state().watchServer(address);
    expect(state()._relay!.watchServer).toHaveBeenLastCalledWith(
      address,
      "session:delayed-channel",
    );
    expect(state()).toMatchObject({
      mapName: "DelayedMap",
      recording: true,
      streamDelayMs: 60_000,
    });
  });

  it("clears the old server's indicators when switching servers", () => {
    state().watchServer("other:28000");
    expect(state()._relay!.watchServer).toHaveBeenLastCalledWith(
      "other:28000",
      undefined,
    );
    expect(state()).toMatchObject({
      serverAddress: "other:28000",
      mapName: undefined,
      recording: false,
      streamDelayMs: 0,
      watchChannelId: null,
    });
  });

  it("clears indicators on a real end or voluntary departure", () => {
    handlers().onSessionStatus!("ended", "Disconnected", { address }, 0);
    expect(state()).toMatchObject({
      disconnectReason: "ended",
      watchChannelId: null,
      recording: false,
      streamDelayMs: 0,
    });
    state().leaveServer();
    expect(state()).toMatchObject({
      watchStatus: null,
      recording: false,
      streamDelayMs: 0,
    });
  });

  it("updates channel continuity when the delayed tail switches to live", () => {
    handlers().onSessionStatus!(
      "live",
      undefined,
      { address, channelId: "session:live", streamDelayMs: 0 },
      2,
    );
    state().watchServer(address);
    expect(state()._relay!.watchServer).toHaveBeenLastCalledWith(
      address,
      "session:live",
    );
    state().leaveServer();
    state().watchServer(address);
    expect(state()._relay!.watchServer).toHaveBeenLastCalledWith(
      address,
      undefined,
    );
  });

  it("cancels a queued join when leaving before the relay opens", () => {
    const relay = state()._relay!;
    Object.defineProperty(relay, "connected", {
      value: false,
      configurable: true,
    });
    vi.mocked(relay.watchServer).mockClear();
    state().watchServer("queued:28000");
    state().leaveServer();
    Object.defineProperty(relay, "connected", { value: true });
    handlers().onOpen!();
    expect(relay.watchServer).not.toHaveBeenCalled();
    expect(state().role).toBeNull();
  });

  it("only joins the last selection when the relay opens", () => {
    const relay = state()._relay!;
    Object.defineProperty(relay, "connected", {
      value: false,
      configurable: true,
    });
    vi.mocked(relay.watchServer).mockClear();
    state().watchServer("first:28000");
    state().watchServer("second:28000");
    Object.defineProperty(relay, "connected", { value: true });
    handlers().onOpen!();
    expect(relay.watchServer).toHaveBeenCalledExactlyOnceWith(
      "second:28000",
      undefined,
    );
  });

  it("ignores session notices after leaving or switching servers", () => {
    const oldHandlers = handlers();
    state().leaveServer();
    oldHandlers.onSessionStatus!("live", undefined, { address }, 5);
    expect(state()).toMatchObject({ watchStatus: null, watcherCount: 0 });
    state().watchServer("other:28000");
    oldHandlers.onSessionStatus!("ended", "old server", { address }, 0);
    expect(state()).toMatchObject({
      watchStatus: "connecting",
      serverAddress: "other:28000",
    });
  });
});

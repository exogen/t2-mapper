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
    state().watchServer(address);
    handlers().onSessionStatus!(
      "live",
      undefined,
      {
        address,
        mapName: "DelayedMap",
        recording: true,
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

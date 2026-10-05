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
    listServers = vi.fn();
    sendWsPing = vi.fn();
    leaveServer() {}
  },
}));
vi.mock("../stream/liveStreaming", () => ({
  LiveStreamAdapter: class {
    hydrate = vi.fn();
    feedPacket = vi.fn();
  },
}));

import {
  liveConnectionStore,
  selectConnectionFailureMessage,
} from "./liveConnectionStore";

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

  it.each([false, true])(
    "keeps a rejection visible through socket closure (session established: %s)",
    (established) => {
      state().leaveServer();
      state().watchServer(address);
      if (established)
        handlers().onSessionStatus!("live", undefined, { address }, 1);
      const reason = "You are not allowed to play on this server.";
      handlers().onSessionStatus!("ended", reason, { address }, 0);
      expect(selectConnectionFailureMessage(state())).toBe(reason);
      handlers().onClose!();
      vi.advanceTimersByTime(120_000);
      expect(selectConnectionFailureMessage(state())).toBe(reason);
      expect(state()).toMatchObject({
        role: "watcher",
        watchStatus: "ended",
        serverAddress: address,
        reconnecting: false,
        _relay: null,
      });
      state().watchServer(address);
      expect(selectConnectionFailureMessage(state())).toBeUndefined();
    },
  );

  it.each([undefined, "", "   ", "\0".repeat(87)])(
    "shows a failure even when the ended notice contains no reason (%s)",
    (reason) => {
      state().leaveServer();
      state().watchServer(address);
      handlers().onSessionStatus!("ended", reason, { address }, 0);
      expect(selectConnectionFailureMessage(state())).toBe(
        "The connection ended without a reason from the server.",
      );
      state().leaveServer();
      expect(selectConnectionFailureMessage(state())).toBeUndefined();
    },
  );

  it("shows a fallback for an invisible direct-join failure from an older relay", () => {
    state().joinServer(address);
    handlers().onStatus!("disconnected", "\0".repeat(87));
    expect(selectConnectionFailureMessage(state())).toBe(
      "The connection ended without a reason from the server.",
    );
  });

  it.each([false, true])(
    "keeps a failed join visible after exhausting relay reconnect attempts (socket opens: %s)",
    (opens) => {
      state().leaveServer();
      state().watchServer(address);
      handlers().onClose!();
      for (const delay of [
        2_000, 4_000, 6_000, 8_000, 10_000, 10_000, 10_000, 30_000, 30_000,
      ]) {
        vi.advanceTimersByTime(delay);
        expect(selectConnectionFailureMessage(state())).toBeUndefined();
        if (opens) {
          handlers().onOpen!();
          handlers().onSessionStatus!("syncing", undefined, { address }, 1);
        }
        handlers().onClose!();
      }
      expect(state()).toMatchObject({
        role: "watcher",
        watchStatus: "ended",
        serverAddress: address,
        disconnectReason: "ended",
        reconnecting: false,
        _relay: null,
      });
      expect(selectConnectionFailureMessage(state())).toBe(
        "Unable to reconnect to the relay.",
      );
      vi.advanceTimersByTime(120_000);
      expect(state()._relay).toBeNull();
    },
  );

  it.each(["live", "manual"])("resets the retry budget after %s", (reset) => {
    handlers().onClose!();
    vi.advanceTimersByTime(2_000);
    handlers().onOpen!();
    handlers().onClose!();
    vi.advanceTimersByTime(4_000);
    handlers().onOpen!();
    if (reset === "live") {
      handlers().onSessionStatus!("live", undefined, { address }, 1);
    } else {
      state().watchServer(address);
    }
    handlers().onClose!();
    vi.advanceTimersByTime(2_000);
    expect(state()._relay).not.toBeNull();
    expect(state().reconnecting).toBe(true);
  });

  it("preserves a direct player join rejection rather than replacing it on transport closure", () => {
    // A previous watch status must not hide this failed player attempt.
    state().joinServer(address);
    handlers().onStatus!("disconnected", "PASSWORD");
    expect(selectConnectionFailureMessage(state())).toBe("PASSWORD");
    handlers().onClose!();
    expect(selectConnectionFailureMessage(state())).toBe("PASSWORD");
    expect(state()).toMatchObject({
      role: "player",
      gameStatus: "disconnected",
      watchStatus: null,
      serverAddress: address,
    });
  });

  it("does not show a join failure when a server-list socket closes", () => {
    state().leaveServer();
    handlers().onClose!();
    expect(state().role).toBeNull();
    expect(selectConnectionFailureMessage(state())).toBeUndefined();
  });

  it("shows server-list failures and clears them on a fresh query", () => {
    state().leaveServer();
    const cached = [{ address, name: "Cached server" } as ServerInfo];
    handlers().onServerList!(cached);
    state().listServers();
    handlers().onError!(
      "Unable to load the server list. Please try refreshing.",
      "listServers",
    );
    expect(state()).toMatchObject({
      servers: cached,
      serversLoading: false,
      serverListError: "Unable to load the server list. Please try refreshing.",
      _listInFlight: false,
    });
    state().listServers();
    expect(state()).toMatchObject({
      serversLoading: true,
      serverListError: null,
    });
    handlers().onServerList!([]);
    expect(state()).toMatchObject({
      servers: [],
      serversLoading: false,
      serverListError: null,
    });
  });

  it("reports transport loss during a server-list query without claiming a game join failed", () => {
    state().leaveServer();
    state().listServers();
    handlers().onClose!();
    expect(state()).toMatchObject({
      serversLoading: false,
      serverListError:
        "Unable to load the server list because the relay connection was lost. Please try refreshing.",
      _listInFlight: false,
    });
    expect(selectConnectionFailureMessage(state())).toBeUndefined();
  });

  it("does not let unrelated relay errors end an in-flight list query or watch session", () => {
    state().listServers();
    handlers().onError!("Chat is unavailable");
    expect(state()).toMatchObject({
      watchStatus: "live",
      serversLoading: true,
      _listInFlight: true,
      serverListError: null,
    });
    handlers().onServerList!([]);
    expect(state().serversLoading).toBe(false);
  });

  function disableWatching() {
    handlers().onSessionStatus!(
      "ended",
      "Server admins have disabled watching for this mission.",
      { address, endReason: "watchingDisabled" },
      0,
    );
  }

  it.each(["connecting", "syncing", "live"] as const)(
    "stops a %s viewer and discards late adapter callbacks and stream data",
    (status) => {
      state().watchServer(address);
      handlers().onSessionStatus!(status, undefined, { address }, 1);
      const adapter = state()._adapter!;
      const relay = state()._relay!;
      vi.mocked(relay.watchServer).mockClear();
      disableWatching();
      adapter.onReady!();
      adapter.onMissionChange!("StaleMap");
      adapter.onParseFault!({ stage: "ghost", message: "Stale fault" });
      handlers().onGamePacket!(new Uint8Array([1]));
      handlers().onCatchup!(
        {} as Parameters<NonNullable<RelayEventHandler["onCatchup"]>>[0],
      );
      handlers().onCatchupProgress!(1, 2);
      handlers().onWatcherCount!(5);
      handlers().onSessionStatus!("live", undefined, { address }, 5);
      expect(adapter.feedPacket).not.toHaveBeenCalled();
      expect(adapter.hydrate).not.toHaveBeenCalled();
      expect(relay.watchServer).not.toHaveBeenCalled();
      expect(state()).toMatchObject({
        watchStatus: "ended",
        watchEndReason: "watchingDisabled",
        disconnectReason: "ended",
        mapName: "DelayedMap",
        adapter: null,
        liveReady: false,
        chatEnabled: false,
        recording: false,
        watcherCount: 0,
        streamDelayMs: 0,
        streamDelayReadyAt: null,
        catchupProgress: null,
        reconnecting: false,
      });
    },
  );

  it.each([false, true])(
    "preserves a refusal through transport closure, without rejoining (restart already announced: %s)",
    (restarting) => {
      if (restarting) handlers().onRelayRestarting!();
      disableWatching();
      // A broadcast restart after the refusal must not revive the session.
      handlers().onRelayRestarting!();
      handlers().onClose!();
      vi.advanceTimersByTime(120_000);
      expect(state()).toMatchObject({
        watchStatus: "ended",
        watchEndReason: "watchingDisabled",
        watchStatusMessage:
          "Server admins have disabled watching for this mission.",
        serverAddress: address,
        relayConnected: false,
        reconnecting: false,
        _relay: null,
      });
    },
  );

  it("accepts a refusal during relay reattachment and clears it on a fresh manual watch", () => {
    handlers().onRelayRestarting!();
    handlers().onSessionStatus!("ended", "Relay shutting down", { address }, 0);
    expect(state().watchStatus).toBe("live");
    handlers().onClose!();
    vi.advanceTimersByTime(2_000);
    handlers().onOpen!();
    disableWatching();
    expect(state()).toMatchObject({
      watchStatus: "ended",
      watchEndReason: "watchingDisabled",
      reconnecting: false,
    });
    state().watchServer(address);
    expect(state()).toMatchObject({
      watchStatus: "connecting",
      watchEndReason: undefined,
      watchStatusMessage: undefined,
      disconnectReason: null,
    });
    handlers().onSessionStatus!("live", undefined, { address }, 1);
    expect(state().watchStatus).toBe("live");
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

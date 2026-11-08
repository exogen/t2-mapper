import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { RelayClient, type RelayEventHandler } from "./relayClient";
import type { ServerMessage } from "../../relay/types";
const creatorId = "ab".repeat(24);
import {
  MAX_CATCHUP_BUFFERED_BYTES,
  MAX_CATCHUP_BUFFERED_FRAMES,
  MAX_CATCHUP_COMPRESSED_BYTES,
  MAX_CATCHUP_DECOMPRESSED_BYTES,
} from "../../relay/catchupLimits";

vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  binaryType = "";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();

  constructor() {
    FakeWebSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  receive(message: ServerMessage | Uint8Array) {
    this.onmessage?.({
      data:
        message instanceof Uint8Array
          ? Uint8Array.from(message).buffer
          : JSON.stringify(message),
    });
  }
}

describe("RelayClient catch-up ordering", () => {
  const clients: RelayClient[] = [];
  let decodes: Array<() => Promise<void>>;
  let decodeCancels: Array<ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    decodes = [];
    decodeCancels = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    // Real gzip decoding with controllable completion order: large snapshots
    // can finish after a newer mission's smaller catch-up on the same socket.
    const NativeDecompressionStream = DecompressionStream;
    vi.stubGlobal(
      "DecompressionStream",
      class {
        readonly readable: ReadableStream<Uint8Array>;
        readonly writable: WritableStream<BufferSource>;
        constructor(format: CompressionFormat) {
          const native = new NativeDecompressionStream(format);
          const reader = native.readable.getReader();
          this.writable = native.writable;
          let release!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          decodes.push(async () => {
            release();
          });
          const cancelled = vi.fn();
          decodeCancels.push(cancelled);
          this.readable = new ReadableStream({
            async pull(controller) {
              await gate;
              if (cancelled.mock.calls.length) return;
              const { done, value } = await reader.read();
              if (done) controller.close();
              else controller.enqueue(value);
            },
            cancel(reason) {
              cancelled();
              release();
              return reader.cancel(reason);
            },
          });
        }
      },
    );
  });
  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
    vi.unstubAllGlobals();
  });

  function setup(extra: RelayEventHandler = {}) {
    const events: string[] = [];
    const error = vi.fn();
    const closed = vi.fn();
    const client = new RelayClient("ws://test", {
      onCatchup: (payload) => events.push(`hydrate:${payload.epoch}`),
      onGamePacket: (data) => events.push(`packet:${data[0]}`),
      onSessionStatus: (status) => events.push(status),
      onError: error,
      onClose: closed,
      ...extra,
    });
    clients.push(client);
    client.connect();
    const ws = FakeWebSocket.instances.at(-1)!;
    ws.open();
    client.watchServer("test:28000");
    return { client, ws, events, error, closed };
  }

  function snapshot(
    ws: FakeWebSocket,
    epoch: number,
    replaySessionId?: string,
  ) {
    const bytes = gzipSync(
      JSON.stringify({
        epoch,
        initialGhosts: [],
        dataBlocks: [],
        ...(replaySessionId
          ? { replay: { sessionId: replaySessionId, epoch } }
          : {}),
      }),
    );
    ws.receive({
      type: "catchupBegin",
      epoch,
      totalBytes: bytes.length,
      chunkCount: 1,
      encoding: "gzip",
    });
    ws.receive(bytes);
    ws.receive({ type: "catchupEnd" });
  }

  it("ignores unfamiliar relay messages and extra fields without interrupting playback", async () => {
    const { ws, events, error, closed } = setup();
    const futureMessage = {
      type: "futureOptionalFeature",
      payload: { enabled: true },
    } as unknown as ServerMessage;
    ws.receive(futureMessage);
    snapshot(ws, 1);
    ws.receive(futureMessage);
    await decodes[0]();
    await vi.waitFor(() => expect(events).toEqual(["hydrate:1"]));
    ws.receive(futureMessage);
    ws.receive({
      type: "sessionStatus",
      status: "live",
      address: "test:28000",
      watcherCount: 1,
      futureOption: true,
    } as ServerMessage);
    ws.receive(new Uint8Array([91]));
    expect(events).toEqual(["hydrate:1", "live", "packet:91"]);
    expect(error).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("orders replay labels after catch-up and filters another room or epoch", async () => {
    const onReplayGamePresentation = vi.fn();
    const { client, ws, events } = setup({ onReplayGamePresentation });
    client.joinReplay("room");
    ws.receive({
      type: "replayState",
      sessionId: "room",
      demo: "test.rec",
      tick: 0,
      durationTicks: 10,
      status: "paused",
      epoch: 1,
      revision: 1,
      watcherCount: 1,
      isOwner: false,
    });
    events.length = 0;
    snapshot(ws, 1, "room");
    const message = {
      type: "replayGamePresentation" as const,
      sessionId: "room",
      epoch: 1,
      game: { id: "game-one", revision: 1, presentation: { title: "Final" } },
    };
    ws.receive(message);
    expect(onReplayGamePresentation).not.toHaveBeenCalled();
    await decodes[0]();
    await vi.waitFor(() =>
      expect(onReplayGamePresentation).toHaveBeenCalledExactlyOnceWith(message),
    );
    ws.receive({ ...message, sessionId: "another-room" });
    ws.receive({ ...message, epoch: 0 });
    expect(onReplayGamePresentation).toHaveBeenCalledOnce();
    ws.receive({ ...message, game: null });
    expect(onReplayGamePresentation).toHaveBeenLastCalledWith({
      ...message,
      game: null,
    });
  });

  it("orders game labels after catch-up and filters unrelated servers and abandoned decodes", async () => {
    const game = {
      id: "game-one",
      revision: 1,
      presentation: { title: "Final" },
    };
    const published = vi.fn();
    const { client, ws, events } = setup({
      onGamePresentation: (value) => {
        published(value);
        events.push(`labels:${value.id}`);
      },
    });
    snapshot(ws, 1);
    ws.receive({ type: "gamePresentation", address: "test:28000", game });
    expect(published).not.toHaveBeenCalled();
    await decodes[0]();
    await vi.waitFor(() =>
      expect(events).toEqual(["hydrate:1", "labels:game-one"]),
    );
    expect(published).toHaveBeenCalledWith(game);
    ws.receive({ type: "gamePresentation", address: "other:28000", game });
    expect(published).toHaveBeenCalledOnce();
    ws.receive({
      type: "gamePresentation",
      address: "test:28000",
      game: null,
    } as unknown as ServerMessage);
    ws.receive({
      type: "gamePresentation",
      address: "test:28000",
      game: { ...game, presentation: { teamNames: [] } },
    } as unknown as ServerMessage);
    expect(published).toHaveBeenCalledOnce();

    snapshot(ws, 2);
    ws.receive({ type: "gamePresentation", address: "test:28000", game });
    client.watchServer("other:28000");
    await decodes[1]();
    expect(published).toHaveBeenCalledOnce();
  });

  it("subscribes to server upload bytes and filters stale/invalid progress", () => {
    const progress = vi.fn();
    const { client, ws } = setup({ onReplayUploadProgress: progress });
    client.watchReplayUpload("upload-one", 100, creatorId);
    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: "watchReplayUpload",
        uploadId: "upload-one",
        totalBytes: 100,
        creatorId,
      }),
    );
    const report = (
      uploadId: string,
      receivedBytes: number,
      totalBytes = 100,
    ) =>
      ws.receive({
        type: "replayUploadProgress",
        uploadId,
        receivedBytes,
        totalBytes,
      });
    report("old-upload", 0);
    report("upload-one", 1, 999);
    report("upload-one", -1);
    report("upload-one", 101);
    report("upload-one", 0.5);
    expect(progress).not.toHaveBeenCalled();
    report("upload-one", 0);
    report("upload-one", 50);
    expect(progress).toHaveBeenCalledTimes(2);
    client.watchReplayUpload("upload-two", 100, creatorId);
    report("upload-one", 100);
    expect(progress).toHaveBeenCalledTimes(2);
    report("upload-two", 0);
    client.joinReplay("room", "private");
    report("upload-two", 100);
    expect(progress).toHaveBeenCalledTimes(3);
    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: "joinReplay",
        sessionId: "room",
        ownerToken: "private",
      }),
    );
  });

  it.each(["leaveReplay", "leaveServer", "close"] as const)(
    "stops upload progress on %s",
    (action) => {
      const progress = vi.fn();
      const { client, ws } = setup({ onReplayUploadProgress: progress });
      client.watchReplayUpload("upload", 100, creatorId);
      client[action]();
      ws.receive({
        type: "replayUploadProgress",
        uploadId: "upload",
        receivedBytes: 50,
        totalBytes: 100,
      });
      expect(progress).not.toHaveBeenCalled();
    },
  );

  it("sends the private creator identity with a hosted creation request", () => {
    const { client, ws } = setup();
    client.createReplay("demo.rec", creatorId, 42);
    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: "createReplay",
        demo: "demo.rec",
        creatorId,
        tick: 42,
      }),
    );
  });

  function replayState(
    ws: FakeWebSocket,
    epoch: number,
    status: "paused" | "playing" | "seeking" = "paused",
    sessionId = "room",
  ) {
    ws.receive({
      type: "replayState",
      sessionId,
      epoch,
      status,
      tick: 100,
      durationTicks: 1000,
      demo: "example.rec",
      revision: epoch,
      watcherCount: 1,
      isOwner: false,
    });
  }

  it("hydrates replay before releasing recorded inputs and playback state in wire order", async () => {
    const replayEvents: string[] = [];
    const { client, ws, events } = setup({
      onReplayState: (state) => replayEvents.push(state.status),
      onReplayTick: (message) => replayEvents.push(`tick:${message.tick}`),
    });
    client.joinReplay("room");
    replayState(ws, 1);
    snapshot(ws, 1, "room");
    ws.receive(new Uint8Array([8]));
    ws.receive({
      type: "replayTick",
      sessionId: "room",
      epoch: 1,
      tick: 101,
      move: {} as never,
      firstPerson: false,
    });
    replayState(ws, 1, "playing");
    expect(events).toEqual([]);
    expect(replayEvents).toEqual(["paused"]);
    await decodes[0]();
    await vi.waitFor(() => expect(events).toEqual(["hydrate:1", "packet:8"]));
    expect(replayEvents).toEqual(["paused", "tick:101", "playing"]);
  });

  it("keeps recorded view-mode changes before their packet across hydration", async () => {
    const order: string[] = [];
    const { client, ws } = setup({
      onCatchup: () => order.push("hydrate"),
      onReplayInfo: (message) => order.push(`info:${message.firstPerson}`),
      onGamePacket: (data) => order.push(`packet:${data[0]}`),
    });
    const info = {
      type: "replayInfo" as const,
      sessionId: "room",
      epoch: 1,
      firstPerson: false,
    };
    client.joinReplay("room");
    replayState(ws, 1);
    ws.receive(info); // No parser state yet: discard instead of applying early.
    snapshot(ws, 1, "room");
    ws.receive({ ...info, sessionId: "other-room" });
    ws.receive({ ...info, epoch: 2 });
    ws.receive(info);
    ws.receive(new Uint8Array([8]));
    expect(order).toEqual([]);
    await decodes[0]();
    await vi.waitFor(() =>
      expect(order).toEqual(["hydrate", "info:false", "packet:8"]),
    );
    ws.receive({ ...info, firstPerson: true });
    ws.receive(new Uint8Array([9]));
    expect(order.slice(-2)).toEqual(["info:true", "packet:9"]);
  });

  it("discards an old replay seek snapshot even when its decode finishes last", async () => {
    const ticks: number[] = [];
    const { client, ws, events } = setup({
      onReplayTick: (message) => ticks.push(message.tick),
    });
    client.joinReplay("room");
    replayState(ws, 1);
    snapshot(ws, 1, "room");
    ws.receive(new Uint8Array([1]));
    replayState(ws, 2, "seeking");
    snapshot(ws, 2, "room");
    replayState(ws, 2);
    ws.receive(new Uint8Array([2]));
    ws.receive({
      type: "replayTick",
      sessionId: "room",
      epoch: 1,
      tick: 101,
      move: {} as never,
      firstPerson: false,
    });
    await decodes[1]();
    await decodes[0]();
    await vi.waitFor(() => expect(events).toEqual(["hydrate:2", "packet:2"]));
    expect(ticks).toEqual([]);
  });

  it("retains an ended replay snapshot while its terminal state is decoding", async () => {
    const statuses: string[] = [];
    const { client, ws, events } = setup({
      onReplayState: (state) => statuses.push(state.status),
    });
    client.joinReplay("room");
    replayState(ws, 1);
    snapshot(ws, 1, "room");
    ws.receive({
      type: "replayState",
      sessionId: "room",
      epoch: 1,
      revision: 2,
      tick: 1000,
      durationTicks: 1000,
      demo: "example.rec",
      status: "ended",
      watcherCount: 1,
      isOwner: true,
    });
    await decodes[0]();
    await vi.waitFor(() => expect(events).toEqual(["hydrate:1"]));
    expect(statuses).toEqual(["paused", "ended"]);
  });

  it("invalidates an old snapshot as soon as a seek preparation begins", async () => {
    const { client, ws, events } = setup();
    client.joinReplay("room");
    replayState(ws, 1);
    snapshot(ws, 1, "room");
    ws.receive({
      type: "replayState",
      sessionId: "room",
      epoch: 1,
      revision: 2,
      tick: 100,
      durationTicks: 1000,
      demo: "example.rec",
      status: "seeking",
      watcherCount: 1,
      isOwner: true,
    });
    await decodes[0]();
    await Promise.resolve();
    expect(events).toEqual([]);
    replayState(ws, 2);
    snapshot(ws, 2, "room");
    await decodes[1]();
    await vi.waitFor(() => expect(events).toEqual(["hydrate:2"]));
  });

  it("identifies a server-list error without ending the watch session", () => {
    const { ws, error, closed, events } = setup();
    ws.receive({
      type: "error",
      requestType: "listServers",
      message: "Unable to load the server list. Please try refreshing.",
    });
    expect(error).toHaveBeenCalledWith(
      "Unable to load the server list. Please try refreshing.",
      "listServers",
    );
    expect(closed).not.toHaveBeenCalled();
    expect(events).not.toContain("ended");
  });

  function live(ws: FakeWebSocket) {
    ws.receive({
      type: "sessionStatus",
      status: "live",
      address: "test:28000",
      watcherCount: 1,
    });
  }

  it.each([true, false])(
    "passes chatEnabled=%s through player and watcher status messages",
    (chatEnabled) => {
      const onStatus = vi.fn();
      const onSessionStatus = vi.fn();
      const { ws } = setup({ onStatus, onSessionStatus });
      ws.receive({ type: "status", status: "connected", chatEnabled });
      expect(onStatus).toHaveBeenCalledWith(
        "connected",
        undefined,
        undefined,
        chatEnabled,
      );
      ws.receive({
        type: "sessionStatus",
        status: "connecting",
        address: "test:28000",
        watcherCount: 1,
        chatEnabled,
      });
      expect(onSessionStatus).toHaveBeenCalledWith(
        "connecting",
        undefined,
        expect.objectContaining({ chatEnabled }),
        1,
      );
    },
  );

  it("hydrates before releasing statuses and raw packets, in wire order", async () => {
    const { ws, events } = setup();
    snapshot(ws, 1);
    live(ws);
    ws.receive(new Uint8Array([7]));
    expect(events).toEqual([]);
    await decodes[0]();
    await vi.waitFor(() =>
      expect(events).toEqual(["hydrate:1", "live", "packet:7"]),
    );
  });

  it.each(["old first", "new first"])(
    "ignores superseded epoch decodes (%s)",
    async (order) => {
      const { ws, events } = setup();
      snapshot(ws, 1);
      live(ws);
      ws.receive(new Uint8Array([1]));
      snapshot(ws, 2);
      live(ws);
      ws.receive(new Uint8Array([2]));
      if (order === "old first") {
        await decodes[0]();
        await Promise.resolve();
        expect(events).toEqual([]);
        await decodes[1]();
      } else {
        await decodes[1]();
        await decodes[0]();
      }
      await vi.waitFor(() =>
        expect(events).toEqual(["hydrate:2", "live", "packet:2"]),
      );
      ws.receive(new Uint8Array([3]));
      expect(events.at(-1)).toBe("packet:3");
    },
  );

  it.each(["close", "leave", "watch"])(
    "cancels in-flight hydration on %s",
    async (action) => {
      const { client, ws, events } = setup();
      snapshot(ws, 1);
      ws.receive(new Uint8Array([1]));
      if (action === "close") ws.close();
      if (action === "leave") client.leaveServer();
      if (action === "watch") client.watchServer("other:28000");
      expect(decodeCancels[0]).toHaveBeenCalledOnce();
      await decodes[0]();
      await Promise.resolve();
      expect(events).toEqual([]);
    },
  );

  it("reconnects after corrupt catch-up instead of forwarding unseeded packets", async () => {
    const { ws, events, error, closed } = setup();
    ws.receive({
      type: "catchupBegin",
      epoch: 1,
      totalBytes: 3,
      chunkCount: 1,
      encoding: "gzip",
    });
    ws.receive(new Uint8Array([1, 2, 3]));
    ws.receive({ type: "catchupEnd" });
    ws.receive(new Uint8Array([7]));
    await decodes[0]();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
    expect(error).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
  });

  it.each(["waiting", "collecting", "finalizing", "corrupt", "live"])(
    "ends immediately when watching is disabled while %s",
    async (phase) => {
      const status = vi.fn();
      const { client, ws, events, error, closed } = setup({
        onSessionStatus: status,
      });
      if (phase === "finalizing" || phase === "live") snapshot(ws, 1);
      if (phase === "collecting" || phase === "corrupt") {
        ws.receive({
          type: "catchupBegin",
          epoch: 1,
          totalBytes: 3,
          chunkCount: 1,
          encoding: "gzip",
        });
        ws.receive(new Uint8Array([1, 2, 3]));
        if (phase === "corrupt") ws.receive({ type: "catchupEnd" });
      }
      if (phase === "live") {
        await decodes[0]();
        await vi.waitFor(() => expect(events).toEqual(["hydrate:1"]));
        events.length = 0;
      }
      live(ws);
      if (phase !== "collecting") ws.receive(new Uint8Array([7]));
      status.mockClear();
      events.length = 0;
      ws.receive({
        type: "sessionStatus",
        status: "ended",
        endReason: "watchingDisabled",
        message: "Watching disabled",
        address: "test:28000",
        watcherCount: 0,
      });
      expect(status).toHaveBeenCalledExactlyOnceWith(
        "ended",
        "Watching disabled",
        expect.objectContaining({ endReason: "watchingDisabled" }),
        0,
      );
      if (phase === "finalizing" || phase === "corrupt") {
        await decodes[0]();
        // Flush both the decode success and failure continuations.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      live(ws);
      snapshot(ws, 2);
      ws.receive(new Uint8Array([8]));
      expect(events).toEqual([]);
      expect(status).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
      expect(closed).not.toHaveBeenCalled();

      // The same socket remains usable for an explicit new selection.
      client.watchServer("test:28000");
      snapshot(ws, 3);
      live(ws);
      await decodes.at(-1)!();
      await vi.waitFor(() => expect(events).toEqual(["hydrate:3"]));
      expect(status).toHaveBeenLastCalledWith(
        "live",
        undefined,
        expect.objectContaining({ endReason: undefined }),
        1,
      );
    },
  );

  it("rejects incomplete framing without trying to hydrate", () => {
    const { ws, events, closed } = setup();
    ws.receive({
      type: "catchupBegin",
      epoch: 1,
      totalBytes: 4,
      chunkCount: 2,
      encoding: "gzip",
    });
    ws.receive(new Uint8Array([1, 2]));
    ws.receive({ type: "catchupEnd" });
    expect(closed).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
    expect(decodes).toHaveLength(0);
  });

  it.each([
    { totalBytes: 0 },
    { totalBytes: -1 },
    { totalBytes: 1.5 },
    { totalBytes: MAX_CATCHUP_COMPRESSED_BYTES + 1 },
    { totalBytes: Number.MAX_SAFE_INTEGER + 1 },
    { chunkCount: 0 },
    { chunkCount: -1 },
    { chunkCount: 1.5 },
    { chunkCount: 4 },
    { epoch: 0 },
    { epoch: -1 },
    { epoch: 1.5 },
    { encoding: "deflate" as "gzip" },
  ])("rejects unsafe catch-up framing %j before decoding", (invalid) => {
    const { ws, events, error, closed } = setup();
    ws.receive({
      type: "catchupBegin",
      epoch: 1,
      totalBytes: 3,
      chunkCount: 1,
      encoding: "gzip",
      ...invalid,
    });
    expect(error).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
    expect(decodes).toHaveLength(0);
  });

  it.each(["bytes", "chunks", "empty"])(
    "rejects compressed %s overflow before storing another chunk",
    (overflow) => {
      const progress = vi.fn();
      const { ws, closed } = setup({ onCatchupProgress: progress });
      ws.receive({
        type: "catchupBegin",
        epoch: 1,
        totalBytes: 3,
        chunkCount: overflow === "chunks" ? 1 : 2,
        encoding: "gzip",
      });
      ws.receive(new Uint8Array([1, 2]));
      progress.mockClear();
      ws.receive(
        overflow === "bytes"
          ? new Uint8Array([3, 4])
          : overflow === "chunks"
            ? new Uint8Array([3])
            : new Uint8Array(),
      );
      expect(closed).toHaveBeenCalledOnce();
      expect(progress).not.toHaveBeenCalled();
      expect(decodes).toHaveLength(0);
    },
  );

  it("accepts exactly the compressed-byte limit", () => {
    const progress = vi.fn();
    const { ws, closed } = setup({ onCatchupProgress: progress });
    ws.receive({
      type: "catchupBegin",
      epoch: 1,
      totalBytes: MAX_CATCHUP_COMPRESSED_BYTES,
      chunkCount: 1,
      encoding: "gzip",
    });
    ws.receive(new Uint8Array(MAX_CATCHUP_COMPRESSED_BYTES));
    expect(progress).toHaveBeenLastCalledWith(
      MAX_CATCHUP_COMPRESSED_BYTES,
      MAX_CATCHUP_COMPRESSED_BYTES,
    );
    expect(closed).not.toHaveBeenCalled();
  });

  it("bounds buffered packet bytes and cancels the unfinished decode", async () => {
    const { ws, closed, events } = setup();
    snapshot(ws, 1);
    ws.receive(new Uint8Array(MAX_CATCHUP_BUFFERED_BYTES));
    expect(closed).not.toHaveBeenCalled();
    ws.receive(new Uint8Array([1]));
    expect(closed).toHaveBeenCalledOnce();
    expect(decodeCancels[0]).toHaveBeenCalledOnce();
    await decodes[0]();
    await Promise.resolve();
    expect(events).toEqual([]);
  });

  it("counts JSON replay frames toward the pending-decode frame limit", async () => {
    const error = vi.fn();
    const { client, ws, closed, events } = setup({ onReplayError: error });
    client.joinReplay("room");
    replayState(ws, 1);
    snapshot(ws, 1, "room");
    const tick = {
      type: "replayTick" as const,
      sessionId: "room",
      epoch: 1,
      tick: 101,
      move: {} as never,
      firstPerson: false,
    };
    for (let i = 0; i < MAX_CATCHUP_BUFFERED_FRAMES; i++) ws.receive(tick);
    expect(closed).not.toHaveBeenCalled();
    ws.receive(tick);
    expect(closed).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("buffer exceeds its limit"),
      "room",
    );
    expect(decodeCancels[0]).toHaveBeenCalledOnce();
    await decodes[0]();
    await Promise.resolve();
    expect(events).toEqual([]);
  });

  it("stops inflated payloads at the byte limit before decoding the excess chunk", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "DecompressionStream",
      class {
        writable = new WritableStream();
        readable = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([123]));
            controller.enqueue(new Uint8Array(MAX_CATCHUP_DECOMPRESSED_BYTES));
          },
          cancel,
        });
      },
    );
    const replayError = vi.fn();
    const { client, ws, events, closed, error } = setup({
      onReplayError: replayError,
    });
    client.joinReplay("room");
    replayState(ws, 1);
    snapshot(ws, 1, "room");
    await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
    expect(replayError).toHaveBeenCalledWith(
      expect.stringContaining("64 MiB decoded limit"),
      "room",
    );
    expect(error).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
  });

  it("stops releasing the old packet queue when a packet requests a new catch-up", async () => {
    const packets: number[] = [];
    const { client, ws } = setup({
      onGamePacket: (data) => {
        packets.push(data[0]);
        client.watchServer("test:28000");
      },
    });
    snapshot(ws, 1);
    ws.receive(new Uint8Array([1]));
    ws.receive(new Uint8Array([2]));
    await decodes[0]();
    await vi.waitFor(() => expect(packets).toEqual([1]));
    // The relay may already have queued more frames before it receives
    // our re-watch request. They belong to the abandoned parser state.
    ws.receive(new Uint8Array([3]));
    expect(packets).toEqual([1]);
  });

  it("ignores the rest of an abandoned snapshot while waiting for a new one", async () => {
    const { client, ws, events, error, closed } = setup();
    ws.receive({
      type: "catchupBegin",
      epoch: 1,
      totalBytes: 3,
      chunkCount: 1,
      encoding: "gzip",
    });
    client.watchServer("test:28000");
    ws.receive(new Uint8Array([1, 2, 3]));
    ws.receive({ type: "catchupEnd" });
    live(ws);
    expect(events).toEqual([]);
    expect(error).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    snapshot(ws, 2);
    live(ws);
    ws.receive(new Uint8Array([4]));
    await decodes[0]();
    await vi.waitFor(() =>
      expect(events).toEqual(["hydrate:2", "live", "packet:4"]),
    );
  });

  it("ignores complete snapshots and statuses arriving after leave", () => {
    const { client, ws, events } = setup();
    client.leaveServer();
    snapshot(ws, 1);
    live(ws);
    expect(decodes).toHaveLength(0);
    expect(events).toEqual([]);
  });

  it("ignores a previous server's snapshot while awaiting the selected one", () => {
    const { client, ws, events } = setup();
    client.watchServer("other:28000");
    ws.receive({
      type: "catchupBegin",
      address: "test:28000",
      epoch: 1,
      totalBytes: 3,
      chunkCount: 1,
      encoding: "gzip",
    });
    ws.receive(new Uint8Array([1, 2, 3]));
    ws.receive({ type: "catchupEnd" });
    live(ws);
    expect(decodes).toHaveLength(0);
    expect(events).toEqual([]);
  });
});

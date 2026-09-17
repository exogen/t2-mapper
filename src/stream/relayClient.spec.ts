import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { RelayClient, type RelayEventHandler } from "./relayClient";
import type { ServerMessage } from "../../relay/types";

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

  beforeEach(() => {
    FakeWebSocket.instances = [];
    decodes = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    // Real gzip decoding with controllable completion order: large snapshots
    // can finish after a newer mission's smaller catch-up on the same socket.
    const NativeResponse = Response;
    vi.stubGlobal(
      "Response",
      class extends NativeResponse {
        override arrayBuffer(): Promise<ArrayBuffer> {
          const result = super.arrayBuffer().then(
            (value) => ({ value, error: undefined }),
            (error) => ({ value: undefined, error }),
          );
          return new Promise((resolve, reject) => {
            decodes.push(async () => {
              const outcome = await result;
              if (outcome.error) reject(outcome.error);
              else resolve(outcome.value!);
            });
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

  function snapshot(ws: FakeWebSocket, epoch: number) {
    const bytes = gzipSync(
      JSON.stringify({ epoch, initialGhosts: [], dataBlocks: [] }),
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

  function live(ws: FakeWebSocket) {
    ws.receive({
      type: "sessionStatus",
      status: "live",
      address: "test:28000",
      watcherCount: 1,
    });
  }

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
});

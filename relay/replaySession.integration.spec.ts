import { setImmediate, setTimeout as delay } from "node:timers/promises";
import { deflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockTypeInfo, BlockTypeMove, BlockTypePacket } from "t2-demo-parser";
import type { WebSocket } from "ws";
import { RelayClient } from "../src/stream/relayClient";
import { ReplayStreamAdapter } from "../src/stream/replayStreaming";
import type { ClientMessage, ServerMessage } from "./types";
import type { ReplayClientMessage, ReplayState } from "./replayTypes";
import { ReplaySessionManager } from "./replaySession";
import {
  buildDemoValues,
  buildHeader,
  buildInfoBlock,
  buildInitialBlock,
  ZERO_MOVE,
} from "./demoWriter";
import {
  command,
  CONNECT_SEQUENCE,
  netString,
  serverPacket,
} from "./serverPacketFixtures";

vi.mock("../src/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function block(type: number, bytes: Uint8Array): Uint8Array {
  const header = Buffer.alloc(2);
  header.writeUInt16LE((type << 12) | bytes.length);
  return Buffer.concat([header, bytes]);
}

/** Real recording, including protocol events and a packet-only EOF score update. */
function recording(ticks = 30): Uint8Array {
  const initial = buildInitialBlock({
    connectSequence: CONNECT_SEQUENCE,
    missionName: "Katabatic",
    demoValues: buildDemoValues({
      recorderName: "Observer",
      serverName: "Replay integration",
      serverAddress: "example:28000",
      date: new Date("2026-01-01T00:00:00Z"),
      missionDisplayName: "Katabatic",
      mod: "classic",
      gameType: "Capture the Flag",
    }),
  });
  const packets = [
    block(
      BlockTypePacket,
      serverPacket(1, {
        events: [
          netString(0, 1, "ServerMessage"),
          command(1, 1, "MsgCTFAddTeam", "", "1", "Storm", "", "0"),
        ],
      }),
    ),
  ];
  for (let tick = 0; tick < ticks; tick++) {
    if (tick === 0 || tick === 10)
      packets.push(block(BlockTypeInfo, buildInfoBlock(tick === 10)));
    packets.push(block(BlockTypeMove, ZERO_MOVE));
  }
  packets.push(
    block(
      BlockTypePacket,
      serverPacket(2, {
        events: [command(2, 1, "MsgTeamScore", "", "1", "42")],
      }),
    ),
  );
  return Buffer.concat([
    buildHeader(initial.length),
    initial,
    deflateRawSync(Buffer.concat(packets)),
  ]);
}

let manager: ReplaySessionManager;

/** Browser and ws server endpoints exchange copied frames in FIFO microtasks. */
class MemoryWebSocket {
  static OPEN = 1;
  static instances: MemoryWebSocket[] = [];
  readyState = 0;
  binaryType = "";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  readonly serverMessages: ServerMessage[] = [];
  readonly endpoint = {
    OPEN: 1,
    readyState: 1,
    bufferedAmount: 0,
    send: (frame: string | Uint8Array) => {
      const data =
        typeof frame === "string" ? frame : Uint8Array.from(frame).buffer;
      if (typeof frame === "string")
        this.serverMessages.push(JSON.parse(frame) as ServerMessage);
      void Promise.resolve().then(() => {
        if (this.readyState === MemoryWebSocket.OPEN)
          this.onmessage?.({ data });
      });
    },
    close: () => this.close(),
  };

  constructor(_url: string) {
    MemoryWebSocket.instances.push(this);
  }
  open() {
    this.readyState = MemoryWebSocket.OPEN;
    this.onopen?.();
  }
  send(frame: string) {
    const message = JSON.parse(frame) as ClientMessage;
    void Promise.resolve().then(async () => {
      if (this.readyState !== MemoryWebSocket.OPEN) return;
      if (message.type === "wsPing")
        this.endpoint.send(JSON.stringify({ type: "wsPong", ts: message.ts }));
      else
        await manager.handle(
          this.endpoint as unknown as WebSocket,
          message as ReplayClientMessage,
        );
    });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = this.endpoint.readyState = 3;
    manager.detach(this.endpoint as unknown as WebSocket);
    this.onclose?.();
  }
}

interface Viewer {
  client: RelayClient;
  adapter: ReplayStreamAdapter;
  socket: MemoryWebSocket;
  state: ReplayState | null;
  hydrations: Array<{ tick: number; epoch: number }>;
  ticks: number[];
  errors: string[];
}
const viewers: Viewer[] = [];

function viewer(): Viewer {
  const client = new RelayClient("ws://memory", {
    onReplayState(state) {
      result.state = state;
      result.adapter.applyState(state);
    },
    onCatchup(payload) {
      result.adapter.hydrate(payload);
      result.hydrations.push({
        tick: payload.replay!.tick,
        epoch: payload.epoch,
      });
    },
    onGamePacket(data) {
      result.adapter.feedPacket(data);
    },
    onReplayTick(message) {
      result.ticks.push(message.tick);
      result.adapter.feedReplayTick(message);
    },
    onReplayInfo(message) {
      result.adapter.feedReplayInfo(message);
    },
    onReplayError(message) {
      result.errors.push(message);
    },
    onError(message) {
      result.errors.push(message);
    },
  });
  const result: Viewer = {
    client,
    adapter: new ReplayStreamAdapter(client),
    socket: null!,
    state: null,
    hydrations: [],
    ticks: [],
    errors: [],
  };
  client.connect();
  result.socket = MemoryWebSocket.instances.at(-1)!;
  result.socket.open();
  viewers.push(result);
  return result;
}

/** Let native gzip streams finish without advancing the replay's fake wall clock. */
async function settle(until: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400 && !until(); attempt++) await delay(5);
  expect(until()).toBe(true);
}

function control(
  viewer: Viewer,
  action: "play" | "pause" | "seek",
  tick?: number,
) {
  viewer.client.controlReplay(
    viewer.state!.sessionId,
    viewer.state!.revision,
    action,
    tick,
  );
}

describe("replay server/browser interoperability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MemoryWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MemoryWebSocket);
    manager = new ReplaySessionManager({
      loadDemo: async () => recording(),
      now: () => Date.now(),
    });
  });
  afterEach(() => {
    for (const viewer of viewers.splice(0)) viewer.client.close();
    manager.shutdown();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("replaces a replay on the same browser socket without latching its old terminal state", async () => {
    const owner = viewer();
    const creatorId = "a".repeat(48);
    owner.client.createReplay("fixture.rec", creatorId, 0);
    await settle(() => owner.hydrations.length === 1);
    const oldId = owner.state!.sessionId;
    const watcher = viewer();
    watcher.client.joinReplay(oldId);
    await settle(() => watcher.hydrations.length === 1);
    const before = owner.socket.serverMessages.length;
    owner.client.createReplay("fixture.rec", creatorId, 7);
    await settle(() => owner.hydrations.length === 2);
    expect(owner.state).toMatchObject({
      status: "paused",
      tick: 7,
      isOwner: true,
      closed: false,
    });
    expect(owner.state!.sessionId).not.toBe(oldId);
    expect(owner.socket.serverMessages.slice(before)).not.toContainEqual(
      expect.objectContaining({ type: "replayState", sessionId: oldId }),
    );
    expect(watcher.state).toMatchObject({
      sessionId: oldId,
      closed: true,
      status: "ended",
    });
    expect(manager.getStatusSummary()).toEqual([
      expect.objectContaining({ sessionId: owner.state!.sessionId, tick: 7 }),
    ]);
    expect(owner.errors).toEqual([]);
  });

  it("hydrates two viewers across create, play, canonical pause, backwards seek and packet-only EOF", async () => {
    const owner = viewer();
    owner.client.createReplay("fixture.rec", "a".repeat(48), 0);
    await settle(() => owner.hydrations.length === 1);
    expect(owner.state).toMatchObject({
      status: "paused",
      tick: 0,
      isOwner: true,
      recorderName: "Observer",
      recordingDate: "Jan-1-2026 12:00AM",
    });
    const watcher = viewer();
    watcher.client.joinReplay(owner.state!.sessionId);
    await settle(() => watcher.hydrations.length === 1);
    expect(watcher.state).toMatchObject({
      status: "paused",
      isOwner: false,
      watcherCount: 2,
      recorderName: "Observer",
      recordingDate: "Jan-1-2026 12:00AM",
    });
    expect(
      watcher.socket.serverMessages.some(
        (message) => message.type === "replayState" && message.ownerToken,
      ),
    ).toBe(false);
    control(watcher, "play");
    await settle(() => watcher.errors.length === 1);
    expect(watcher.errors[0]).toContain("creator");

    control(owner, "play");
    await settle(() => owner.state?.status === "playing");
    await vi.advanceTimersByTimeAsync(20 * 32);
    await settle(() => watcher.adapter.sourceTick === 20);
    expect(owner.ticks).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(
      owner.socket.serverMessages
        .filter((message) => message.type === "replayTick")
        .map((message) => message.firstPerson),
    ).toEqual([
      ...Array.from({ length: 10 }, () => false),
      ...Array.from({ length: 10 }, () => true),
    ]);
    // Ordinary live rendering can be ahead; the canonical pause must replace it.
    owner.adapter.stepToTime(2);
    control(owner, "pause", 20);
    await settle(
      () => owner.hydrations.length === 2 && watcher.hydrations.length === 2,
    );
    for (const current of [owner, watcher]) {
      expect(current.state).toMatchObject({ status: "paused", tick: 20 });
      expect(current.adapter.stepToTime(999).timeSec).toBeCloseTo(20 * 0.032);
      expect(current.hydrations.at(-1)!.epoch).toBe(current.state!.epoch);
    }

    control(owner, "seek", 7);
    await settle(
      () => owner.hydrations.length === 3 && watcher.hydrations.length === 3,
    );
    expect(watcher.adapter.getSnapshot().timeSec).toBeCloseTo(7 * 0.032);
    expect(watcher.state).toMatchObject({ status: "paused", tick: 7 });
    control(owner, "play");
    await settle(() => owner.state?.status === "playing");
    await vi.advanceTimersByTimeAsync(24 * 32);
    await settle(
      () => owner.hydrations.length === 4 && watcher.hydrations.length === 4,
    );
    for (const current of [owner, watcher]) {
      expect(current.state).toMatchObject({ status: "ended", tick: 30 });
      expect(current.adapter.stepToTime(999).timeSec).toBeCloseTo(30 * 0.032);
      expect(current.adapter.getSnapshot().teamScores).toContainEqual(
        expect.objectContaining({ teamId: 1, score: 42 }),
      );
    }
    expect(owner.errors).toEqual([]);
    expect(watcher.errors).toHaveLength(1);
  });

  it("keeps streaming after the creator leaves and restores controls only with the creator capability", async () => {
    const owner = viewer();
    owner.client.createReplay("fixture.rec", "a".repeat(48), 0);
    await settle(() => owner.hydrations.length === 1);
    const id = owner.state!.sessionId;
    const token = (
      owner.socket.serverMessages.find(
        (message) => message.type === "replayState" && message.ownerToken,
      ) as ReplayState
    ).ownerToken!;
    const watcher = viewer();
    watcher.client.joinReplay(id);
    await settle(() => watcher.hydrations.length === 1);
    control(owner, "play");
    await settle(() => watcher.state?.status === "playing");
    await vi.advanceTimersByTimeAsync(3 * 32);
    await settle(() => watcher.adapter.sourceTick === 3);
    const epoch = watcher.state!.epoch;
    const beforeLeave = watcher.socket.serverMessages.length;

    owner.client.leaveReplay();
    await settle(() => watcher.state?.watcherCount === 1);
    expect(watcher.state).toMatchObject({ status: "playing", epoch });
    await vi.advanceTimersByTimeAsync(5 * 32);
    await settle(() => watcher.adapter.sourceTick === 8);
    expect(watcher.hydrations).toHaveLength(1);
    expect(watcher.socket.serverMessages.slice(beforeLeave)).not.toContainEqual(
      expect.objectContaining({ type: "catchupBegin" }),
    );
    expect(watcher.ticks).toEqual(
      Array.from({ length: 8 }, (_, index) => index + 1),
    );
    expect(
      watcher.socket.serverMessages
        .slice(beforeLeave)
        .filter((message) => message.type === "replayTick")
        .every((message) => message.epoch === epoch),
    ).toBe(true);

    control(watcher, "pause", 8);
    await settle(() => watcher.errors.length === 1);
    expect(watcher.errors[0]).toContain("creator");
    await vi.advanceTimersByTimeAsync(2 * 32);
    await settle(() => watcher.adapter.sourceTick === 10);
    expect(watcher.state).toMatchObject({ status: "playing", epoch });

    owner.client.joinReplay(id, token);
    await settle(() => owner.hydrations.length === 2);
    expect(owner.state).toMatchObject({
      isOwner: true,
      status: "playing",
      epoch,
    });
    expect(watcher.hydrations).toHaveLength(1);
    control(owner, "pause", 10);
    await settle(
      () => owner.hydrations.length === 3 && watcher.hydrations.length === 2,
    );
    expect(watcher.state).toMatchObject({ status: "paused", tick: 10 });
    expect(watcher.state!.epoch).toBeGreaterThan(epoch);
    expect(watcher.adapter.stepToTime(999).timeSec).toBeCloseTo(10 * 0.032);
    expect(owner.errors).toEqual([]);
  });

  it("discards an older real gzip snapshot and its buffered frames when pause supersedes it", async () => {
    const NativeDecompressionStream = DecompressionStream;
    const decodes: Array<() => Promise<void>> = [];
    vi.stubGlobal(
      "DecompressionStream",
      class {
        readonly readable: ReadableStream<Uint8Array>;
        readonly writable: InstanceType<
          typeof NativeDecompressionStream
        >["writable"];
        constructor(
          ...args: ConstructorParameters<typeof NativeDecompressionStream>
        ) {
          const native = new NativeDecompressionStream(...args);
          const reader = native.readable.getReader();
          this.writable = native.writable;
          let release!: () => void;
          let canceled = false;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          decodes.push(async () => release());
          this.readable = new ReadableStream({
            async pull(controller) {
              await gate;
              if (canceled) return;
              const { done, value } = await reader.read();
              if (done) controller.close();
              else controller.enqueue(value);
            },
            cancel(reason) {
              canceled = true;
              release();
              return reader.cancel(reason);
            },
          });
        }
      },
    );
    const owner = viewer();
    owner.client.createReplay("fixture.rec", "a".repeat(48), 0);
    await settle(() => decodes.length === 1);
    await decodes[0]();
    await settle(() => owner.hydrations.length === 1);
    control(owner, "play");
    await settle(() => owner.state?.status === "playing");
    owner.client.syncReplay(owner.state!.sessionId);
    await settle(() => decodes.length === 2);
    await vi.advanceTimersByTimeAsync(64);
    expect(owner.ticks).toEqual([]);
    control(owner, "pause", 2);
    await settle(() => decodes.length === 3);
    await decodes[2]();
    await settle(() => owner.hydrations.length === 2);
    expect(owner.hydrations.map(({ tick }) => tick)).toEqual([0, 2]);
    const pausedEpoch = owner.state!.epoch;
    await decodes[1]();
    await setImmediate();
    expect(owner.hydrations.map(({ tick }) => tick)).toEqual([0, 2]);
    expect(owner.ticks).toEqual([]);
    expect(owner.state).toMatchObject({
      status: "paused",
      tick: 2,
      epoch: pausedEpoch,
    });
    expect(owner.adapter.stepToTime(999).timeSec).toBeCloseTo(2 * 0.032);
    expect(owner.errors).toEqual([]);
  });
});

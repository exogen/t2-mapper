import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import type { Move } from "t2-demo-parser";
import type { WebSocket } from "ws";
import {
  ReplaySessionManager,
  type ReplaySource,
  type ReplaySessionManagerOptions,
} from "./replaySession";
import type { ReplayState } from "./replayTypes";
import type { ServerMessage } from "./types";
import { NEUTRAL_MOVE } from "./moveList";
import { testCatchupPayload } from "./serverPacketFixtures";
import { buildHeader } from "./demoWriter";
import { REPLAY_UPLOAD_TIMEOUT_MS } from "./replayTypes";

// Exercise both size boundaries without constructing 64 MiB test snapshots.
vi.mock("./catchupLimits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./catchupLimits")>()),
  MAX_CATCHUP_COMPRESSED_BYTES: 16 * 1024,
  MAX_CATCHUP_DECOMPRESSED_BYTES: 64 * 1024,
}));

class Socket {
  OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  frames: Array<string | Uint8Array> = [];
  close = vi.fn(() => {
    this.readyState = 3;
  });
  send(value: string | Uint8Array) {
    this.frames.push(value);
  }
  get ws() {
    return this as unknown as WebSocket;
  }
  messages() {
    return this.frames
      .filter((frame): frame is string => typeof frame === "string")
      .map((frame) => JSON.parse(frame) as ServerMessage);
  }
  state() {
    return this.messages()
      .filter((message) => message.type === "replayState")
      .at(-1)! as ReplayState;
  }
}

class Source implements ReplaySource {
  tick = 0;
  durationTicks = 10_000;
  complete = false;
  firstPerson = true;
  advanceOneTick(): ReturnType<ReplaySource["advanceOneTick"]> {
    if (this.tick === this.durationTicks) {
      this.complete = true;
      return [{ kind: "packet", data: new Uint8Array([255]) }];
    }
    this.tick++;
    return [
      { kind: "packet", data: new Uint8Array([this.tick]) },
      {
        kind: "move",
        tick: this.tick,
        move: { ...NEUTRAL_MOVE, id: this.tick - 1, sendCount: 0 } as Move,
        firstPerson: this.firstPerson,
      },
    ];
  }
  async seek(tick: number) {
    this.tick = tick;
    this.complete = false;
  }
  catchup(
    sessionId: string,
    epoch: number,
    status: "paused" | "playing" | "ended",
  ) {
    return {
      ...testCatchupPayload({ epoch, serverAddress: `replay:${sessionId}` }),
      replay: {
        sessionId,
        epoch,
        status,
        tick: this.tick,
        pendingMoves: [],
        nextMoveId: 0,
        lastClientMoveId: 0,
        controlMoveReplayStartId: 0,
        lastMoveAck: 0,
        controlMovesAvailable: true,
        firstPerson: true,
        fov: 100,
        absoluteYaw: 0,
        absolutePitch: 0,
      },
    };
  }
}

const CREATOR_ID = "a".repeat(48);
const OTHER_CREATOR_ID = "b".repeat(48);

let managers: ReplaySessionManager[];
function setup(options: ReplaySessionManagerOptions = {}) {
  const source = new Source();
  const manager = new ReplaySessionManager({
    loadDemo: async () => new Uint8Array(),
    createSource: async () => source,
    now: () => Date.now(),
    idleTtlMs: 1000,
    ...options,
  });
  managers.push(manager);
  return { manager, source };
}
async function create(
  manager: ReplaySessionManager,
  creatorId = randomBytes(24).toString("hex"),
) {
  const owner = new Socket();
  await manager.handle(owner.ws, {
    type: "createReplay",
    demo: "test.rec",
    creatorId,
  });
  return {
    owner,
    id: owner.state().sessionId,
    token: (
      owner
        .messages()
        .find(
          (message) => message.type === "replayState" && message.ownerToken,
        ) as ReplayState
    ).ownerToken!,
  };
}
async function action(
  manager: ReplaySessionManager,
  socket: Socket,
  command: "play" | "pause" | "seek" | "end",
  tick?: number,
) {
  return manager.handle(socket.ws, {
    type: "controlReplay",
    sessionId: socket.state().sessionId,
    revision: socket.state().revision,
    action: command,
    tick,
  });
}

describe("replay sessions", () => {
  const uploadId = "01234567-89ab-4cde-8fab-0123456789ab";
  const nextUploadId = "01234567-89ab-4cde-8fab-0123456789ac";

  it("replaces a browser's old room across sockets before applying the room limit", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const old = await create(manager, CREATOR_ID);
    const watcher = new Socket();
    await manager.handle(watcher.ws, { type: "joinReplay", sessionId: old.id });
    const next = await create(manager, CREATOR_ID);
    expect(next.id).not.toBe(old.id);
    expect(manager.getStatusSummary()).toEqual([
      expect.objectContaining({ sessionId: next.id }),
    ]);
    expect(old.owner.state()).toMatchObject({ closed: true, status: "ended" });
    expect(watcher.state()).toMatchObject({ closed: true, status: "ended" });
    await manager.handle(watcher.ws, {
      type: "joinReplay",
      sessionId: old.id,
      ownerToken: old.token,
    });
    expect(watcher.messages().at(-1)).toMatchObject({ type: "replayError" });
    const publicData = JSON.stringify([
      ...next.owner.messages(),
      manager.getStatusSummary(),
    ]);
    expect(publicData).not.toContain(CREATOR_ID);
    expect(publicData).not.toContain("creatorHash");
  });

  it("does not send the requesting socket a terminal state for its old room", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const { owner, id } = await create(manager, CREATOR_ID);
    const watcher = new Socket();
    await manager.handle(watcher.ws, { type: "joinReplay", sessionId: id });
    owner.frames = [];
    await manager.handle(owner.ws, {
      type: "createReplay",
      creatorId: CREATOR_ID,
      demo: "next.rec",
    });
    expect(owner.state()).toMatchObject({ demo: "next.rec", closed: false });
    expect(
      owner.messages().filter((message) => message.type === "replayState"),
    ).not.toContainEqual(expect.objectContaining({ sessionId: id }));
    expect(watcher.state()).toMatchObject({ sessionId: id, closed: true });
  });

  it("replaces only created rooms even after the creator joins another room as a watcher", async () => {
    const { manager } = setup({ maxSessions: 2 });
    const own = await create(manager, CREATOR_ID);
    const foreign = await create(manager, OTHER_CREATOR_ID);
    await manager.handle(own.owner.ws, {
      type: "joinReplay",
      sessionId: foreign.id,
    });
    expect(own.owner.state().isOwner).toBe(false);
    await manager.handle(own.owner.ws, {
      type: "createReplay",
      creatorId: CREATOR_ID,
      demo: "replacement.rec",
    });
    expect(
      manager.getStatusSummary().map((session) => session.sessionId),
    ).toEqual([foreign.id, own.owner.state().sessionId]);
    expect(foreign.owner.state()).toMatchObject({
      closed: false,
      isOwner: true,
    });
    expect(own.owner.state().sessionId).not.toBe(own.id);
  });

  it("validates creation metadata before replacing an existing room", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const { id, owner } = await create(manager, CREATOR_ID);
    for (const input of [
      { creatorId: "" },
      { creatorId: "A".repeat(48) },
      { creatorId: "g".repeat(48) },
      { creatorId: undefined as unknown as string },
      { demo: "../bad.rec" },
      { tick: -1 },
    ]) {
      await manager.handle(new Socket().ws, {
        type: "createReplay",
        creatorId: CREATOR_ID,
        demo: "test.rec",
        ...input,
      });
      expect(manager.getStatusSummary()).toEqual([
        expect.objectContaining({ sessionId: id }),
      ]);
    }
    expect(owner.state().closed).toBe(false);
    for (const input of [
      { creatorId: "" },
      { creatorId: undefined as unknown as string },
      { uploadId: "bad" },
      { totalBytes: 0 },
    ]) {
      await manager.handle(owner.ws, {
        type: "watchReplayUpload",
        creatorId: CREATOR_ID,
        uploadId,
        totalBytes: 100,
        ...input,
      });
      expect(manager.getStatusSummary()[0].sessionId).toBe(id);
      expect(owner.state().closed).toBe(false);
    }
    await expect(
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "../bad.rec",
        signal: new AbortController().signal,
        read: async () => buildHeader(0),
      }),
    ).rejects.toThrow("Choose");
    expect(manager.getStatusSummary()[0].sessionId).toBe(id);
  });

  it("starts a replacement upload without sending the old room state to the uploading socket", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const { owner, id } = await create(manager, CREATOR_ID);
    const watcher = new Socket();
    await manager.handle(watcher.ws, { type: "joinReplay", sessionId: id });
    owner.frames = [];
    const bytes = buildHeader(0);
    await manager.handle(owner.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: bytes.byteLength,
    });
    expect(owner.messages()).toEqual([
      {
        type: "replayUploadProgress",
        uploadId,
        receivedBytes: 0,
        totalBytes: bytes.byteLength,
      },
    ]);
    expect(watcher.state()).toMatchObject({ sessionId: id, closed: true });
    expect(manager.getStatusSummary()).toEqual([]);
    const next = await manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      uploadId,
      name: "next.rec",
      signal: new AbortController().signal,
      read: async () => bytes,
    });
    expect(manager.getStatusSummary()[0].sessionId).toBe(next.sessionId);
  });

  it("rejects delayed replaced HTTP uploads and mismatched creator IDs before touching current rooms", async () => {
    const { manager } = setup({ maxSessions: 2 });
    const observer = new Socket();
    const bytes = buildHeader(0);
    await manager.handle(observer.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: bytes.byteLength,
    });
    const foreign = await create(manager, OTHER_CREATOR_ID);
    const read = vi.fn(async () => bytes);
    await expect(
      manager.createUploadedDemo({
        creatorId: OTHER_CREATOR_ID,
        uploadId,
        name: "wrong.rec",
        signal: new AbortController().signal,
        read,
      }),
    ).rejects.toThrow("expired");
    expect(read).not.toHaveBeenCalled();
    expect(foreign.owner.state().closed).toBe(false);
    // The rejected header did not claim or cancel the legitimate observer.
    await manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      uploadId,
      name: "valid.rec",
      signal: new AbortController().signal,
      read: async () => bytes,
    });
    await manager.handle(observer.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: bytes.byteLength,
    });
    const current = await create(manager, CREATOR_ID);
    await expect(
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        uploadId,
        name: "stale.rec",
        signal: new AbortController().signal,
        read,
      }),
    ).rejects.toThrow("expired");
    expect(read).not.toHaveBeenCalled();
    expect(
      manager.getStatusSummary().map((session) => session.sessionId),
    ).toEqual([foreign.id, current.id]);
    expect(current.owner.state().closed).toBe(false);
  });

  it.each(["reading", "preparing"])(
    "cancels an older upload while %s without letting its late completion remove the replacement",
    async (phase) => {
      let finish!: (value: Uint8Array | ReplaySource) => void;
      let oldSignal!: AbortSignal;
      const source = new Source();
      let sourceCalls = 0;
      const { manager } = setup({
        maxSessions: 1,
        loadDemo: async () => {
          expect(oldSignal.aborted).toBe(true);
          return new Uint8Array();
        },
        createSource: async (_bytes, signal) => {
          if (phase === "preparing" && ++sourceCalls === 1) {
            oldSignal = signal;
            return await new Promise<ReplaySource>((resolve) => {
              finish = resolve as typeof finish;
            });
          }
          return source;
        },
      });
      const observer = new Socket();
      const bytes = buildHeader(0);
      await manager.handle(observer.ws, {
        type: "watchReplayUpload",
        creatorId: CREATOR_ID,
        uploadId,
        totalBytes: bytes.byteLength,
      });
      const old = manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        uploadId,
        name: "old.rec",
        signal: new AbortController().signal,
        read: async (signal) => {
          if (phase === "reading") {
            oldSignal = signal;
            return await new Promise<Uint8Array>((resolve) => {
              finish = resolve as typeof finish;
            });
          }
          return bytes;
        },
      });
      const rejected = expect(old).rejects.toThrow();
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      const replacement = await create(manager, CREATOR_ID);
      await rejected;
      expect(oldSignal.aborted).toBe(true);
      finish(phase === "reading" ? bytes : new Source());
      await Promise.resolve();
      await Promise.resolve();
      expect(manager.getStatusSummary()).toEqual([
        expect.objectContaining({
          sessionId: replacement.id,
          status: "paused",
        }),
      ]);
      expect(replacement.owner.state().closed).toBe(false);
    },
  );

  function retained(manager: ReplaySessionManager, id: string) {
    return (
      manager as unknown as {
        sessions: Map<string, { source: unknown; catchupCache: unknown }>;
      }
    ).sessions.get(id);
  }

  it.each(["decoded", "compressed"] as const)(
    "fails closed before sending an oversized %s snapshot and releases its source",
    async (limit) => {
      const { manager, source } = setup();
      const catchup = source.catchup.bind(source);
      source.catchup = (...args) => ({
        ...catchup(...args),
        missionName:
          limit === "decoded"
            ? "é".repeat(40_000)
            : randomBytes(30_000).toString("base64"),
      });
      const { owner, id } = await create(manager);
      expect(owner.state()).toMatchObject({
        status: "ended",
        closed: true,
        error: expect.stringContaining(`${limit} size limit`),
      });
      expect(owner.frames.some((frame) => frame instanceof Uint8Array)).toBe(
        false,
      );
      expect(retained(manager, id)).toMatchObject({
        source: null,
        catchupCache: undefined,
      });
      await action(manager, owner, "play");
      expect(owner.messages().at(-1)).toMatchObject({
        type: "replayError",
        message: expect.stringContaining("has ended"),
      });
    },
  );

  it("rejects uploaded sources with an unusable snapshot before returning an owner capability", async () => {
    const { manager, source } = setup();
    const catchup = source.catchup.bind(source);
    source.catchup = (...args) => ({
      ...catchup(...args),
      missionName: "é".repeat(40_000),
    });
    await expect(
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "large.rec",
        signal: new AbortController().signal,
        read: async () => buildHeader(0),
      }),
    ).rejects.toThrow("decoded size limit");
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("contains a fatal snapshot error during disconnect without throwing from the socket handler", async () => {
    const { manager, source } = setup();
    const { owner, id } = await create(manager);
    const watcher = new Socket();
    await manager.handle(watcher.ws, { type: "joinReplay", sessionId: id });
    await action(manager, owner, "play");
    source.catchup = () => {
      throw new Error("Invalid source snapshot");
    };
    expect(() => manager.detach(owner.ws)).not.toThrow();
    expect(watcher.state()).toMatchObject({
      status: "ended",
      closed: true,
      error: "Invalid source snapshot",
    });
    expect(retained(manager, id)).toMatchObject({
      source: null,
      catchupCache: undefined,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(source.tick).toBe(0);
  });

  it("closes a corrupt running source and releases parsed state immediately", async () => {
    const { manager, source } = setup();
    const { owner, id } = await create(manager);
    source.advanceOneTick = () => {
      throw new Error("Corrupt replay packet");
    };
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(32);
    expect(owner.state()).toMatchObject({
      status: "ended",
      closed: true,
      error: "Corrupt replay packet",
    });
    expect(retained(manager, id)).toMatchObject({
      source: null,
      catchupCache: undefined,
    });
  });

  it("forwards recorded first-person input mode with each move tick", async () => {
    const { manager, source } = setup();
    const { owner } = await create(manager);
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(32);
    source.firstPerson = false;
    await vi.advanceTimersByTimeAsync(32);
    expect(
      owner
        .messages()
        .filter((message) => message.type === "replayTick")
        .map((message) => message.firstPerson),
    ).toEqual([true, false]);
  });

  it("preserves Info, packet, and Move chronology in the spectator stream", async () => {
    const { manager, source } = setup();
    const { owner } = await create(manager);
    source.advanceOneTick = () => {
      source.tick++;
      return [
        { kind: "info", firstPerson: false },
        { kind: "packet", data: new Uint8Array([77]) },
        {
          kind: "move",
          tick: source.tick,
          move: NEUTRAL_MOVE as Move,
          firstPerson: false,
        },
      ];
    };
    const start = owner.frames.length;
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(32);
    const events = owner.frames.slice(start).flatMap((frame) => {
      if (frame instanceof Uint8Array) return [`packet:${frame[0]}`];
      const message = JSON.parse(frame) as ServerMessage;
      return message.type === "replayInfo" || message.type === "replayTick"
        ? [`${message.type}:${message.firstPerson}`]
        : [];
    });
    expect(events).toEqual([
      "replayInfo:false",
      "packet:77",
      "replayTick:false",
    ]);
  });

  it("acknowledges a private upload before HTTP, reports actual bytes through 100%, and removes observation before owner join", async () => {
    let finish!: (source: ReplaySource) => void;
    const { manager } = setup({
      createSource: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const observer = new Socket();
    const bytes = new Uint8Array(1000);
    bytes.set(buildHeader(0));
    await manager.handle(observer.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: bytes.byteLength,
    });
    expect(manager.getStatusSummary()).toEqual([]);
    expect(observer.messages()).toEqual([
      {
        type: "replayUploadProgress",
        uploadId,
        receivedBytes: 0,
        totalBytes: 1000,
      },
    ]);
    const preparing = manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      name: "progress.rec",
      uploadId,
      signal: new AbortController().signal,
      read: async (_signal, report) => {
        for (const received of [1, 2, 10, 11, 20, 1000]) report!(received);
        return bytes;
      },
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(
      observer
        .messages()
        .filter((message) => message.type === "replayUploadProgress")
        .map((message) => message.receivedBytes),
    ).toEqual([0, 10, 20, 1000]);
    expect(manager.getStatusSummary()[0].status).toBe("preparing");
    finish(new Source());
    const result = await preparing;
    await manager.handle(observer.ws, { type: "joinReplay", ...result });
    expect(observer.state().isOwner).toBe(true);
    // Observation is finished; a normal owner leave keeps the ready source
    // available throughout the room's existing reconnect grace.
    manager.detach(observer.ws);
    expect(manager.getStatusSummary()).toHaveLength(1);
  });

  it("bounds private observations, replaces one socket's waiting upload, and never allocates phantom rooms", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const first = new Socket();
    const second = new Socket();
    await manager.handle(first.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: 100,
    });
    await manager.handle(second.ws, {
      type: "watchReplayUpload",
      creatorId: OTHER_CREATOR_ID,
      uploadId,
      totalBytes: 100,
    });
    expect(second.messages().at(-1)).toMatchObject({ type: "replayError" });
    await manager.handle(second.ws, {
      type: "watchReplayUpload",
      creatorId: OTHER_CREATOR_ID,
      uploadId: nextUploadId,
      totalBytes: 100,
    });
    expect(second.messages().at(-1)).toMatchObject({
      type: "replayError",
      message: expect.stringContaining("in use"),
    });
    await manager.handle(first.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId: nextUploadId,
      totalBytes: 100,
    });
    expect(first.messages().at(-1)).toMatchObject({
      type: "replayUploadProgress",
      uploadId: nextUploadId,
    });
    const read = vi.fn(async () => buildHeader(0));
    await expect(
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "old.rec",
        uploadId,
        read,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("expired");
    expect(read).not.toHaveBeenCalled();
    expect(manager.getStatusSummary()).toEqual([]);
    manager.detach(first.ws);
    await manager.handle(second.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: 100,
    });
    expect(second.messages().at(-1)).toMatchObject({
      type: "replayUploadProgress",
    });
  });

  it("claims an upload ID once and cancellation of its observer aborts the active POST and frees capacity", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const observer = new Socket();
    await manager.handle(observer.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: 100,
    });
    let signal!: AbortSignal;
    const uploading = manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      name: "active.rec",
      uploadId,
      signal: new AbortController().signal,
      read: (value) => {
        signal = value;
        return new Promise(() => {});
      },
    });
    const canceled = expect(uploading).rejects.toThrow("canceled");
    const read = vi.fn(async () => buildHeader(0));
    await expect(
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "duplicate.rec",
        uploadId,
        signal: new AbortController().signal,
        read,
      }),
    ).rejects.toThrow("claimed");
    expect(read).not.toHaveBeenCalled();
    expect(signal.aborted).toBe(false);
    manager.detach(observer.ws);
    await canceled;
    expect(signal.aborted).toBe(true);
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("expires pre-POST observations and rejects wrong byte totals without retaining rooms or observations", async () => {
    const { manager } = setup();
    const observer = new Socket();
    await manager.handle(observer.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: 100,
    });
    await vi.advanceTimersByTimeAsync(REPLAY_UPLOAD_TIMEOUT_MS);
    expect(observer.messages().at(-1)).toMatchObject({
      type: "replayError",
      message: expect.stringContaining("timed out"),
    });
    const bytes = buildHeader(0);
    await manager.handle(observer.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId: nextUploadId,
      totalBytes: bytes.byteLength + 1,
    });
    await expect(
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "short.rec",
        uploadId: nextUploadId,
        signal: new AbortController().signal,
        read: async (_signal, report) => {
          report!(bytes.byteLength);
          return bytes;
        },
      }),
    ).rejects.toThrow("selected file");
    expect(manager.getStatusSummary()).toEqual([]);
    await expect(
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "missing.rec",
        uploadId: nextUploadId,
        signal: new AbortController().signal,
        read: async () => bytes,
      }),
    ).rejects.toThrow("expired");
  });

  it("detaches an old replay before observing uploads and cancels source preparation on observer shutdown", async () => {
    const { manager } = setup();
    const { owner } = await create(manager);
    await action(manager, owner, "play");
    await manager.handle(owner.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: 100,
    });
    expect(manager.getStatusSummary()[0]).toMatchObject({
      status: "paused",
      watcherCount: 0,
    });

    let finish!: (source: ReplaySource) => void;
    const preparing = setup({
      createSource: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const observer = new Socket();
    const bytes = buildHeader(0);
    await preparing.manager.handle(observer.ws, {
      type: "watchReplayUpload",
      creatorId: CREATOR_ID,
      uploadId,
      totalBytes: bytes.byteLength,
    });
    const pending = preparing.manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      name: "parsing.rec",
      uploadId,
      signal: new AbortController().signal,
      read: async () => bytes,
    });
    const failure = expect(pending).rejects.toThrow("shutting down");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(observer.messages().at(-1)).toMatchObject({
      type: "replayUploadProgress",
      receivedBytes: bytes.byteLength,
    });
    preparing.manager.shutdown();
    await failure;
    finish(new Source());
    await Promise.resolve();
    expect(preparing.manager.getStatusSummary()).toEqual([]);
  });

  it("discards only unclaimed uploaded rooms authenticated by their owner capability", async () => {
    const { manager } = setup();
    const upload = () =>
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "private.rec",
        signal: new AbortController().signal,
        read: async () => buildHeader(0),
      });
    const unclaimed = await upload();
    manager.discardUnclaimedUpload(unclaimed.sessionId, "wrong");
    expect(manager.getStatusSummary()).toHaveLength(1);
    manager.discardUnclaimedUpload(unclaimed.sessionId, unclaimed.ownerToken);
    expect(manager.getStatusSummary()).toEqual([]);
    manager.discardUnclaimedUpload(unclaimed.sessionId, unclaimed.ownerToken);
    const hosted = await create(manager);
    manager.discardUnclaimedUpload(hosted.id, hosted.token);
    expect(manager.getStatusSummary()).toHaveLength(1);
    const claimed = await upload();
    const owner = new Socket();
    await manager.handle(owner.ws, { type: "joinReplay", ...claimed });
    manager.discardUnclaimedUpload(claimed.sessionId, claimed.ownerToken);
    expect(manager.getStatusSummary()).toHaveLength(2);
    expect(owner.state().isOwner).toBe(true);
  });
  it("prepares a private uploaded source without invoking the hosted loader and lets its owner claim it", async () => {
    const loadDemo = vi.fn();
    const { manager, source } = setup({ loadDemo });
    const metadata = {
      recorderName: "MapGenius",
      recordingDate: "Sep-18-2026 2:17AM",
    };
    Object.assign(source, metadata);
    const result = await manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      name: "my match.rec",
      tick: 42,
      signal: new AbortController().signal,
      read: async () => buildHeader(0),
    });
    expect(loadDemo).not.toHaveBeenCalled();
    expect(source.tick).toBe(42);
    const owner = new Socket();
    await manager.handle(owner.ws, { type: "joinReplay", ...result });
    expect(owner.state()).toMatchObject({
      isOwner: true,
      demo: "my match.rec",
      tick: 42,
      status: "paused",
      ...metadata,
    });
    const watcher = new Socket();
    await manager.handle(watcher.ws, {
      type: "joinReplay",
      sessionId: result.sessionId,
    });
    expect(watcher.state()).toMatchObject({ isOwner: false, ...metadata });
    await action(manager, owner, "end");
    const sessions = (
      manager as unknown as {
        sessions: Map<string, { source: unknown; catchupCache: unknown }>;
      }
    ).sessions;
    expect(sessions.get(result.sessionId)).toMatchObject({
      source: null,
      catchupCache: undefined,
    });
    const late = new Socket();
    await manager.handle(late.ws, {
      type: "joinReplay",
      sessionId: result.sessionId,
    });
    expect(late.state()).toMatchObject({
      closed: true,
      tick: 42,
      ...metadata,
    });
  });

  it("reserves capacity before reading uploads and immediately releases failed or canceled reservations", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const abort = new AbortController();
    let observed: AbortSignal | undefined;
    const pending = manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      name: "one.rec",
      signal: abort.signal,
      read: (signal) => {
        observed = signal;
        return new Promise(() => {});
      },
    });
    const failure = expect(pending).rejects.toThrow("canceled");
    const read = vi.fn(async () => buildHeader(0));
    await expect(
      manager.createUploadedDemo({
        creatorId: OTHER_CREATOR_ID,
        name: "two.rec",
        signal: new AbortController().signal,
        read,
      }),
    ).rejects.toThrow("in use");
    expect(read).not.toHaveBeenCalled();
    abort.abort(new Error("canceled"));
    await failure;
    expect(observed?.aborted).toBe(true);
    expect(manager.getStatusSummary()).toEqual([]);
    await expect(
      manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "bad.rec",
        signal: new AbortController().signal,
        read: async () => new Uint8Array([1, 2]),
      }),
    ).rejects.toThrow("Tribes 2 demo");
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("expires unfinished uploads independently of attached sockets and rejects late parsing after shutdown", async () => {
    const { manager } = setup({ idleTtlMs: REPLAY_UPLOAD_TIMEOUT_MS * 2 });
    let readSignal!: AbortSignal;
    const upload = manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      name: "slow.rec",
      signal: new AbortController().signal,
      read: (signal) => {
        readSignal = signal;
        return new Promise(() => {});
      },
    });
    const failure = expect(upload).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(REPLAY_UPLOAD_TIMEOUT_MS);
    await failure;
    expect(readSignal.aborted).toBe(true);
    expect(manager.getStatusSummary()).toEqual([]);

    let finish!: (source: ReplaySource) => void;
    const parsing = setup({
      createSource: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const pending = parsing.manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      name: "parse.rec",
      signal: new AbortController().signal,
      read: async () => buildHeader(0),
    });
    const canceled = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    parsing.manager.shutdown();
    await canceled;
    finish(new Source());
    await Promise.resolve();
    expect(parsing.manager.getStatusSummary()).toEqual([]);
  });

  it("cleans uploaded parse failures and expires successfully prepared but unclaimed sources", async () => {
    const bad = setup({
      createSource: async () => {
        throw new Error("Unreadable demo");
      },
    });
    await expect(
      bad.manager.createUploadedDemo({
        creatorId: CREATOR_ID,
        name: "bad.rec",
        signal: new AbortController().signal,
        read: async () => buildHeader(0),
      }),
    ).rejects.toThrow("Unreadable demo");
    expect(bad.manager.getStatusSummary()).toEqual([]);
    const { manager } = setup();
    await manager.createUploadedDemo({
      creatorId: CREATOR_ID,
      name: "ready.rec",
      signal: new AbortController().signal,
      read: async () => buildHeader(0),
    });
    expect(manager.getStatusSummary()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.getStatusSummary()).toEqual([]);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    managers = [];
  });
  afterEach(() => {
    for (const manager of managers) manager.shutdown();
    vi.useRealTimers();
  });

  it("starts paused, shares watcher links without owner credentials, and enforces creator controls", async () => {
    const { manager, source } = setup();
    const { owner, id, token } = await create(manager);
    const watcher = new Socket();
    await manager.handle(watcher.ws, { type: "joinReplay", sessionId: id });
    expect(owner.state()).toMatchObject({
      status: "paused",
      isOwner: true,
      watcherCount: 2,
    });
    expect(watcher.state()).toMatchObject({ status: "paused", isOwner: false });
    expect(JSON.stringify(watcher.messages())).not.toContain(token);
    await action(manager, watcher, "play");
    expect(watcher.messages().at(-1)).toMatchObject({
      type: "replayError",
      message: expect.stringContaining("creator"),
    });
    await vi.advanceTimersByTimeAsync(320);
    expect(source.tick).toBe(0);
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(96);
    expect(source.tick).toBe(3);
    const streamed = watcher.frames.slice(
      watcher.frames.findIndex(
        (frame) =>
          typeof frame === "string" && JSON.parse(frame).type === "replayState",
      ) + 1,
    );
    expect(
      streamed.some((frame) => frame instanceof Uint8Array && frame[0] === 1),
    ).toBe(true);
    expect(
      watcher
        .messages()
        .filter((message) => message.type === "replayTick")
        .map((message) => message.tick),
    ).toEqual([1, 2, 3]);
  });

  it("canonicalizes pause and late joins at the exact committed tick", async () => {
    const { manager, source } = setup();
    const { owner, id } = await create(manager);
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(96);
    await action(manager, owner, "pause");
    const pausedEpoch = owner.state().epoch;
    await vi.advanceTimersByTimeAsync(320);
    expect(source.tick).toBe(3);
    const late = new Socket();
    await manager.handle(late.ws, { type: "joinReplay", sessionId: id });
    const binary = late.frames.filter(
      (frame): frame is Uint8Array => frame instanceof Uint8Array,
    );
    const catchup = JSON.parse(gunzipSync(Buffer.concat(binary)).toString());
    expect(catchup.replay).toMatchObject({
      tick: 3,
      epoch: pausedEpoch,
      status: "paused",
    });
    expect(
      late.messages().find((message) => message.type === "catchupBegin"),
    ).toMatchObject({
      type: "catchupBegin",
      address: `replay:${id}`,
    });
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(32);
    expect(source.tick).toBe(4);
  });

  it("announces new epochs before catchup and honors the creator's displayed pause tick", async () => {
    const { manager, source } = setup();
    const { owner } = await create(manager);
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(160);
    expect(source.tick).toBe(5);
    await action(manager, owner, "pause", 3);
    expect(source.tick).toBe(3);
    expect(owner.state()).toMatchObject({ tick: 3, status: "paused" });
    let announcedEpoch = -1;
    for (const message of owner.messages()) {
      if (message.type === "replayState") announcedEpoch = message.epoch;
      if (message.type === "catchupBegin")
        expect(message.epoch).toBe(announcedEpoch);
    }
  });

  it("keeps explicitly ended rooms read-only while allowing EOF rooms to seek", async () => {
    const { manager } = setup();
    const { owner, id, token } = await create(manager);
    await action(manager, owner, "end");
    await action(manager, owner, "seek", 0);
    expect(owner.messages().at(-1)).toMatchObject({
      type: "replayError",
      message: expect.stringContaining("has ended"),
    });
    const returning = new Socket();
    await manager.handle(returning.ws, {
      type: "joinReplay",
      sessionId: id,
      ownerToken: token,
    });
    expect(returning.state()).toMatchObject({
      status: "ended",
      isOwner: false,
    });
  });

  it("auto-pauses on owner disconnect and lets only the capability holder reclaim controls", async () => {
    const { manager, source } = setup();
    const { owner, id, token } = await create(manager);
    const watcher = new Socket();
    await manager.handle(watcher.ws, {
      type: "joinReplay",
      sessionId: id,
      ownerToken: "wrong",
    });
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(32);
    manager.detach(owner.ws);
    expect(watcher.state().status).toBe("paused");
    await vi.advanceTimersByTimeAsync(64);
    expect(source.tick).toBe(1);
    const returning = new Socket();
    await manager.handle(returning.ws, {
      type: "joinReplay",
      sessionId: id,
      ownerToken: token,
    });
    expect(returning.state().isOwner).toBe(true);
    await action(manager, returning, "play");
    await vi.advanceTimersByTimeAsync(32);
    expect(source.tick).toBe(2);
    manager.detach(returning.ws);
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("rejects stale revisions and clamps seeks to the recording", async () => {
    const { manager, source } = setup();
    const { owner, id } = await create(manager);
    const revision = owner.state().revision;
    await action(manager, owner, "play");
    await manager.handle(owner.ws, {
      type: "controlReplay",
      sessionId: id,
      revision,
      action: "pause",
    });
    expect(owner.state().status).toBe("playing");
    await action(manager, owner, "seek", 100_000);
    expect(source.tick).toBe(source.durationTicks);
    expect(owner.state().status).toBe("paused");
  });

  it("restores a usable paused snapshot if a seek fails", async () => {
    const { manager, source } = setup();
    const { owner, id } = await create(manager);
    const watcher = new Socket();
    await manager.handle(watcher.ws, { type: "joinReplay", sessionId: id });
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(96);
    const previousEpoch = owner.state().epoch;
    source.seek = async () => {
      throw new Error("Corrupt packet at destination");
    };
    await action(manager, owner, "seek", 100);
    for (const socket of [owner, watcher]) {
      expect(socket.state()).toMatchObject({
        tick: 3,
        status: "paused",
        error: "Corrupt packet at destination",
      });
      expect(socket.state().epoch).toBeGreaterThan(previousEpoch);
      const start = socket.frames.findLastIndex(
        (frame) =>
          typeof frame === "string" &&
          JSON.parse(frame).type === "catchupBegin",
      );
      const compressed = socket.frames
        .slice(start)
        .filter((frame): frame is Uint8Array => frame instanceof Uint8Array);
      expect(
        JSON.parse(gunzipSync(Buffer.concat(compressed)).toString()).replay,
      ).toMatchObject({
        tick: 3,
        status: "paused",
        epoch: socket.state().epoch,
      });
    }
    await action(manager, owner, "play");
    expect(owner.state().error).toBeUndefined();
    await vi.advanceTimersByTimeAsync(32);
    expect(source.tick).toBe(4);
  });

  it("reclaims explicitly closed rooms before rejecting a new session", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const { owner } = await create(manager);
    const oldId = owner.state().sessionId;
    await action(manager, owner, "end");
    const second = new Socket();
    await manager.handle(second.ws, {
      type: "createReplay",
      demo: "next.rec",
      creatorId: OTHER_CREATOR_ID,
    });
    expect(second.state()).toMatchObject({
      status: "paused",
      isOwner: true,
      demo: "next.rec",
    });
    expect(manager.getStatusSummary()).toHaveLength(1);
    expect(second.state().sessionId).not.toBe(oldId);
  });

  it("flushes packet-only EOF tails and stops the session", async () => {
    const { manager, source } = setup();
    source.durationTicks = 1;
    const { owner } = await create(manager);
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(64);
    expect(
      owner.frames.some(
        (frame) =>
          frame instanceof Uint8Array && frame.length === 1 && frame[0] === 255,
      ),
    ).toBe(true);
    expect(owner.state().status).toBe("ended");
  });

  it("bounds sessions and participants", async () => {
    const { manager } = setup({ maxSessions: 1, maxParticipants: 1 });
    const { id } = await create(manager);
    const second = new Socket();
    await manager.handle(second.ws, { type: "joinReplay", sessionId: id });
    expect(second.messages().at(-1)).toMatchObject({
      type: "replayError",
      message: expect.stringContaining("full"),
    });
    await manager.handle(second.ws, {
      type: "createReplay",
      demo: "test.rec",
      creatorId: OTHER_CREATOR_ID,
    });
    expect(second.messages().at(-1)).toMatchObject({
      type: "replayError",
      message: expect.stringContaining("in use"),
    });
  });

  it("takes the newest seek result and ignores an aborted older seek", async () => {
    const { manager, source } = setup();
    const { owner } = await create(manager);
    const pending: Array<{
      tick: number;
      signal?: AbortSignal;
      finish: () => void;
    }> = [];
    source.seek = (tick: number, signal?: AbortSignal) =>
      new Promise<void>((resolve) => {
        pending.push({
          tick,
          signal,
          finish: () => {
            if (!signal?.aborted) source.tick = tick;
            resolve();
          },
        });
      });
    const older = action(manager, owner, "seek", 100);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const newer = action(manager, owner, "seek", 200);
    expect(pending[0].signal?.aborted).toBe(true);
    expect(pending).toHaveLength(1);
    pending[0].finish();
    await older;
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1].finish();
    await newer;
    const epoch = owner.state().epoch;
    expect(owner.state()).toMatchObject({ tick: 200, epoch, status: "paused" });
  });

  it("finishes a tick before canonicalizing a backpressured owner's disconnect", async () => {
    const { manager } = setup({ maxBufferedBytes: 1000 });
    const { owner, id } = await create(manager);
    const watcher = new Socket();
    await manager.handle(watcher.ws, { type: "joinReplay", sessionId: id });
    await action(manager, owner, "play");
    owner.bufferedAmount = 1001;
    await vi.advanceTimersByTimeAsync(32);
    expect(owner.close).toHaveBeenCalledWith(1013, expect.any(String));
    expect(watcher.state()).toMatchObject({ status: "paused", tick: 1 });
    const messages = watcher.messages();
    const tickIndex = messages.findIndex(
      (message) => message.type === "replayTick",
    );
    const snapshotIndex = messages.findLastIndex(
      (message) => message.type === "catchupBegin",
    );
    expect(tickIndex).toBeGreaterThan(-1);
    expect(snapshotIndex).toBeGreaterThan(tickIndex);
  });

  it("cancels orphaned hosted preparation immediately and ignores a late download completion", async () => {
    let finish!: (value: Uint8Array) => void;
    let signal!: AbortSignal;
    const createSource = vi.fn(async () => new Source());
    const { manager } = setup({
      loadDemo: (_reference, abort) =>
        new Promise((resolve) => {
          signal = abort;
          finish = resolve;
        }),
      createSource,
    });
    const owner = new Socket();
    const loading = manager.handle(owner.ws, {
      type: "createReplay",
      creatorId: CREATOR_ID,
      demo: "test.rec",
    });
    manager.detach(owner.ws);
    expect(signal.aborted).toBe(true);
    expect(manager.getStatusSummary()).toEqual([]);
    finish(new Uint8Array());
    await loading;
    expect(createSource).not.toHaveBeenCalled();
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("marks destroyed rooms closed while preserving seekable natural EOF until expiry", async () => {
    const { manager, source } = setup();
    source.durationTicks = 1;
    const { owner } = await create(manager);
    await action(manager, owner, "play");
    await vi.advanceTimersByTimeAsync(64);
    expect(owner.state()).toMatchObject({ status: "ended", closed: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(owner.state()).toMatchObject({ status: "ended", closed: true });
    expect(manager.getStatusSummary()).toEqual([]);
    const fresh = setup();
    const next = await create(fresh.manager);
    fresh.manager.shutdown();
    expect(next.owner.state()).toMatchObject({ status: "ended", closed: true });
  });
});

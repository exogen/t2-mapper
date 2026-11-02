import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplayState } from "../../relay/replayTypes";
import type { WatchCatchupPayload } from "../../relay/types";
import type { RelayEventHandler } from "../stream/relayClient";
import type { ReplayUploadOptions } from "../stream/replayUpload";
import { REPLAY_UPLOAD_TIMEOUT_MS } from "../../relay/replayTypes";

const uploads = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("../stream/replayUpload", () => ({ uploadReplay: uploads.upload }));

vi.mock("../stream/demoFileLoader", () => ({ unloadDemo: vi.fn() }));
vi.mock("./liveConnectionStore", () => ({
  liveConnectionStore: {
    getState: () => ({ leaveServer() {}, disconnectRelay() {} }),
  },
}));
vi.mock("../stream/relayClient", () => ({
  RelayClient: class {
    connected = true;
    readonly url: string;
    readonly handlers: RelayEventHandler;
    constructor(url: string, handlers: RelayEventHandler) {
      this.url = url;
      this.handlers = handlers;
    }
    connect() {}
    close() {
      this.connected = false;
    }
    createReplay = vi.fn();
    joinReplay = vi.fn();
    controlReplay = vi.fn();
    leaveReplay = vi.fn();
    syncReplay = vi.fn();
    watchReplayUpload = vi.fn();
  },
}));
vi.mock("../stream/replayStreaming", () => ({
  ReplayStreamAdapter: class {
    missionName = "Katabatic";
    missionSequence: string | null = null;
    onParseFault?: () => void;
    sourceTick = 0;
    relay: unknown;
    constructor(relay: unknown) {
      this.relay = relay;
    }
    hold = vi.fn();
    applyState = vi.fn();
    feedPacket = vi.fn();
    feedReplayTick = vi.fn();
    feedReplayInfo = vi.fn();
    hydrate = vi.fn((payload: WatchCatchupPayload) => {
      this.missionName = payload.missionName!;
      this.missionSequence = payload.missionSequence ?? null;
      this.sourceTick = payload.replay!.tick;
    });
  },
}));

import { replayConnectionStore } from "./replayConnectionStore";
import { engineStore } from "./engineStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { gameEntityStore } from "./gameEntityStore";
import { casterStore, type SavedCamera } from "./casterStore";

const state = () => replayConnectionStore.getState();
const creatorId = "cd".repeat(24);
const handlers = () =>
  (state()._relay as unknown as { handlers: RelayEventHandler }).handlers;
function replay(overrides: Partial<ReplayState> = {}): ReplayState {
  return {
    sessionId: "room",
    demo: "demo.rec",
    tick: 10,
    durationTicks: 1000,
    status: "paused",
    epoch: 1,
    revision: 1,
    watcherCount: 1,
    isOwner: false,
    ...overrides,
  };
}
function catchup(epoch = 1, tick = 10): WatchCatchupPayload {
  return {
    epoch,
    missionName: "Katabatic",
    replay: { sessionId: "room", epoch, tick, status: "paused" },
  } as WatchCatchupPayload;
}

function uploadChannel() {
  const relay = state()._relay!;
  const callbacks = handlers();
  callbacks.onOpen!();
  const [uploadId, totalBytes, creatorId] = (
    relay.watchReplayUpload as ReturnType<typeof vi.fn>
  ).mock.calls.at(-1)! as [string, number, string];
  return {
    relay,
    callbacks,
    uploadId,
    creatorId,
    progress(receivedBytes: number, id = uploadId, total = totalBytes) {
      callbacks.onReplayUploadProgress!({
        type: "replayUploadProgress",
        uploadId: id,
        totalBytes: total,
        receivedBytes,
      });
    },
  };
}

describe("replay session connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", {
      cookie: `mapgenius.replay.client=${creatorId}`,
      addEventListener() {},
      removeEventListener() {},
    });
    vi.stubGlobal("location", { protocol: "http:" });
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    state().leave();
    uploads.upload.mockReset();
    casterStore.getState().suspend();
    replayConnectionStore.setState(
      replayConnectionStore.getInitialState(),
      true,
    );
    engineStore.getState().setRecording(null);
    streamPlaybackStore.setState(streamPlaybackStore.getInitialState(), true);
  });
  afterEach(() => {
    state().leave();
    casterStore.getState().suspend();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends creator commands only after the server grants ownership", () => {
    state().create("demo.rec", 10);
    const relay = state()._relay!;
    handlers().onOpen!();
    expect(relay.createReplay).toHaveBeenCalledWith("demo.rec", creatorId, 10);
    handlers().onReplayState!(replay());
    state().control("play");
    expect(relay.controlReplay).not.toHaveBeenCalled();
    handlers().onReplayState!(
      replay({ revision: 2, isOwner: true, ownerToken: "private" }),
    );
    expect(state().state).not.toHaveProperty("ownerToken");
    state().control("seek", 40);
    expect(relay.controlReplay).toHaveBeenCalledExactlyOnceWith(
      "room",
      2,
      "seek",
      40,
    );
    state().control("seek", -1);
    state().control("seek", NaN);
    expect(relay.controlReplay).toHaveBeenCalledTimes(1);
  });

  it("uploads local bytes once and joins with a privately retained owner token", async () => {
    const buffer = new ArrayBuffer(32);
    uploads.upload.mockResolvedValue({
      sessionId: "uploaded-room",
      ownerToken: "upload-owner",
    });
    state().createLocal(buffer, "Local demo.rec", 123);
    expect(state()).toMatchObject({
      uploading: true,
      connecting: true,
      sessionId: null,
    });
    const channel = uploadChannel();
    expect(uploads.upload).not.toHaveBeenCalled();
    channel.progress(0, "old-upload");
    channel.progress(0, channel.uploadId, 999);
    channel.progress(1);
    expect(uploads.upload).not.toHaveBeenCalled();
    channel.progress(0);
    channel.progress(0);
    expect(uploads.upload).toHaveBeenCalledOnce();
    expect(uploads.upload).toHaveBeenCalledWith(
      state().relayUrl,
      buffer,
      "Local demo.rec",
      expect.objectContaining({
        tick: 123,
        signal: expect.any(AbortSignal),
        uploadId: channel.uploadId,
        creatorId: channel.creatorId,
      }),
    );
    await vi.waitFor(() => expect(state().uploading).toBe(false));
    expect(state().sessionId).toBe("uploaded-room");
    expect(state().state).toBeNull();
    expect(state()).not.toHaveProperty("ownerToken");
    expect(state()._relay).toBe(channel.relay);
    expect(state()._relay!.joinReplay).toHaveBeenCalledWith(
      "uploaded-room",
      "upload-owner",
    );
  });

  it("captures one browser identity for both upload channels and reads it fresh for each creation", () => {
    state().create("first.rec");
    handlers().onOpen!();
    expect(state()._relay!.createReplay).toHaveBeenCalledWith(
      "first.rec",
      creatorId,
      undefined,
    );
    document.cookie = `mapgenius.replay.client=${"ab".repeat(24)}`;
    uploads.upload.mockReturnValue(new Promise(() => {}));
    state().createLocal(new ArrayBuffer(32), "Local.rec");
    const channel = uploadChannel();
    expect(channel.creatorId).toBe("ab".repeat(24));
    document.cookie = `mapgenius.replay.client=${"ef".repeat(24)}`;
    channel.progress(0);
    expect(uploads.upload).toHaveBeenCalledWith(
      state().relayUrl,
      expect.any(ArrayBuffer),
      "Local.rec",
      expect.objectContaining({ creatorId: "ab".repeat(24) }),
    );
    expect(state()).not.toHaveProperty("creatorId");
  });

  it.each(["hosted", "local"])(
    "fails %s creation cleanly when cookies are blocked",
    (mode) => {
      vi.stubGlobal("document", {
        get cookie() {
          return "";
        },
        set cookie(_value: string) {},
        addEventListener() {},
        removeEventListener() {},
      });
      if (mode === "hosted") state().create("demo.rec");
      else state().createLocal(new ArrayBuffer(32), "Local.rec");
      expect(state()).toMatchObject({
        _relay: null,
        connecting: false,
        uploading: false,
        state: null,
      });
      expect(state().error).toContain("Cookies must be enabled");
      expect(uploads.upload).not.toHaveBeenCalled();
    },
  );

  it("aborts local uploads on leave and ignores a late successful response", async () => {
    let finish!: (value: { sessionId: string; ownerToken: string }) => void;
    uploads.upload.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    state().createLocal(new ArrayBuffer(4), "Local.rec");
    const channel = uploadChannel();
    channel.progress(0);
    const options = uploads.upload.mock.calls[0][3] as ReplayUploadOptions;
    const signal = options.signal!;
    state().leave();
    expect(signal.aborted).toBe(true);
    channel.progress(3);
    finish({ sessionId: "stale-upload", ownerToken: "stale-owner" });
    await Promise.resolve();
    expect(state()).toMatchObject({
      uploading: false,
      connecting: false,
      sessionId: null,
      _relay: null,
      uploadProgress: null,
    });
    expect(
      sessionStorage.getItem(
        `mapgenius.replay.owner:${state().relayUrl}:stale-upload`,
      ),
    ).toBeNull();
  });

  it("does not let a superseded upload or its error replace a newer replay", async () => {
    let fail!: (error: Error) => void;
    uploads.upload.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    state().createLocal(new ArrayBuffer(4), "First.rec");
    const channel = uploadChannel();
    channel.progress(0);
    const options = uploads.upload.mock.calls[0][3] as ReplayUploadOptions;
    const signal = options.signal!;
    state().create("hosted.rec", 40);
    const relay = state()._relay;
    expect(signal.aborted).toBe(true);
    channel.progress(4);
    fail(new Error("Old upload failed"));
    await Promise.resolve();
    await Promise.resolve();
    expect(state()).toMatchObject({
      uploading: false,
      error: null,
      _relay: relay,
      uploadProgress: null,
    });
    handlers().onOpen!();
    expect(relay!.createReplay).toHaveBeenCalledWith(
      "hosted.rec",
      creatorId,
      40,
    );
  });

  it("keeps upload failures visible and closes its progress connection", async () => {
    uploads.upload.mockRejectedValue(
      new Error("Demo exceeds replay memory limit"),
    );
    state().createLocal(new ArrayBuffer(4), "Large.rec");
    const channel = uploadChannel();
    channel.progress(0);
    await vi.waitFor(() => expect(state().uploading).toBe(false));
    expect(state()).toMatchObject({
      connecting: false,
      _relay: null,
      error: "Demo exceeds replay memory limit",
      uploadProgress: null,
    });
    expect(channel.relay.connected).toBe(false);
  });

  it("shows monotonic server-received percentages and clears late progress", async () => {
    let finish!: (value: { sessionId: string; ownerToken: string }) => void;
    uploads.upload.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    state().createLocal(new ArrayBuffer(1_000), "Progress.rec");
    const channel = uploadChannel();
    channel.progress(0);
    expect(state()).toMatchObject({ uploading: true, uploadProgress: 0 });
    channel.progress(257);
    expect(state().uploadProgress).toBe(0.25);
    channel.progress(100);
    channel.progress(NaN);
    expect(state().uploadProgress).toBe(0.25);
    channel.progress(1_000);
    expect(state()).toMatchObject({
      uploading: true,
      uploadProgress: 1,
      sessionId: null,
    });
    finish({ sessionId: "progress-room", ownerToken: "private-progress" });
    await vi.waitFor(() => expect(state().uploading).toBe(false));
    expect(state().uploadProgress).toBeNull();
    channel.progress(500);
    expect(state().uploadProgress).toBeNull();
  });

  it("cancels before acknowledgement and never starts a stale upload", () => {
    state().createLocal(new ArrayBuffer(32), "Before ack.rec");
    const channel = uploadChannel();
    state().leave();
    channel.progress(0);
    expect(uploads.upload).not.toHaveBeenCalled();
    expect(state()).toMatchObject({
      _relay: null,
      uploading: false,
      uploadProgress: null,
    });
  });

  it("creates private upload IDs on local HTTP without randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab),
    });
    state().createLocal(new ArrayBuffer(32), "LAN.rec");
    const channel = uploadChannel();
    expect(channel.uploadId).toBe("ab".repeat(24));
    expect(uploads.upload).not.toHaveBeenCalled();
  });

  it("surfaces upload ID creation failures without keeping a pending transfer", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: () => {
        throw new Error("Random source unavailable");
      },
    });
    state().createLocal(new ArrayBuffer(32), "Random failure.rec");
    expect(state()).toMatchObject({
      _relay: null,
      uploading: false,
      connecting: false,
      uploadProgress: null,
      error: "Random source unavailable",
    });
    expect(uploads.upload).not.toHaveBeenCalled();
  });

  it("cancels HTTP transfer when its progress socket disconnects without retrying", () => {
    uploads.upload.mockReturnValue(new Promise(() => {}));
    state().createLocal(new ArrayBuffer(32), "Disconnected.rec");
    const channel = uploadChannel();
    channel.progress(0);
    const options = uploads.upload.mock.calls[0][3] as ReplayUploadOptions;
    channel.callbacks.onClose!();
    expect(options.signal!.aborted).toBe(true);
    expect(state()).toMatchObject({
      uploading: false,
      uploadProgress: null,
      connecting: false,
      _relay: null,
    });
    expect(state().error).toContain("Connection closed while uploading");
    vi.advanceTimersByTime(REPLAY_UPLOAD_TIMEOUT_MS);
    channel.progress(0);
    expect(uploads.upload).toHaveBeenCalledOnce();
    expect(state()._relay).toBeNull();
  });

  it("releases a pre-ack upload after socket errors or the overall deadline", () => {
    state().createLocal(new ArrayBuffer(32), "Socket error.rec");
    const failed = uploadChannel();
    failed.callbacks.onError!("Socket failed");
    failed.progress(0);
    expect(state()).toMatchObject({
      uploading: false,
      uploadProgress: null,
      error: "Socket failed",
    });
    state().createLocal(new ArrayBuffer(32), "No acknowledgement.rec");
    const timed = uploadChannel();
    vi.advanceTimersByTime(REPLAY_UPLOAD_TIMEOUT_MS);
    timed.progress(0);
    expect(uploads.upload).not.toHaveBeenCalled();
    expect(state()).toMatchObject({
      uploading: false,
      uploadProgress: null,
      _relay: null,
    });
    expect(state().error).toContain("timed out");
  });

  it("restores the owner's private token on reconnect and keeps the camera adapter", () => {
    state().join("room");
    handlers().onOpen!();
    handlers().onReplayState!(replay({ isOwner: true, ownerToken: "private" }));
    const adapter = state().adapter;
    const oldHandlers = handlers();
    oldHandlers.onClose!();
    expect(state().connecting).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(state().adapter).toBe(adapter);
    handlers().onOpen!();
    expect(state()._relay!.joinReplay).toHaveBeenCalledWith("room", "private");
    oldHandlers.onReplayState!(replay({ revision: 999, status: "ended" }));
    expect(state().state?.status).toBe("paused");
    state().leave();
    vi.advanceTimersByTime(60_000);
    expect(state()._relay).toBeNull();
  });

  it("retains ownership in memory when storage writes fail but reads still work", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Storage is full", "QuotaExceededError");
      },
    });
    state().join("quota-room");
    handlers().onReplayState!(
      replay({
        sessionId: "quota-room",
        isOwner: true,
        ownerToken: "private-quota-token",
      }),
    );
    expect(state().state).not.toHaveProperty("ownerToken");
    handlers().onClose!();
    vi.advanceTimersByTime(1000);
    handlers().onOpen!();
    expect(state()._relay!.joinReplay).toHaveBeenCalledExactlyOnceWith(
      "quota-room",
      "private-quota-token",
    );
  });

  it("ignores stale snapshot completions and preserves local follow across a seek", () => {
    state().join("room");
    handlers().onReplayState!(replay());
    const adapter = state().adapter!;
    engineStore.getState().setRecording({
      source: "live",
      duration: Infinity,
      missionName: "Katabatic",
      gameType: null,
      serverDisplayName: null,
      recorderName: null,
      recordingDate: null,
      streamingPlayback: adapter,
    });
    const traversal = engineStore.getState().playback.seekNonce;
    handlers().onCatchup!(catchup());
    expect(engineStore.getState().playback.seekNonce).toBe(traversal + 1);
    const player = {
      kind: "player" as const,
      scope: "recording",
      clientId: 7,
      rawName: "Alice",
    };
    streamPlaybackStore.setState({
      cameraMode: "orbitOverride",
      followEntityId: "old-body",
      followPlayer: player,
    });
    handlers().onReplayState!(
      replay({ epoch: 2, revision: 2, tick: 50, status: "seeking" }),
    );
    expect(state().ready).toBe(false);
    handlers().onCatchup!(catchup(1));
    expect(adapter.hydrate).toHaveBeenCalledTimes(1);
    expect(engineStore.getState().playback.seekNonce).toBe(traversal + 1);
    handlers().onCatchup!(catchup(2, 50));
    expect(engineStore.getState().playback).toMatchObject({
      seekNonce: traversal + 2,
      seekTime: 1.6,
      status: "paused",
    });
    expect(state().ready).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "orbitOverride",
      followPlayer: player,
      followEntityId: null,
    });
  });

  it("keeps the ended world attached so the owner can seek backwards", () => {
    state().join("room");
    handlers().onReplayState!(replay({ isOwner: true }));
    handlers().onCatchup!(catchup());
    const adapter = state().adapter;
    handlers().onReplayState!(
      replay({ status: "ended", revision: 2, isOwner: true }),
    );
    expect(state().adapter).toBe(adapter);
    state().control("seek", 0);
    expect(state()._relay!.controlReplay).toHaveBeenCalledWith(
      "room",
      2,
      "seek",
      0,
    );
  });

  it("clears follow on a same-map restart but preserves it within one mission", () => {
    state().join("room");
    handlers().onReplayState!(replay());
    const initial = { ...catchup(), missionSequence: "7" };
    handlers().onCatchup!(initial);
    const player = {
      kind: "player" as const,
      scope: "recording",
      clientId: 7,
      rawName: "Alice",
    };
    const follow = () =>
      streamPlaybackStore.setState({
        cameraMode: "orbitOverride",
        followEntityId: "old-body",
        followTargetId: 7,
        followPlayer: player,
        followFlagSlot: 1,
        lastFollowTargetId: 7,
        lastFollowGhostIndex: 13,
      });
    follow();
    handlers().onReplayState!(replay({ epoch: 2, revision: 2 }));
    handlers().onCatchup!({
      ...initial,
      epoch: 2,
      replay: { ...initial.replay!, epoch: 2 },
    });
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "orbitOverride",
      followPlayer: player,
      followTargetId: 7,
      followFlagSlot: 1,
      lastFollowTargetId: 7,
      lastFollowGhostIndex: 13,
    });

    handlers().onReplayState!(replay({ epoch: 3, revision: 3 }));
    handlers().onCatchup!({ ...catchup(3), missionSequence: "8" });
    expect(state().missionIdentity).toBe(JSON.stringify(["8", "katabatic"]));
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followPlayer: null,
      followTargetId: null,
      followFlagSlot: null,
      lastFollowTargetId: null,
      lastFollowGhostIndex: null,
    });

    // A mission boundary arriving through ordinary packets also resets now,
    // without waiting for another catch-up or the once-per-second tick update.
    follow();
    state().adapter!.onMissionIdentity!("9", "Katabatic");
    expect(state().missionIdentity).toBe(JSON.stringify(["9", "katabatic"]));
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followEntityId: null,
      followPlayer: null,
      followTargetId: null,
      followFlagSlot: null,
      lastFollowTargetId: null,
      lastFollowGhostIndex: null,
    });
  });

  it("reconnects at natural EOF so the creator can seek backwards again", () => {
    state().join("room");
    handlers().onReplayState!(
      replay({
        isOwner: true,
        ownerToken: "owner-at-eof",
        status: "ended",
        closed: false,
      }),
    );
    handlers().onCatchup!(catchup());
    const adapter = state().adapter;
    handlers().onClose!();
    expect(state()).toMatchObject({ ready: false, connecting: true });
    vi.advanceTimersByTime(1000);
    handlers().onOpen!();
    expect(state()._relay!.joinReplay).toHaveBeenCalledWith(
      "room",
      "owner-at-eof",
    );
    handlers().onReplayState!(
      replay({ isOwner: true, status: "ended", closed: false }),
    );
    handlers().onCatchup!(catchup());
    expect(state()).toMatchObject({ ready: true, connecting: false, adapter });
    state().control("seek", 0);
    expect(state()._relay!.controlReplay).toHaveBeenCalledWith(
      "room",
      1,
      "seek",
      0,
    );
  });

  it("does not reconnect after the creator explicitly closes the session", () => {
    state().join("room");
    handlers().onReplayState!(replay({ status: "ended", closed: true }));
    handlers().onClose!();
    expect(state()).toMatchObject({
      ready: false,
      connecting: false,
      _relay: null,
    });
    vi.advanceTimersByTime(60_000);
    expect(state()._relay).toBeNull();
  });

  it("closes a failed join without leaving an idle connection or retrying", () => {
    state().join("missing-room");
    const relay = state()._relay!;
    const callbacks = handlers();
    callbacks.onReplayError!("Replay session was not found");
    expect(state()).toMatchObject({
      state: null,
      ready: false,
      connecting: false,
      _relay: null,
      error: "Replay session was not found",
    });
    expect(relay.connected).toBe(false);
    callbacks.onClose!();
    vi.advanceTimersByTime(60_000);
    expect(state()._relay).toBeNull();
  });

  it("ends an unsuccessful resync instead of leaving the scene loading forever", () => {
    state().join("room");
    handlers().onReplayState!(replay({ status: "playing" }));
    handlers().onCatchup!(catchup());
    const adapter = state().adapter!;
    const callbacks = handlers();
    state().sync();
    expect(state().ready).toBe(false);
    callbacks.onReplayError!("Replay session was not found");
    expect(state()).toMatchObject({
      ready: false,
      connecting: false,
      _relay: null,
      state: { status: "ended", closed: true },
      error: "Replay session was not found",
    });
    expect(adapter.hold).toHaveBeenCalled();
    callbacks.onClose!();
    vi.advanceTimersByTime(60_000);
    expect(state()._relay).toBeNull();
  });

  it("keeps a hydrated room usable after an ordinary command rejection", () => {
    state().join("room");
    handlers().onReplayState!(replay({ status: "playing", isOwner: true }));
    handlers().onCatchup!(catchup());
    const relay = state()._relay;
    handlers().onReplayError!("Playback changed; retry the command");
    expect(state()).toMatchObject({
      ready: true,
      connecting: false,
      _relay: relay,
      state: { status: "playing" },
      error: "Playback changed; retry the command",
    });
    state().control("pause");
    expect(relay!.controlReplay).toHaveBeenCalledWith(
      "room",
      1,
      "pause",
      undefined,
    );
  });

  it("activates scoped caster settings and keeps cameras across seek/reconnect", () => {
    state().join("room");
    handlers().onReplayState!(replay());
    const initial = catchup();
    initial.missionSequence = "7";
    handlers().onCatchup!(initial);
    expect(casterStore.getState().context).toEqual({
      server: "replay:room",
      mission: JSON.stringify(["7", "katabatic"]),
    });
    const camera: SavedCamera = {
      kind: "fly",
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
      fov: 90,
      followBehindPlayer: false,
    };
    expect(casterStore.getState().saveCamera(3, camera)).toBe(true);
    casterStore.getState().renameTeam(1, "Replay team");
    const settings = casterStore.getState().settings;

    handlers().onReplayState!(replay({ epoch: 2, revision: 2, tick: 50 }));
    const seek = catchup(2, 50);
    seek.missionSequence = "7";
    handlers().onCatchup!(seek);
    expect(casterStore.getState().settings).toBe(settings);

    handlers().onClose!();
    vi.advanceTimersByTime(1000);
    handlers().onOpen!();
    handlers().onReplayState!(replay({ epoch: 2, revision: 2, tick: 50 }));
    handlers().onCatchup!(seek);
    expect(casterStore.getState().settings).toBe(settings);
    expect(casterStore.getState().settings?.quickCams[3]).toEqual(camera);
    state().leave();
    expect(casterStore.getState().context).toBeNull();
  });

  it("uses map identity for retail demos and resets on another mission or replay", () => {
    state().join("room");
    handlers().onReplayState!(replay());
    handlers().onCatchup!(catchup());
    expect(casterStore.getState().context).toEqual({
      server: "replay:room",
      mission: JSON.stringify(["Katabatic", "katabatic"]),
    });
    casterStore.getState().renameTeam(1, "First mission");
    // Identity notifications still work after the renderer replaces metadata callbacks.
    state().adapter!.onMissionInfoChange = () => {};
    state().adapter!.onMissionIdentity!("8", "Katabatic");
    expect(casterStore.getState().settings?.teamNames).toEqual({});
    casterStore.getState().renameTeam(1, "Repeated map");
    const next = { ...catchup(), missionName: "Surreal" };
    handlers().onCatchup!(next);
    expect(casterStore.getState().settings?.teamNames).toEqual({});

    state().join("other-room");
    handlers().onReplayState!(replay({ sessionId: "other-room" }));
    const other = catchup();
    other.replay!.sessionId = "other-room";
    handlers().onCatchup!(other);
    expect(casterStore.getState().context?.server).toBe("replay:other-room");
    expect(casterStore.getState().settings?.teamNames).toEqual({});
  });

  it("does not suspend another source's caster settings when replay is inactive", () => {
    casterStore.getState().activate("live.example:28000", "2", "Katabatic");
    const context = casterStore.getState().context;
    state().leave();
    expect(casterStore.getState().context).toBe(context);
  });

  it("keeps a recovered server seek error visible after its rollback snapshot", () => {
    state().join("room");
    handlers().onReplayState!(
      replay({
        error: "Couldn't decode the requested tick; restored playback",
      }),
    );
    handlers().onCatchup!(catchup());
    expect(state()).toMatchObject({
      ready: true,
      connecting: false,
      error: "Couldn't decode the requested tick; restored playback",
    });
    handlers().onReplayState!(replay({ revision: 2, status: "playing" }));
    expect(state().error).toBeNull();
  });

  it("updates mission identity after the renderer takes over metadata notifications", () => {
    state().join("room");
    const adapter = state().adapter!;
    adapter.onMissionInfoChange = () => {};
    adapter.onMissionChange!("Surreal");
    expect(gameEntityStore.getState().missionName).toBe("Surreal");
  });

  it("resynchronizes after a hidden tab returns without retaining a listener after leave", () => {
    let visibility = "hidden";
    let listener: (() => void) | undefined;
    const remove = vi.fn();
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_name: string, callback: () => void) => {
        listener = callback;
      },
      removeEventListener: remove,
    });
    state().join("room");
    handlers().onReplayState!(replay({ status: "playing" }));
    const relay = state()._relay!;
    listener!();
    expect(relay.syncReplay).not.toHaveBeenCalled();
    visibility = "visible";
    listener!();
    expect(relay.syncReplay).toHaveBeenCalledExactlyOnceWith("room");
    expect(state().connecting).toBe(true);
    state().leave();
    expect(remove).toHaveBeenCalledWith("visibilitychange", listener);
  });
});

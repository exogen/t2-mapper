import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamRecording } from "./types";

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  parse: vi.fn(),
  leave: vi.fn(),
  commentary: vi.fn(),
  warn: vi.fn(),
  readCheckpoints: vi.fn(),
  scan: vi.fn(),
  setMissionInfo: vi.fn(),
  current: null as StreamRecording | null,
}));
vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: mocks.warn }),
}));
vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({
      setRecording: mocks.install,
      playback: { recording: mocks.current },
    }),
  },
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: {
    getState: () => ({ leaveServer: mocks.leave, disconnectRelay: vi.fn() }),
  },
}));
vi.mock("../state/gameEntityStore", () => ({
  gameEntityStore: {
    getState: () => ({
      endStreaming: vi.fn(),
      setMissionInfo: mocks.setMissionInfo,
    }),
  },
}));
vi.mock("../state/commandCircuitStore", () => ({
  commandCircuitStore: { getState: () => ({ deactivate: vi.fn() }) },
}));
vi.mock("../state/demoDirectorStore", () => ({
  resetDirector: vi.fn(),
  setDirectorDemoBuffer: vi.fn(),
}));
vi.mock("../state/commentaryTracksStore", () => ({
  commentaryTracksStore: { getState: () => ({ load: mocks.commentary }) },
}));
vi.mock("./demoStreaming", () => ({
  createDemoStreamingRecording: mocks.parse,
}));
vi.mock("./demoCheckpoints", () => ({
  DEMO_CHECKPOINT_SUFFIX: ".checkpoints.json",
  readDemoCheckpoints: mocks.readCheckpoints,
}));
vi.mock("./demoTimelineScanner", () => ({
  scanDemoTimeline: mocks.scan,
}));

import {
  loadDemoFile,
  loadDemoUrl,
  loadDemoReference,
  unloadDemo,
} from "./demoFileLoader";
import { demoLoadStore } from "../state/demoLoadStore";
import { demoTimelineStore } from "../state/demoTimelineStore";
import { casterStore } from "../state/casterStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
const buffer = new ArrayBuffer(4);
const response = () =>
  ({ ok: true, body: null, arrayBuffer: async () => buffer }) as Response;
const recording = (name: string) =>
  ({ source: "demo", recorderName: name }) as StreamRecording;

describe("demo loads during navigation", () => {
  beforeEach(() => {
    unloadDemo();
    vi.clearAllMocks();
    mocks.readCheckpoints.mockResolvedValue([]);
    mocks.scan.mockResolvedValue({
      events: [],
    });
    vi.stubEnv("RELAY_URL", "wss://relay.example");
    mocks.install.mockImplementation((recording) => {
      mocks.current = recording;
    });
  });
  afterEach(() => {
    unloadDemo();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("clears custom team names when ejecting a demo", () => {
    casterStore.getState().activate("demo:test", "demo", "");
    casterStore.getState().renameTeam(1, "Demo team");
    unloadDemo();
    expect(casterStore.getState().context).toBeNull();
    expect(casterStore.getState().settings).toBeNull();
  });

  it.each([
    ["progressive playback", null, "First Player", "First Player"],
    ["known recording metadata", "Header Player", null, "Header Player"],
  ])(
    "uses the recorder known from %s when scanning the timeline",
    async (_source, recordedName, playbackName, expectedName) => {
      const demo = {
        ...recording("demo"),
        recorderName: recordedName,
        streamingPlayback: { connectedPlayerName: playbackName },
      } as unknown as StreamRecording;
      mocks.parse.mockResolvedValueOnce(demo);
      await loadDemoFile({ arrayBuffer: async () => buffer } as File);
      await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());

      expect(mocks.scan).toHaveBeenCalledWith(
        buffer,
        expectedName,
        expect.any(Function),
        expect.any(AbortSignal),
        expect.any(Function),
      );
      expect(demo.recorderName).toBe(expectedName);
    },
  );

  it("publishes a server discovered later by the current timeline scan", async () => {
    const setServerNameFallback = vi.fn();
    const demo = {
      ...recording("Flyers"),
      missionName: "Surreal",
      recordingDate: null,
      serverDisplayName: null,
      streamingPlayback: { serverDisplayName: null, setServerNameFallback },
    } as unknown as StreamRecording;
    mocks.parse.mockResolvedValueOnce(demo);
    await loadDemoFile({ arrayBuffer: async () => buffer } as File);
    await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());

    mocks.scan.mock.calls[0][4]("Rapture Competition East");

    expect(demo).toMatchObject({
      serverDisplayName: "Rapture Competition East",
      missionName: "Surreal",
      recorderName: "Flyers",
      recordingDate: null,
    });
    expect(setServerNameFallback).toHaveBeenCalledWith(
      "Rapture Competition East",
    );
    expect(mocks.setMissionInfo).toHaveBeenCalledWith({
      serverDisplayName: "Rapture Competition East",
    });
  });

  it.each([
    ["header", "Header Server", null, "Header Server", "Header Server"],
    [
      "current playback",
      "Header Server",
      "Current Server",
      "Current Server",
      "Header Server",
    ],
    [
      "current playback without header metadata",
      null,
      "First Server",
      "First Server",
      "First Server",
    ],
  ])(
    "preserves the known %s server when a later scan finds another",
    async (_source, headerName, currentName, displayedName, recordedName) => {
      const playback = {
        serverDisplayName: currentName,
        setServerNameFallback: vi.fn((name: string) => {
          playback.serverDisplayName ??= name;
        }),
      };
      const demo = {
        ...recording("Flyers"),
        serverDisplayName: headerName,
        streamingPlayback: playback,
      } as unknown as StreamRecording;
      mocks.parse.mockResolvedValueOnce(demo);
      await loadDemoFile({ arrayBuffer: async () => buffer } as File);
      await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());

      mocks.scan.mock.calls[0][4]("Later Server");

      expect(demo.serverDisplayName).toBe(recordedName);
      expect(playback.setServerNameFallback).toHaveBeenCalledWith(recordedName);
      expect(mocks.setMissionInfo).toHaveBeenCalledWith({
        serverDisplayName: displayedName,
      });
    },
  );

  it.each(["eject", "next demo"])(
    "ignores server discoveries from an old scan after %s",
    async (action) => {
      const setServerNameFallback = vi.fn();
      const demo = {
        ...recording("first"),
        serverDisplayName: null,
        streamingPlayback: { setServerNameFallback },
      } as unknown as StreamRecording;
      mocks.parse.mockResolvedValueOnce(demo);
      await loadDemoFile({ arrayBuffer: async () => buffer } as File);
      await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());
      const scan = mocks.scan.mock.calls[0];

      if (action === "eject") unloadDemo();
      else {
        mocks.parse.mockResolvedValueOnce(recording("next"));
        await loadDemoFile({ arrayBuffer: async () => buffer } as File);
      }
      expect(scan[3].aborted).toBe(true);
      scan[4]("Old Server");

      expect(demo.serverDisplayName).toBeNull();
      expect(setServerNameFallback).not.toHaveBeenCalled();
      expect(mocks.setMissionInfo).not.toHaveBeenCalled();
    },
  );

  it("ignores published details after another playback replaces the installed recording", async () => {
    const sidecar = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).endsWith(".rec.json")) return sidecar.promise;
        if (String(url).endsWith(".checkpoints.json"))
          return new Response(null, { status: 404 });
        return response();
      }),
    );
    mocks.parse.mockResolvedValue(recording("published"));
    await loadDemoUrl("https://demos.example/game.rec");
    mocks.current = { source: "live" } as StreamRecording;
    sidecar.resolve(
      new Response(
        JSON.stringify({
          games: [{ mission: "Katabatic", startMs: 0, title: "Old game" }],
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(demoLoadStore.getState().publishedGames).toBeNull();
  });

  it("keeps a discovered server when the timeline scan later fails", async () => {
    const scanned = deferred<never>();
    mocks.scan.mockReturnValueOnce(scanned.promise);
    const demo = {
      ...recording("Flyers"),
      serverDisplayName: null,
      streamingPlayback: { setServerNameFallback: vi.fn() },
    } as unknown as StreamRecording;
    mocks.parse.mockResolvedValueOnce(demo);
    await loadDemoFile({ arrayBuffer: async () => buffer } as File);
    await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());

    mocks.scan.mock.calls[0][4]("Rapture Competition East");
    scanned.reject(new Error("Later packet failed"));
    await vi.waitFor(() =>
      expect(demoTimelineStore.getState().error).toBe("Later packet failed"),
    );

    expect(demo.serverDisplayName).toBe("Rapture Competition East");
    expect(mocks.setMissionInfo).toHaveBeenCalledWith({
      serverDisplayName: "Rapture Competition East",
    });
  });

  it("imports a paired local sidecar before installing the recording", async () => {
    const importCheckpoints = vi.fn();
    const demo = {
      ...recording("local"),
      streamingPlayback: { importCheckpoints },
    } as unknown as StreamRecording;
    mocks.parse.mockResolvedValueOnce(demo);
    await loadDemoFile(
      { arrayBuffer: async () => buffer } as File,
      { text: async () => "checkpoint sidecar" } as File,
    );
    expect(mocks.readCheckpoints).toHaveBeenCalledWith(
      "checkpoint sidecar",
      buffer,
    );
    expect(importCheckpoints).toHaveBeenCalledWith([]);
    expect(importCheckpoints.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.install.mock.invocationCallOrder[0],
    );
    expect(mocks.install).toHaveBeenCalledWith(demo, buffer);
  });

  it("loads a URL demo while its optional seek sidecar is still downloading", async () => {
    const sidecar = deferred<Response>();
    const importCheckpoints = vi.fn();
    const demo = {
      ...recording("remote"),
      streamingPlayback: { importCheckpoints },
    } as unknown as StreamRecording;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path.endsWith(".checkpoints.json")) return sidecar.promise;
        if (path.endsWith(".rec.json"))
          return new Response(null, { status: 404 });
        return response();
      }),
    );
    mocks.parse.mockResolvedValueOnce(demo);
    await loadDemoUrl("https://demos.example/demo.rec?token=example");
    expect(mocks.install).toHaveBeenCalledWith(demo, buffer);
    expect(fetch).toHaveBeenCalledWith(
      "https://demos.example/demo.rec.checkpoints.json?token=example",
      { signal: expect.any(AbortSignal) },
    );
    expect(importCheckpoints).not.toHaveBeenCalled();
    sidecar.resolve(new Response("checkpoint sidecar"));
    await vi.waitFor(() => expect(importCheckpoints).toHaveBeenCalledWith([]));
  });

  it("loads published game details without delaying playback and revalidates the sidecar", async () => {
    const sidecar = deferred<Response>();
    const games = [
      {
        mission: "Katabatic",
        gameType: "CTF",
        startMs: 0,
        tournament: false,
        gameId: "saved-game",
        presentationRevision: 2,
        title: "Final",
        teamNames: { 1: "Knights", 2: "Dragons" },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path.endsWith(".checkpoints.json"))
          return new Response(null, { status: 404 });
        if (path.endsWith(".rec.json")) return sidecar.promise;
        return response();
      }),
    );
    mocks.parse.mockResolvedValue(recording("published"));
    await loadDemoUrl("https://demos.example/game.rec?token=example");
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(demoLoadStore.getState().publishedGames).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "https://demos.example/game.rec.json?token=example",
      { signal: expect.any(AbortSignal), cache: "no-cache" },
    );
    sidecar.resolve(new Response(JSON.stringify({ games })));
    await vi.waitFor(() =>
      expect(demoLoadStore.getState().publishedGames).toEqual(games),
    );
  });

  it("loads saved game metadata before the recording response arrives, without an editor request", async () => {
    const download = deferred<Response>();
    const games = [
      {
        mission: "TWL_Harvester",
        startMs: 0,
        gameType: "Capture the Flag",
        tournament: true,
        title: "25th Anniversary: Quarterfinals",
      },
    ];
    const sidecar = Response.json({ games });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path.endsWith(".rec.json")) return sidecar;
        if (path.endsWith(".checkpoints.json"))
          return new Response(null, { status: 404 });
        return download.promise;
      }),
    );
    mocks.parse.mockResolvedValue(recording("published"));
    const loading = loadDemoUrl(
      "https://demos.example/tournament-server-2_20261108T0456_twl-harvester_e9e60a.rec",
    );

    await vi.waitFor(() => expect(sidecar.bodyUsed).toBe(true));
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
    expect(demoLoadStore.getState().publishedGames).toBeNull();

    download.resolve(response());
    await loading;
    expect(demoLoadStore.getState().publishedGames).toEqual(games);
  });

  it("does not replace newer editor metadata with a delayed initial sidecar", async () => {
    const sidecar = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).endsWith(".rec.json")) return sidecar.promise;
        if (String(url).endsWith(".checkpoints.json"))
          return new Response(null, { status: 404 });
        return response();
      }),
    );
    mocks.parse.mockResolvedValue(recording("published"));
    await loadDemoUrl("https://demos.example/old.rec");
    const games = [
      {
        mission: "Katabatic",
        startMs: 0,
        gameType: "CTF",
        tournament: false,
        gameId: "game",
        presentationRevision: 2,
        title: "Just saved",
        teamNames: { 1: "Saved team" },
      },
    ];
    demoLoadStore.setState({ publishedGames: games });
    sidecar.resolve(
      Response.json({
        games: [{ ...games[0], presentationRevision: 1, title: "Old title" }],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(demoLoadStore.getState().publishedGames).toBe(games);
  });

  it.each(["eject", "local file"])(
    "clears pending metadata on %s before the recording response arrives",
    async (action) => {
      const download = deferred<Response>();
      const games = [{ mission: "Katabatic", startMs: 0, title: "Old game" }];
      const sidecar = Response.json({ games });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).endsWith(".rec.json") ? sidecar : download.promise,
        ),
      );
      const loading = loadDemoUrl("https://demos.example/old.rec");
      await vi.waitFor(() => expect(sidecar.bodyUsed).toBe(true));

      if (action === "eject") unloadDemo();
      else {
        mocks.parse.mockResolvedValue(recording("local"));
        await loadDemoFile({ arrayBuffer: async () => buffer } as File);
      }
      download.resolve(response());
      await loading;

      expect(demoLoadStore.getState().requestedUrl).toBeNull();
      expect(demoLoadStore.getState().publishedGames).toBeNull();
      expect(demoLoadStore.getState().sourceUrl).toBeNull();
    },
  );

  it("retains published details that arrive before parsing and clears them for local files", async () => {
    const parsed = deferred<StreamRecording>();
    const games = [
      {
        mission: "Katabatic",
        gameType: "CTF",
        startMs: 0,
        tournament: false,
        title: "Final",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).endsWith(".rec.json"))
          return new Response(JSON.stringify({ games }));
        if (String(url).endsWith(".checkpoints.json"))
          return new Response(null, { status: 404 });
        return response();
      }),
    );
    mocks.parse
      .mockReturnValueOnce(parsed.promise)
      .mockResolvedValue(recording("local"));
    const pending = loadDemoUrl("https://demos.example/game.rec");
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(demoLoadStore.getState().publishedGames).toBeNull();
    parsed.resolve(recording("published"));
    await pending;
    expect(demoLoadStore.getState().publishedGames).toEqual(games);
    await loadDemoFile({ arrayBuffer: async () => buffer } as File);
    expect(demoLoadStore.getState().publishedGames).toBeNull();
  });

  it.each(["eject", "next demo"])(
    "ignores published details arriving after %s",
    async (action) => {
      const sidecar = deferred<Response>();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
          if (String(url).endsWith(".rec.json")) return sidecar.promise;
          if (String(url).endsWith(".checkpoints.json"))
            return new Response(null, { status: 404 });
          return response();
        }),
      );
      mocks.parse.mockResolvedValue(recording("published"));
      await loadDemoUrl("https://demos.example/game.rec");
      if (action === "eject") unloadDemo();
      else await loadDemoFile({ arrayBuffer: async () => buffer } as File);
      sidecar.resolve(
        new Response(
          JSON.stringify({
            games: [{ mission: "Katabatic", startMs: 0, title: "Old game" }],
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(demoLoadStore.getState().publishedGames).toBeNull();
    },
  );

  it.each(["missing", "invalid JSON", "invalid format", "offline"])(
    "keeps playback usable with %s published metadata",
    async (failure) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
          if (String(url).endsWith(".checkpoints.json"))
            return new Response(null, { status: 404 });
          if (String(url).endsWith(".rec.json")) {
            if (failure === "offline") throw new Error("offline");
            if (failure === "missing")
              return new Response(null, { status: 404 });
            return new Response(
              failure === "invalid JSON"
                ? "{"
                : JSON.stringify({ games: [null, {}] }),
            );
          }
          return response();
        }),
      );
      mocks.parse.mockResolvedValue(recording("published"));
      await loadDemoUrl("https://demos.example/game.rec");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.install).toHaveBeenCalledOnce();
      expect(demoLoadStore.getState()).toMatchObject({
        phase: "idle",
        publishedGames: null,
      });
    },
  );

  it("recognizes an authoritative empty games list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).endsWith(".rec.json"))
          return Response.json({ games: [] });
        if (String(url).endsWith(".checkpoints.json"))
          return new Response(null, { status: 404 });
        return response();
      }),
    );
    mocks.parse.mockResolvedValue(recording("warmup"));
    await loadDemoUrl("https://demos.example/warmup.rec");
    await vi.waitFor(() =>
      expect(demoLoadStore.getState().publishedGames).toEqual([]),
    );
  });

  it("ignores seek checkpoints decoded after a recording is replaced", async () => {
    const decoded = deferred<[]>();
    const importCheckpoints = vi.fn();
    mocks.readCheckpoints.mockReturnValueOnce(decoded.promise);
    mocks.parse
      .mockResolvedValueOnce({
        ...recording("first"),
        streamingPlayback: { importCheckpoints },
      })
      .mockResolvedValueOnce(recording("next"));
    const pending = loadDemoFile(
      { arrayBuffer: async () => buffer } as File,
      { text: async () => "sidecar" } as File,
    );
    await vi.waitFor(() =>
      expect(mocks.readCheckpoints).toHaveBeenCalledOnce(),
    );
    await loadDemoFile({ arrayBuffer: async () => buffer } as File);
    decoded.resolve([]);
    await pending;
    expect(importCheckpoints).not.toHaveBeenCalled();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(mocks.current?.recorderName).toBe("next");
  });

  it("falls back to ordinary playback when a paired seek sidecar is unusable", async () => {
    const importCheckpoints = vi.fn();
    const demo = {
      ...recording("local"),
      streamingPlayback: { importCheckpoints },
    } as unknown as StreamRecording;
    mocks.parse.mockResolvedValueOnce(demo);
    mocks.readCheckpoints.mockRejectedValueOnce(
      new Error("Wrong recording hash"),
    );
    await loadDemoFile(
      { arrayBuffer: async () => buffer } as File,
      { text: async () => "sidecar" } as File,
    );
    expect(mocks.install).toHaveBeenCalledWith(demo, buffer);
    expect(importCheckpoints).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.stringContaining("Ignoring"),
      expect.any(Error),
    );
    expect(demoLoadStore.getState().phase).toBe("idle");
  });

  it("aborts a download on eject and ignores a late response", async () => {
    const download = deferred<Response>();
    const fetch = vi.fn(() => download.promise);
    vi.stubGlobal("fetch", fetch);
    const pending = loadDemoUrl("first.rec");
    const signal = (vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit)
      .signal!;
    unloadDemo();
    expect(signal.aborted).toBe(true);
    download.resolve(response());
    await pending;
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedUrl: null,
      sourceUrl: null,
      phase: "idle",
    });
  });

  it("does not install an older parse after the next demo is loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const first = deferred<StreamRecording>();
    const second = recording("second");
    mocks.parse
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(second);
    const pending = loadDemoUrl("first.rec");
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce());
    await loadDemoUrl("second.rec");
    first.resolve(recording("first"));
    await pending;
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith(second, buffer);
    expect(demoLoadStore.getState()).toMatchObject({
      requestedUrl: "second.rec",
      sourceUrl: "second.rec",
    });
  });

  it("does not replace a selected demo with an older local file read", async () => {
    const read = deferred<ArrayBuffer>();
    const pending = loadDemoFile({ arrayBuffer: () => read.promise } as File);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const next = recording("next");
    mocks.parse.mockResolvedValueOnce(next);
    await loadDemoUrl("next.rec");
    read.resolve(buffer);
    await pending;
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith(next, buffer);
    expect(demoLoadStore.getState().sourceUrl).toBe("next.rec");
  });

  it("can load the same URL again after ejecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    mocks.parse.mockResolvedValue(recording("same"));
    await loadDemoUrl("same.rec");
    unloadDemo();
    await loadDemoUrl("same.rec");
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(demoLoadStore.getState().sourceUrl).toBe("same.rec");
    expect(demoLoadStore.getState().sidecarSourceUrl).toBe("same.rec");
  });

  it("keeps the installed demo reference through a pending or failed replacement and clears it for a local file", async () => {
    const pending = deferred<Response>();
    const hosted = recording("hosted");
    const local = recording("local");
    mocks.parse.mockResolvedValueOnce(hosted).mockResolvedValueOnce(local);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response())
        .mockReturnValueOnce(pending.promise),
    );
    await loadDemoReference("TribesForever:22945");
    expect(demoLoadStore.getState().sourceReference).toBe(
      "tribesforever:22945",
    );
    const replacement = loadDemoReference("tribesforever:22946");
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: "tribesforever:22946",
      sourceReference: "tribesforever:22945",
    });
    expect(mocks.current).toBe(hosted);
    pending.reject(new Error("Unavailable replacement"));
    await replacement;
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "error",
      requestedDemo: "tribesforever:22946",
      sourceReference: "tribesforever:22945",
    });
    await loadDemoFile({
      name: "Local recording.rec",
      arrayBuffer: async () => buffer,
    } as File);
    expect(mocks.current).toBe(local);
    expect(demoLoadStore.getState().sourceReference).toBeNull();
    expect(demoLoadStore.getState().sourceFileName).toBe("Local recording.rec");
    unloadDemo();
    expect(demoLoadStore.getState().sourceReference).toBeNull();
    expect(demoLoadStore.getState().sourceFileName).toBeNull();
  });

  it("keeps the installed local filename during a failed replacement and clears it for hosted demos", async () => {
    mocks.parse.mockResolvedValue(recording("local"));
    await loadDemoFile({
      name: "Installed.rec",
      arrayBuffer: async () => buffer,
    } as File);
    const read = deferred<ArrayBuffer>();
    const replacement = loadDemoFile({
      name: "Pending.rec",
      arrayBuffer: () => read.promise,
    } as File);
    expect(demoLoadStore.getState().sourceFileName).toBe("Installed.rec");
    read.reject(new Error("Couldn't read replacement"));
    await replacement;
    expect(demoLoadStore.getState().sourceFileName).toBe("Installed.rec");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    await loadDemoReference("tribesforever:22945");
    expect(demoLoadStore.getState().sourceFileName).toBeNull();
  });

  it("loads a qualified source through the existing parser without index sidecars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const demo = recording("TribesForever");
    mocks.parse.mockResolvedValue(demo);
    await loadDemoReference("tribesforever:22945");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://relay.example/demo-download/tribesforever/22945",
      {
        signal: expect.any(AbortSignal),
        headers: { Accept: "application/octet-stream, application/json" },
      },
    );
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith(demo, buffer);
    expect(mocks.commentary).toHaveBeenCalledExactlyOnceWith(null);
    expect(demoLoadStore.getState()).toMatchObject({
      sourceUrl: "https://tribesforever.com/demo/22945/download",
      requestedUrl: "https://tribesforever.com/demo/22945/download",
      requestedDemo: "tribesforever:22945",
      sidecarSourceUrl: null,
      phase: "idle",
    });
  });

  it("reports missing relay configuration without downloading or parsing", async () => {
    vi.stubEnv("RELAY_URL", undefined);
    vi.stubGlobal("fetch", vi.fn());
    await loadDemoReference("tribesforever:22945");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: "tribesforever:22945",
      phase: "error",
      error: "RELAY_URL is not configured",
    });
  });

  it("cancels a qualified download when another demo is selected", async () => {
    const first = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(response()),
    );
    const pending = loadDemoReference("tribesforever:22945");
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    mocks.parse.mockResolvedValue(recording("next"));
    await loadDemoUrl("next.rec");
    first.resolve(response());
    await pending;
    expect(signal.aborted).toBe(true);
    expect(mocks.parse).toHaveBeenCalledOnce();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: null,
      sourceUrl: "next.rec",
    });
  });

  it("shows source validation errors and cancels the preceding download", async () => {
    const first = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => first.promise),
    );
    const pending = loadDemoReference("tribesforever:22945");
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    await loadDemoReference("unknown:1");
    first.resolve(response());
    await pending;
    expect(signal.aborted).toBe(true);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: "unknown:1",
      requestedUrl: null,
      phase: "error",
      error: "Unknown demo source: unknown",
    });
  });

  it("shows download failures for qualified sources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not found", { status: 404 })),
    );
    await loadDemoReference("tribesforever:22945");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: "tribesforever:22945",
      phase: "error",
      error: "Couldn't download the demo",
    });
  });

  it("closes an unread HTTP error body and aborts the failed load", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new ReadableStream({ cancel }), { status: 502 }),
      ),
    );
    await loadDemoUrl("failed.rec");
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  const cachedUrl =
    "https://demos.example/demos/sources/tribesforever/22945.rec";
  const metadata = {
    format: "t2-source-demo",
    schemaVersion: 1,
    source: "tribesforever",
    id: "22945",
    sourceUrl: "https://tribesforever.com/demo/22945/download",
    fetchedAt: "2026-09-28T12:00:00.000Z",
    recordedAt: null,
    originalFilename: "original.rec",
    gameVersion: 25034,
    protocolVersion: 0x330004,
    durationMs: 1259725,
  };

  it("loads seek checkpoints from a cached external demo without index/commentary sidecars", async () => {
    const importCheckpoints = vi.fn();
    const cached = {
      ...recording("cached"),
      streamingPlayback: { importCheckpoints },
    } as unknown as StreamRecording;
    const saved = { cursor: { moveTicks: 0 } };
    mocks.readCheckpoints.mockResolvedValueOnce([saved]);
    mocks.parse.mockResolvedValueOnce(cached);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).endsWith(".checkpoints.json"))
          return new Response("saved checkpoints");
        if (String(url).endsWith(".rec.json"))
          return new Response(JSON.stringify(metadata));
        return { ...response(), url: cachedUrl };
      }),
    );
    await loadDemoReference("tribesforever:22945");
    await vi.waitFor(() =>
      expect(importCheckpoints).toHaveBeenCalledWith([saved]),
    );
    expect(mocks.readCheckpoints).toHaveBeenCalledWith(
      "saved checkpoints",
      buffer,
    );
    expect(fetch).toHaveBeenCalledWith(`${cachedUrl}.checkpoints.json`, {
      signal: expect.any(AbortSignal),
    });
    expect(mocks.commentary).toHaveBeenCalledWith(null);
  });

  it("installs a demo without waiting for metadata and receives metadata later", async () => {
    const sidecar = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ...response(), url: cachedUrl })
        .mockReturnValueOnce(sidecar.promise),
    );
    mocks.parse.mockResolvedValue(recording("cached"));
    await loadDemoReference("tribesforever:22945");
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(`${cachedUrl}.json`, {
      signal: expect.any(AbortSignal),
    });
    expect(demoLoadStore.getState()).toMatchObject({
      sourceMetadata: null,
      phase: "idle",
    });
    sidecar.resolve(new Response(JSON.stringify(metadata)));
    await vi.waitFor(() =>
      expect(demoLoadStore.getState().sourceMetadata).toEqual(metadata),
    );
    await loadDemoFile({ arrayBuffer: async () => buffer } as File);
    expect(demoLoadStore.getState()).toMatchObject({
      sourceMetadata: null,
    });
  });

  it("keeps metadata that arrives before the demo is parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ...response(), url: cachedUrl })
        .mockResolvedValueOnce(new Response(JSON.stringify(metadata))),
    );
    const parsed = deferred<StreamRecording>();
    mocks.parse.mockReturnValueOnce(parsed.promise);
    const pending = loadDemoReference("tribesforever:22945");
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce());
    expect(demoLoadStore.getState().sourceMetadata).toBeNull();
    parsed.resolve(recording("cached"));
    await pending;
    expect(demoLoadStore.getState().sourceMetadata).toEqual(metadata);
  });

  it.each(["eject", "next demo"])(
    "ignores late metadata after %s",
    async (action) => {
      const sidecar = deferred<Response>();
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({ ...response(), url: cachedUrl })
          .mockReturnValueOnce(sidecar.promise)
          .mockResolvedValueOnce(new Response(null, { status: 404 }))
          .mockResolvedValueOnce(response()),
      );
      mocks.parse.mockResolvedValue(recording("cached"));
      await loadDemoReference("tribesforever:22945");
      const signal = vi.mocked(fetch).mock.calls[1][1]!.signal!;
      if (action === "eject") unloadDemo();
      else await loadDemoUrl("next.rec");
      expect(signal.aborted).toBe(true);
      sidecar.resolve(new Response(JSON.stringify(metadata)));
      await sidecar.promise;
      // Allow the async JSON parse and state-update continuation to finish.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(demoLoadStore.getState().sourceMetadata).toBeNull();
      expect(demoLoadStore.getState().sourceUrl).toBe(
        action === "eject" ? null : "next.rec",
      );
    },
  );

  it("keeps playback working if the metadata request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ...response(), url: cachedUrl })
        .mockRejectedValueOnce(new Error("metadata offline")),
    );
    mocks.parse.mockResolvedValue(recording("cached"));
    await loadDemoReference("tribesforever:22945");
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "idle",
      sourceMetadata: null,
    });
    expect(mocks.warn).toHaveBeenCalledOnce();
  });

  it("aborts pending metadata if parsing the demo fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ...response(), url: cachedUrl })
        .mockImplementationOnce(
          (_url, options) =>
            new Promise((_resolve, reject) => {
              options.signal.addEventListener(
                "abort",
                () => reject(options.signal.reason),
                { once: true },
              );
            }),
        ),
    );
    mocks.parse.mockRejectedValueOnce(new Error("invalid demo"));
    await loadDemoReference("tribesforever:22945");
    expect(vi.mocked(fetch).mock.calls[1][1]!.signal!.aborted).toBe(true);
    expect(demoLoadStore.getState().error).toBe("Couldn't parse the demo");
  });

  it("shows the relay's unsupported-version error", async () => {
    const message =
      "Only Tribes 2 v25034 demos are supported (received protocol 0x330003)";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(message, { status: 422 })),
    );
    await loadDemoReference("tribesforever:22945");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "error",
      error: message,
    });
  });

  it("shows a retry message when the relay's import queue is full", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 503 })),
    );
    await loadDemoReference("tribesforever:22945");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "error",
      error: "Demo downloads are busy. Please try again shortly.",
    });
  });
  it("shows the relay's demo size limit error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("Demo exceeds the 150 MB size limit", { status: 413 }),
      ),
    );
    await loadDemoReference("tribesforever:22945");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "error",
      error: "Demo exceeds the 150 MB size limit",
    });
  });
});

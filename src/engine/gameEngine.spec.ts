import { expect, it, vi } from "vitest";
import { Scene, type WebGLRenderer } from "three";
import { GameEngine, type EngineHost } from "./gameEngine";
import { loadTextures } from "./textures";
import { getSceneAssets } from "../assets/sceneAssets";

vi.mock("./ambientParticles", () => ({ AmbientParticles: class {} }));
vi.mock("./lightningEffects", () => ({ LightningEffects: class {} }));

const textureLoad = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../assets/htmlTextures", () => ({
  loadHtmlTexture: textureLoad.run,
  recordSkippedHtmlTextureUpload: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function host(): EngineHost {
  return {
    renderer: { initTexture: vi.fn() } as unknown as WebGLRenderer,
    scene: new Scene(),
    invalidate: vi.fn(),
    assetsLoading: () => false,
  };
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

it("rejects a retired view's host wait before another view gets a host", async () => {
  const engine = new GameEngine();
  const retired = new AbortController();
  const current = new AbortController();
  const oldHost = engine.whenHost(retired.signal);
  const nextHost = engine.whenHost(current.signal);
  retired.abort();
  await expect(oldHost).rejects.toBe(retired.signal.reason);
  const next = host();
  const disconnect = engine.connect(next);
  await expect(nextHost).resolves.toBe(next);
  disconnect();
});

it("detaches render pool resources before retiring a scene's loading manager", () => {
  const engine = new GameEngine();
  const first = engine.sceneAssets;
  const loading = engine.assetLoadingManager;
  const release = vi.fn(() => expect(first.disposed).toBe(false));
  const dispose = vi.fn(() => expect(release).toHaveBeenCalledOnce());
  const stop = engine.onSceneAssetsRelease(release);
  first.cache<string, string>({}, dispose).set("terrain", "old terrain");
  expect(getSceneAssets(loading)).toBe(first);

  engine.releaseSceneAssets();
  expect(release).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledExactlyOnceWith("old terrain");
  expect(getSceneAssets(loading)).toBe(first);
  expect(first.disposed).toBe(true);
  expect(engine.sceneAssets).not.toBe(first);
  expect(engine.assetLoadingManager).not.toBe(loading);
  expect(getSceneAssets(engine.assetLoadingManager)).toBe(engine.sceneAssets);

  stop();
  engine.releaseSceneAssets();
  expect(release).toHaveBeenCalledOnce();
});

it("retires an attached host before replacing it, including pending preparations", async () => {
  const engine = new GameEngine();
  const first = host(),
    second = host();
  const firstBefore = first.scene.onBeforeRender;
  const pending = deferred<number>();
  const load = vi
    .fn()
    .mockReturnValueOnce(pending.promise)
    .mockReturnValueOnce(2);
  const installed = vi.fn();
  const stop = engine.prepareWithHost(load, installed);
  const disconnectFirst = engine.connect(first);
  await flush();
  const disconnectSecond = engine.connect(second);
  expect(load.mock.calls[0][1].aborted).toBe(true);
  expect(first.scene.onBeforeRender).toBe(firstBefore);
  disconnectFirst();
  expect(engine.currentHost).toBe(second);
  pending.resolve(1);
  await flush();
  await flush();
  expect(installed).toHaveBeenCalledExactlyOnceWith(2, second);
  disconnectSecond();
  stop();
});

it("cleans a synchronously superseded host start without overwriting the new cleanup", () => {
  const engine = new GameEngine();
  const first = host(),
    second = host();
  const oldCleanup = vi.fn(),
    newCleanup = vi.fn();
  const disconnectFirst = engine.connect(first);
  let disconnectSecond: (() => void) | undefined;
  const stop = engine.withHost((current) => {
    if (current === first) {
      disconnectSecond = engine.connect(second);
      return oldCleanup;
    }
    return newCleanup;
  });
  expect(oldCleanup).toHaveBeenCalledOnce();
  expect(newCleanup).not.toHaveBeenCalled();
  disconnectFirst();
  expect(engine.currentHost).toBe(second);
  disconnectSecond?.();
  stop();
  expect(newCleanup).toHaveBeenCalledOnce();
});

it("does not stop a newer host's later users when an old connect loop resumes", () => {
  const engine = new GameEngine();
  const first = host(),
    second = host();
  const cleanup = vi.fn();
  let disconnectSecond: (() => void) | undefined;
  const stopFirst = engine.withHost((current) => {
    if (current === first) disconnectSecond = engine.connect(second);
  });
  const stopLater = engine.withHost(() => cleanup);
  engine.connect(first);
  expect(engine.currentHost).toBe(second);
  expect(cleanup).not.toHaveBeenCalled();
  disconnectSecond?.();
  expect(cleanup).toHaveBeenCalledOnce();
  stopLater();
  stopFirst();
});

it("keeps a replacement installed reentrantly by an old host's cleanup", () => {
  const engine = new GameEngine();
  const first = host(),
    requested = host(),
    newest = host();
  let disconnectNewest: (() => void) | undefined;
  const cleaned = vi.fn();
  const stop = engine.withHost((current) =>
    current === first
      ? () => {
          disconnectNewest = engine.connect(newest);
        }
      : cleaned,
  );
  engine.connect(first);
  const disconnectRequested = engine.connect(requested);
  expect(engine.currentHost).toBe(newest);
  disconnectRequested();
  expect(engine.currentHost).toBe(newest);
  disconnectNewest?.();
  stop();
  expect(cleaned).toHaveBeenCalledOnce();
});

it("retires every host user before reporting a throwing disposal observer", () => {
  const engine = new GameEngine();
  const later = vi.fn();
  const first = engine.withHost(() => () => {
    throw new Error("dispose observer");
  });
  const second = engine.withHost(() => later);
  const current = host();
  const before = current.scene.onBeforeRender;
  const disconnect = engine.connect(current);
  expect(disconnect).toThrow("dispose observer");
  expect(later).toHaveBeenCalledOnce();
  expect(engine.currentHost).toBeNull();
  expect(current.scene.onBeforeRender).toBe(before);
  first();
  second();
});

it("reports multiple disposal failures after all host users finish", () => {
  const engine = new GameEngine();
  const first = new Error("first disposal"),
    second = new Error("second disposal");
  const later = vi.fn();
  const stops = [
    engine.withHost(() => () => {
      throw first;
    }),
    engine.withHost(() => () => {
      throw second;
    }),
    engine.withHost(() => later),
  ];
  const disconnect = engine.connect(host());
  let failure: unknown;
  try {
    disconnect();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([first, second]);
  expect(later).toHaveBeenCalledOnce();
  stops.forEach((stop) => stop());
});

it("does not start preparation for a released owner waiting for a host", async () => {
  const engine = new GameEngine();
  const load = vi.fn();
  const stop = engine.prepareWithHost(load, vi.fn());
  stop();
  const disconnect = engine.connect(host());
  await flush();
  expect(load).not.toHaveBeenCalled();
  disconnect();
});

it("aborts released GPU preparation without cancelling a shared texture request", async () => {
  const engine = new GameEngine();
  const current = host();
  const disconnect = engine.connect(current);
  const request = deferred<import("three").Texture>();
  textureLoad.run.mockReturnValue(request.promise);
  const setup = vi.fn();
  const installed = vi.fn();
  const stop = engine.prepareWithHost(
    ({ renderer }, signal) =>
      loadTextures(["shared.png"], renderer, setup, signal),
    installed,
  );
  await flush();
  stop();
  const { Texture } = await import("three");
  const image = new Texture();
  request.resolve(image);
  await request.promise;
  await flush();
  expect(setup).not.toHaveBeenCalled();
  expect(current.renderer.initTexture).not.toHaveBeenCalled();
  expect(installed).not.toHaveBeenCalled();
  // Other owners still receive the shared acquisition result.
  await expect(textureLoad.run()).resolves.toBe(image);
  disconnect();
});

it("rejects old-host results and cleans each successful installation once across reconnects", async () => {
  const engine = new GameEngine();
  const old = deferred<number>(),
    next = deferred<number>();
  const load = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  const cleaned = vi.fn();
  const install = vi.fn<(value: number, host: EngineHost) => () => void>(
    () => cleaned,
  );
  const stop = engine.prepareWithHost(load, install);
  const disconnectOld = engine.connect(host());
  await flush();
  disconnectOld();
  expect(load.mock.calls[0][1].aborted).toBe(true);
  const disconnectNext = engine.connect(host());
  await flush();
  old.resolve(1);
  next.resolve(2);
  await flush();
  await flush();
  expect(install).toHaveBeenCalledOnce();
  expect(install.mock.calls[0][0]).toBe(2);
  disconnectNext();
  stop();
  expect(cleaned).toHaveBeenCalledOnce();
});

it.each(["load", "install"] as const)(
  "handles reentrant owner release during %s",
  async (stage) => {
    const engine = new GameEngine();
    const disconnect = engine.connect(host());
    const cleaned = vi.fn();
    const install = vi.fn(() => {
      if (stage === "install") stop();
      return cleaned;
    });
    const stop = engine.prepareWithHost(() => {
      if (stage === "load") stop();
      return 1;
    }, install);
    await flush();
    await flush();
    expect(install).toHaveBeenCalledTimes(stage === "install" ? 1 : 0);
    expect(cleaned).toHaveBeenCalledTimes(stage === "install" ? 1 : 0);
    stop();
    disconnect();
    expect(cleaned).toHaveBeenCalledTimes(stage === "install" ? 1 : 0);
  },
);

it("contains synchronous preparation errors and ignores failures after disconnect", async () => {
  const engine = new GameEngine();
  const current = host();
  const disconnect = engine.connect(current);
  const error = vi.fn();
  const stop = engine.prepareWithHost(
    () => {
      throw new Error("source");
    },
    vi.fn(),
    error,
  );
  await flush();
  await flush();
  expect(error).toHaveBeenCalledOnce();
  stop();
  const pending = deferred<number>();
  const late = engine.prepareWithHost(() => pending.promise, vi.fn(), error);
  await flush();
  disconnect();
  pending.reject(new Error("late"));
  await flush();
  await flush();
  expect(error).toHaveBeenCalledOnce();
  late();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { textureToUrl } = vi.hoisted(() => ({ textureToUrl: vi.fn() }));

vi.mock("../loaders", () => ({ textureToUrl }));

beforeEach(() => {
  vi.resetModules();
  textureToUrl.mockReset().mockImplementation(() => {
    throw new Error("Not a built-in skin");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function manifestResponse(status = 200) {
  return new Response(JSON.stringify({ customSkins: { lmale: ["custom"] } }), {
    status,
  });
}

describe("player skin manifest", () => {
  it("uses built-in skins before the remote manifest is loaded", async () => {
    textureToUrl.mockReturnValue("/built-in.png");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { resolvePlayerSkinUrl } = await import("./playerSkins");
    expect(resolvePlayerSkinUrl("light_male.dts", "beagle")).toBe(
      "/built-in.png",
    );
    expect(textureToUrl).toHaveBeenCalledWith("skins/beagle.lmale", null);
    expect(resolvePlayerSkinUrl("light_male.dts", "base")).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares the pending request and caches its custom skin lookup", async () => {
    const fetch = vi.fn().mockResolvedValue(manifestResponse());
    vi.stubGlobal("fetch", fetch);
    const { loadSkinManifest, resolvePlayerSkinUrl } =
      await import("./playerSkins");
    const pending = loadSkinManifest();
    expect(loadSkinManifest()).toBe(pending);
    expect(resolvePlayerSkinUrl("light_male.dts", "custom")).toBeUndefined();
    await pending;
    expect(resolvePlayerSkinUrl("LIGHT_MALE.DTS", "custom")).toBe(
      "https://assets.tribes2.online/skins/files/custom.lmale.png",
    );
    expect(resolvePlayerSkinUrl("light_male.dts", "missing")).toBeUndefined();
    expect(resolvePlayerSkinUrl("heavy_male.dts", "custom")).toBeUndefined();
    expect(loadSkinManifest()).toBe(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["network", "HTTP"])("retries one %s failure", async (failure) => {
    const fetch = vi.fn();
    if (failure === "network")
      fetch.mockRejectedValueOnce(new Error("Offline"));
    else fetch.mockResolvedValueOnce(manifestResponse(503));
    fetch.mockResolvedValueOnce(manifestResponse());
    vi.stubGlobal("fetch", fetch);
    const { loadSkinManifest, resolvePlayerSkinUrl } =
      await import("./playerSkins");
    await loadSkinManifest();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(resolvePlayerSkinUrl("light_male.dts", "custom")).toContain(
      "/custom.lmale.png",
    );
  });

  it("settles and caches failure after exactly one retry", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetch);
    const { loadSkinManifest, resolvePlayerSkinUrl } =
      await import("./playerSkins");
    const pending = loadSkinManifest();
    await expect(pending).resolves.toBeUndefined();
    expect(loadSkinManifest()).toBe(pending);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(resolvePlayerSkinUrl("light_male.dts", "custom")).toBeUndefined();
  });

  it("aborts stalled attempts and settles after the retry also times out", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(1));
    const signals: AbortSignal[] = [];
    const fetch = vi.fn((_url: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetch);
    const { loadSkinManifest } = await import("./playerSkins");
    await expect(loadSkinManifest()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});

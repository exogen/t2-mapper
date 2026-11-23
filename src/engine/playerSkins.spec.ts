import { getLocalFilePath } from "../manifest";
import { loadDtsData } from "../dts/nodeDts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the native Starwolf spelling should win, even when a dotted variant exists.
vi.mock("../manifest.json", async (importOriginal) => {
  const { default: manifest } = await importOriginal<{
    default: typeof import("../manifest.json");
  }>();
  const alternate = "textures/skins/swolf.hmale_512.png";
  return {
    default: {
      ...manifest,
      resources: {
        ...manifest.resources,
        [alternate]: [alternate, ["skins.vl2"]],
      },
    },
  };
});

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function manifestResponse(status = 200) {
  const customSkins = { lmale: ["custom", "beagle"] };
  return new Response(JSON.stringify({ customSkins }), { status });
}

async function materialUrls(shape: string, path: string) {
  const { getPlayerSkinSelection, playerSkinUrls } =
    await import("./playerSkins");
  return (preferred?: string, team?: string) =>
    playerSkinUrls(path, getPlayerSkinSelection(shape, preferred, team));
}

describe("player skin manifest", () => {
  it.each([
    ["heavy_male.dts", "Beagle", "textures/skins/beagle.hmale_512.png"],
    ["heavy_male.dts", "swolf", "textures/skins/swolf_hmale_512.png"],
    ["light_female.dts", "cotp", "textures/skins/cotp_lfemale_512.png"],
    ["medium_female.dts", "DSword", "textures/skins/ds.mfemale_512.png"],
    ["bioderm_light.dts", "base", "textures/skins/a.lbioderm_512.png"],
    ["bioderm_medium.dts", "baseb", "textures/skins/b.mbioderm_512.png"],
    ["bioderm_heavy.dts", "horde", "textures/skins/base.hbioderm_512.png"],
    ["medium_male.dts", "basebot", "textures/skins/a.mrobot_512.png"],
    ["heavy_male.dts", "basebbot", "textures/skins/b.hrobot_512.png"],
    ["tr2light_male.dts", "tr2-1", "textures/tr2-1.lmale.png"],
    ["tr2heavy_male.dts", "swolf", "textures/skins/swolf_hmale_512.png"],
    ["light_male.dts", "base", "textures/skins/base.lmale.png"],
    ["heavy_male.dts", "baseb", "textures/skins/baseb.hmale.png"],
  ])(
    "resolves %s with %s to %s from the built-in manifest",
    async (shape, skin, path) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const data = await loadDtsData(getLocalFilePath(`shapes/${shape}`));
      const base = data.materials.find((material) =>
        material.name.includes("base."),
      )!;
      const urls = await materialUrls(shape, base.name.replaceAll("\\", "/"));
      const { getUrlForPath } = await import("../loaders");
      expect(urls(skin)[0]).toBe(getUrlForPath(path));
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("uses the regular team texture when the preference is absent or unavailable", async () => {
    const urls = await materialUrls("light_male.dts", "skins/base.lmale");
    const { getUrlForPath } = await import("../loaders");
    const teamUrl = getUrlForPath("textures/skins/beagle.lmale.png");
    expect(urls(undefined, "beagle")[0]).toBe(teamUrl);
    expect(urls("missing", "beagle")[0]).toBe(teamUrl);
    expect(urls("baseb", "beagle")[0]).toBe(
      getUrlForPath("textures/skins/baseb.lmale.png"),
    );
    expect(urls("missing", "alsoMissing")[0]).toBeUndefined();
  });

  it("shares the pending request and caches its custom skin lookup", async () => {
    const fetch = vi.fn().mockResolvedValue(manifestResponse());
    vi.stubGlobal("fetch", fetch);
    const { loadSkinManifest } = await import("./playerSkins");
    const light = await materialUrls("LIGHT_MALE.DTS", "skins/base.lmale");
    const heavy = await materialUrls("heavy_male.dts", "skins/base.hmale");
    const pending = loadSkinManifest();
    expect(loadSkinManifest()).toBe(pending);
    expect(light("custom")).toEqual([]);
    await pending;
    expect(light("beagle")[0]).toMatch(/\/skins\/beagle\.lmale_512\.png$/);
    expect(light("custom", "beagle")).toEqual([
      "https://assets.tribes2.online/skins/files/custom.lmale.png",
    ]);
    expect(light("missing")).toEqual([]);
    expect(heavy("custom")).toEqual([]);
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
    const { loadSkinManifest } = await import("./playerSkins");
    const urls = await materialUrls("light_male.dts", "skins/base.lmale");
    await loadSkinManifest();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(urls("custom")[0]).toContain("/custom.lmale.png");
  });

  it("settles and caches failure after exactly one retry", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetch);
    const { loadSkinManifest } = await import("./playerSkins");
    const urls = await materialUrls("light_male.dts", "skins/base.lmale");
    const pending = loadSkinManifest();
    await expect(pending).resolves.toBeUndefined();
    expect(loadSkinManifest()).toBe(pending);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(urls("custom")[0]).toBeUndefined();
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

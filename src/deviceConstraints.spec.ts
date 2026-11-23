import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyDevice,
  readDeviceSignals,
  type DeviceSignals,
} from "./deviceConstraints";

afterEach(() => vi.unstubAllGlobals());

describe("device classification", () => {
  it.each([
    { mobile: true },
    { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
    { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel)" },
    { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" },
    { userAgent: "Mozilla/5.0 (iPod touch; CPU iPhone OS)" },
    { userAgent: "Example Mobile Browser" },
  ])(
    "prioritizes mobile identity even with strong reported resources: %j",
    (signals) => {
      expect(
        classifyDevice({
          ...signals,
          deviceMemoryGB: 16,
          hardwareConcurrency: 16,
          coarsePointer: false,
        }),
      ).toEqual({ constrained: true, reason: "mobile" });
    },
  );

  it("recognizes desktop-mode iPad and Android tablets despite a false mobile hint", () => {
    for (const signals of [
      {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
        maxTouchPoints: 5,
      },
      {
        userAgent: "Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36",
        maxTouchPoints: 10,
      },
    ]) {
      expect(
        classifyDevice({
          ...signals,
          mobile: false,
          coarsePointer: false,
          hardwareConcurrency: 8,
          deviceMemoryGB: 8,
        }),
      ).toEqual({ constrained: true, reason: "mobile" });
    }
  });

  it("keeps a fine-pointer touchscreen Windows laptop in the desktop category", () => {
    const laptop = {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      maxTouchPoints: 10,
      coarsePointer: false,
    };
    expect(
      classifyDevice({ ...laptop, hardwareConcurrency: 12, deviceMemoryGB: 8 }),
    ).toEqual({ constrained: false, reason: "desktop" });
    expect(
      classifyDevice({ ...laptop, hardwareConcurrency: 12, deviceMemoryGB: 4 }),
    ).toEqual({ constrained: true, reason: "low-memory" });
  });

  it("uses the primary coarse pointer before resource hints, independent of mobile false", () => {
    expect(
      classifyDevice({
        mobile: false,
        coarsePointer: true,
        deviceMemoryGB: 2,
        hardwareConcurrency: 2,
      }),
    ).toEqual({ constrained: true, reason: "coarse-pointer" });
  });

  it.each([
    [{ deviceMemoryGB: 0.5, hardwareConcurrency: 16 }, "low-memory"],
    [{ deviceMemoryGB: 4, hardwareConcurrency: 4 }, "low-memory"],
    [{ deviceMemoryGB: 8, hardwareConcurrency: 4 }, "low-cpu"],
    [{ hardwareConcurrency: 1 }, "low-cpu"],
    [{ deviceMemoryGB: 8, hardwareConcurrency: 8 }, "desktop"],
    [{}, "desktop"],
  ] as const)(
    "applies resource thresholds with stable priority: %j",
    (signals, reason) => {
      expect(classifyDevice(signals)).toEqual({
        constrained: reason !== "desktop",
        reason,
      });
    },
  );

  it.each([0, -1, NaN, Infinity, -Infinity])(
    "treats invalid resource hints as unknown: %s",
    (value) => {
      expect(
        classifyDevice({ deviceMemoryGB: value, hardwareConcurrency: value }),
      ).toEqual({ constrained: false, reason: "desktop" });
      expect(
        classifyDevice({ userAgent: "Macintosh", maxTouchPoints: value }),
      ).toEqual({ constrained: false, reason: "desktop" });
    },
  );

  it("does not infer mobile identity from one Mac touch point alone", () => {
    expect(
      classifyDevice({ userAgent: "Macintosh", maxTouchPoints: 1 }),
    ).toEqual({ constrained: false, reason: "desktop" });
  });
});

describe("browser signal reading", () => {
  it("is safe in SSR without navigator, window, or media queries", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    expect(readDeviceSignals()).toEqual({});
    expect(classifyDevice(readDeviceSignals())).toEqual({
      constrained: false,
      reason: "desktop",
    });
  });

  it("reads optional browser hints and the primary pointer, without reading viewport width", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal("navigator", {
      userAgentData: { mobile: false },
      userAgent: "Android tablet",
      maxTouchPoints: 5,
      deviceMemory: 4,
      hardwareConcurrency: 8,
    });
    vi.stubGlobal("window", {
      matchMedia,
      get innerWidth() {
        throw new Error("layout must not influence classification");
      },
    });
    expect(readDeviceSignals()).toEqual({
      mobile: false,
      userAgent: "Android tablet",
      maxTouchPoints: 5,
      deviceMemoryGB: 4,
      hardwareConcurrency: 8,
      coarsePointer: true,
    });
    expect(matchMedia).toHaveBeenCalledExactlyOnceWith("(pointer: coarse)");
  });

  it("works when mobile and memory hints or matchMedia are unavailable", () => {
    vi.stubGlobal("navigator", {
      userAgent: "desktop",
      maxTouchPoints: 0,
      hardwareConcurrency: 8,
    });
    vi.stubGlobal("window", {});
    expect(readDeviceSignals()).toEqual({
      userAgent: "desktop",
      maxTouchPoints: 0,
      hardwareConcurrency: 8,
    });
  });

  it("reads media-query hints even without navigator and tolerates failing media queries", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(readDeviceSignals()).toEqual({ coarsePointer: false });
    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("unavailable");
      },
    });
    expect(readDeviceSignals()).toEqual({});
  });

  it("omits invalid optional numeric browser hints", () => {
    vi.stubGlobal("navigator", {
      userAgentData: {},
      maxTouchPoints: NaN,
      deviceMemory: 0,
      hardwareConcurrency: -1,
    });
    vi.stubGlobal("window", undefined);
    const signals: DeviceSignals = readDeviceSignals();
    expect(signals).toEqual({});
    expect(classifyDevice(signals).constrained).toBe(false);
  });
});

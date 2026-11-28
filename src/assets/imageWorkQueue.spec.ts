import { afterEach, describe, expect, it, vi } from "vitest";
import { readDeviceSignals } from "../deviceConstraints";
import { imageWorkConcurrency } from "./imageWorkQueue";

afterEach(() => vi.unstubAllGlobals());

describe("shared image work policy", () => {
  it("uses mobile identity even with a fine pointer and strong resource hints", () => {
    expect(
      imageWorkConcurrency({
        mobile: true,
        coarsePointer: false,
        deviceMemoryGB: 32,
        hardwareConcurrency: 12,
      }),
    ).toBe(2);
  });

  it("uses four slots on a touchscreen desktop with a coarse pointer", () => {
    expect(
      imageWorkConcurrency({
        userAgent: "Mozilla/5.0 (Windows NT 10.0)",
        maxTouchPoints: 5,
        coarsePointer: true,
        deviceMemoryGB: 32,
        hardwareConcurrency: 12,
      }),
    ).toBe(4);
  });

  it("recognizes an iPad with a desktop user agent and trackpad", () => {
    expect(
      imageWorkConcurrency({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/26.0 Safari/605.1.15",
        maxTouchPoints: 5,
        coarsePointer: false,
      }),
    ).toBe(2);
  });

  it("uses four slots in desktop Safari without a memory hint", () => {
    expect(
      imageWorkConcurrency({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/26.0 Safari/605.1.15",
        maxTouchPoints: 0,
        hardwareConcurrency: 8,
      }),
    ).toBe(4);
  });

  it("uses four slots on a desktop that reports 8 GiB", () => {
    vi.stubGlobal("navigator", {
      userAgentData: { mobile: false },
      deviceMemory: 8,
      hardwareConcurrency: 10,
    });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(imageWorkConcurrency(readDeviceSignals())).toBe(4);
  });

  it("uses two slots when either resource hint reaches its lower tier", () => {
    expect(
      imageWorkConcurrency({ deviceMemoryGB: 4, hardwareConcurrency: 12 }),
    ).toBe(2);
    expect(
      imageWorkConcurrency({ deviceMemoryGB: 32, hardwareConcurrency: 4 }),
    ).toBe(2);
  });

  it("uses four slots when browser resource hints are unavailable", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    expect(imageWorkConcurrency(readDeviceSignals())).toBe(4);
    expect(
      imageWorkConcurrency({ deviceMemoryGB: -1, hardwareConcurrency: NaN }),
    ).toBe(4);
  });
});

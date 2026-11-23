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
        deviceMemoryGB: 8,
        hardwareConcurrency: 12,
      }),
    ).toBe(2);
    expect(
      imageWorkConcurrency({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        maxTouchPoints: 5,
        coarsePointer: false,
        deviceMemoryGB: 8,
        hardwareConcurrency: 12,
      }),
    ).toBe(2);
    expect(
      imageWorkConcurrency({
        userAgent: "Mozilla/5.0 (Windows NT 10.0)",
        maxTouchPoints: 5,
        coarsePointer: false,
        deviceMemoryGB: 8,
        hardwareConcurrency: 12,
      }),
    ).toBe(4);
  });

  it("uses the same structural browser signals as the global device policy", () => {
    vi.stubGlobal("navigator", {
      userAgentData: { mobile: true },
      userAgent: "test",
      deviceMemory: 8,
      hardwareConcurrency: 12,
    });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(imageWorkConcurrency(readDeviceSignals())).toBe(2);
  });

  it("supports Node imports and conservative low-resource hints without DOM globals", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    expect(imageWorkConcurrency(readDeviceSignals())).toBe(4);
    expect(imageWorkConcurrency({ coarsePointer: true })).toBe(2);
    expect(imageWorkConcurrency({ deviceMemoryGB: 4 })).toBe(2);
    expect(imageWorkConcurrency({ hardwareConcurrency: 2 })).toBe(2);
  });
});

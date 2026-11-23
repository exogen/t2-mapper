import { performanceTuning } from "./performanceTuning";

/** Optional browser hints, rather than measurements of available resources. */
export interface DeviceSignals {
  mobile?: boolean;
  userAgent?: string;
  maxTouchPoints?: number;
  deviceMemoryGB?: number;
  hardwareConcurrency?: number;
  coarsePointer?: boolean;
}

export interface DeviceClassification {
  constrained: boolean;
  reason: "mobile" | "coarse-pointer" | "low-memory" | "low-cpu" | "desktop";
}

function positiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * A conservative quality-default policy. Mobile identity takes priority over
 * strong reported resources; a false mobile hint does not exclude tablets.
 * Touch support alone does not classify a Windows laptop as constrained.
 */
export function classifyDevice(signals: DeviceSignals): DeviceClassification {
  const ua = signals.userAgent ?? "";
  const mobile =
    signals.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (/Macintosh/i.test(ua) &&
      positiveFinite(signals.maxTouchPoints) &&
      signals.maxTouchPoints > 1);
  if (mobile) return { constrained: true, reason: "mobile" };
  if (signals.coarsePointer === true)
    return { constrained: true, reason: "coarse-pointer" };
  if (
    positiveFinite(signals.deviceMemoryGB) &&
    signals.deviceMemoryGB <=
      performanceTuning.constrainedDevice.maximumMemoryGB
  )
    return { constrained: true, reason: "low-memory" };
  if (
    positiveFinite(signals.hardwareConcurrency) &&
    signals.hardwareConcurrency <=
      performanceTuning.constrainedDevice.maximumLogicalCpuThreads
  )
    return { constrained: true, reason: "low-cpu" };
  return { constrained: false, reason: "desktop" };
}

/** Read available hints without depending on React, layout, or browser globals
 * during module initialization. Unsupported optional APIs remain undefined. */
export function readDeviceSignals(): DeviceSignals {
  const signals: DeviceSignals = {};
  // Structural globals also let Node tools import the pure classification
  // policy without pulling DOM types into the shared simulation project.
  const environment = globalThis as {
    navigator?: {
      userAgentData?: { mobile?: boolean };
      userAgent?: string;
      maxTouchPoints?: number;
      deviceMemory?: number;
      hardwareConcurrency?: number;
    };
    window?: { matchMedia?: (query: string) => { matches: boolean } };
  };
  const nav = environment.navigator;
  if (nav) {
    if (typeof nav.userAgentData?.mobile === "boolean")
      signals.mobile = nav.userAgentData.mobile;
    if (typeof nav.userAgent === "string") signals.userAgent = nav.userAgent;
    if (
      typeof nav.maxTouchPoints === "number" &&
      Number.isFinite(nav.maxTouchPoints) &&
      nav.maxTouchPoints >= 0
    )
      signals.maxTouchPoints = nav.maxTouchPoints;
    // deviceMemory is an approximate, potentially rounded or clamped hint.
    if (positiveFinite(nav.deviceMemory))
      signals.deviceMemoryGB = nav.deviceMemory;
    if (positiveFinite(nav.hardwareConcurrency))
      signals.hardwareConcurrency = nav.hardwareConcurrency;
  }
  const browserWindow = environment.window;
  if (typeof browserWindow?.matchMedia === "function") {
    try {
      signals.coarsePointer =
        browserWindow.matchMedia("(pointer: coarse)").matches;
    } catch {
      // Restricted or partial browser environments can expose a failing API.
    }
  }
  return signals;
}

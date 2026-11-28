import {
  hasMobileIdentity,
  readDeviceSignals,
  type DeviceSignals,
} from "../deviceConstraints";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import { deviceTierValue, performanceTuning } from "../performanceTuning";
import { AssetLoadQueue } from "./assetLoadQueue";

export function imageWorkConcurrency(signals: DeviceSignals) {
  const policy = performanceTuning.imageWorkConcurrency;
  const {
    deviceMemoryGB = 0,
    hardwareConcurrency = 0,
    maxTouchPoints = 0,
  } = signals;
  // Desktop-mode iPads advertise a Mac user agent and still report touch.
  const desktopModeIPad =
    /Macintosh/i.test(signals.userAgent ?? "") &&
    Number.isFinite(maxTouchPoints) &&
    maxTouchPoints > 1;
  const constrained =
    hasMobileIdentity(signals) ||
    desktopModeIPad ||
    (deviceMemoryGB > 0 &&
      deviceMemoryGB <= policy.maximumConstrainedMemoryGiB) ||
    (hardwareConcurrency > 0 &&
      hardwareConcurrency <= policy.maximumConstrainedLogicalCpuThreads);
  return deviceTierValue(policy, constrained);
}

/** One budget for URL images (ImageBitmap and HTML texture loads) and embedded
 * DIF PNG decode.
 * Jobs create their blobs/images inside the slot, so waiting work retains only
 * metadata and existing source bytes, not a backlog of newly decoded images. */
export const imageWorkQueue = new AssetLoadQueue(
  imageWorkConcurrency(readDeviceSignals()),
);

// Work counts are shared across all paths. Decoded resource bytes continue to
// be reported only by their owners, never added a second time by this queue.
export function readImageWorkMetrics() {
  return {
    concurrency: imageWorkQueue.concurrency,
    queued: imageWorkQueue.queued,
    queuedCritical: imageWorkQueue.queuedCritical,
    queuedDemand: imageWorkQueue.queuedDemand,
    queuedSpeculative: imageWorkQueue.queuedSpeculative,
    active: imageWorkQueue.active,
    peakQueued: imageWorkQueue.peakQueued,
    peakActive: imageWorkQueue.peakActive,
    completed: imageWorkQueue.completed,
    failed: imageWorkQueue.failed,
  };
}

registerMetricSource("imageWorkQueue", readImageWorkMetrics);

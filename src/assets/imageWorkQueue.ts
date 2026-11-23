import {
  classifyDevice,
  readDeviceSignals,
  type DeviceSignals,
} from "../deviceConstraints";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import { deviceTierValue, performanceTuning } from "../performanceTuning";
import { AssetLoadQueue } from "./assetLoadQueue";

export function imageWorkConcurrency(signals: DeviceSignals) {
  return deviceTierValue(
    performanceTuning.imageWorkConcurrency,
    classifyDevice(signals).constrained,
  );
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
registerMetricSource("imageWorkQueue", () => ({
  concurrency: imageWorkQueue.concurrency,
  queued: imageWorkQueue.queued,
  active: imageWorkQueue.active,
  peakQueued: imageWorkQueue.peakQueued,
  peakActive: imageWorkQueue.peakActive,
  completed: imageWorkQueue.completed,
  failed: imageWorkQueue.failed,
}));

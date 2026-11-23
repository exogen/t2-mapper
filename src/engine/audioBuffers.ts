import type { AudioLoader } from "three";
import { createLogger } from "../logger";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import { ByteLruMap } from "../assets/byteLruMap";
import { PendingRequests } from "../assets/pendingRequests";
import { classifyDevice, readDeviceSignals } from "../deviceConstraints";
import { deviceTierValue, performanceTuning } from "../performanceTuning";

const log = createLogger("audioBuffers");

const constrained = classifyDevice(readDeviceSignals()).constrained;
/** Lookup ownership only. Playing sounds retain their own AudioBuffer references. */
export const audioBufferCache = new ByteLruMap<string, AudioBuffer>({
  maxBytes: deviceTierValue(
    performanceTuning.audioBufferCache.maximumBytes,
    constrained,
  ),
  maxEntries: deviceTierValue(
    performanceTuning.audioBufferCache.maximumEntries,
    constrained,
  ),
  sizeOf(buffer) {
    const bytes = buffer.length * buffer.numberOfChannels * 4;
    // Real AudioBuffers have immutable valid dimensions. Partial test doubles
    // have unknown size but still obey the independent entry budget.
    return Number.isFinite(bytes) && bytes >= 0 ? bytes : 0;
  },
});

type OnLoad = (buffer: AudioBuffer) => void;
type OnError = (error: unknown) => void;

// Share decoding independently of finished-buffer eviction policy.
const pendingBuffers = new PendingRequests<string, AudioBuffer>((error, url) =>
  log.error("Audio callback error %s: %o", url, error),
);

registerMetricSource("audioBufferCache", () => {
  return {
    cacheEntries: audioBufferCache.size,
    pendingEntries: pendingBuffers.size,
    decodedSources: audioBufferCache.uniqueValues,
    // Both names describe the cache only, not buffers held by active sounds.
    decodedAudioBytes: audioBufferCache.retainedBytes,
    cacheOwnedDecodedBytes: audioBufferCache.retainedBytes,
    byteLimit: audioBufferCache.maxBytes,
    entryLimit: audioBufferCache.maxEntries,
    cacheHits: audioBufferCache.hits,
    cacheMisses: audioBufferCache.misses,
    evictions: audioBufferCache.evictions,
    oversizedBuffersNotCached: audioBufferCache.oversizedRejections,
  };
});

export function getCachedAudioBuffer(
  audioUrl: string,
  audioLoader: AudioLoader,
  onLoad: OnLoad,
  onError?: OnError,
): void {
  const cached = audioBufferCache.get(audioUrl);
  if (cached) {
    onLoad(cached);
    return;
  }
  pendingBuffers.request(
    audioUrl,
    (resolve, reject) => {
      audioLoader.load(
        audioUrl,
        (buffer) => {
          audioBufferCache.set(audioUrl, buffer);
          resolve(buffer);
        },
        undefined,
        (error) => {
          log.error("Audio load error %s: %o", audioUrl, error);
          reject(error);
        },
      );
    },
    onLoad,
    onError,
  );
}

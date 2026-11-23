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

/** The audio cache owns the lifetime of a shared fetch and decode. */
export interface AudioBufferLoader {
  load(
    url: string,
    onLoad: OnLoad,
    onProgress: undefined,
    onError: OnError,
    signal: AbortSignal,
  ): void;
}

export function createAudioBufferLoader(
  context: Pick<BaseAudioContext, "decodeAudioData">,
): AudioBufferLoader {
  return {
    load(url, onLoad, _onProgress, onError, signal) {
      // Use a request-local signal so a timed-out fetch cannot hold up a
      // later attempt for the same URL or abort unrelated audio.
      void fetch(url, { signal })
        .then((response) => {
          if (!response.ok)
            throw new Error(
              `Audio request failed with HTTP ${response.status}`,
            );
          return response.arrayBuffer();
        })
        .then((bytes) => {
          signal.throwIfAborted();
          return context.decodeAudioData(bytes);
        })
        .then(onLoad, onError);
    },
  };
}

const AUDIO_LOAD_TIMEOUT_MS = 10_000;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 8000;
const retryByUrl = new ByteLruMap<string, { retryAt: number; delayMs: number }>(
  {
    maxBytes: 0,
    maxEntries: audioBufferCache.maxEntries,
    sizeOf: () => 0,
  },
);

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
  audioLoader: AudioBufferLoader,
  onLoad: OnLoad,
  onError?: OnError,
): () => void {
  const cached = audioBufferCache.get(audioUrl);
  if (cached) {
    onLoad(cached);
    return () => {};
  }
  return pendingBuffers.request(
    audioUrl,
    (resolve, reject) =>
      startSharedLoad(audioUrl, audioLoader, resolve, reject),
    onLoad,
    onError,
  );
}

function startSharedLoad(
  url: string,
  loader: AudioBufferLoader,
  resolve: OnLoad,
  reject: OnError,
): void {
  const retry = retryByUrl.get(url);
  const fail = (error: unknown) => {
    const delayMs = retry
      ? Math.min(retry.delayMs * 2, MAX_RETRY_DELAY_MS)
      : INITIAL_RETRY_DELAY_MS;
    retryByUrl.set(url, { retryAt: performance.now() + delayMs, delayMs });
    log.error("Audio load error %s: %o", url, error);
    reject(error);
  };
  const start = () =>
    loadWithDeadline(
      url,
      loader,
      (buffer) => {
        retryByUrl.delete(url);
        audioBufferCache.set(url, buffer);
        resolve(buffer);
      },
      fail,
    );

  const wait = (retry?.retryAt ?? 0) - performance.now();
  if (wait <= 0) {
    start();
    return;
  }
  setTimeout(() => {
    try {
      start();
    } catch (error) {
      // Report a delayed loader throw to the waiting subscribers.
      fail(error);
    }
  }, wait);
}

function loadWithDeadline(
  url: string,
  loader: AudioBufferLoader,
  onLoad: OnLoad,
  onError: OnError,
): void {
  const controller = new AbortController();
  const deadline = performance.now() + AUDIO_LOAD_TIMEOUT_MS;
  let finished = false;
  const finish = () => {
    if (finished) return false;
    finished = true;
    clearTimeout(timer);
    return true;
  };
  const expire = () => {
    if (!finish()) return;
    const error = new DOMException("Audio load timed out", "TimeoutError");
    controller.abort(error);
    onError(error);
  };
  const timer = setTimeout(expire, AUDIO_LOAD_TIMEOUT_MS);
  try {
    loader.load(
      url,
      (buffer) => {
        // Background tabs may delay the timeout callback.
        if (performance.now() >= deadline) expire();
        else if (finish()) onLoad(buffer);
      },
      undefined,
      (error) => {
        if (finish()) onError(error);
      },
      controller.signal,
    );
  } catch (error) {
    // An immediate throw is handled by PendingRequests and its caller.
    if (finish()) throw error;
  }
}

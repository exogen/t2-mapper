import type { AudioLoader } from "three";
import { createLogger } from "../logger";

const log = createLogger("audioBuffers");

export const audioBufferCache = new Map<string, AudioBuffer>();

interface BufferRequest {
  onLoad: (buffer: AudioBuffer) => void;
  onError?: (error: unknown) => void;
}

// Share decoding as well as the finished buffer across all sound owners.
const pendingBuffers = new Map<string, BufferRequest[]>();

export function getCachedAudioBuffer(
  audioUrl: string,
  audioLoader: AudioLoader,
  onLoad: BufferRequest["onLoad"],
  onError?: BufferRequest["onError"],
): void {
  const cached = audioBufferCache.get(audioUrl);
  if (cached) {
    onLoad(cached);
    return;
  }
  const request = { onLoad, onError };
  const pending = pendingBuffers.get(audioUrl);
  if (pending) {
    pending.push(request);
    return;
  }
  const requests = [request];
  pendingBuffers.set(audioUrl, requests);
  try {
    audioLoader.load(
      audioUrl,
      (buffer) => {
        audioBufferCache.set(audioUrl, buffer);
        pendingBuffers.delete(audioUrl);
        for (const request of requests) {
          try {
            request.onLoad(buffer);
          } catch (error) {
            log.error("Audio callback error %s: %o", audioUrl, error);
          }
        }
      },
      undefined,
      (error) => {
        pendingBuffers.delete(audioUrl);
        log.error("Audio load error %s: %o", audioUrl, error);
        for (const request of requests) {
          try {
            request.onError?.(error);
          } catch (error) {
            log.error("Audio callback error %s: %o", audioUrl, error);
          }
        }
      },
    );
  } catch (error) {
    pendingBuffers.delete(audioUrl);
    throw error;
  }
}

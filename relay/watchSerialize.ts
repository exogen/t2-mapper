import type { WatchCatchupPayload } from "./types.js";

/**
 * JSON codec for WatchCatchupPayload, shared by the relay (serialize)
 * and browser (deserialize). Parser output is plain objects/arrays
 * except for Uint8Array fields in some event data (e.g.
 * SimVoiceStreamEvent audio), encoded as { $u8: base64 }.
 */

const U8_KEY = "$u8";

function u8ToBase64(u8: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < u8.length; i += chunkSize) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToU8(base64: string): Uint8Array {
  const binary = atob(base64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    u8[i] = binary.charCodeAt(i);
  }
  return u8;
}

export function serializeCatchupPayload(payload: WatchCatchupPayload): string {
  return JSON.stringify(payload, (_key, value) => {
    if (value instanceof Uint8Array) {
      return { [U8_KEY]: u8ToBase64(value) };
    }
    return value;
  });
}

export function deserializeCatchupPayload(json: string): WatchCatchupPayload {
  return JSON.parse(json, (_key, value) => {
    if (
      value &&
      typeof value === "object" &&
      typeof value[U8_KEY] === "string" &&
      Object.keys(value).length === 1
    ) {
      return base64ToU8(value[U8_KEY]);
    }
    return value;
  }) as WatchCatchupPayload;
}

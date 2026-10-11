import type { WatchCatchupPayload } from "./types.js";

/**
 * JSON codec for WatchCatchupPayload, shared by the relay (serialize)
 * and browser (deserialize). Parser output is plain objects/arrays
 * except for Uint8Array fields in some event data (e.g.
 * SimVoiceStreamEvent audio), encoded as { $u8: base64 }.
 */

const U8_KEY = "$u8";

type DataBlocks = WatchCatchupPayload["dataBlocks"];

/** One serialized datablock table, scoped to a parser's lifetime. */
export class CatchupDataBlockCache {
  private cached: {
    entries: Array<{
      id: number;
      className: string;
      data: DataBlocks[number][1]["data"];
    }>;
    json: string;
  } | null = null;

  serialize(dataBlocks: DataBlocks): string {
    const cached = this.cached;
    // PacketParser shares immutable datablock values in saveState() too:
    // a dispatched SimDataBlockEvent replaces the value, even for the same ID.
    if (
      cached &&
      cached.entries.length === dataBlocks.length &&
      cached.entries.every((entry, i) => {
        const [id, block] = dataBlocks[i];
        return (
          entry.id === id &&
          entry.className === block.className &&
          entry.data === block.data
        );
      })
    )
      return cached.json;

    const json = JSON.stringify(dataBlocks);
    this.cached = {
      entries: dataBlocks.map(([id, block]) => ({
        id,
        className: block.className,
        data: block.data,
      })),
      json,
    };
    return json;
  }
}

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

function replaceBytes(_key: string, value: unknown): unknown {
  return value instanceof Uint8Array ? { [U8_KEY]: u8ToBase64(value) } : value;
}

export function serializeCatchupPayload(
  payload: WatchCatchupPayload,
  dataBlockCache?: CatchupDataBlockCache,
): string {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    // Only queued net events contain byte arrays (voice/file chunks).
    // Other sections use native JSON without a per-value JS callback.
    const json =
      key === "dataBlocks" && dataBlockCache
        ? dataBlockCache.serialize(payload.dataBlocks)
        : JSON.stringify(
            value,
            key === "pendingGuaranteedEvents" ? replaceBytes : undefined,
          );
    if (json !== undefined) fields.push(JSON.stringify(key) + ":" + json);
  }
  return "{" + fields.join(",") + "}";
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

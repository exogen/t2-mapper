import type { Readable } from "node:stream";
import { DemoParser, DemoIdentString, type DemoHeader } from "t2-demo-parser";
import { SOURCE_DEMO_PROTOCOL_VERSION } from "./demoSourceMetadata.js";

export class DemoValidationError extends Error {}

export const MAX_SOURCE_DEMO_BYTES = 150_000_000;

export class DemoTooLargeError extends DemoValidationError {
  constructor() {
    super("Demo exceeds the 150 MB size limit");
  }
}

/** A single streaming PUT needs the exact, uncompressed byte count upfront. */
export function sourceDemoLength(headers: Headers): number {
  const raw = headers.get("content-length");
  if (raw && /^\d+$/.test(raw) && Number(raw) > MAX_SOURCE_DEMO_BYTES)
    throw new DemoTooLargeError();
  if (
    !raw ||
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) <= 0
  )
    throw new DemoValidationError(
      "Demo source must provide a valid Content-Length",
    );
  const encoding = headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity")
    throw new DemoValidationError("Demo source must provide an unencoded file");
  return Number(raw);
}

/** Inspect only the header, then put every byte back for streaming/upload. */
export async function validateSourceDemo(body: Readable): Promise<DemoHeader> {
  const chunks: Buffer[] = [];
  let prefix = Buffer.alloc(0);
  // Keep the stream open when leaving the iterator after finding the header.
  for await (const chunk of body.iterator({ destroyOnReturn: false })) {
    chunks.push(chunk);
    // A one-byte string length plus 3 U32s makes the header at most 268 bytes.
    prefix = Buffer.concat([prefix, chunk.subarray(0, 268 - prefix.length)]);
    let header: DemoHeader;
    try {
      header = DemoParser.peekHeader(prefix).header;
    } catch (err) {
      if (err instanceof RangeError) continue;
      throw err;
    }
    if (header.identString !== DemoIdentString)
      throw new DemoValidationError("Not a Tribes 2 demo");
    if (header.protocolVersion !== SOURCE_DEMO_PROTOCOL_VERSION) {
      throw new DemoValidationError(
        `Only Tribes 2 v25034 demos are supported (received protocol 0x${header.protocolVersion.toString(16)})`,
      );
    }
    for (let i = chunks.length - 1; i >= 0; i--) body.unshift(chunks[i]);
    return header;
  }
  throw new DemoValidationError("Incomplete Tribes 2 demo header");
}

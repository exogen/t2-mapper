import { performanceTuning } from "../performanceTuning";

/** Own compressed download bytes once. Prefix snapshots are temporary copies;
 * finalizing releases chunk owners before the parser trims its inflated data. */
export class CompressedDemoBuffer {
  private backing?: Uint8Array<ArrayBuffer>;
  private readonly chunks: Uint8Array[] = [];
  private chunkBytes = 0;
  private complete?: ArrayBuffer;
  private copyBytes = 0;
  private copies = 0;
  private transientCopyBytes = 0;
  private readonly onCopy?: () => void;
  length = 0;

  constructor(
    expectedBytes = 0,
    maximumPreallocationBytes: number = performanceTuning.compressedDemoBuffer
      .maximumPreallocationBytes.constrained,
    onCopy?: () => void,
  ) {
    this.onCopy = onCopy;
    // Content-Length is a hint: never reserve an arbitrary advertised size.
    if (
      Number.isSafeInteger(expectedBytes) &&
      expectedBytes > 0 &&
      expectedBytes <= maximumPreallocationBytes
    )
      this.backing = new Uint8Array(expectedBytes);
  }

  append(chunk: Uint8Array): void {
    if (this.complete) throw new Error("Demo buffer is already finalized");
    if (this.backing && this.length + chunk.byteLength <= this.backing.length) {
      this.backing.set(chunk, this.length);
    } else {
      if (this.backing) {
        this.chunks.push(this.backing.subarray(0, this.length));
        this.chunkBytes = this.length;
        this.backing = undefined;
      }
      this.chunks.push(chunk);
      this.chunkBytes += chunk.byteLength;
    }
    this.length += chunk.byteLength;
  }

  /** Header/initial-block probes must not hand out the growing backing store. */
  prefix(): ArrayBuffer {
    return this.copy();
  }

  finish(): ArrayBuffer {
    if (this.complete) return this.complete;
    if (this.backing?.length === this.length) {
      this.complete = this.backing.buffer;
    } else if (
      this.chunks.length === 1 &&
      this.chunks[0].byteOffset === 0 &&
      this.chunks[0].byteLength === this.chunks[0].buffer.byteLength &&
      this.chunks[0].buffer instanceof ArrayBuffer
    ) {
      this.complete = this.chunks[0].buffer;
    } else {
      this.complete = this.copy();
    }
    this.backing = undefined;
    this.chunks.length = 0;
    this.chunkBytes = 0;
    return this.complete;
  }

  metrics(): Record<string, number> {
    return {
      receivedBytes: this.length,
      compressedChunkBytes: this.chunkBytes,
      compressedPreallocatedBytes: this.backing?.byteLength ?? 0,
      compressedAssembledBytes: this.complete?.byteLength ?? 0,
      compressedCopyTransientBytes: this.transientCopyBytes,
      compressedCopies: this.copies,
      compressedCopiedBytes: this.copyBytes,
    };
  }

  private copy(): ArrayBuffer {
    const bytes = new Uint8Array(this.length);
    if (this.backing) bytes.set(this.backing.subarray(0, this.length));
    else {
      let offset = 0;
      for (const chunk of this.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
    }
    this.copies++;
    this.copyBytes += bytes.byteLength;
    this.transientCopyBytes = bytes.byteLength;
    try {
      this.onCopy?.();
    } finally {
      this.transientCopyBytes = 0;
    }
    return bytes.buffer;
  }
}

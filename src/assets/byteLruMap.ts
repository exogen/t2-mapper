export interface ByteLruOptions<V> {
  maxBytes: number;
  maxEntries: number;
  /** Values must have stable sizes while cached; aliases share one charge. */
  sizeOf(value: V): number;
}

/** A lookup cache with byte and entry budgets. Eviction only removes references;
 * it never disposes, mutates, or invalidates values retained by active owners.
 * Map iteration follows least-to-most-recently-used key order. */
export class ByteLruMap<K, V extends object> extends Map<K, V> {
  readonly maxBytes: number;
  readonly maxEntries: number;
  hits = 0;
  misses = 0;
  evictions = 0;
  oversizedRejections = 0;
  private bytes = 0;
  private references = new Map<V, { count: number; bytes: number }>();
  private sizeOf: (value: V) => number;

  constructor(options: ByteLruOptions<V>) {
    super();
    if (
      !Number.isFinite(options.maxBytes) ||
      options.maxBytes < 0 ||
      !Number.isSafeInteger(options.maxEntries) ||
      options.maxEntries < 0
    )
      throw new Error("Invalid LRU cache budget");
    this.maxBytes = options.maxBytes;
    this.maxEntries = options.maxEntries;
    this.sizeOf = options.sizeOf;
  }

  get retainedBytes(): number {
    return this.bytes;
  }
  get uniqueValues(): number {
    return this.references.size;
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    const value = super.get(key)!;
    super.delete(key);
    super.set(key, value);
    return value;
  }

  override set(key: K, value: V): this {
    const referenced = this.references.get(value);
    const bytes = referenced?.bytes ?? this.sizeOf(value);
    if (!Number.isFinite(bytes) || bytes < 0)
      throw new Error("Invalid LRU cache value size");
    this.delete(key);
    if (bytes > this.maxBytes) {
      this.oversizedRejections++;
      return this;
    }
    const current = this.references.get(value);
    if (current) current.count++;
    else {
      this.references.set(value, { count: 1, bytes });
      this.bytes += bytes;
    }
    super.set(key, value);
    while (this.bytes > this.maxBytes || this.size > this.maxEntries) {
      const oldest = super.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
      this.evictions++;
    }
    return this;
  }

  override delete(key: K): boolean {
    if (!super.has(key)) return false;
    const value = super.get(key)!;
    super.delete(key);
    const reference = this.references.get(value)!;
    if (--reference.count === 0) {
      this.references.delete(value);
      this.bytes -= reference.bytes;
    }
    return true;
  }

  override clear(): void {
    super.clear();
    this.references.clear();
    this.bytes = 0;
  }
}

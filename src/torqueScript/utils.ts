/**
 * Map with case-insensitive key lookups, preserving original casing.
 * The underlying map stores values with original key casing for inspection.
 */
export class CaseInsensitiveMap<V> {
  private map = new Map<string, V>();
  private keyLookup = new Map<string, string>(); // normalized -> original

  constructor(entries?: Iterable<readonly [string, V]> | null) {
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  get size(): number {
    return this.map.size;
  }

  get(key: string): V | undefined {
    const originalKey = this.keyLookup.get(key.toLowerCase());
    return originalKey !== undefined ? this.map.get(originalKey) : undefined;
  }

  set(key: string, value: V): this {
    const norm = key.toLowerCase();
    const existingKey = this.keyLookup.get(norm);
    if (existingKey !== undefined) {
      // Key exists, update value using existing casing
      this.map.set(existingKey, value);
    } else {
      // New key, store with original casing
      this.keyLookup.set(norm, key);
      this.map.set(key, value);
    }
    return this;
  }

  has(key: string): boolean {
    return this.keyLookup.has(key.toLowerCase());
  }

  delete(key: string): boolean {
    const norm = key.toLowerCase();
    const originalKey = this.keyLookup.get(norm);
    if (originalKey !== undefined) {
      this.keyLookup.delete(norm);
      return this.map.delete(originalKey);
    }
    return false;
  }

  clear(): void {
    this.map.clear();
    this.keyLookup.clear();
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[string, V]> {
    return this.map.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, V]> {
    return this.map[Symbol.iterator]();
  }

  forEach(
    callback: (value: V, key: string, map: CaseInsensitiveMap<V>) => void,
  ): void {
    for (const [key, value] of this.map) {
      callback(value, key, this);
    }
  }

  get [Symbol.toStringTag](): string {
    return "CaseInsensitiveMap";
  }

  getOriginalKey(key: string): string | undefined {
    return this.keyLookup.get(key.toLowerCase());
  }
}

/**
 * Set with case-insensitive membership checks.
 */
export class CaseInsensitiveSet {
  private set = new Set<string>();

  constructor(values?: Iterable<string> | null) {
    if (values) {
      for (const value of values) {
        this.add(value);
      }
    }
  }

  get size(): number {
    return this.set.size;
  }

  add(value: string): this {
    this.set.add(value.toLowerCase());
    return this;
  }

  has(value: string): boolean {
    return this.set.has(value.toLowerCase());
  }

  delete(value: string): boolean {
    return this.set.delete(value.toLowerCase());
  }

  clear(): void {
    this.set.clear();
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this.set[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return "CaseInsensitiveSet";
  }
}

/** Normalize path separators only (backslashes to forward slashes). */
export function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Normalize path for use as a cache key (slashes + lowercase). */
export function normalizePath(path: string): string {
  return normalizeSlashes(path).toLowerCase();
}

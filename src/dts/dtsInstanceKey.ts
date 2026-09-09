/** Reusable compatibility snapshot. Steady frames compare scalar values in
 * place; serialization and key allocation happen only when a value changes. */
export class DTSInstanceKey {
  private values: unknown[] = [];
  private cursor = 0;
  private changed = false;
  private key?: { id: number };

  begin(): this {
    this.cursor = 0;
    this.changed = false;
    return this;
  }

  add(value: unknown): this {
    if (this.values[this.cursor] !== value) {
      this.values[this.cursor] = value;
      this.changed = true;
    }
    this.cursor++;
    return this;
  }

  end(): number {
    if (this.values.length !== this.cursor) {
      this.values.length = this.cursor;
      this.changed = true;
    }
    if (this.changed || !this.key) {
      const serialized = JSON.stringify(this.values);
      let key = keys.get(serialized)?.deref();
      if (key === undefined) {
        key = { id: ++nextKey };
        const ref = new WeakRef(key);
        keys.set(serialized, ref);
        cleanup.register(key, { serialized, ref });
      }
      this.key = key;
    }
    return this.key.id;
  }
}

// Keep matching IDs while any snapshot uses them. Clearing a size-limited
// interner would prevent newly loaded shapes from joining older live batches.
const keys = new Map<string, WeakRef<{ id: number }>>();
const cleanup = new FinalizationRegistry<{
  serialized: string;
  ref: WeakRef<{ id: number }>;
}>(({ serialized, ref }) => {
  if (keys.get(serialized) === ref) keys.delete(serialized);
});
let nextKey = 0;

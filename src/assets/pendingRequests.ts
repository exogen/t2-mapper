interface Subscriber<V> {
  onLoad?: (value: V) => void;
  onError?: (error: unknown) => void;
}

/** Shares unfinished work only. Finished-value caching and disposal belong to
 * the caller; cached callbacks can therefore retain their synchronous contract. */
export class PendingRequests<K, V> {
  private readonly entries = new Map<K, Subscriber<V>[]>();
  private readonly observerError: (error: unknown, key: K) => void;

  constructor(observerError: (error: unknown, key: K) => void) {
    this.observerError = observerError;
  }

  get size(): number {
    return this.entries.size;
  }

  request(
    key: K,
    start: (
      resolve: (value: V) => void,
      reject: (error: unknown) => void,
    ) => void,
    onLoad?: Subscriber<V>["onLoad"],
    onError?: Subscriber<V>["onError"],
  ): void {
    const pending = this.entries.get(key);
    if (pending) {
      if (onLoad || onError) pending.push({ onLoad, onError });
      return;
    }
    const subscribers = onLoad || onError ? [{ onLoad, onError }] : [];
    this.entries.set(key, subscribers);
    let settled = false;
    const settle = (notify: (subscriber: Subscriber<V>) => void) => {
      if (settled) return;
      settled = true;
      this.entries.delete(key);
      // Remove before notifying: an error observer can immediately retry.
      for (const subscriber of subscribers) {
        try {
          notify(subscriber);
        } catch (error) {
          try {
            this.observerError(error, key);
          } catch {
            // Logging must not strand another subscriber either.
          }
        }
      }
      subscribers.length = 0;
    };
    try {
      start(
        (value) => settle((subscriber) => subscriber.onLoad?.(value)),
        (error) => settle((subscriber) => subscriber.onError?.(error)),
      );
    } catch (error) {
      // Preserve synchronous loader throws without leaving a stuck request.
      if (!settled) {
        settled = true;
        this.entries.delete(key);
      }
      throw error;
    }
  }
}

import { getReconnectDelayMs, normalizeAddress } from "./shared.js";

/** Failed connections are remembered independently of sockets and watch sessions. */
export class ConnectionCooldowns {
  private entries = new Map<
    string,
    { until: number; reason?: string; timer: ReturnType<typeof setTimeout> }
  >();

  recordFailure(address: string, reason?: string): void {
    const key = normalizeAddress(address);
    const previous = this.entries.get(key);
    const until = Math.max(
      previous?.until ?? 0,
      Date.now() + getReconnectDelayMs(reason),
    );
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(
      () => this.entries.delete(key),
      until - Date.now(),
    );
    timer.unref();
    this.entries.set(key, {
      until,
      reason: reason?.trim() || undefined,
      timer,
    });
  }

  getMessage(address: string): string | undefined {
    const entry = this.entries.get(normalizeAddress(address));
    if (!entry || entry.until <= Date.now()) return;
    return (
      entry.reason ??
      "Unable to connect to this server. Please try again later."
    );
  }
}

/** Shared by every game connection in this relay process. */
export const connectionCooldowns = new ConnectionCooldowns();

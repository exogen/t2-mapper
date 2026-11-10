import { createAuthClient } from "better-auth/client";

export const appApiBaseUrl =
  process.env.AUTH_API_URL || "http://localhost:8765";
export const AUTH_REQUEST_TIMEOUT_MS = 20_000;
export const authClient = createAuthClient({
  baseURL: appApiBaseUrl,
  fetchOptions: { credentials: "include" },
});

export const DISCORD_SIGN_IN_STORAGE_KEY = "mapgenius.discord-sign-in";
type SignInEvent = "opened" | "complete" | "error";

export function readDiscordSignInAttempt(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

export function discordSignInUrl(
  attemptId: string,
  outcome?: "complete" | "error",
): URL {
  const base = new URL(import.meta.env.BASE_URL || "/", window.location.href);
  const url = new URL("account/sign-in/", base);
  if (outcome === "complete") url.searchParams.set("complete", "1");
  if (outcome === "error") url.searchParams.set("accountError", "discord");
  url.hash = attemptId;
  return url;
}

function channelName(attemptId: string): string {
  return `${DISCORD_SIGN_IN_STORAGE_KEY}:${attemptId}`;
}

/** A notification only: the main window must verify its session with the relay. */
export function notifyDiscordSignIn(
  attemptId: string,
  event: SignInEvent,
): void {
  const message = { attemptId, event };
  try {
    const channel = new BroadcastChannel(channelName(attemptId));
    channel.postMessage(message);
    channel.close();
    return;
  } catch {
    // A storage event also reaches a parent window that never lost focus.
  }
  try {
    const key = channelName(attemptId);
    localStorage.setItem(key, JSON.stringify(message));
    localStorage.removeItem(key);
  } catch {
    // The parent also verifies its session when it regains focus.
  }
}

export interface DiscordSignInWindow {
  url: string;
  opened: boolean;
  focus(): boolean;
  dispose(): void;
}

/** Open synchronously from a user gesture; never navigate the game window. */
export function openDiscordSignIn({
  onEvent,
  onUnavailable,
  onExpired,
}: {
  onEvent: (event: SignInEvent) => void;
  onUnavailable: () => void;
  onExpired: () => void;
}): DiscordSignInWindow {
  const attemptId = crypto.randomUUID();
  const url = discordSignInUrl(attemptId).href;
  let disposed = false;
  let channel: BroadcastChannel | undefined;
  let popup: Window | null = null;
  const receive = (message: unknown) => {
    if (
      disposed ||
      typeof message !== "object" ||
      message === null ||
      !("attemptId" in message) ||
      message.attemptId !== attemptId ||
      !("event" in message) ||
      (message.event !== "opened" &&
        message.event !== "complete" &&
        message.event !== "error")
    )
      return;
    clearTimeout(openingTimeout);
    onEvent(message.event);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== channelName(attemptId) || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed notifications.
    }
  };
  // Subscribe before opening: a cached completion page can respond immediately.
  window.addEventListener("storage", onStorage);
  try {
    channel = new BroadcastChannel(channelName(attemptId));
    channel.onmessage = (event) => receive(event.data);
  } catch {
    // Storage events remain available if BroadcastChannel is blocked.
  }
  const openingTimeout = setTimeout(onUnavailable, 15_000);
  const expiryTimeout = setTimeout(() => {
    dispose();
    onExpired();
  }, 10 * 60_000);
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(openingTimeout);
    clearTimeout(expiryTimeout);
    channel?.close();
    window.removeEventListener("storage", onStorage);
  }
  const width = 500;
  const height = 650;
  let features = `popup,width=${width},height=${height}`;
  try {
    const { screenX, screenY, outerWidth, outerHeight } = window;
    const left = Math.round(screenX + (outerWidth - width) / 2);
    const top = Math.round(screenY + (outerHeight - height) / 2);
    if (
      outerWidth > 0 &&
      outerHeight > 0 &&
      Number.isFinite(left) &&
      Number.isFinite(top)
    )
      features += `,left=${left},top=${top}`;
  } catch {
    // Positioning is optional; unavailable geometry must not prevent sign-in.
  }
  try {
    popup = window.open(url, "_blank", features);
  } catch {
    // An ordinary link remains usable if opening a popup is unavailable.
  }
  if (!popup) clearTimeout(openingTimeout);
  return {
    url,
    opened: Boolean(popup),
    focus() {
      if (disposed) return false;
      try {
        if (popup && !popup.closed) {
          popup.focus();
          return true;
        }
      } catch {
        // COOP can sever the WindowProxy. Completion does not depend on it.
      }
      return false;
    },
    dispose,
  };
}

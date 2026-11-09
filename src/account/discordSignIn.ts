export const DISCORD_SIGN_IN_PATH = "account/sign-in/";
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
  const url = new URL(DISCORD_SIGN_IN_PATH, base);
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
    // Storage events cover browsers that cannot create a BroadcastChannel.
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
      !["opened", "complete", "error"].includes(message.event as string)
    )
      return;
    clearTimeout(openingTimeout);
    onEvent(message.event as SignInEvent);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== channelName(attemptId) || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      // Ignore unrelated or malformed storage values.
    }
  };
  // Subscribe before opening: a cached completion page can respond immediately.
  window.addEventListener("storage", onStorage);
  try {
    channel = new BroadcastChannel(channelName(attemptId));
    channel.onmessage = (event) => receive(event.data);
  } catch {
    // The same-origin storage listener remains available.
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
  try {
    popup = window.open(url, "_blank", "popup,width=500,height=650");
  } catch {
    // An ordinary link remains usable if opening a popup is unavailable.
  }
  if (!popup) clearTimeout(openingTimeout);
  return {
    url,
    opened: popup !== null,
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

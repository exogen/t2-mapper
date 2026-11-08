import { createAuthClient } from "better-auth/client";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AccountUser } from "../../relay/accountTypes";

export interface AppAccountState {
  status: "idle" | "loading" | "ready" | "error";
  enabled: boolean | null;
  user: AccountUser | null;
  pending: "sign-in" | "sign-out" | null;
  error: string | null;
}

export const appApiBaseUrl =
  process.env.AUTH_API_URL || "http://localhost:8765";
const authClient = createAuthClient({
  baseURL: appApiBaseUrl,
  fetchOptions: { credentials: "include" },
});

export const appAccountStore = createStore<AppAccountState>(() => ({
  status: "idle",
  enabled: null,
  user: null,
  pending: null,
  error: null,
}));

export function useAppAccount<T>(selector: (state: AppAccountState) => T): T {
  return useStore(appAccountStore, selector);
}

let refreshRequest: Promise<void> | null = null;
let refreshGeneration = 0;
let lastRefreshAt: number | null = null;
const FOCUS_REFRESH_INTERVAL_MS = 5 * 60_000;

function invalidateRefresh() {
  refreshGeneration++;
  refreshRequest = null;
}

/** Re-read the app session, without making a request to Discord. */
export function refreshAccount({ onlyIfStale = false } = {}): Promise<void> {
  if (appAccountStore.getState().pending) return Promise.resolve();
  if (refreshRequest) return refreshRequest;
  const now = Date.now();
  if (
    onlyIfStale &&
    lastRefreshAt !== null &&
    now - lastRefreshAt < FOCUS_REFRESH_INTERVAL_MS
  )
    return Promise.resolve();
  lastRefreshAt = now;
  const generation = refreshGeneration;
  // Revalidate a known session in the background so focus changes do not
  // unmount admin dialogs or reset their unsaved fields.
  appAccountStore.setState((state) => ({
    status: state.status === "ready" ? "ready" : "loading",
    error: null,
  }));
  const request = (async () => {
    try {
      const response = await fetch(
        new URL("/api/account", appApiBaseUrl).href,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      // Older relays have no account API. Keep their existing guest UI usable.
      let account: { enabled: boolean; user: AccountUser | null } = {
        enabled: false,
        user: null,
      };
      if (response.status !== 404) {
        if (!response.ok) throw new Error("Account request failed");
        account = await response.json();
      }
      if (typeof account.enabled !== "boolean") {
        throw new Error("Invalid account response");
      }
      if (generation !== refreshGeneration) return;
      appAccountStore.setState({
        status: "ready",
        enabled: account.enabled,
        user: account.enabled ? account.user : null,
        error: null,
      });
    } catch {
      if (generation !== refreshGeneration) return;
      // A stale profile must never keep displaying admin controls after the
      // current session could not be verified.
      appAccountStore.setState({
        status: "error",
        user: null,
        error: "Sign-in is unavailable. Please try again.",
      });
    }
  })();
  refreshRequest = request;
  void request.finally(() => {
    if (refreshRequest === request) refreshRequest = null;
  });
  return request;
}

export async function signInWithDiscord(): Promise<void> {
  if (appAccountStore.getState().pending) return;
  invalidateRefresh();
  appAccountStore.setState({ pending: "sign-in", error: null });
  try {
    const callbackUrl = new URL(window.location.href);
    callbackUrl.searchParams.delete("accountError");
    const errorUrl = new URL(callbackUrl);
    errorUrl.searchParams.set("accountError", "discord");
    const result = await authClient.signIn.social({
      provider: "discord",
      callbackURL: callbackUrl.href,
      errorCallbackURL: errorUrl.href,
    });
    if (result.error || !result.data?.url) {
      throw new Error("Discord sign-in failed");
    }
    // The SDK has started navigation. Clear the request state so browser Back
    // cannot restore a page permanently stuck on "Opening Discord…".
    appAccountStore.setState({ pending: null });
  } catch {
    appAccountStore.setState({
      pending: null,
      error: "Could not start Discord sign-in. Please try again.",
    });
  }
}

export async function signOutAccount(): Promise<void> {
  if (appAccountStore.getState().pending) return;
  invalidateRefresh();
  appAccountStore.setState({ pending: "sign-out", error: null });
  try {
    const result = await authClient.signOut();
    if (result.error) throw new Error("Sign-out failed");
    appAccountStore.setState({ status: "ready", pending: null, user: null });
  } catch {
    appAccountStore.setState({
      pending: null,
      error: "Could not sign out. Please try again.",
    });
  }
}

/** Consume our callback error parameters; keep the selected map/demo URL intact. */
export function consumeAccountSignInError(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("accountError")) return;
  url.searchParams.delete("accountError");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState(window.history.state, "", url.href);
  appAccountStore.setState({
    error: "Discord sign-in was cancelled or failed. Please try again.",
  });
}

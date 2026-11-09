import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AccountUser } from "../../relay/accountTypes";
import {
  appApiBaseUrl,
  AUTH_REQUEST_TIMEOUT_MS,
  authClient,
} from "../account/authClient";
import {
  openDiscordSignIn,
  type DiscordSignInWindow,
} from "../account/discordSignIn";

export { appApiBaseUrl } from "../account/authClient";

export interface AppAccountState {
  status: "idle" | "loading" | "ready" | "error";
  enabled: boolean | null;
  user: AccountUser | null;
  pending: "sign-in" | "sign-out" | null;
  error: string | null;
  signInUrl: string | null;
}

export const appAccountStore = createStore<AppAccountState>(() => ({
  status: "idle",
  enabled: null,
  user: null,
  pending: null,
  error: null,
  signInUrl: null,
}));

export function useAppAccount<T>(selector: (state: AppAccountState) => T): T {
  return useStore(appAccountStore, selector);
}

let refreshRequest: Promise<void> | null = null;
let refreshGeneration = 0;
let lastRefreshAt: number | null = null;
const FOCUS_REFRESH_INTERVAL_MS = 5 * 60_000;
let signInWindow: DiscordSignInWindow | null = null;

function finishSignInAttempt() {
  signInWindow?.dispose();
  signInWindow = null;
}

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  const request = (async () => {
    try {
      const response = await fetch(
        new URL("/api/account", appApiBaseUrl).href,
        {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
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
      if (account.user) finishSignInAttempt();
      appAccountStore.setState({
        status: "ready",
        enabled: account.enabled,
        user: account.enabled ? account.user : null,
        error: null,
        signInUrl: account.user ? null : appAccountStore.getState().signInUrl,
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
    } finally {
      clearTimeout(timeout);
    }
  })();
  refreshRequest = request;
  void request.finally(() => {
    if (refreshRequest === request) refreshRequest = null;
  });
  return request;
}

export function refreshAccountOnFocus(): Promise<void> {
  // While sign-in is open, focus is also a fallback for blocked cross-window
  // messaging. This never navigates or recreates the game engine.
  if (signInWindow && appAccountStore.getState().pending === "sign-in") {
    // A browser can block both completion transports, including the initial
    // "opened" notification. Returning from that popup must still verify login.
    appAccountStore.setState({ pending: null });
  }
  return refreshAccount({ onlyIfStale: signInWindow === null });
}

async function verifyDiscordSignIn(): Promise<void> {
  finishSignInAttempt();
  invalidateRefresh();
  const generation = refreshGeneration;
  await refreshAccount();
  const account = appAccountStore.getState();
  if (
    generation === refreshGeneration &&
    account.status === "ready" &&
    !account.user
  ) {
    appAccountStore.setState({
      error: "Sign-in could not be verified. Please try again.",
    });
  }
}

export function signInWithDiscord(): void {
  if (appAccountStore.getState().pending) return;
  if (signInWindow?.focus()) return;
  finishSignInAttempt();
  invalidateRefresh();
  appAccountStore.setState({
    pending: "sign-in",
    error: null,
    signInUrl: null,
  });
  try {
    signInWindow = openDiscordSignIn({
      onEvent(event) {
        appAccountStore.setState({
          pending: null,
          error: null,
          signInUrl: null,
        });
        if (event === "complete") {
          void verifyDiscordSignIn();
        } else if (event === "error") {
          appAccountStore.setState({
            error: "Discord sign-in was cancelled or failed. Please try again.",
          });
        }
      },
      onUnavailable() {
        appAccountStore.setState({
          pending: null,
          signInUrl: signInWindow?.url ?? null,
          error: "Could not open sign-in. Try opening it in a new tab.",
        });
      },
      onExpired() {
        signInWindow = null;
        appAccountStore.setState({ pending: null, signInUrl: null });
      },
    });
    if (!signInWindow.opened) {
      appAccountStore.setState({
        pending: null,
        signInUrl: signInWindow.url,
        error: "Your browser blocked the sign-in window.",
      });
    }
  } catch {
    finishSignInAttempt();
    appAccountStore.setState({
      pending: null,
      error: "Could not start Discord sign-in. Please try again.",
    });
  }
}

export async function signOutAccount(): Promise<void> {
  if (appAccountStore.getState().pending) return;
  finishSignInAttempt();
  invalidateRefresh();
  appAccountStore.setState({ pending: "sign-out", error: null });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    const result = await authClient.signOut({
      fetchOptions: { signal: controller.signal },
    });
    if (result.error) throw new Error("Sign-out failed");
    appAccountStore.setState({
      status: "ready",
      pending: null,
      user: null,
      signInUrl: null,
    });
  } catch {
    appAccountStore.setState({
      pending: null,
      error: "Could not sign out. Please try again.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

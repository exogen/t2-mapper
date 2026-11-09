import { afterEach, beforeEach, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ social: vi.fn(), signOut: vi.fn() }));
const popup = vi.hoisted(() => ({
  open: vi.fn(),
  focus: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../account/authClient", () => ({
  appApiBaseUrl: "https://api.example.com",
  AUTH_REQUEST_TIMEOUT_MS: 20_000,
  authClient: {
    signIn: { social: client.social },
    signOut: client.signOut,
  },
  openDiscordSignIn: popup.open,
}));

let account: typeof import("./appAccountStore");
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let replaceState: ReturnType<typeof vi.fn>;
const admin = {
  id: "user-1",
  name: "Example player",
  image: "https://cdn.discordapp.com/example.png",
  role: "admin" as const,
  discordId: "123456789012345678",
  discordUsername: "example_player",
};

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("AUTH_API_URL", "https://api.example.com");
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { href: "https://example.com/watch/?server=abc#camera" },
    history: { state: { keep: true }, replaceState },
  });
  client.social.mockReset();
  client.signOut.mockReset();
  popup.open.mockReset();
  popup.focus.mockReset().mockReturnValue(true);
  popup.dispose.mockReset();
  popup.open.mockReturnValue({
    url: "https://example.com/account/sign-in/#12345678-1234-4123-8123-123456789abc",
    opened: true,
    focus: popup.focus,
    dispose: popup.dispose,
  });
  account = await import("./appAccountStore");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("loads a verified app session with its cookie and never caches the response", async () => {
  fetchMock.mockResolvedValue(Response.json({ enabled: true, user: admin }));
  await account.refreshAccount();
  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.example.com/api/account",
    {
      credentials: "include",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    },
  );
  expect(account.appAccountStore.getState()).toMatchObject({
    enabled: true,
    status: "ready",
    user: admin,
  });
});

function stalledRequest(
  _input: Parameters<typeof fetch>[0],
  options?: RequestInit,
): ReturnType<typeof fetch> {
  return new Promise((_resolve, reject) => {
    const signal = options?.signal;
    if (!signal) throw new Error("Expected an account request signal");
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

it("times out a stalled account request, clears its observer, and permits an immediate retry", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementationOnce(stalledRequest);
  const request = account.refreshAccount();
  const duplicate = account.refreshAccount();
  expect(duplicate).toBe(request);
  await vi.advanceTimersByTimeAsync(19_999);
  expect(account.appAccountStore.getState().status).toBe("loading");
  await vi.advanceTimersByTimeAsync(1);
  await request;
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "error",
    user: null,
    error: "Sign-in is unavailable. Please try again.",
  });
  expect(vi.getTimerCount()).toBe(0);
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    user: admin,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not let an older timed-out request clear or overwrite a newer sign-in verification", async () => {
  vi.useFakeTimers();
  account.appAccountStore.setState({ status: "ready", enabled: true });
  fetchMock.mockImplementationOnce(stalledRequest);
  const older = account.refreshAccount();
  await vi.advanceTimersByTimeAsync(10_000);
  account.signInWithDiscord();
  let resolveVerification!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
  );
  signInEvent("complete");
  const verification = account.refreshAccount();
  await vi.advanceTimersByTimeAsync(10_000);
  await older;
  expect(account.refreshAccount()).toBe(verification);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    error: null,
  });
  resolveVerification(Response.json({ enabled: true, user: admin }));
  await verification;
  expect(account.appAccountStore.getState().user).toEqual(admin);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["idle", "error"] as const)(
  "shows loading without removing the previous error while resolving an account from %s",
  async (status) => {
    account.appAccountStore.setState({
      status,
      error: status === "error" ? "Previous request failed" : null,
    });
    let resolveRefresh!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const request = account.refreshAccount();

    expect(account.appAccountStore.getState()).toMatchObject({
      status: "loading",
      user: null,
      error: status === "error" ? "Previous request failed" : null,
    });
    resolveRefresh(Response.json({ enabled: true, user: admin }));
    await request;
    expect(account.appAccountStore.getState()).toMatchObject({
      status: "ready",
      user: admin,
      error: null,
    });
  },
);

it("keeps a verified session ready throughout a coalesced background refresh", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccount();
  let resolveRefresh!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
  );
  const statuses: string[] = [];
  const unsubscribe = account.appAccountStore.subscribe((state) => {
    statuses.push(state.status);
  });

  const request = account.refreshAccount();
  const duplicate = account.refreshAccount();

  expect(duplicate).toBe(request);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    user: admin,
  });
  resolveRefresh(Response.json({ enabled: true, user: admin }));
  await request;
  unsubscribe();
  expect(statuses.every((status) => status === "ready")).toBe(true);
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    user: admin,
  });
});

it("checks on focus only after five minutes, with no polling between focus events", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  fetchMock.mockImplementation(async () =>
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccount({ onlyIfStale: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await account.refreshAccount({ onlyIfStale: true });
  vi.setSystemTime(Date.now() + 5 * 60_000 - 1);
  await account.refreshAccount({ onlyIfStale: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  vi.setSystemTime(Date.now() + 1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await account.refreshAccount({ onlyIfStale: true });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(account.appAccountStore.getState().status).toBe("ready");
});

it("lets explicit refreshes bypass and restart the focus cooldown", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  fetchMock.mockImplementation(async () =>
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccount();
  vi.setSystemTime(Date.now() + 4 * 60_000);
  await account.refreshAccount();
  expect(fetchMock).toHaveBeenCalledTimes(2);

  vi.setSystemTime(Date.now() + 60_000);
  await account.refreshAccount({ onlyIfStale: true });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("limits failed focus checks while allowing an immediate manual retry", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Offline"));
  await account.refreshAccount({ onlyIfStale: true });
  await account.refreshAccount({ onlyIfStale: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fetchMock.mockResolvedValue(Response.json({ enabled: true, user: admin }));
  await account.refreshAccount();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    user: admin,
  });
});

it.each([
  ["expired session", null],
  ["revoked admin role", { ...admin, role: "user" as const }],
])("applies %s when background refresh completes", async (_label, user) => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccount();
  let resolveRefresh!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
  );

  const request = account.refreshAccount();

  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    user: admin,
  });
  resolveRefresh(Response.json({ enabled: true, user }));
  await request;
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    user,
  });
});

it("keeps guest controls usable when accounts are disabled", async () => {
  fetchMock.mockResolvedValue(Response.json({ enabled: false, user: null }));
  await account.refreshAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    enabled: false,
    user: null,
    error: null,
    status: "ready",
  });
  expect(client.social).not.toHaveBeenCalled();
});

it("keeps account support unknown after an initial CORS failure and discovers it on retry", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await account.refreshAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    enabled: null,
    status: "error",
    user: null,
  });

  fetchMock.mockResolvedValueOnce(Response.json({ enabled: true, user: null }));
  await account.refreshAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    enabled: true,
    status: "ready",
    user: null,
    error: null,
  });
});

function signInEvent(event: "opened" | "complete" | "error") {
  popup.open.mock.calls.at(-1)![0].onEvent(event);
}

it("opens sign-in synchronously without navigating the demo or calling Discord from the game", () => {
  account.signInWithDiscord();
  expect(popup.open).toHaveBeenCalledTimes(1);
  expect(client.social).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(window.location.href).toBe(
    "https://example.com/watch/?server=abc#camera",
  );
  expect(replaceState).not.toHaveBeenCalled();
  expect(account.appAccountStore.getState().pending).toBe("sign-in");
});

it("coalesces startup clicks and focuses the same popup after it opens", () => {
  account.signInWithDiscord();
  account.signInWithDiscord();
  expect(popup.open).toHaveBeenCalledTimes(1);
  signInEvent("opened");
  expect(account.appAccountStore.getState().pending).toBe(null);
  account.signInWithDiscord();
  expect(popup.focus).toHaveBeenCalledOnce();
  expect(popup.open).toHaveBeenCalledTimes(1);
});

it("offers a separate-tab fallback when the popup is blocked", () => {
  const signInUrl =
    "https://example.com/account/sign-in/#12345678-1234-4123-8123-123456789abc";
  popup.open.mockReturnValueOnce({
    url: signInUrl,
    opened: false,
    focus: popup.focus,
    dispose: popup.dispose,
  });
  account.signInWithDiscord();
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    error: "Your browser blocked the sign-in window.",
    signInUrl,
  });
  signInEvent("opened");
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    error: null,
    signInUrl: null,
  });
});

it("replaces a closed popup without letting the old attempt hold the UI busy", () => {
  account.signInWithDiscord();
  signInEvent("opened");
  popup.focus.mockReturnValueOnce(false);
  account.signInWithDiscord();
  expect(popup.dispose).toHaveBeenCalledOnce();
  expect(popup.open).toHaveBeenCalledTimes(2);
  expect(account.appAccountStore.getState().pending).toBe("sign-in");
});

it("clears pending state after a startup exception so the user can retry", () => {
  popup.open.mockImplementationOnce(() => {
    throw new Error("Private browser detail");
  });
  account.signInWithDiscord();
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    error: "Could not start Discord sign-in. Please try again.",
  });
  account.signInWithDiscord();
  expect(popup.open).toHaveBeenCalledTimes(2);
});

it("verifies the cookie session on completion after clearing busy state, without navigating", async () => {
  account.appAccountStore.setState({ status: "ready", enabled: true });
  fetchMock.mockImplementation(async () => {
    expect(account.appAccountStore.getState().pending).toBeNull();
    return Response.json({ enabled: true, user: admin });
  });
  account.signInWithDiscord();
  signInEvent("complete");
  await account.refreshAccount();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    status: "ready",
    user: admin,
    signInUrl: null,
  });
  expect(popup.dispose).toHaveBeenCalledOnce();
  expect(window.location.href).toBe(
    "https://example.com/watch/?server=abc#camera",
  );
  expect(replaceState).not.toHaveBeenCalled();
});

it("ignores an older guest focus refresh after authentication even when the startup notification was lost", async () => {
  account.appAccountStore.setState({ status: "ready", enabled: true });
  account.signInWithDiscord();
  let resolveOld!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const oldRequest = account.refreshAccountOnFocus();
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  signInEvent("complete");
  await account.refreshAccount();
  resolveOld(Response.json({ enabled: true, user: null }));
  await oldRequest;
  expect(account.appAccountStore.getState().user).toEqual(admin);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("keeps authentication unverified when completion arrives while the relay is offline", async () => {
  account.appAccountStore.setState({ status: "ready", enabled: true });
  fetchMock.mockRejectedValue(new TypeError("Offline"));
  account.signInWithDiscord();
  signInEvent("complete");
  await account.refreshAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    status: "error",
    user: null,
    error: "Sign-in is unavailable. Please try again.",
  });
  expect(window.location.href).toBe(
    "https://example.com/watch/?server=abc#camera",
  );
});

it("does not trust a completion notification when the relay still reports an anonymous session", async () => {
  account.appAccountStore.setState({ status: "ready", enabled: true });
  fetchMock.mockResolvedValue(Response.json({ enabled: true, user: null }));
  account.signInWithDiscord();
  signInEvent("complete");
  await account.refreshAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    pending: null,
    user: null,
    error: "Sign-in could not be verified. Please try again.",
  });
});

it.each(["retry", "sign-out"] as const)(
  "ignores a superseded sign-in verification failure after %s",
  async (action) => {
    account.appAccountStore.setState({ status: "ready", enabled: true });
    let resolveVerification!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVerification = resolve;
        }),
    );
    account.signInWithDiscord();
    signInEvent("complete");
    const verification = account.refreshAccount();
    if (action === "retry") account.signInWithDiscord();
    else {
      client.signOut.mockResolvedValue({
        data: { success: true },
        error: null,
      });
      await account.signOutAccount();
    }
    resolveVerification(Response.json({ enabled: true, user: null }));
    await verification;
    expect(account.appAccountStore.getState()).toMatchObject({
      pending: action === "retry" ? "sign-in" : null,
      user: null,
      error: null,
    });
  },
);

it("retains the manual-tab link when a focus refresh clears the popup-blocked error", async () => {
  account.appAccountStore.setState({ status: "ready", enabled: true });
  const signInUrl =
    "https://example.com/account/sign-in/#12345678-1234-4123-8123-123456789abc";
  popup.open.mockReturnValueOnce({
    url: signInUrl,
    opened: false,
    focus: popup.focus,
    dispose: popup.dispose,
  });
  account.signInWithDiscord();
  fetchMock.mockResolvedValue(Response.json({ enabled: true, user: null }));
  await account.refreshAccountOnFocus();
  expect(account.appAccountStore.getState()).toMatchObject({
    error: null,
    signInUrl,
  });
});

it("refreshes on focus during sign-in even before the normal cooldown expires", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ enabled: true, user: null }));
  await account.refreshAccount();
  account.signInWithDiscord();
  signInEvent("opened");
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccountOnFocus();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(account.appAccountStore.getState().user).toEqual(admin);
  await account.refreshAccountOnFocus();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("verifies a fast popup login even when every startup and completion notification is lost", async () => {
  account.appAccountStore.setState({ status: "ready", enabled: true });
  account.signInWithDiscord();
  expect(account.appAccountStore.getState().pending).toBe("sign-in");
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  // The app owns focus checks, independently of the sidebar's React Activity.
  await account.refreshAccountOnFocus();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    user: admin,
  });
  expect(popup.dispose).toHaveBeenCalledOnce();
});

it("coalesces focus checks while an anonymous sign-in attempt stays active", async () => {
  account.appAccountStore.setState({ status: "ready", enabled: true });
  account.signInWithDiscord();
  let resolveGuest!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveGuest = resolve;
      }),
  );
  const request = account.refreshAccountOnFocus();
  expect(account.refreshAccountOnFocus()).toBe(request);
  expect(fetchMock).toHaveBeenCalledOnce();
  resolveGuest(Response.json({ enabled: true, user: null }));
  await request;
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    user: null,
  });
  expect(popup.dispose).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  signInEvent("complete");
  await account.refreshAccount();
  expect(account.appAccountStore.getState().user).toEqual(admin);
});

it("does not bypass an in-progress sign-out when the window regains focus", async () => {
  account.appAccountStore.setState({ status: "ready", enabled: true });
  account.signInWithDiscord();
  signInEvent("opened");
  let resolveSignOut!: (result: unknown) => void;
  client.signOut.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSignOut = resolve;
      }),
  );
  const signOut = account.signOutAccount();
  await account.refreshAccountOnFocus();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(account.appAccountStore.getState().pending).toBe("sign-out");
  resolveSignOut({ data: { success: true }, error: null });
  await signOut;
});

it("allows retry inside the popup after a safe cancellation/error notification", () => {
  account.signInWithDiscord();
  signInEvent("error");
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    user: null,
    error: "Discord sign-in was cancelled or failed. Please try again.",
  });
  expect(popup.dispose).not.toHaveBeenCalled();
  signInEvent("opened");
  expect(account.appAccountStore.getState().error).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("restores a usable button and fallback after the popup page fails to load", () => {
  account.signInWithDiscord();
  popup.open.mock.calls[0][0].onUnavailable();
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    error: "Could not open sign-in. Try opening it in a new tab.",
    signInUrl: expect.stringContaining("/account/sign-in/"),
  });
});

it("expires an abandoned sign-in observer without leaving busy state or a stale fallback", () => {
  account.signInWithDiscord();
  popup.open.mock.calls[0][0].onExpired();
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    signInUrl: null,
  });
  account.signInWithDiscord();
  expect(popup.open).toHaveBeenCalledTimes(2);
});

it("does not restore a signed-out account from an older session request", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccount();
  let resolveOld!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const oldRequest = account.refreshAccount();
  client.signOut.mockResolvedValue({ data: { success: true }, error: null });
  await account.signOutAccount();
  resolveOld(Response.json({ enabled: true, user: admin }));
  await oldRequest;
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    user: null,
    status: "ready",
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("clears a successfully revoked session without another account request", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccount();
  fetchMock.mockClear();
  fetchMock.mockRejectedValue(new Error("Offline"));
  client.signOut.mockResolvedValue({ data: { success: true }, error: null });

  await account.signOutAccount();

  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    enabled: true,
    user: null,
    pending: null,
    error: null,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("removes stale admin controls if the session can no longer be verified", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ enabled: true, user: admin }),
  );
  await account.refreshAccount();
  let rejectRefresh!: (error: Error) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectRefresh = reject;
      }),
  );
  const request = account.refreshAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    status: "ready",
    user: admin,
  });
  rejectRefresh(new Error("Offline"));
  await request;
  expect(account.appAccountStore.getState()).toMatchObject({
    enabled: true,
    status: "error",
    user: null,
    error: "Sign-in is unavailable. Please try again.",
  });
});

it("keeps the current account visible when sign-out fails", async () => {
  fetchMock.mockResolvedValue(Response.json({ enabled: true, user: admin }));
  await account.refreshAccount();
  client.signOut.mockResolvedValue({ error: { message: "Offline" } });
  await account.signOutAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    user: admin,
    pending: null,
    error: "Could not sign out. Please try again.",
  });
});

it("bounds the whole sign-out action and retains the profile for retry after an abort", async () => {
  vi.useFakeTimers();
  account.appAccountStore.setState({
    status: "ready",
    enabled: true,
    user: admin,
  });
  client.signOut.mockImplementationOnce(
    ({ fetchOptions }: { fetchOptions: { signal: AbortSignal } }) =>
      new Promise((_resolve, reject) => {
        fetchOptions.signal.addEventListener(
          "abort",
          () => reject(fetchOptions.signal.reason),
          { once: true },
        );
      }),
  );
  const request = account.signOutAccount();
  expect(account.appAccountStore.getState().pending).toBe("sign-out");
  await vi.advanceTimersByTimeAsync(19_999);
  expect(account.appAccountStore.getState().pending).toBe("sign-out");
  await vi.advanceTimersByTimeAsync(1);
  await request;
  expect(account.appAccountStore.getState()).toMatchObject({
    user: admin,
    pending: null,
    error: "Could not sign out. Please try again.",
  });
  expect(vi.getTimerCount()).toBe(0);
  client.signOut.mockResolvedValueOnce({
    data: { success: true },
    error: null,
  });
  await account.signOutAccount();
  expect(account.appAccountStore.getState()).toMatchObject({
    user: null,
    pending: null,
    error: null,
  });
  expect(vi.getTimerCount()).toBe(0);
});

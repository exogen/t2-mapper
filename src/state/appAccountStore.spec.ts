import { afterEach, beforeEach, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ social: vi.fn(), signOut: vi.fn() }));
vi.mock("better-auth/client", () => ({
  createAuthClient: () => ({
    signIn: { social: client.social },
    signOut: client.signOut,
  }),
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
    },
  );
  expect(account.appAccountStore.getState()).toMatchObject({
    enabled: true,
    status: "ready",
    user: admin,
  });
});

it.each(["idle", "error"] as const)(
  "shows loading while resolving an account from %s",
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
      error: null,
    });
    resolveRefresh(Response.json({ enabled: true, user: admin }));
    await request;
    expect(account.appAccountStore.getState()).toMatchObject({
      status: "ready",
      user: admin,
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

it.each([200, 404])(
  "keeps guest controls usable when accounts are disabled (%s)",
  async (status) => {
    fetchMock.mockResolvedValue(
      status === 404
        ? new Response(null, { status })
        : Response.json({ enabled: false, user: null }),
    );
    await account.refreshAccount();
    expect(account.appAccountStore.getState()).toMatchObject({
      enabled: false,
      user: null,
      error: null,
      status: "ready",
    });
    expect(client.social).not.toHaveBeenCalled();
  },
);

it("keeps account support unknown after an initial CORS failure and discovers it on retry", async () => {
  // A browser cannot expose an old relay's 404 when it has no CORS headers.
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

it("starts only Discord sign-in and preserves the selected map/demo URL", async () => {
  client.social.mockResolvedValue({
    data: { url: "https://discord.com/oauth2/authorize" },
    error: null,
  });
  await account.signInWithDiscord();
  expect(client.social).toHaveBeenCalledWith({
    provider: "discord",
    callbackURL: "https://example.com/watch/?server=abc#camera",
    errorCallbackURL:
      "https://example.com/watch/?server=abc&accountError=discord#camera",
  });
  expect(account.appAccountStore.getState().pending).toBe(null);
});

it("coalesces duplicate sign-in clicks while the provider request is pending", async () => {
  let resolveSignIn!: (result: unknown) => void;
  client.social.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
  );
  const request = account.signInWithDiscord();
  await account.signInWithDiscord();
  expect(client.social).toHaveBeenCalledTimes(1);
  resolveSignIn({
    data: { url: "https://discord.com/oauth2/authorize" },
    error: null,
  });
  await request;
  expect(account.appAccountStore.getState().pending).toBe(null);
});

it("clears pending sign-in after a provider failure so the user can retry", async () => {
  client.social.mockResolvedValue({
    error: { message: "Private provider detail" },
    data: null,
  });
  await account.signInWithDiscord();
  expect(account.appAccountStore.getState()).toMatchObject({
    pending: null,
    error: "Could not start Discord sign-in. Please try again.",
  });
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

it("consumes sign-in error parameters without clearing app navigation or history state", () => {
  window.location.href =
    "https://example.com/watch/?server=abc&accountError=discord&error=access_denied&error_description=Provider+details#camera";
  account.consumeAccountSignInError();
  expect(replaceState).toHaveBeenCalledWith(
    { keep: true },
    "",
    "https://example.com/watch/?server=abc#camera",
  );
  expect(account.appAccountStore.getState().error).toContain(
    "Discord sign-in was cancelled or failed",
  );
});

it("preserves unrelated error parameters without the sign-in marker", () => {
  window.location.href =
    "https://example.com/watch/?server=abc&error=other&error_description=Unrelated#camera";
  account.consumeAccountSignInError();
  expect(replaceState).not.toHaveBeenCalled();
  expect(account.appAccountStore.getState().error).toBeNull();
});

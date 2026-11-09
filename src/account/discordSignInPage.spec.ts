import { afterEach, beforeEach, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ social: vi.fn(), notify: vi.fn() }));
vi.mock("./authClient", () => ({
  AUTH_REQUEST_TIMEOUT_MS: 20_000,
  authClient: { signIn: { social: client.social } },
}));
vi.mock("./discordSignIn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./discordSignIn")>();
  return {
    ...actual,
    notifyDiscordSignIn: client.notify,
  };
});

const ATTEMPT = "d1fcce40-37ac-43ba-8b27-1b7bc48a0f93";
const STORAGE_KEY = "mapgenius.discord-sign-in";
const PAGE = "https://play.tribes2.online/account/sign-in/";
const DISCORD = "https://discord.com/oauth2/authorize?state=server-state";

class TestElement extends EventTarget {
  textContent = "";
  hidden = false;
  href = "";
}

const elements = new Map<string, TestElement>();
let popup: ReturnType<typeof createWindow>;
let storage: Storage;

function createWindow() {
  return Object.assign(new EventTarget(), {
    location: { href: `${PAGE}#${ATTEMPT}`, replace: vi.fn() },
    history: { replaceState: vi.fn() },
    opener: {} as object | null,
    top: undefined as unknown,
    close: vi.fn(),
    setTimeout,
    clearTimeout,
  });
}

function element(id: string) {
  return elements.get(`sign-in-${id}`)!;
}

async function loadPage(url = `${PAGE}#${ATTEMPT}`) {
  popup.location.href = url;
  await import("./discordSignInPage");
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  client.social.mockReset();
  client.notify.mockReset();
  client.social.mockResolvedValue({ data: { url: DISCORD }, error: null });
  elements.clear();
  for (const id of ["title", "message", "spinner", "retry", "close", "return"])
    elements.set(`sign-in-${id}`, new TestElement());
  element("retry").hidden = true;
  element("close").hidden = true;
  element("return").hidden = true;
  popup = createWindow();
  popup.top = popup;
  const values = new Map<string, string>();
  storage = {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
  };
  vi.stubGlobal("document", {
    getElementById: (id: string) => elements.get(id) ?? null,
  });
  vi.stubGlobal("window", popup);
  vi.stubGlobal("sessionStorage", storage);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("starts Discord in the popup with PKCE handled by the relay and no parent redirect", async () => {
  await loadPage();

  expect(popup.opener).toBeNull();
  expect(storage.getItem(STORAGE_KEY)).toBe(ATTEMPT);
  expect(client.notify).toHaveBeenCalledWith(ATTEMPT, "opened");
  expect(client.social).toHaveBeenCalledWith(
    {
      provider: "discord",
      disableRedirect: true,
      callbackURL: `${PAGE}?complete=1#${ATTEMPT}`,
      errorCallbackURL: `${PAGE}?accountError=discord#${ATTEMPT}`,
    },
    { signal: expect.any(AbortSignal) },
  );
  expect(popup.location.replace).toHaveBeenCalledWith(DISCORD);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the opening state while its provider request is pending", async () => {
  client.social.mockReturnValue(new Promise(() => {}));
  await loadPage();

  expect(element("message").textContent).toBe("Connecting to Discord…");
  expect(element("spinner").hidden).toBe(false);
  expect(element("retry").hidden).toBe(true);
  expect(element("close").hidden).toBe(true);
  expect(popup.location.replace).not.toHaveBeenCalled();
});

it.each(["", "#invalid", `#${ATTEMPT.slice(0, -1)}`])(
  "does not initiate OAuth from a page without a valid attempt (%s)",
  async (hash) => {
    await loadPage(`${PAGE}${hash}`);
    expect(client.social).not.toHaveBeenCalled();
    expect(client.notify).not.toHaveBeenCalled();
    expect(element("message").textContent).toContain("Return to MapGenius");
    expect(element("spinner").hidden).toBe(true);
    expect(element("close").hidden).toBe(true);
    expect(element("return").hidden).toBe(false);
    expect(element("return").href).toBe("https://play.tribes2.online/");
  },
);

it("does not initiate OAuth when the sign-in page is embedded", async () => {
  popup.top = {};
  await loadPage();
  expect(client.social).not.toHaveBeenCalled();
  expect(client.notify).not.toHaveBeenCalled();
  expect(element("title").textContent).toBe("Open sign-in in a window");
});

it("completes without loading a second login flow or exposing credentials in the message", async () => {
  storage.setItem(STORAGE_KEY, ATTEMPT);
  await loadPage(`${PAGE}?complete=1#${ATTEMPT}`);

  expect(client.social).not.toHaveBeenCalled();
  expect(client.notify.mock.calls).toEqual([[ATTEMPT, "complete"]]);
  expect(storage.getItem(STORAGE_KEY)).toBeNull();
  expect(popup.history.replaceState).toHaveBeenCalledWith(
    null,
    "",
    "/account/sign-in/",
  );
  expect(popup.close).toHaveBeenCalledOnce();
  expect(element("title").textContent).toBe("Returning to MapGenius");
  expect(element("message").textContent).toContain("close this window");
  expect(element("return").hidden).toBe(true);
});

it("handles denial using fixed text and strips provider error details from the URL", async () => {
  await loadPage(
    `${PAGE}?accountError=discord&error=access_denied&error_description=private-provider-detail#${ATTEMPT}`,
  );
  expect(client.social).not.toHaveBeenCalled();
  expect(client.notify.mock.calls).toEqual([[ATTEMPT, "error"]]);
  expect(popup.close).toHaveBeenCalledOnce();
  expect(element("title").textContent).toBe("Sign-in was not completed");
  expect(element("message").textContent).not.toContain(
    "private-provider-detail",
  );
  expect(popup.history.replaceState).toHaveBeenCalledWith(
    null,
    "",
    "/account/sign-in/",
  );
});

it("can retry a denied callback when the browser leaves its sign-in window open", async () => {
  storage.setItem(STORAGE_KEY, ATTEMPT);
  await loadPage(
    `${PAGE}?accountError=discord&error=access_denied&error_description=private-provider-detail#${ATTEMPT}`,
  );

  expect(popup.close).toHaveBeenCalledOnce();
  expect(client.social).not.toHaveBeenCalled();
  expect(element("retry").hidden).toBe(false);
  expect(storage.getItem(STORAGE_KEY)).toBeNull();

  element("retry").dispatchEvent(new Event("click"));
  await settle();

  expect(client.social).toHaveBeenCalledExactlyOnceWith(
    {
      provider: "discord",
      disableRedirect: true,
      callbackURL: `${PAGE}?complete=1#${ATTEMPT}`,
      errorCallbackURL: `${PAGE}?accountError=discord#${ATTEMPT}`,
    },
    { signal: expect.any(AbortSignal) },
  );
  expect(storage.getItem(STORAGE_KEY)).toBe(ATTEMPT);
  expect(client.notify.mock.calls).toEqual([
    [ATTEMPT, "error"],
    [ATTEMPT, "opened"],
  ]);
  expect(popup.location.replace).toHaveBeenCalledWith(DISCORD);
});

it("recovers the attempt for the relay's global error callback", async () => {
  storage.setItem(STORAGE_KEY, ATTEMPT);
  await loadPage(`${PAGE}?accountError=discord`);
  expect(client.social).not.toHaveBeenCalled();
  expect(client.notify).toHaveBeenCalledWith(ATTEMPT, "error");
  expect(storage.getItem(STORAGE_KEY)).toBeNull();
  expect(popup.close).toHaveBeenCalledOnce();
});

it("does not start a new login when an uncorrelated completion page is reloaded", async () => {
  await loadPage(`${PAGE}?complete=1#invalid`);
  expect(client.social).not.toHaveBeenCalled();
  expect(client.notify).not.toHaveBeenCalled();
  expect(popup.close).not.toHaveBeenCalled();
  expect(element("title").textContent).toBe("Return to MapGenius");
});

it.each(["complete", "error"] as const)(
  "handles a %s callback when session storage is unavailable",
  async (outcome) => {
    vi.mocked(storage.removeItem).mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const params = outcome === "complete" ? "complete=1" : "error=denied";
    await loadPage(`${PAGE}?${params}#${ATTEMPT}`);
    expect(client.notify).toHaveBeenCalledWith(ATTEMPT, outcome);
    expect(popup.close).toHaveBeenCalledOnce();
  },
);

it("can initiate login without session storage because callbacks carry the attempt", async () => {
  vi.mocked(storage.setItem).mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  await loadPage();
  expect(client.social).toHaveBeenCalledOnce();
  expect(popup.location.replace).toHaveBeenCalledWith(DISCORD);
});

it("shows a useful global error when both the fragment and storage are unavailable", async () => {
  vi.mocked(storage.getItem).mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  await loadPage(`${PAGE}?accountError=discord`);
  expect(client.social).not.toHaveBeenCalled();
  expect(client.notify).not.toHaveBeenCalled();
  expect(element("title").textContent).toBe("Sign-in was not completed");
  expect(element("close").hidden).toBe(true);
  expect(element("return").hidden).toBe(false);
  expect(element("message").textContent).not.toContain("original");
});

it("offers a return link for an error without a popup attempt", async () => {
  await loadPage(`${PAGE}?accountError=discord`);
  expect(client.social).not.toHaveBeenCalled();
  expect(client.notify).not.toHaveBeenCalled();
  expect(popup.close).not.toHaveBeenCalled();
  expect(element("return").hidden).toBe(false);
  expect(element("return").href).toBe("https://play.tribes2.online/");
  expect(element("message").textContent).not.toContain("original");
});

it("keeps return navigation within an app hosted under a base path", async () => {
  await loadPage(
    "https://example.com/t2-mapper/account/sign-in/?accountError=discord",
  );
  expect(element("return").hidden).toBe(false);
  expect(element("return").href).toBe("https://example.com/t2-mapper/");
});

it.each([
  "http://discord.com/oauth2/authorize",
  "https://discord.com.attacker.example/oauth2/authorize",
  "https://attacker.example/oauth2/authorize",
  "https://user:password@discord.com/oauth2/authorize",
  "https://discord.com/channels/@me",
  "javascript:alert(1)",
])("rejects an unexpected provider URL (%s)", async (url) => {
  client.social.mockResolvedValue({ data: { url }, error: null });
  await loadPage();
  expect(popup.location.replace).not.toHaveBeenCalled();
  expect(client.notify).toHaveBeenLastCalledWith(ATTEMPT, "error");
  expect(element("retry").hidden).toBe(false);
  expect(element("message").textContent).not.toContain(url);
});

it("accepts Discord's API authorization path", async () => {
  const url = "https://discord.com/api/oauth2/authorize?state=server-state";
  client.social.mockResolvedValue({ data: { url }, error: null });
  await loadPage();
  expect(popup.location.replace).toHaveBeenCalledWith(url);
});

it("allows retry after a provider request fails, without creating an unrelated attempt", async () => {
  client.social.mockResolvedValueOnce({
    data: null,
    error: { message: "Private server detail" },
  });
  await loadPage();
  expect(element("retry").hidden).toBe(false);
  expect(element("message").textContent).not.toContain("Private server detail");

  element("retry").dispatchEvent(new Event("click"));
  await settle();

  expect(client.social).toHaveBeenCalledTimes(2);
  expect(client.notify.mock.calls).toEqual([
    [ATTEMPT, "opened"],
    [ATTEMPT, "error"],
    [ATTEMPT, "opened"],
  ]);
  expect(popup.location.replace).toHaveBeenCalledWith(DISCORD);
});

it("restores the attempt in session storage on retry for global error callbacks", async () => {
  client.social.mockRejectedValueOnce(new Error("Offline"));
  await loadPage();
  storage.removeItem(STORAGE_KEY);
  expect(storage.getItem(STORAGE_KEY)).toBeNull();

  element("retry").dispatchEvent(new Event("click"));
  await settle();

  expect(storage.getItem(STORAGE_KEY)).toBe(ATTEMPT);
  expect(popup.location.replace).toHaveBeenCalledWith(DISCORD);
});

it("aborts a stalled request and lets the user retry after twenty seconds", async () => {
  client.social.mockImplementationOnce(
    (_body, { signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      }),
  );
  await loadPage();
  const signal = client.social.mock.calls[0][1].signal as AbortSignal;
  await vi.advanceTimersByTimeAsync(20_000);

  expect(signal.aborted).toBe(true);
  expect(popup.location.replace).not.toHaveBeenCalled();
  expect(client.notify).toHaveBeenLastCalledWith(ATTEMPT, "error");
  expect(element("spinner").hidden).toBe(true);
  expect(element("retry").hidden).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not navigate or report an error if a late response arrives after closing", async () => {
  let resolve!: (value: unknown) => void;
  client.social.mockImplementationOnce(
    () => new Promise((complete) => (resolve = complete)),
  );
  await loadPage();
  popup.dispatchEvent(new Event("pagehide"));
  resolve({ data: { url: DISCORD }, error: null });
  await settle();

  expect(popup.location.replace).not.toHaveBeenCalled();
  expect(client.notify.mock.calls).toEqual([[ATTEMPT, "opened"]]);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the close button usable when the browser leaves a completion tab open", async () => {
  await loadPage(`${PAGE}?complete=1#${ATTEMPT}`);
  expect(element("close").hidden).toBe(false);
  element("close").dispatchEvent(new Event("click"));
  expect(popup.close).toHaveBeenCalledTimes(2);
});

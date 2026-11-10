import { afterEach, beforeEach, expect, it, vi } from "vitest";

const ATTEMPT = "12345678-1234-4123-8123-123456789abc";
const OTHER_ATTEMPT = "12345678-1234-4123-8123-123456789abd";
const PAGE_URL = "https://play.tribes2.online/?demo=example.rec#camera";
let auth: typeof import("./authClient");
let popup: { closed: boolean; focus: ReturnType<typeof vi.fn> };
let open: ReturnType<typeof vi.fn>;
let channels: FakeChannel[];
let setItem: ReturnType<typeof vi.fn>;
let removeItem: ReturnType<typeof vi.fn>;
const attempts: Array<{ dispose(): void }> = [];

class FakeChannel {
  readonly name: string;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  close = vi.fn();
  postMessage = vi.fn();
  constructor(name: string) {
    this.name = name;
    channels.push(this);
  }
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("BASE_URL", "/");
  vi.stubGlobal("crypto", { randomUUID: () => ATTEMPT });
  channels = [];
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  popup = { closed: false, focus: vi.fn() };
  open = vi.fn(() => popup);
  vi.stubGlobal("window", {
    location: { href: PAGE_URL },
    screenX: 120,
    screenY: 80,
    outerWidth: 1440,
    outerHeight: 900,
    open,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  setItem = vi.fn();
  removeItem = vi.fn();
  vi.stubGlobal("localStorage", { setItem, removeItem });
  auth = await import("./authClient");
});

afterEach(() => {
  for (const attempt of attempts.splice(0)) attempt.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function start() {
  const onEvent = vi.fn();
  const onUnavailable = vi.fn();
  const onExpired = vi.fn();
  const attempt = auth.openDiscordSignIn({
    onEvent,
    onUnavailable,
    onExpired,
  });
  attempts.push(attempt);
  return { attempt, onEvent, onUnavailable, onExpired };
}

function deliver(data: unknown) {
  channels[0].onmessage?.({ data });
}

it("accepts only a generated UUID attempt identifier", () => {
  expect(auth.readDiscordSignInAttempt(ATTEMPT)).toBe(ATTEMPT);
  for (const input of [
    null,
    {},
    "",
    ATTEMPT + "?error",
    "../callback",
    "12345678-1234-1123-8123-123456789abc",
    "12345678-1234-4123-0123-123456789abc",
  ]) {
    expect(auth.readDiscordSignInAttempt(input)).toBeNull();
  }
});

it("builds a lightweight callback URL without copying demo/server query strings or camera state", () => {
  expect(auth.discordSignInUrl(ATTEMPT).href).toBe(
    `https://play.tribes2.online/account/sign-in/#${ATTEMPT}`,
  );
  expect(auth.discordSignInUrl(ATTEMPT, "complete").href).toBe(
    `https://play.tribes2.online/account/sign-in/?complete=1#${ATTEMPT}`,
  );
  expect(auth.discordSignInUrl(ATTEMPT, "error").href).toBe(
    `https://play.tribes2.online/account/sign-in/?accountError=discord#${ATTEMPT}`,
  );
});

it("respects a frontend deployed under a base path", () => {
  vi.stubEnv("BASE_URL", "/t2-mapper/");
  expect(auth.discordSignInUrl(ATTEMPT).href).toBe(
    `https://play.tribes2.online/t2-mapper/account/sign-in/#${ATTEMPT}`,
  );
});

it("subscribes before synchronously opening the popup and never navigates the parent", () => {
  open.mockImplementationOnce(() => {
    expect(channels).toHaveLength(1);
    expect(channels[0].onmessage).toBeTypeOf("function");
    return popup;
  });
  const { attempt } = start();
  expect(attempt.opened).toBe(true);
  expect(open).toHaveBeenCalledWith(
    `https://play.tribes2.online/account/sign-in/#${ATTEMPT}`,
    "_blank",
    "popup,width=500,height=650,left=590,top=205",
  );
  expect(window.location.href).toBe(PAGE_URL);
});

it.each([
  { screenX: undefined },
  { screenY: NaN },
  { outerWidth: Infinity },
  { outerHeight: -Infinity },
  { outerWidth: 0 },
  { outerHeight: -1 },
])(
  "opens without positioning when window geometry is unusable: %o",
  (geometry) => {
    Object.assign(window, geometry);
    const { attempt, onEvent } = start();
    expect(attempt.opened).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith(
      attempt.url,
      "_blank",
      "popup,width=500,height=650",
    );
    deliver({ attemptId: ATTEMPT, event: "complete" });
    expect(onEvent).toHaveBeenCalledExactlyOnceWith("complete");
  },
);

it("still opens sign-in when reading window geometry throws", () => {
  Object.defineProperty(window, "screenX", {
    configurable: true,
    get() {
      throw new Error("Window position unavailable");
    },
  });
  const { attempt, onEvent } = start();
  expect(attempt.opened).toBe(true);
  expect(open).toHaveBeenCalledExactlyOnceWith(
    attempt.url,
    "_blank",
    "popup,width=500,height=650",
  );
  deliver({ attemptId: ATTEMPT, event: "complete" });
  expect(onEvent).toHaveBeenCalledExactlyOnceWith("complete");
});

it("rejects malformed, unknown, and other-attempt notifications", () => {
  const { onEvent } = start();
  for (const data of [
    null,
    [],
    {},
    "complete",
    { attemptId: OTHER_ATTEMPT, event: "complete" },
    { attemptId: ATTEMPT, event: "admin" },
    { attemptId: ATTEMPT, event: null },
    { attemptId: ATTEMPT },
  ])
    deliver(data);
  expect(onEvent).not.toHaveBeenCalled();
  deliver({ attemptId: ATTEMPT, event: "complete" });
  expect(onEvent).toHaveBeenCalledExactlyOnceWith("complete");
});

it("keeps completion working when COOP makes the popup proxy appear closed", () => {
  const { attempt, onEvent } = start();
  popup.closed = true;
  expect(attempt.focus()).toBe(false);
  deliver({ attemptId: ATTEMPT, event: "complete" });
  expect(onEvent).toHaveBeenCalledExactlyOnceWith("complete");
});

it("focuses the existing popup and safely tolerates an inaccessible WindowProxy", () => {
  const { attempt } = start();
  expect(attempt.focus()).toBe(true);
  expect(popup.focus).toHaveBeenCalledOnce();
  Object.defineProperty(popup, "closed", {
    get() {
      throw new Error("COOP isolation");
    },
  });
  expect(attempt.focus()).toBe(false);
});

it.each(["returns null", "returns undefined", "throws"])(
  "keeps the completion observer for a manual-tab fallback when window.open %s",
  (kind) => {
    if (kind === "returns null") open.mockReturnValueOnce(null);
    else if (kind === "returns undefined") open.mockReturnValueOnce(undefined);
    else
      open.mockImplementationOnce(() => {
        throw new Error("Popup unavailable");
      });
    const { attempt, onEvent, onUnavailable } = start();
    expect(attempt.opened).toBe(false);
    vi.advanceTimersByTime(15_000);
    expect(onUnavailable).not.toHaveBeenCalled();
    deliver({ attemptId: ATTEMPT, event: "complete" });
    expect(onEvent).toHaveBeenCalledExactlyOnceWith("complete");
  },
);

it("reports a missing popup startup once, then accepts a delayed completion", () => {
  const { onUnavailable, onEvent } = start();
  vi.advanceTimersByTime(14_999);
  expect(onUnavailable).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onUnavailable).toHaveBeenCalledOnce();
  deliver({ attemptId: ATTEMPT, event: "opened" });
  deliver({ attemptId: ATTEMPT, event: "complete" });
  expect(onEvent.mock.calls).toEqual([["opened"], ["complete"]]);
});

it("cancels startup timeout after the popup reports itself opened", () => {
  const { onUnavailable } = start();
  deliver({ attemptId: ATTEMPT, event: "opened" });
  vi.advanceTimersByTime(15_000);
  expect(onUnavailable).not.toHaveBeenCalled();
});

it("bounds abandoned listeners and ignores all late notifications after expiry", () => {
  const { attempt, onExpired, onEvent } = start();
  deliver({ attemptId: ATTEMPT, event: "opened" });
  onEvent.mockClear();
  vi.advanceTimersByTime(10 * 60_000);
  expect(onExpired).toHaveBeenCalledOnce();
  expect(channels[0].close).toHaveBeenCalledOnce();
  expect(attempt.focus()).toBe(false);
  deliver({ attemptId: ATTEMPT, event: "complete" });
  expect(onEvent).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("disposes observers and timers idempotently without closing or navigating the game", () => {
  const { attempt, onEvent, onExpired, onUnavailable } = start();
  attempt.dispose();
  attempt.dispose();
  expect(channels[0].close).toHaveBeenCalledOnce();
  expect(window.removeEventListener).toHaveBeenCalledWith(
    "storage",
    vi.mocked(window.addEventListener).mock.calls[0][1],
  );
  vi.runAllTimers();
  deliver({ attemptId: ATTEMPT, event: "complete" });
  expect(onEvent).not.toHaveBeenCalled();
  expect(onExpired).not.toHaveBeenCalled();
  expect(onUnavailable).not.toHaveBeenCalled();
  expect(window.location.href).toBe(PAGE_URL);
});

it("sends only the correlation identifier and event, then releases its notification channel", () => {
  auth.notifyDiscordSignIn(ATTEMPT, "complete");
  expect(channels[0].postMessage).toHaveBeenCalledExactlyOnceWith({
    attemptId: ATTEMPT,
    event: "complete",
  });
  expect(channels[0].close).toHaveBeenCalledOnce();
});

it("delivers background completion through storage without requiring a focus event", () => {
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        throw new Error("Unavailable");
      }
    },
  );
  const { onEvent, onUnavailable } = start();
  const listener = vi.mocked(window.addEventListener).mock.calls[0][1] as (
    event: Partial<StorageEvent>,
  ) => void;
  auth.notifyDiscordSignIn(ATTEMPT, "complete");
  const [key, newValue] = setItem.mock.calls[0];
  expect(removeItem).toHaveBeenCalledWith(key);
  listener({ key, newValue });
  expect(onEvent).toHaveBeenCalledExactlyOnceWith("complete");
  vi.advanceTimersByTime(15_000);
  expect(onUnavailable).not.toHaveBeenCalled();
  for (const event of [
    { key: "unrelated", newValue },
    { key, newValue: null },
    { key, newValue: "invalid JSON" },
    {
      key,
      newValue: JSON.stringify({ attemptId: OTHER_ATTEMPT, event: "complete" }),
    },
  ])
    listener(event);
  expect(onEvent).toHaveBeenCalledOnce();
});

it("does not crash the completion page when both notification transports are unavailable", () => {
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        throw new Error("Unavailable");
      }
    },
  );
  setItem.mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  expect(() => auth.notifyDiscordSignIn(ATTEMPT, "complete")).not.toThrow();
});

it("honors a provided sign-out abort signal while its JSON response body is stalled", async () => {
  const controller = new AbortController();
  let bodyStarted = false;
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, options) => {
    expect(options?.signal).toBe(controller.signal);
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        bodyStarted = true;
        controller.signal.addEventListener(
          "abort",
          () => stream.error(controller.signal.reason),
          { once: true },
        );
      },
    });
    return new Response(body, {
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();
  auth = await import("./authClient");
  const timeout = setTimeout(
    () => controller.abort(),
    auth.AUTH_REQUEST_TIMEOUT_MS,
  );
  const rejected = expect(
    auth.authClient.signOut({ fetchOptions: { signal: controller.signal } }),
  ).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(auth.AUTH_REQUEST_TIMEOUT_MS);
  await rejected;
  clearTimeout(timeout);
  expect(bodyStarted).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
let auth: typeof import("./authClient");
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("bounds a stalled sign-out request using the installed auth client's timeout", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    (_input, options) =>
      new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) throw new Error("Expected an auth request signal");
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  vi.stubGlobal("fetch", fetch);
  // Better Auth captures fetch when its client is created.
  vi.resetModules();
  auth = await import("./authClient");
  const rejected = expect(auth.authClient.signOut()).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(auth.AUTH_REQUEST_TIMEOUT_MS);
  await rejected;
  expect(fetch).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the popup's own cancellation signal when the auth client has a default timeout", async () => {
  const controller = new AbortController();
  const fetch = vi.fn<typeof globalThis.fetch>(
    (_input, options) =>
      new Promise((_resolve, reject) => {
        expect(options?.signal).toBe(controller.signal);
        controller.signal.addEventListener(
          "abort",
          () => reject(controller.signal.reason),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();
  auth = await import("./authClient");
  const rejected = expect(
    auth.authClient.signIn.social(
      {
        provider: "discord",
        disableRedirect: true,
      },
      { signal: controller.signal },
    ),
  ).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(auth.AUTH_REQUEST_TIMEOUT_MS);
  expect(controller.signal.aborted).toBe(false);
  expect(fetch).toHaveBeenCalledOnce();
  controller.abort();
  await rejected;
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

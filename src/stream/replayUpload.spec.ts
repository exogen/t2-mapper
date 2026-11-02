import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_REPLAY_UPLOAD_BYTES,
  REPLAY_UPLOAD_TIMEOUT_MS,
  REPLAY_CLIENT_ID_HEADER,
} from "../../relay/replayTypes";
import { uploadReplay } from "./replayUpload";
const creatorId = "ab".repeat(24);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("temporary replay upload", () => {
  it("posts original bytes without redirects and correlates the existing progress socket", async () => {
    const buffer = new ArrayBuffer(32);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ sessionId: "room", ownerToken: "private" }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      uploadReplay(
        "wss://relay.example/socket?old=1#old",
        buffer,
        "Local & demo.rec",
        { creatorId, tick: 42, uploadId: "private-upload" },
      ),
    ).resolves.toEqual({ sessionId: "room", ownerToken: "private" });
    const [href, request] = fetch.mock.calls[0];
    const url = new URL(href);
    expect(url.origin).toBe("https://relay.example");
    expect(url.pathname).toBe("/replay-upload");
    expect(url.hash).toBe("");
    expect(url.searchParams.get("name")).toBe("Local & demo.rec");
    expect(url.searchParams.get("tick")).toBe("42");
    expect(url.searchParams.get("uploadId")).toBe("private-upload");
    expect(url.searchParams.has("old")).toBe(false);
    expect(request).toMatchObject({
      method: "POST",
      body: buffer,
      headers: { "Content-Type": "application/octet-stream" },
      redirect: "error",
    });
    expect(request.headers[REPLAY_CLIENT_ID_HEADER]).toBe(creatorId);
    expect(url.searchParams.has("creatorId")).toBe(false);
  });

  it("allows a direct upload without a progress subscription", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ sessionId: "room", ownerToken: "private" }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await uploadReplay("ws://localhost:8765", new ArrayBuffer(4), "demo.rec", {
      creatorId,
    });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.protocol).toBe("http:");
    expect(url.searchParams.has("uploadId")).toBe(false);
    expect(url.searchParams.has("tick")).toBe(false);
  });

  it("rejects invalid bytes, ticks and relay URLs before sending", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      uploadReplay("ws://localhost:8765", new ArrayBuffer(0), "empty.rec", {
        creatorId,
      }),
    ).rejects.toThrow("empty");
    await expect(
      uploadReplay(
        "ws://localhost:8765",
        { byteLength: MAX_REPLAY_UPLOAD_BYTES + 1 } as ArrayBuffer,
        "large.rec",
        { creatorId },
      ),
    ).rejects.toThrow("150 MB");
    await expect(
      uploadReplay("ws://localhost:8765", new ArrayBuffer(4), "demo.rec", {
        creatorId,
        tick: -1,
      }),
    ).rejects.toThrow("non-negative tick");
    await expect(
      uploadReplay("file:///tmp/replay", new ArrayBuffer(4), "demo.rec", {
        creatorId,
      }),
    ).rejects.toThrow("relay URL is invalid");
    await expect(
      uploadReplay("ws://localhost:8765", new ArrayBuffer(4), "demo.rec", {
        creatorId: "invalid",
      }),
    ).rejects.toThrow("creator identity is invalid");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      "application/json",
      JSON.stringify({ error: "Not a valid Tribes 2 demo" }),
      "Not a valid Tribes 2 demo",
    ],
    ["text/plain", "Demo is too large", "Demo is too large"],
  ])("preserves %s validation errors", async (contentType, body, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 422,
          headers: { "Content-Type": contentType },
        }),
      ),
    );
    await expect(
      uploadReplay("ws://localhost:8765", new ArrayBuffer(4), "demo.rec", {
        creatorId,
      }),
    ).rejects.toThrow(message);
  });

  it.each([JSON.stringify({ sessionId: "room" }), "invalid json"])(
    "rejects invalid private response %s",
    async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
      await expect(
        uploadReplay("ws://localhost:8765", new ArrayBuffer(4), "demo.rec", {
          creatorId,
        }),
      ).rejects.toThrow("invalid replay session");
    },
  );

  it("passes cancellation to fetch and refuses already-canceled transfers", async () => {
    const abort = new AbortController();
    let signal!: AbortSignal;
    const fetch = vi.fn((_url: string, request: RequestInit) => {
      signal = request.signal!;
      return new Promise<Response>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason)),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const pending = uploadReplay(
      "ws://localhost:8765",
      new ArrayBuffer(4),
      "demo.rec",
      { creatorId, signal: abort.signal },
    );
    abort.abort(new Error("Left replay"));
    await expect(pending).rejects.toThrow("Left replay");
    expect(signal.aborted).toBe(true);
    await expect(
      uploadReplay("ws://localhost:8765", new ArrayBuffer(4), "demo.rec", {
        creatorId,
        signal: abort.signal,
      }),
    ).rejects.toThrow("Left replay");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps the two-minute timeout active through server preparation", async () => {
    const timeout = new AbortController();
    const clock = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeout.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, request: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            request.signal!.addEventListener("abort", () =>
              reject(request.signal!.reason),
            ),
          ),
      ),
    );
    const pending = uploadReplay(
      "ws://localhost:8765",
      new ArrayBuffer(4),
      "demo.rec",
      { creatorId },
    );
    timeout.abort(new DOMException("Timed out", "TimeoutError"));
    await expect(pending).rejects.toThrow("timed out");
    expect(clock).toHaveBeenCalledWith(REPLAY_UPLOAD_TIMEOUT_MS);
  });
});

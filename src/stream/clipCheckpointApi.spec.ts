import { afterEach, expect, it, vi } from "vitest";
import type { ClipView } from "../../relay/clipTypes";
import { ClipApiError } from "./clipApi";
import {
  readClipCheckpoint,
  recoverClipCheckpoint,
  verifyClipSource,
  ClipSourceError,
} from "./clipCheckpointApi";
import { demoSha256 } from "./demoCheckpoints";

vi.mock("../account/authClient", () => ({
  appApiBaseUrl: "https://api.example.com",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([204, 409, 503])(
  "plays from a verified demo when the checkpoint responds with %s",
  async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);
    const buffer = new ArrayBuffer(1);
    const clip = {
      checkpointUrl: "/api/clips/clip/checkpoint",
      sourceSha256: await demoSha256(buffer),
    } as ClipView;
    const signal = new AbortController().signal;
    await expect(readClipCheckpoint(clip, buffer, signal)).resolves.toBeNull();
    await expect(
      readClipCheckpoint(clip, new ArrayBuffer(2), signal),
    ).rejects.toThrow("could not be verified");
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("reports a removed clip even if the source demo is still downloaded", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 410 })),
  );
  const buffer = new ArrayBuffer(1);
  const clip = {
    checkpointUrl: "/api/clips/clip/checkpoint",
    sourceSha256: await demoSha256(buffer),
  } as ClipView;
  const result = readClipCheckpoint(clip, buffer, new AbortController().signal);
  await expect(result).rejects.toBeInstanceOf(ClipApiError);
  await expect(result).rejects.toMatchObject({ status: 410 });
});

it("reports the rejected object only when the downloaded demo matches the clip", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const buffer = new ArrayBuffer(1);
  const clip = {
    checkpointUrl: "/api/clips/clip/checkpoint",
    sourceSha256: await demoSha256(buffer),
  } as ClipView;
  const signal = new AbortController().signal;
  await expect(
    recoverClipCheckpoint(clip, new ArrayBuffer(2), '"old"', signal),
  ).rejects.toThrow("could not be verified");
  expect(fetch).not.toHaveBeenCalled();
  await recoverClipCheckpoint(clip, buffer, '"old"', signal);
  expect(fetch.mock.calls[0][0].searchParams.get("rejected")).toBe('"old"');
  expect(fetch.mock.calls[0][1].method).toBe("POST");
});

it("verifies the clip's saved identity even when a checkpoint is available", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response("checkpoint", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const clip = {
    checkpointUrl: "/checkpoint",
    sourceSha256: await demoSha256(new ArrayBuffer(1)),
  } as ClipView;
  await expect(
    readClipCheckpoint(clip, new ArrayBuffer(2), new AbortController().signal),
  ).rejects.toBeInstanceOf(ClipSourceError);
  expect(fetch).not.toHaveBeenCalled();
});

it("shares hashing across verification, checkpoint loading and checkpoint repair", async () => {
  const buffer = new ArrayBuffer(5);
  const clip = {
    checkpointUrl: "/checkpoint",
    sourceSha256: await demoSha256(buffer),
  } as ClipView;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
  const digest = vi.spyOn(crypto.subtle, "digest");
  const signal = new AbortController().signal;
  await verifyClipSource(clip, buffer, signal);
  await readClipCheckpoint(clip, buffer, signal);
  await recoverClipCheckpoint(clip, buffer, null, signal);
  expect(digest).toHaveBeenCalledOnce();
});

it("treats cancellation during hashing as cancellation rather than a source mismatch", async () => {
  const abort = new AbortController();
  const clip = { sourceSha256: "a".repeat(64) } as ClipView;
  const task = verifyClipSource(clip, new ArrayBuffer(6), abort.signal);
  abort.abort();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
});

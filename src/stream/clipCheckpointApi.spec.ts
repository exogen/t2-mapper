import { afterEach, expect, it, vi } from "vitest";
import type { ClipView } from "../../relay/clipTypes";
import { ClipApiError } from "./clipApi";
import { readClipCheckpoint, recoverClipCheckpoint } from "./clipCheckpointApi";

vi.mock("../account/authClient", () => ({
  appApiBaseUrl: "https://api.example.com",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const clip = { checkpointUrl: "/api/clips/clip/checkpoint" } as ClipView;

it.each([204, 409, 503])(
  "allows a normal seek when the checkpoint responds with %s",
  async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await expect(readClipCheckpoint(clip, signal)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("reports a removed clip even if the source demo is still downloaded", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 410 })),
  );
  const result = readClipCheckpoint(clip, new AbortController().signal);
  await expect(result).rejects.toBeInstanceOf(ClipApiError);
  await expect(result).rejects.toMatchObject({ status: 410 });
});

it("only reports an identified checkpoint object for repair", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  await recoverClipCheckpoint(clip, null, signal);
  expect(fetch).not.toHaveBeenCalled();
  await recoverClipCheckpoint(clip, '"old"', signal);
  expect(fetch.mock.calls[0][0].searchParams.get("rejected")).toBe('"old"');
  expect(fetch.mock.calls[0][1].method).toBe("POST");
});

it("returns the checkpoint and its repair token", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response("checkpoint", { headers: { ETag: '"saved"' } }),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    readClipCheckpoint(clip, new AbortController().signal),
  ).resolves.toEqual({ text: "checkpoint", etag: '"saved"' });
});

it("skips checkpoint requests after cancellation", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const signal = AbortSignal.abort();
  await expect(readClipCheckpoint(clip, signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  await expect(
    recoverClipCheckpoint(clip, '"saved"', signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(fetch).not.toHaveBeenCalled();
});

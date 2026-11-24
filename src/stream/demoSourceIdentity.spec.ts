import { afterEach, expect, it, vi } from "vitest";
import { cachedDemoSha256 } from "./demoSourceIdentity";

afterEach(() => vi.restoreAllMocks());

it("hashes a finalized recording once across concurrent and repeated consumers", async () => {
  const digest = vi.spyOn(crypto.subtle, "digest");
  const buffer = new ArrayBuffer(4);
  const first = cachedDemoSha256(buffer);
  expect(cachedDemoSha256(buffer)).toBe(first);
  const hash = await first;
  expect(await cachedDemoSha256(buffer)).toBe(hash);
  expect(digest).toHaveBeenCalledOnce();
  await cachedDemoSha256(buffer.slice(0));
  expect(digest).toHaveBeenCalledTimes(2);
});

it("allows retrying a failed hash instead of caching a rejection", async () => {
  const digest = vi
    .spyOn(crypto.subtle, "digest")
    .mockRejectedValueOnce(new Error("Hash failed"));
  const buffer = new ArrayBuffer(4);
  await expect(cachedDemoSha256(buffer)).rejects.toThrow("Hash failed");
  await expect(cachedDemoSha256(buffer)).resolves.toHaveLength(64);
  expect(digest).toHaveBeenCalledTimes(2);
});

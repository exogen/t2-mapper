/** Hashing is shared only for finalized source buffers, which owners never mutate. */
const sourceHashes = new WeakMap<ArrayBuffer, Promise<string>>();

export async function demoSha256(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Concurrent clip/checkpoint checks share work without retaining source buffers. */
export function cachedDemoSha256(buffer: ArrayBuffer): Promise<string> {
  let pending = sourceHashes.get(buffer);
  if (!pending) {
    pending = demoSha256(buffer);
    sourceHashes.set(buffer, pending);
    void pending.catch(() => {
      if (sourceHashes.get(buffer) === pending) sourceHashes.delete(buffer);
    });
  }
  return pending;
}

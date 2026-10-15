/**
 * Purging public URLs from the Cloudflare edge cache, in the batches the
 * purge-by-URL API requires.
 */

/**
 * The purge-by-URL API accepts at most 30 files per request.
 */
export const PURGE_BATCH_SIZE = 30;

const MAX_ATTEMPTS = 3;

/**
 * A failure that will not succeed on retry (bad token, bad zone, etc.).
 */
class FatalPurgeError extends Error {}

async function purgeBatchOnce(
  zoneId: string,
  apiToken: string,
  files: string[],
): Promise<void> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files }),
    },
  );
  const body = (await response.json()) as {
    success: boolean;
    errors: { code: number; message: string }[];
  };
  if (!response.ok || !body.success) {
    const message = `Purge request failed (HTTP ${response.status}): ${JSON.stringify(body.errors)}`;
    // Client errors (bad token, bad zone) won't succeed on retry.
    throw response.status < 500
      ? new FatalPurgeError(message)
      : new Error(message);
  }
}

/**
 * Purge one batch of at most PURGE_BATCH_SIZE URLs. Retries transient
 * failures (network errors, 5xx) with backoff; fails fast on client errors
 * like a bad token.
 */
export async function purgeBatch(
  zoneId: string,
  apiToken: string,
  files: string[],
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await purgeBatchOnce(zoneId, apiToken, files);
      return;
    } catch (err) {
      if (err instanceof FatalPurgeError) throw err;
      if (attempt >= MAX_ATTEMPTS) throw err;
      const delayMs = 1000 * 2 ** (attempt - 1);
      console.warn(`Purge attempt ${attempt} failed; retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

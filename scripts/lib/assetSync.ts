import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assetIgnoreList } from "./assetIgnore.js";
import {
  metadataFor,
  precompressedMetadataFor,
  type AssetMetadata,
} from "./assetMetadata.js";
import { isPrecompressedKey, shouldPrecompress } from "./precompress.js";

export interface RemoteAsset {
  size: number;
  etag: string;
}

export interface AssetSyncState {
  version: 1;
  /** Set only after every planned mutation succeeds. */
  fingerprint?: string;
  policy: string;
  compression: string;
  pending: string[];
  /** Separate from uploads: copying headers must not trigger recompression. */
  pendingMetadata?: string[];
  /** Retained until the separate Cloudflare purge step acknowledges it. */
  report: string[];
}

export interface StoredSyncState {
  value: AssetSyncState;
  etag: string;
}

export interface AssetSyncStore {
  readState(): Promise<StoredSyncState | undefined>;
  writeState(value: AssetSyncState, previousEtag?: string): Promise<string>;
  list(): Promise<Map<string, RemoteAsset>>;
  upload(key: string, file: string, metadata: AssetMetadata): Promise<void>;
  updateMetadata(key: string, metadata: AssetMetadata): Promise<void>;
  delete(keys: string[]): Promise<void>;
}

/** Bounded I/O, waiting for active jobs even if one fails. */
export async function concurrent<T>(
  items: readonly T[],
  concurrency: number,
  action: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failed = false;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!failed && next < items.length) {
        const item = items[next++];
        try {
          await action(item);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
}

async function matchesRemote(
  file: string,
  remote?: RemoteAsset,
): Promise<boolean> {
  if (!remote) return false;
  const handle = await fs.open(file);
  try {
    if ((await handle.stat()).size !== remote.size) return false;
    // Single-part R2 uploads use MD5 ETags. An unfamiliar/multipart ETag
    // conservatively uploads once; it must never hide a same-size edit.
    const digest = createHash("md5");
    for await (const chunk of handle.createReadStream()) digest.update(chunk);
    return digest.digest("hex") === remote.etag.replaceAll('"', "");
  } finally {
    await handle.close();
  }
}

export function syncMetadata(key: string): AssetMetadata {
  const metadata = isPrecompressedKey(key)
    ? precompressedMetadataFor(key.slice(0, -3))
    : metadataFor(key);
  if (!metadata) throw new Error(`No asset metadata for ${key}`);
  return metadata;
}

export interface AssetSyncOptions {
  source: string;
  files: string[];
  bucketUrl: string;
  fingerprint: string;
  policy: string;
  compression: string;
  precompress: boolean;
  forceSync?: boolean;
  dryRun?: boolean;
  allowLargePrune?: boolean;
  concurrency: number;
  store: AssetSyncStore;
  /** Produces the compressed file on demand, outside the source directory. */
  compress(file: string): Promise<string>;
  log(message: string): void;
}

export interface AssetSyncResult {
  skipped: boolean;
  report: string;
  uploads: number;
  metadataUpdates: number;
  deletions: number;
}

function reportText(lines: string[], etag?: string): string {
  if (lines.length === 0) return "";
  return (
    (etag ? `# asset-sync-state: ${etag}\n` : "") + lines.join("\n") + "\n"
  );
}

export async function syncAssets(
  options: AssetSyncOptions,
): Promise<AssetSyncResult> {
  const {
    source,
    files,
    store,
    fingerprint,
    policy,
    compression,
    precompress,
    concurrency,
    log,
  } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error("Concurrency must be a positive integer.");
  if (files.length === 0)
    throw new Error("Refusing to synchronize an empty asset source.");
  const previous = await store.readState();
  if (!options.forceSync && previous?.value.fingerprint === fingerprint) {
    log(
      "Asset fingerprint unchanged; skipping bucket listing, uploads and compression.",
    );
    return {
      skipped: true,
      report: reportText(previous.value.report, previous.etag),
      uploads: 0,
      metadataUpdates: 0,
      deletions: 0,
    };
  }

  const remote = await store.list();
  const rawUploads = new Set<string>();
  await concurrent(files, concurrency, async (file) => {
    if (!(await matchesRemote(path.join(source, file), remote.get(file))))
      rawUploads.add(file);
  });
  const live = new Set(files);
  const pending = new Set(previous?.value.pending);
  const pendingMetadata = new Set(previous?.value.pendingMetadata);
  const uploads = new Set(rawUploads);
  for (const file of files) {
    if (!precompress || !shouldPrecompress(file)) continue;
    const sibling = `${file}.br`;
    live.add(sibling);
    if (
      rawUploads.has(file) ||
      pending.has(file) ||
      pending.has(sibling) ||
      !remote.has(sibling) ||
      (previous != null && previous.value.compression !== compression)
    )
      uploads.add(sibling);
  }

  const deletions: string[] = [];
  const metadataUpdates: string[] = [];
  const policyChanged = previous != null && previous.value.policy !== policy;
  for (const key of remote.keys()) {
    const sibling = isPrecompressedKey(key);
    const sourceKey = sibling ? key.slice(0, -3) : key;
    if (assetIgnoreList.ignores(sourceKey) || (!sibling && !metadataFor(key)))
      continue;
    if (sibling && !precompress) continue;
    if (!live.has(key)) deletions.push(key);
    else if (
      (policyChanged || pending.has(key) || pendingMetadata.has(key)) &&
      !uploads.has(key)
    )
      metadataUpdates.push(key);
  }
  if (deletions.length / remote.size > 0.2 && !options.allowLargePrune) {
    throw new Error(
      `Refusing to delete ${deletions.length}/${remote.size} objects. Use --allow-large-prune for deliberate bulk removal.`,
    );
  }

  const plannedReport = [
    ...[...uploads, ...metadataUpdates]
      .sort()
      .map(
        (key) =>
          `upload: ${path.join(source, key)} to ${options.bucketUrl}${key}`,
      ),
    ...deletions.sort().map((key) => `delete: ${options.bucketUrl}${key}`),
  ];
  const report = [
    ...new Set([...(previous?.value.report ?? []), ...plannedReport]),
  ];
  log(
    `${remote.size} remote objects; ${uploads.size} uploads, ${metadataUpdates.length} metadata updates, ${deletions.length} deletions.`,
  );
  const counts = {
    skipped: false,
    uploads: uploads.size,
    metadataUpdates: metadataUpdates.length,
    deletions: deletions.length,
  };
  if (options.dryRun) {
    log("Dry run: no uploads, compression, deletions or sync-state writes.");
    return {
      ...counts,
      report: reportText(report.map((line) => `(dryrun) ${line}`)),
    };
  }

  // Invalidate the old success before touching assets. Persist the plan so
  // interrupted uploads (especially raw/.br pairs) and purges survive retries
  // or a rollback to an older checkout. Deploys share one concurrency group.
  let etag = previous?.etag;
  if (plannedReport.length > 0) {
    etag = await store.writeState(
      {
        version: 1,
        policy,
        compression,
        pending: [...uploads],
        pendingMetadata: metadataUpdates,
        report,
      },
      etag,
    );
    await concurrent([...uploads].sort(), concurrency, async (key) => {
      const file = isPrecompressedKey(key)
        ? await options.compress(key.slice(0, -3))
        : path.join(source, key);
      await store.upload(key, file, syncMetadata(key));
      log(`Uploaded ${key}`);
    });
    await concurrent(metadataUpdates, concurrency, async (key) => {
      await store.updateMetadata(key, syncMetadata(key));
    });
    for (let i = 0; i < deletions.length; i += 1000)
      await store.delete(deletions.slice(i, i + 1000));
  }
  etag = await store.writeState(
    { version: 1, fingerprint, policy, compression, pending: [], report },
    etag,
  );
  return { ...counts, report: reportText(report, etag) };
}

/** Called only after Cloudflare has successfully purged this exact report. */
export async function acknowledgeSyncReport(
  store: AssetSyncStore,
  report: string,
): Promise<void> {
  if (!report.trim()) return;
  const etag = report.match(/^# asset-sync-state: (.+)$/m)?.[1];
  const state = await store.readState();
  if (
    !etag ||
    !state ||
    state.etag !== etag ||
    !state.value.fingerprint ||
    report !== reportText(state.value.report, etag)
  ) {
    throw new Error(
      "Sync state changed or is incomplete; refusing to acknowledge this purge report.",
    );
  }
  await store.writeState({ ...state.value, report: [] }, etag);
}

/**
 * Brotli siblings for the formats worth precompressing.
 *
 * Cloudflare compresses nothing for these by default: they are served as
 * `application/octet-stream`, which its compression rules skip, so a `.dts`
 * goes over the wire raw. Storing a `<name>.dts.br` next to it lets something
 * at the edge hand the compressed copy to any client that accepts brotli.
 *
 * NOTHING SERVES THESE TODAY. The asset worker that swapped them in was
 * retired in favour of a Cloudflare compression rule, which compresses at
 * brotli 4 rather than the 11 here. The siblings are still written so that
 * bringing a worker back is a deploy rather than a full recompression of the
 * corpus; they cost bucket storage and nothing else.
 *
 * Measured: brotli quality 11 lands around a third of the original for
 * shapes and interiors and 38% for terrain, and decompresses at ~220 MB/s in
 * the browser's network stack, about a millisecond for a typical file.
 */
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

const brotliCompress = promisify(zlib.brotliCompress);

/**
 * Extensions that get a `.br` sibling. All are served as
 * `application/octet-stream`, which Cloudflare's compression skips by
 * default.
 *
 * `.ter` is a raw 16-bit heightfield followed by raw per-square material and
 * alpha bytes — nothing in it is compressed, and it is on the critical path
 * for a mission load, one ~450 KB file before any ground can be drawn.
 *
 * `.dsq` earns far less than the rest: quantized keyframe rotations are close
 * to noise, so quality 11 only reaches 76% where shapes reach 31%. It is here
 * because the animation sequences are fetched per shape and the pass costs
 * nothing extra once it is running, not because the ratio is good.
 *
 * Measured but deliberately left out: `.bm8` compresses well (30%) and `.spn`
 * poorly (68%), and neither is ever requested — nothing in the app resolves a
 * `.spn`, and the `.bm8` texture probe in src/manifest.ts is commented out.
 * Revisit `.bm8` if paletted-texture loading is turned on.
 */
export const PRECOMPRESS_EXTENSIONS = new Set([".dts", ".dif", ".dsq", ".ter"]);

/**
 * Quality 11. This runs once per changed file in CI, and the transfer it
 * saves is worth far more than the decode: quality 11 costs ~2.3 ms more to
 * decode per MB than gzip but saves ~0.1 MB, so gzip only wins above about
 * 365 Mbps of effective bandwidth.
 */
export const BROTLI_QUALITY = 11;

/** The sibling key for a source path. */
export function precompressedPath(sourcePath: string): string {
  return `${sourcePath}.br`;
}

export function shouldPrecompress(sourcePath: string): boolean {
  return PRECOMPRESS_EXTENSIONS.has(path.extname(sourcePath).toLowerCase());
}

/**
 * Which files need a `.br` written: the ones just uploaded (their sibling is
 * now stale) plus any whose sibling is missing from the bucket entirely.
 *
 * The second half is what makes the step self-healing — a file that was
 * already in R2 before precompression existed, or one whose upload failed
 * partway, is picked up on the next run rather than staying uncompressed
 * forever.
 */
export function precompressionTargets({
  sourcePaths,
  uploadedPaths,
  existingKeys,
}: {
  /** Every candidate file, relative to the sync source. */
  sourcePaths: Iterable<string>;
  /** Files this run just uploaded, relative to the sync source. */
  uploadedPaths: ReadonlySet<string>;
  /** Keys already in the bucket, relative to its prefix. */
  existingKeys: ReadonlySet<string>;
}): string[] {
  const targets: string[] = [];
  for (const sourcePath of sourcePaths) {
    if (!shouldPrecompress(sourcePath)) continue;
    if (
      uploadedPaths.has(sourcePath) ||
      !existingKeys.has(precompressedPath(sourcePath))
    ) {
      targets.push(sourcePath);
    }
  }
  return targets.sort();
}

/**
 * Whether a bucket key is a sibling this pipeline produces — `x.dts.br`,
 * but not some unrelated `notes.txt.br` that happens to end in `.br`.
 */
export function isPrecompressedKey(key: string): boolean {
  return key.endsWith(".br") && shouldPrecompress(key.slice(0, -".br".length));
}

/**
 * Siblings in the bucket whose source file is gone, so they should be too.
 *
 * The main `aws s3 sync --delete` cannot see these: its filters select
 * `*.dts`, which does not match `*.dts.br`, so without this a removed shape
 * leaves its compressed copy behind forever — and an edge rule that rewrites
 * to the sibling would happily keep serving it.
 */
export function orphanedSiblings({
  sourcePaths,
  existingKeys,
}: {
  sourcePaths: Iterable<string>;
  existingKeys: Iterable<string>;
}): string[] {
  const live = new Set<string>();
  for (const sourcePath of sourcePaths) {
    if (shouldPrecompress(sourcePath)) live.add(precompressedPath(sourcePath));
  }
  const orphans: string[] = [];
  for (const key of existingKeys) {
    if (isPrecompressedKey(key) && !live.has(key)) orphans.push(key);
  }
  return orphans.sort();
}

/**
 * Compress every target into `stagingDir`, mirroring its relative path.
 *
 * Bounded concurrency because `zlib.brotliCompress` is asynchronous and runs
 * on libuv's threadpool: awaiting one at a time leaves every core but one
 * idle. It matters now that interiors are included — 262 MB of them against
 * 16 MB of shapes — so a first run is minutes rather than tens of seconds.
 */
export async function compressAll(
  targets: readonly string[],
  {
    sourceDir,
    stagingDir,
    concurrency = defaultConcurrency(),
  }: { sourceDir: string; stagingDir: string; concurrency?: number },
): Promise<{ rawBytes: number; packedBytes: number }> {
  let rawBytes = 0;
  let packedBytes = 0;
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= targets.length) return;
      const target = targets[index];
      const source = path.join(sourceDir, target);
      // Read into a local before adding. `total += await f()` evaluates
      // `total` BEFORE awaiting, so a lane that resumes after another has
      // added writes back a stale sum and the count silently drifts.
      const raw = (await fs.stat(source)).size;
      rawBytes += raw;
      const packed = await writeBrotli(
        source,
        path.join(stagingDir, precompressedPath(target)),
      );
      packedBytes += packed;
    }
  }
  const lanes = Math.max(1, Math.min(concurrency, targets.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return { rawBytes, packedBytes };
}

/**
 * Node's brotli calls land on libuv's threadpool, which defaults to 4
 * threads; going wider than that only queues unless UV_THREADPOOL_SIZE is
 * raised too (the deploy workflow does).
 */
function defaultConcurrency(): number {
  const pool = Number.parseInt(process.env.UV_THREADPOOL_SIZE ?? "", 10);
  if (Number.isFinite(pool) && pool > 0) return pool;
  return 4;
}

/** Compress one file, returning the compressed size. */
export async function writeBrotli(
  sourceFile: string,
  destFile: string,
): Promise<number> {
  const raw = await fs.readFile(sourceFile);
  const packed = await brotliCompress(raw, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  await fs.mkdir(path.dirname(destFile), { recursive: true });
  await fs.writeFile(destFile, packed);
  return packed.length;
}

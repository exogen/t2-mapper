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
 * corpus; they cost storage and compression time when assets change.
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

export function shouldPrecompress(sourcePath: string): boolean {
  return PRECOMPRESS_EXTENSIONS.has(path.extname(sourcePath).toLowerCase());
}

/**
 * Whether a bucket key is a sibling this pipeline produces — `x.dts.br`,
 * but not some unrelated `notes.txt.br` that happens to end in `.br`.
 */
export function isPrecompressedKey(key: string): boolean {
  return key.endsWith(".br") && shouldPrecompress(key.slice(0, -".br".length));
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

/**
 * The HTTP metadata every game asset in R2 carries, in one place.
 *
 * Both the deploy sync and the metadata backfill read this module, so an
 * object's headers are the same however it got into the bucket. Anything
 * that writes to the bucket must go through `metadataFor` — R2 returns no
 * Content-Type at all when the uploader does not set one, and the AWS
 * CLI's own guesses are wrong for the game's formats (it reads `.dts` as
 * DTS audio and `.dif` as DV video).
 */
import path from "node:path";
import { TEXT_EXTENSIONS } from "./encoding.js";

/** Seconds a cache may reuse an asset without revalidating. */
export const ASSET_MAX_AGE = 7200;

/**
 * Seconds past max-age that a cache may serve the stale copy while it
 * revalidates in the background, so an expiring asset never makes a request
 * wait on the origin.
 */
export const ASSET_STALE_WHILE_REVALIDATE = 21600;

/**
 * Deliberately NO `s-maxage`: Cloudflare treats it as implying
 * `proxy-revalidate`, which stops a shared cache serving stale content at
 * all, so pairing it with stale-while-revalidate turns the whole
 * stale window off (requests come back EXPIRED rather than UPDATING).
 * `must-revalidate`, `proxy-revalidate` and `no-cache` do the same.
 */
export function cacheControl(
  maxAge: number = ASSET_MAX_AGE,
  staleWhileRevalidate: number = ASSET_STALE_WHILE_REVALIDATE,
): string {
  return `max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

/** The policy every asset carries unless a maintenance run overrides it. */
export const ASSET_CACHE_CONTROL = cacheControl();

/**
 * Text assets are all UTF-8: `scripts/lib/encoding.ts` converts them as
 * they are added, so the charset is a fact rather than a guess.
 */
export const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

/** Extensions whose type is more specific than plain text. */
const TEXT_OVERRIDES: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
};

/** Media and model formats, by their registered type. */
const MEDIA_CONTENT_TYPES: Record<string, string> = {
  ".avi": "video/x-msvideo",
  ".bmp": "image/bmp",
  ".glb": "model/gltf-binary",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".wav": "audio/wav",
};

/**
 * Engine formats with no registered media type: shapes, interiors,
 * animation sequences, terrain, spawn data, 8-bit bitmaps. Listed rather
 * than defaulted so a new extension is a deliberate decision instead of
 * silently shipping as a blob.
 */
const BINARY_EXTENSIONS = new Set([
  ".bm8",
  ".dif",
  ".dsq",
  ".dts",
  ".spn",
  ".ter",
]);

export const BINARY_CONTENT_TYPE = "application/octet-stream";

/**
 * The encoding on a precompressed `.br` sibling (see lib/precompress.ts).
 * A writer using `--metadata-directive REPLACE` must pass this alongside
 * Content-Type and Cache-Control, or the object serves compressed bytes
 * with no encoding header and every client gets garbage.
 */
export const PRECOMPRESSED_CONTENT_ENCODING = "br";

export interface AssetMetadata {
  contentType: string;
  cacheControl: string;
  contentEncoding?: string;
}

/**
 * The Content-Type for an asset path, or undefined when the extension is
 * one this table has never seen. Callers treat undefined as an error:
 * guessing is how `.dts` ended up as audio.
 */
export function contentTypeFor(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_OVERRIDES[ext]) return TEXT_OVERRIDES[ext];
  if (TEXT_EXTENSIONS.has(ext)) return TEXT_CONTENT_TYPE;
  if (MEDIA_CONTENT_TYPES[ext]) return MEDIA_CONTENT_TYPES[ext];
  if (BINARY_EXTENSIONS.has(ext)) return BINARY_CONTENT_TYPE;
  return undefined;
}

/**
 * Every header an uploaded object gets. A writer that replaces object
 * metadata (`--metadata-directive REPLACE`) must set all of these, or it
 * silently drops the ones it leaves out.
 */
export function metadataFor(filePath: string): AssetMetadata | undefined {
  const contentType = contentTypeFor(filePath);
  if (!contentType) return undefined;
  return { contentType, cacheControl: ASSET_CACHE_CONTROL };
}

/**
 * Headers for the `.br` sibling of a source file: the SOURCE's content type
 * (a compressed `.dts` is still a shape, not a brotli stream) plus the
 * encoding that tells the browser to inflate it.
 */
export function precompressedMetadataFor(
  sourcePath: string,
): AssetMetadata | undefined {
  const base = metadataFor(sourcePath);
  if (!base) return undefined;
  return { ...base, contentEncoding: PRECOMPRESSED_CONTENT_ENCODING };
}

/** Every extension the table knows, lower-cased and dot-prefixed. */
export function knownExtensions(): string[] {
  return [
    ...new Set([
      ...TEXT_EXTENSIONS,
      ...Object.keys(TEXT_OVERRIDES),
      ...Object.keys(MEDIA_CONTENT_TYPES),
      ...BINARY_EXTENSIONS,
    ]),
  ].sort();
}

/**
 * Group file paths by the Content-Type they should carry, keeping each
 * extension exactly as it is spelled on disk — the tree holds `.WAV` and
 * `.PNG` as well as their lower-cased twins, and the AWS CLI's
 * include/exclude patterns are case-sensitive.
 */
export function groupByContentType(filePaths: Iterable<string>): {
  groups: Map<string, Set<string>>;
  unknown: Map<string, string[]>;
} {
  const groups = new Map<string, Set<string>>();
  const unknown = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const ext = path.extname(filePath);
    const contentType = contentTypeFor(filePath);
    if (!contentType) {
      const seen = unknown.get(ext.toLowerCase()) ?? [];
      if (seen.length < 3) seen.push(filePath);
      unknown.set(ext.toLowerCase(), seen);
      continue;
    }
    let extensions = groups.get(contentType);
    if (!extensions) {
      extensions = new Set();
      groups.set(contentType, extensions);
    }
    extensions.add(ext);
  }
  return { groups, unknown };
}

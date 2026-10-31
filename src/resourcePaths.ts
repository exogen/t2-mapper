/**
 * Where game resources live: the manifest's resource entries, the layout of
 * the extracted assets, and resource naming conventions. Pure (no manifest
 * import), so the relay and scripts can resolve entries from a manifest they
 * load themselves.
 */

/** The extracted game assets, relative to the repo root. */
export const ASSET_BASE_DIR = "docs/base";

export type SourceTuple =
  // Same casing as the entry's first-seen path
  | [sourcePath: string]
  // Different casing in this source
  | [sourcePath: string, actualPath: string];

/**
 * A manifest resource entry: the path's first-seen casing, then a source
 * tuple per source holding it, in layering order. A loose file's source is
 * the empty string. Later VL2s override earlier ones, so the last source
 * wins.
 */
export type ResourceEntry = [firstSeenPath: string, ...SourceTuple[]];

export interface ResourceSource {
  /** VL2 path under `@vl2`, or the empty string for a loose file. */
  source: string;
  /** The resource's path inside the source, with that source's casing. */
  actualPath: string;
}

function toResourceSource(
  firstSeenPath: string,
  [source, actualPath]: SourceTuple,
): ResourceSource {
  return { source, actualPath: actualPath ?? firstSeenPath };
}

/** Every source of a resource entry, in layering order. */
export function resourceSources(entry: ResourceEntry): ResourceSource[] {
  const [firstSeenPath, ...sourceTuples] = entry;
  return sourceTuples.map((tuple) => toResourceSource(firstSeenPath, tuple));
}

/** The last (winning) source of a resource entry, with its actual path. */
export function winningSource(entry: ResourceEntry): ResourceSource {
  const [firstSeenPath, ...sourceTuples] = entry;
  return toResourceSource(firstSeenPath, sourceTuples[sourceTuples.length - 1]);
}

/**
 * A source file's location relative to the asset root, as both URL and file
 * path: `@vl2/<source>/<path>` inside a VL2, `<path>` for a loose file.
 */
export function sourceFilePath({ source, actualPath }: ResourceSource): string {
  return source ? `@vl2/${source}/${actualPath}` : actualPath;
}

/** The winning source's location relative to the asset root. */
export function winningSourcePath(entry: ResourceEntry): string {
  return sourceFilePath(winningSource(entry));
}

/** Resource path of a shape named by a datablock or mission object. */
export function shapeResourcePath(shapeName: string): string {
  return `shapes/${shapeName}`;
}

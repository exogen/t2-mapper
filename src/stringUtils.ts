/**
 * Normalizes a path string, but not as complicated as Node's `path.normalize`.
 * This simply changes all backslashes to `/` (regardless of platform) and
 * collapses any adjacent slashes to a single slash.
 */
export function normalizePath(pathString: string) {
  return pathString.replace(/\\/g, "/").replace(/\/+/g, "/");
}

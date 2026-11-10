import { isDiscordId } from "./accountTypes.js";

/** Lowercase slug: special chars stripped, word runs joined with dashes. */
function slugify(part: string): string {
  return part
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `<server-slug>_<sortable UTC datetime>_<mission-slug>_<random id>.rec`
 * — the random component guarantees uniqueness (same-named servers
 * cycling in the same minute would otherwise collide and corrupt each
 * other's spools).
 */
export function buildDemoFilename(
  date: Date,
  serverName: string,
  missionName: string,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
  const serverSlug = slugify(serverName).slice(0, 60) || "server";
  const missionSlug = slugify(missionName).slice(0, 40) || "mission";
  const id = Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(3)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${serverSlug}_${stamp}_${missionSlug}_${id}.rec`;
}

/** A storage basename, independent of the naming scheme used for new uploads. */
function isDemoFilename(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 4 &&
    value.length <= 512 &&
    /\.rec$/i.test(value) &&
    !/[/\\:\u0000-\u001f\u007f]/.test(value) &&
    !/%(?:2f|5c)/i.test(value)
  );
}

/** Recognize the managed storage directory at untrusted input boundaries. */
export function isUserDemoKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^users\/([^/]+)\/([^/]+)$/.exec(value);
  return !!match && isDiscordId(match[1]) && isDemoFilename(match[2]);
}

/** Legacy flat filenames and the one managed user-upload directory shape. */
export function isPublishedDemoKey(value: unknown): value is string {
  return isUserDemoKey(value) || isDemoFilename(value);
}

/** Encode filename characters without escaping the managed directory separators. */
export function encodedDemoKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** Resolve only a canonical recording inside the configured published directory. */
export function publishedDemoKeyFromUrl(
  sourceUrl: string | null,
  baseUrl: string,
): string | null {
  if (!sourceUrl || !baseUrl) return null;
  try {
    const origin =
      (globalThis as { location?: { href: string } }).location?.href ??
      "http://localhost/";
    const base = new URL(`${baseUrl.replace(/\/+$/, "")}/`, origin);
    const source = new URL(sourceUrl, origin);
    if (
      source.origin !== base.origin ||
      source.username ||
      source.password ||
      source.search ||
      source.hash ||
      !source.pathname.startsWith(base.pathname)
    )
      return null;
    const segments = source.pathname
      .slice(base.pathname.length)
      .split("/")
      .map(decodeURIComponent);
    if (segments.some((segment) => /[/\\]/.test(segment))) return null;
    const key = segments.join("/");
    return isPublishedDemoKey(key) ? key : null;
  } catch {
    return null;
  }
}

/** Shared JSON contract for <source>/<id>.rec.json, separate from cast sidecars. */
export interface SourceDemoMetadata {
  format: "t2-source-demo";
  schemaVersion: 1;
  source: string;
  id: string;
  sourceUrl: string;
  fetchedAt: string;
  /** Upstream Last-Modified as UTC ISO 8601, or null when absent/invalid. */
  recordedAt: string | null;
  originalFilename: string | null;
  gameVersion: 25034;
  protocolVersion: number;
  durationMs: number;
}

/** The .rec protocol identifier written by Tribes 2 build 25034. */
export const SOURCE_DEMO_PROTOCOL_VERSION = 0x330004;

/** Handles plain/quoted filename and RFC 5987 filename*, preferring the latter. */
export function contentDispositionFilename(
  header: string | null,
): string | null {
  if (!header) return null;
  let plain: string | null = null;
  let extended: string | null = null;
  const params = /;\s*(filename\*?)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))/gi;
  for (const match of header.matchAll(params)) {
    const value =
      match[2] != null ? match[2].replace(/\\(.)/g, "$1") : match[3].trim();
    if (match[1].toLowerCase() === "filename") {
      plain ??= value || null;
      continue;
    }
    const encoded = /^([^']*)'[^']*'(.*)$/.exec(value);
    if (!encoded) continue;
    try {
      const charset = encoded[1].toLowerCase();
      if (charset === "utf-8")
        extended = decodeURIComponent(encoded[2]) || null;
      else if (charset === "iso-8859-1")
        extended =
          encoded[2].replace(/%([\da-f]{2})/gi, (_, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
          ) || null;
    } catch {
      /* A malformed extended value falls back to filename. */
    }
  }
  return extended ?? plain;
}

export function sourceDemoMetadata(value: unknown): SourceDemoMetadata | null {
  if (!value || typeof value !== "object") return null;
  const m = value as SourceDemoMetadata;
  const timestamp = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  if (
    m.format !== "t2-source-demo" ||
    m.schemaVersion !== 1 ||
    typeof m.source !== "string" ||
    typeof m.id !== "string" ||
    typeof m.sourceUrl !== "string" ||
    !timestamp(m.fetchedAt) ||
    (m.recordedAt !== null && !timestamp(m.recordedAt)) ||
    (m.originalFilename !== null &&
      (typeof m.originalFilename !== "string" ||
        m.originalFilename.length === 0)) ||
    m.gameVersion !== 25034 ||
    m.protocolVersion !== SOURCE_DEMO_PROTOCOL_VERSION ||
    !Number.isInteger(m.durationMs) ||
    m.durationMs < 0 ||
    m.durationMs > 0xffffffff
  )
    return null;
  return m;
}

/** Shared with the browser; keep this module free of Node-only imports. */
export const DEMO_DOWNLOAD_PREFIX = "/demo-download/";

export function tribesForeverDownloadUrl(id: string): string {
  if (!/^[1-9]\d*$/.test(id)) {
    throw new Error("TribesForever demo ID must be a positive integer");
  }
  return `https://tribesforever.com/demo/${id}/download`;
}

export interface RemoteDemo {
  source: string;
  id: string;
  url: string;
  cachePath: string;
}

/** Server-side allowlist: browser input never supplies a URL to fetch. */
const remoteSources = new Map([["tribesforever", tribesForeverDownloadUrl]]);

export function resolveRemoteDemo(source: string, id: string): RemoteDemo {
  const resolve = remoteSources.get(source);
  if (!resolve) throw new Error("Unknown demo source");
  return {
    source,
    id,
    url: resolve(id),
    cachePath: `sources/${source}/${encodeURIComponent(id)}.rec`,
  };
}

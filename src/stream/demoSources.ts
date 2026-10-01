import {
  DEMO_DOWNLOAD_PREFIX,
  tribesForeverDownloadUrl,
} from "../../relay/demoSources";
import { DEMOS_BASE_URL, demoDownloadUrl } from "./demoIndex";
import {
  sourceDemoMetadata,
  type SourceDemoMetadata,
} from "../../relay/demoSourceMetadata";

export class DemoSourceLoadError extends Error {}

export interface DemoSource {
  /** Stable, public source URL, even when the bytes need a relay. */
  url: string;
  /** Published sidecars are only available for demos from our own index. */
  sidecarSourceUrl: string | null;
  /** Cached external demos can have seek checkpoints without index sidecars. */
  checkpointSourceUrl?(response: Response): string | null;
  load(signal: AbortSignal): Promise<Response>;
  loadMetadata?(
    response: Response,
    signal: AbortSignal,
  ): Promise<SourceDemoMetadata | null>;
}

export type DemoSourceLoader = (id: string) => DemoSource;

function waitForDemoPoll(signal: AbortSignal, delayMs: number): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

/** Add a qualifier here to support another source in ?demo=<source>:<id>. */
export const demoSourceLoaders: ReadonlyMap<string, DemoSourceLoader> = new Map(
  [
    [
      "tribesforever",
      (id) => {
        const url = tribesForeverDownloadUrl(id);
        return {
          url,
          sidecarSourceUrl: null,
          checkpointSourceUrl: (response) =>
            response.url?.endsWith(`/sources/tribesforever/${id}.rec`)
              ? response.url
              : null,
          async load(signal) {
            // TribesForever's download endpoint does not allow browser CORS.
            if (!process.env.RELAY_URL) {
              throw new DemoSourceLoadError("RELAY_URL is not configured");
            }
            const relay = new URL(process.env.RELAY_URL);
            if (relay.protocol === "wss:") relay.protocol = "https:";
            else if (relay.protocol === "ws:") relay.protocol = "http:";
            relay.pathname = `${DEMO_DOWNLOAD_PREFIX}tribesforever/${id}`;
            relay.search = "";
            relay.hash = "";
            let response: Response;
            for (;;) {
              signal.throwIfAborted();
              response = await fetch(relay.href, {
                signal,
                // A CORS-safelisted opt-in; older clients only accept bytes.
                headers: {
                  Accept: "application/octet-stream, application/json",
                },
              });
              if (response.status !== 202) break;
              await response.body?.cancel();
              const retrySeconds = Number(response.headers.get("retry-after"));
              await waitForDemoPoll(
                signal,
                Number.isFinite(retrySeconds) && retrySeconds > 0
                  ? Math.min(30, Math.max(1, retrySeconds)) * 1000
                  : 2000,
              );
            }
            if (response.status === 422 || response.status === 413)
              throw new DemoSourceLoadError(await response.text());
            if (response.status === 503) {
              await response.body?.cancel();
              throw new DemoSourceLoadError(
                "Demo downloads are busy. Please try again shortly.",
              );
            }
            return response;
          },
          async loadMetadata(response, signal) {
            // The relay redirects only after both cached files are complete.
            // No R2 configured: the response stays on the relay, with no sidecar.
            if (!response.url?.endsWith(`/sources/tribesforever/${id}.rec`))
              return null;
            const sidecar = await fetch(`${response.url}.json`, { signal });
            if (!sidecar.ok) {
              await sidecar.body?.cancel();
              return null;
            }
            const metadata = sourceDemoMetadata(await sidecar.json());
            return metadata?.source === "tribesforever" &&
              metadata.id === id &&
              metadata.sourceUrl === url
              ? metadata
              : null;
          },
        };
      },
    ],
  ],
);

export function directDemoSource(url: string): DemoSource {
  return {
    url,
    sidecarSourceUrl: url,
    load: (signal) => fetch(url, { signal }),
  };
}

export function resolveDemoSource(reference: string): DemoSource {
  const separator = reference.indexOf(":");
  if (separator >= 0) {
    const qualifier = reference.slice(0, separator).toLowerCase();
    const loader = demoSourceLoaders.get(qualifier);
    if (!loader) throw new Error(`Unknown demo source: ${qualifier}`);
    return loader(reference.slice(separator + 1));
  }
  if (!DEMOS_BASE_URL)
    throw new Error("Demo index not configured (DEMOS_BASE_URL)");
  return directDemoSource(demoDownloadUrl(reference));
}

/** Safe to use while matching a URL param against a loaded recording. */
export function demoSourceUrl(reference: string): string | null {
  try {
    return resolveDemoSource(reference).url;
  } catch {
    return null;
  }
}

import { linkPreviewCatalogPath } from "../relay/linkPreviewKey";
import {
  linkPreviewUrl,
  resolveLinkPreviewTarget,
  type LinkPreviewTarget,
} from "../relay/linkPreviewRoute";

interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  LINK_PREVIEW_SITE_URL?: string;
  LINK_PREVIEW_RELAY_URL?: string;
  LINK_PREVIEW_RELAY_SECRET?: string;
}

interface Context {
  request: Request;
  env: Env;
  next(request?: Request): Promise<Response>;
  passThroughOnException?(): void;
}

// These are the portions of the Pages runtime APIs used by the middleware.
interface RewriteElement {
  prepend(content: string, options: { html: boolean }): void;
  getAttribute(name: string): string | null;
  remove(): void;
}

declare class HTMLRewriter {
  on(
    selector: string,
    handler: { element(element: RewriteElement): void },
  ): this;
  transform(response: Response): Response;
}

const LOOKUP_TIMEOUT_MS = 1000;
type CatalogTarget = Extract<LinkPreviewTarget, { kind: "map" | "page" }>;

function hasContentType(response: Response, type: string) {
  return (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() === type
  );
}

// Both sources emit the same React-rendered head. Reject whole pages and
// unexpected markup before replacing the app head.
const headPattern =
  /^<title>[^<]+<\/title>\s*<link rel="canonical" href="[^"<>]+"\s*\/?>\s*(?:<meta (?:name|property)="[\w:-]+" content="[^"<>]*"\s*\/?>\s*)+$/;

async function readSnippet(response: Response, contentType: string) {
  if (response.status !== 200 || !hasContentType(response, contentType))
    return undefined;
  const head = (await response.text()).trim();
  return headPattern.test(head) ? head : undefined;
}

async function readCatalogHead(
  env: Env,
  target: CatalogTarget,
  requestUrl: string,
  signal: AbortSignal,
) {
  if (!env.ASSETS || signal.aborted) return undefined;

  try {
    const assetPath = await linkPreviewCatalogPath(target);
    if (signal.aborted) return undefined;
    const response = await env.ASSETS.fetch(
      new Request(new URL(`/${assetPath}`, requestUrl), { signal }),
    );
    return await readSnippet(response, "text/plain");
  } catch {
    return undefined;
  }
}

async function readRelayHead(
  env: Env,
  target: LinkPreviewTarget,
  siteUrl: string,
  signal: AbortSignal,
) {
  if (
    signal.aborted ||
    !env.LINK_PREVIEW_RELAY_URL ||
    !env.LINK_PREVIEW_RELAY_SECRET
  )
    return undefined;

  try {
    const endpoint = new URL("/api/link-preview", env.LINK_PREVIEW_RELAY_URL);
    if (
      (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") ||
      endpoint.username ||
      endpoint.password
    )
      return undefined;
    endpoint.searchParams.set("url", linkPreviewUrl(target, siteUrl));
    const response = await fetch(endpoint, {
      signal,
      redirect: "manual",
      headers: { Authorization: `Bearer ${env.LINK_PREVIEW_RELAY_SECRET}` },
    });
    return await readSnippet(response, "text/html");
  } catch {
    return undefined;
  }
}

async function lookupCatalogHead(
  env: Env,
  target: CatalogTarget,
  requestUrl: string,
  signal: AbortSignal,
) {
  const head = await readCatalogHead(env, target, requestUrl, signal);
  // Explore falls back to a map's default mode if the requested one is absent.
  if (!head && target.kind === "map" && target.missionType)
    return readCatalogHead(
      env,
      { kind: "map", missionName: target.missionName },
      requestUrl,
      signal,
    );
  return head;
}

async function readHead(
  env: Env,
  target: LinkPreviewTarget,
  siteUrl: string,
  requestUrl: string,
) {
  const abort = new AbortController();
  const { signal } = abort;
  let fallbackHead: string | undefined;
  async function lookup() {
    // Load the generic head concurrently so it is available if the primary lookup stalls.
    const fallback =
      target.kind === "page" && target.page === "home"
        ? undefined
        : readCatalogHead(
            env,
            { kind: "page", page: "home" },
            requestUrl,
            signal,
          ).then((head) => (fallbackHead = head));
    const head =
      target.kind === "map" || target.kind === "page"
        ? await lookupCatalogHead(env, target, requestUrl, signal)
        : await readRelayHead(env, target, siteUrl, signal);
    return head ?? fallback;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<string | undefined>((resolve) => {
    timer = setTimeout(() => resolve(fallbackHead), LOOKUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([lookup(), deadline]);
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

const replacedMeta = /^(?:description$|theme-color$|og:|twitter:)/i;

function injectHead(response: Response, snippet: string) {
  const headers = new Headers(response.headers);
  // The asset validators describe the static shell, not the injected HTML.
  for (const header of [
    "etag",
    "last-modified",
    "content-length",
    "accept-ranges",
  ])
    headers.delete(header);
  headers.set("Cache-Control", "no-store");
  // The inserted metadata can move the shell's charset declaration past 1024 bytes.
  headers.set("Content-Type", "text/html; charset=utf-8");
  const updated = new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
  return new HTMLRewriter()
    .on("head", { element: (head) => head.prepend(snippet, { html: true }) })
    .on("head > title", { element: (element) => element.remove() })
    .on('head > link[rel~="canonical"]', {
      element: (element) => element.remove(),
    })
    .on("head > meta", {
      element(element) {
        if (
          replacedMeta.test(element.getAttribute("name") ?? "") ||
          replacedMeta.test(element.getAttribute("property") ?? "")
        )
          element.remove();
      },
    })
    .transform(updated);
}

export async function onRequest({
  env,
  request,
  next,
  passThroughOnException,
}: Context): Promise<Response> {
  if (
    request.method !== "GET" ||
    request.headers.has("range") ||
    (!env.ASSETS &&
      !(env.LINK_PREVIEW_RELAY_URL && env.LINK_PREVIEW_RELAY_SECRET))
  )
    return next();

  let siteUrl: string;
  try {
    siteUrl = linkPreviewUrl(
      { kind: "page", page: "home" },
      env.LINK_PREVIEW_SITE_URL,
    );
  } catch {
    return next();
  }
  const target = resolveLinkPreviewTarget(
    new URL(request.url),
    new URL(siteUrl).pathname,
  );
  if (!target) return next();

  passThroughOnException?.();
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  const response = await next(new Request(request, { headers }));
  if (
    response.status !== 200 ||
    !hasContentType(response, "text/html") ||
    !response.body
  )
    return response;

  const head = await readHead(env, target, siteUrl, request.url);
  return head ? injectHead(response, head) : response;
}

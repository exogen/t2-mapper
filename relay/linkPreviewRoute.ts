import { normalizeAddress } from "./shared.js";

/** Public entities share one preview regardless of playback time or camera. */
export type LinkPreviewTarget =
  | { kind: "map"; missionName: string; missionType?: string }
  | { kind: "demo"; demo: string }
  | { kind: "server"; address?: string; name?: string }
  | { kind: "profile"; userId: string }
  | { kind: "clip"; clipId: string; demo?: string }
  | {
      kind: "page";
      page: "home" | "maps" | "demos" | "servers" | "clips" | "replays";
    };

const modes = ["map", "demo", "live", "replay"] as const;
type Mode = (typeof modes)[number];

/** Normalize the configured application directory, never the requested path. */
function directoryPath(basePath: string): string {
  const path = `/${basePath.replace(/^\/+|\/+$/g, "")}`;
  return path === "/" ? path : `${path}/`;
}

/** Match the static entry URLs, including their index.html aliases. */
function isEntry(path: string, directory: string): boolean {
  return (
    path === directory ||
    (directory !== "/" && path === directory.slice(0, -1)) ||
    path === `${directory}index.html`
  );
}

/**
 * Identify what the app actually opens. Explicit modes discard incompatible
 * fields, as normalizeNavigationQuery does in the browser. Identifiers remain
 * opaque here; the public data resolver decides whether they exist.
 */
export function resolveLinkPreviewTarget(
  url: URL,
  basePath = "/",
): LinkPreviewTarget | null {
  const root = directoryPath(basePath);
  const watch = isEntry(url.pathname, `${root}watch/`);
  if (isEntry(url.pathname, `${root}clips/`))
    return { kind: "page", page: "clips" };
  if (!watch && !isEntry(url.pathname, root)) return null;

  const params = url.searchParams;
  const requestedMode = params.get("mode");
  const explicitMode = modes.includes(requestedMode as Mode)
    ? (requestedMode as Mode)
    : null;
  const demo = params.get("demo");
  const clip = params.get("clip");
  const user = params.get("user");
  const replay = params.get("replay");
  const address = params.get("address");
  const name = params.get("name");
  // The legacy /watch entry always redirects to mode=live.
  const mode: Mode = watch
    ? "live"
    : (explicitMode ??
      (replay
        ? "replay"
        : demo || clip || user !== null
          ? "demo"
          : address || name
            ? "live"
            : "map"));

  switch (mode) {
    case "demo":
      if (clip) return { kind: "clip", clipId: clip, ...(demo && { demo }) };
      if (demo) return { kind: "demo", demo };
      if (user) return { kind: "profile", userId: user };
      return { kind: "page", page: "demos" };
    case "live":
      if (address)
        return { kind: "server", address: normalizeAddress(address) };
      if (name) return { kind: "server", name };
      return { kind: "page", page: "servers" };
    case "replay":
      return { kind: "page", page: "replays" };
    case "map": {
      const mission = params.get("mission");
      if (mission) {
        const [missionName, missionType] = mission.split("~");
        if (missionName)
          return {
            kind: "map",
            missionName,
            ...(missionType && { missionType }),
          };
      }
      return {
        kind: "page",
        page: explicitMode === "map" || mission !== null ? "maps" : "home",
      };
    }
  }
}

/**
 * Build public canonical links from trusted deployment configuration. Never
 * reuse a request's parameters: they can contain credentials, owner tokens,
 * tracking fields, or state irrelevant to an entity-level preview.
 */
export function linkPreviewUrl(
  target: LinkPreviewTarget,
  siteUrl = "https://play.tribes2.online/",
): string {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Link preview site URL must use HTTP or HTTPS");
  url.username = "";
  url.password = "";
  url.pathname = directoryPath(url.pathname);
  url.search = "";
  url.hash = "";
  const params = url.searchParams;

  switch (target.kind) {
    case "map":
      params.set("mode", "map");
      params.set(
        "mission",
        `${target.missionName}${target.missionType ? `~${target.missionType}` : ""}`,
      );
      break;
    case "demo":
      params.set("mode", "demo");
      params.set("demo", target.demo);
      break;
    case "clip":
      params.set("mode", "demo");
      if (target.demo) params.set("demo", target.demo);
      params.set("clip", target.clipId);
      break;
    case "profile":
      params.set("mode", "demo");
      params.set("user", target.userId);
      break;
    case "server":
      params.set("mode", "live");
      if (target.address)
        params.set("address", normalizeAddress(target.address));
      else if (target.name) params.set("name", target.name);
      break;
    case "page":
      switch (target.page) {
        case "home":
          break;
        case "maps":
          params.set("mode", "map");
          break;
        case "demos":
          params.set("mode", "demo");
          break;
        case "servers":
          params.set("mode", "live");
          break;
        case "replays":
          params.set("mode", "replay");
          break;
        case "clips":
          url.pathname += "clips/";
          break;
      }
      break;
  }
  return url.href;
}

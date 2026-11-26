import type { LinkPreviewTarget } from "./linkPreviewRoute.js";
import { normalizeAddress } from "./shared.js";

/** Prefix for the local preview gallery's inspectable artifacts. */
export const LINK_PREVIEW_PREFIX = "previews/v1";

export const LINK_PREVIEW_FILES = [
  "head.html",
  "preview.html",
  "data.json",
] as const;

export type LinkPreviewArtifactFile = (typeof LINK_PREVIEW_FILES)[number];

const DIRECTORIES: Record<LinkPreviewTarget["kind"], string> = {
  map: "maps",
  demo: "demos",
  server: "servers",
  profile: "profiles",
  clip: "clips",
  page: "pages",
};

function storagePrefix(prefix: string): string {
  const clean = prefix.replace(/^\/+|\/+$/g, "");
  if (
    !clean ||
    clean
      .split("/")
      .some((segment) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment))
  ) {
    throw new Error("Link-preview prefix must contain safe path segments");
  }
  return clean;
}

/** The fields identifying a resource, independent of unrelated URL parameters. */
function targetIdentity(target: LinkPreviewTarget): string | readonly string[] {
  switch (target.kind) {
    case "map":
      return [target.missionName, target.missionType ?? ""];
    case "demo":
      return [target.demo];
    case "server":
      return target.address
        ? ["address", normalizeAddress(target.address)]
        : ["name", target.name ?? ""];
    case "profile":
      return [target.userId];
    case "clip":
      return [target.clipId];
    case "page":
      return target.page;
  }
}

/** Identify a local preview artifact independently of unrelated URL parameters. */
export function linkPreviewObjectLocation(
  target: LinkPreviewTarget,
  prefix: string,
) {
  return {
    directory: `${storagePrefix(prefix)}/${DIRECTORIES[target.kind]}`,
    identity: targetIdentity(target),
  };
}

/** The build and Pages Function use the same path for a deployed snippet. */
export async function linkPreviewCatalogPath(
  target: Extract<LinkPreviewTarget, { kind: "map" | "page" }>,
): Promise<string> {
  const { directory, identity } = linkPreviewObjectLocation(
    target,
    "preview-snippets",
  );
  const id =
    typeof identity === "string"
      ? identity
      : Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(JSON.stringify(identity)),
            ),
          ),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
  // Pages redirects canonical .html paths. The payload is plain text until injected.
  return `${directory}/${id}/head.txt`;
}

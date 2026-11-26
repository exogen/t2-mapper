import { createHash } from "node:crypto";
import {
  LINK_PREVIEW_FILES,
  LINK_PREVIEW_PREFIX,
  linkPreviewObjectLocation,
  type LinkPreviewArtifactFile,
} from "./linkPreviewKey.js";
import type { LinkPreviewTarget } from "./linkPreviewRoute";

export {
  LINK_PREVIEW_PREFIX,
  type LinkPreviewArtifactFile,
} from "./linkPreviewKey.js";

/**
 * A central namespace works for every link type, including resources which
 * have no recording sidecar. Full hashes keep demo paths, server addresses,
 * Unicode and arbitrarily long names out of object paths. Do not hash the
 * incoming URL: tracking parameters and display labels aren't identities.
 */
export function linkPreviewObjectKey(
  target: LinkPreviewTarget,
  file: LinkPreviewArtifactFile = "head.html",
  prefix: string = LINK_PREVIEW_PREFIX,
): string {
  if (!LINK_PREVIEW_FILES.includes(file))
    throw new Error("Unknown link-preview artifact");
  const { directory, identity } = linkPreviewObjectLocation(target, prefix);
  const id =
    typeof identity === "string"
      ? identity
      : createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  return `${directory}/${id}/${file}`;
}

/**
 * All persisted heads are mutable. Server summaries may be reused briefly;
 * authored content must revalidate so edits and deletions don't inherit an
 * immutable asset policy. These headers don't control social-platform caches.
 */
export function linkPreviewCacheControl(target: LinkPreviewTarget): string {
  return target.kind === "server" ? "public, max-age=30" : "no-cache";
}

export interface LinkPreviewArtifact {
  key: string;
  body: string;
  contentType: string;
  cacheControl: string;
}

/** Structural input keeps storage independent of the React renderer. */
export interface LinkPreviewArtifactSource<Metadata = unknown> {
  target: LinkPreviewTarget;
  metadata: Metadata;
  headHtml: string;
  documentHtml: string;
}

/**
 * Produce local preview artifacts without doing any I/O. head.html is the
 * generated metadata; preview.html is a standalone authoring view;
 * data.json makes the metadata inspectable without parsing generated HTML.
 */
export function linkPreviewArtifacts<Metadata>(
  preview: LinkPreviewArtifactSource<Metadata>,
  prefix: string = LINK_PREVIEW_PREFIX,
): LinkPreviewArtifact[] {
  const cacheControl = linkPreviewCacheControl(preview.target);
  const bodies: Record<LinkPreviewArtifactFile, string> = {
    "head.html": preview.headHtml,
    "preview.html": preview.documentHtml,
    "data.json": `${JSON.stringify(
      { version: 1, target: preview.target, metadata: preview.metadata },
      null,
      2,
    )}\n`,
  };
  return LINK_PREVIEW_FILES.map((file) => ({
    key: linkPreviewObjectKey(preview.target, file, prefix),
    body: bodies[file],
    contentType:
      file === "data.json"
        ? "application/json; charset=utf-8"
        : "text/html; charset=utf-8",
    cacheControl,
  }));
}

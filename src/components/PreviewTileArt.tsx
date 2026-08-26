import type { ReactNode } from "react";
import {
  RawPreviewImage,
  TILE_FALLBACK_ART_URL,
  useFirstAvailableImage,
} from "./missionPreview";
import tileStyles from "./PreviewTile.module.css";

/**
 * A PreviewTile's art pane: tries the candidate art URLs in order (404s
 * and failures skip to the next), falling back to the generic background
 * — which is what `data-default-image` marks for the dimming variants.
 * While candidates are still being checked the pane shows only the dark
 * backing (no premature fallback flash). `children` render over the art
 * (badges, placeholder icons).
 */
export function PreviewTileArt({
  candidates,
  variant,
  children,
}: {
  candidates: readonly (string | null | undefined)[];
  /** TilePreview data-variant (e.g. "server" dims less than demo cards). */
  variant?: string;
  children?: ReactNode;
}) {
  const { url: artUrl, pending } = useFirstAvailableImage(candidates);
  const previewUrl = pending ? null : (artUrl ?? TILE_FALLBACK_ART_URL);
  return (
    <span
      className={tileStyles.TilePreview}
      data-variant={variant}
      data-default-image={!pending && artUrl == null}
      aria-hidden
    >
      {previewUrl && (
        <RawPreviewImage
          src={previewUrl}
          alt=""
          className={tileStyles.TileImage}
        />
      )}
      {children}
    </span>
  );
}

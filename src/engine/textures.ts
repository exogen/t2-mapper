import { type Texture, type WebGLRenderer } from "three";
import {
  loadHtmlTexture,
  recordSkippedHtmlTextureUpload,
} from "../assets/htmlTextures";

/**
 * Load several textures, then prepare them and upload them to the GPU
 * ahead of their first draw.
 */
export async function loadTextures(
  urls: readonly string[],
  renderer: WebGLRenderer,
  setup?: (texture: Texture) => void,
  signal?: AbortSignal,
): Promise<Texture[]> {
  const textures = await Promise.all(urls.map(loadHtmlTexture));
  for (const texture of textures) {
    if (signal?.aborted) {
      recordSkippedHtmlTextureUpload();
      continue;
    }
    setup?.(texture);
    if (signal?.aborted) {
      recordSkippedHtmlTextureUpload();
      continue;
    }
    renderer.initTexture(texture);
  }
  return textures;
}

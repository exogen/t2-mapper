import { TextureLoader, type Texture, type WebGLRenderer } from "three";

const loader = new TextureLoader();
const cache = new Map<string, Promise<Texture>>();

/**
 * Load a texture once per URL and share it: an HTMLImageElement through
 * three's TextureLoader. Callers that change sampler or colour settings
 * change them for every user of that URL.
 */
export function loadSharedTexture(url: string): Promise<Texture> {
  let promise = cache.get(url);
  if (!promise) {
    promise = loader.loadAsync(url);
    // A failed URL can be retried later.
    promise.catch(() => cache.delete(url));
    cache.set(url, promise);
  }
  return promise;
}

/**
 * Load several textures, then prepare them and upload them to the GPU
 * ahead of their first draw.
 */
export async function loadTextures(
  urls: readonly string[],
  renderer: WebGLRenderer,
  setup?: (texture: Texture) => void,
): Promise<Texture[]> {
  const textures = await Promise.all(urls.map(loadSharedTexture));
  for (const texture of textures) {
    setup?.(texture);
    renderer.initTexture(texture);
  }
  return textures;
}

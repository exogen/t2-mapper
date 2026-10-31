import type { DIFModel } from "../dif/difLoader";
import { InteriorLoader } from "../interiorLoader";

const interiors = new Map<string, Promise<DIFModel>>();

/**
 * Load an interior's DIF once per URL and share it: geometry, surface
 * flags and embedded lightmaps. Parsing starts its textures loading too.
 */
export function loadInterior(url: string): Promise<DIFModel> {
  let promise = interiors.get(url);
  if (!promise) {
    promise = new InteriorLoader().loadAsync(url);
    // A failed URL can be retried later.
    promise.catch(() => interiors.delete(url));
    interiors.set(url, promise);
  }
  return promise;
}

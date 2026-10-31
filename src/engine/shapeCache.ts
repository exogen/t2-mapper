import type { DTSModel } from "../dts/dtsModel";
import { shapeToUrl } from "../loaders";
import { ShapeLoader } from "../shapeLoader";

// The default loading manager's ShapeLoader cache is the one prefetches,
// projectile pools and loading progress already share.
const loader = new ShapeLoader();
const loaded = new Map<string, DTSModel>();

/**
 * Load a DTS shape (with its sequences) by shape file name.
 */
export function loadShape(shapeName: string): Promise<DTSModel> {
  const done = loaded.get(shapeName);
  if (done) return Promise.resolve(done);
  return new Promise<DTSModel>((resolve, reject) => {
    // Throws for a shape missing from the manifest.
    const url = shapeToUrl(shapeName);
    loader.load(
      url,
      (model) => {
        loaded.set(shapeName, model);
        resolve(model);
      },
      undefined,
      reject,
    );
  });
}

/**
 * The shape if it has already loaded, so a view can build it in the same
 * frame instead of showing its placeholder for one.
 */
export function peekShape(shapeName: string): DTSModel | undefined {
  return loaded.get(shapeName);
}

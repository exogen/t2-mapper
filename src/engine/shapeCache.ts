import type { DTSModel } from "../dts/dtsModel";
import type { DTSShapeData } from "../dts/dtsTypes";
import { shapeToUrl } from "../loaders";
import { ShapeLoader } from "../shapeLoader";

// The default loading manager's ShapeLoader cache is the one prefetches,
// projectile pools and loading progress already share.
const loader = new ShapeLoader();

/** Share the view's shape and sequences without waiting for textures. */
export function loadProjectileShapeData(
  shapeName: string,
): DTSShapeData | Promise<DTSShapeData> {
  const url = shapeToUrl(shapeName);
  return loader.peekShapeData(url) ?? loader.loadShapeData(url);
}

/**
 * Load a DTS shape (with its sequences) by shape file name.
 */
export async function loadShape(shapeName: string): Promise<DTSModel> {
  return loader.loadAsync(shapeToUrl(shapeName));
}

/**
 * The shape if it has already loaded, so a view can build it in the same
 * frame instead of showing its placeholder for one.
 */
export function peekShape(shapeName: string): DTSModel | undefined {
  try {
    return loader.peekModel(shapeToUrl(shapeName));
  } catch {
    return undefined; // A custom shape may be absent from the manifest.
  }
}

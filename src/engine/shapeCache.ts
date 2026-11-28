import type { DTSModel } from "../dts/dtsModel";
import type { AssetLoadPriority } from "../assets/assetLoadQueue";
import type { DTSShapeData } from "../dts/dtsTypes";
import { shapeToUrl } from "../loaders";
import { ShapeLoader } from "../shapeLoader";
import { DefaultLoadingManager, type LoadingManager } from "three";
import type { GameEngine } from "./gameEngine";

const loaders = new WeakMap<LoadingManager, ShapeLoader>();
function getLoader(manager: LoadingManager): ShapeLoader {
  let loader = loaders.get(manager);
  if (!loader) {
    loader = new ShapeLoader(manager);
    loaders.set(manager, loader);
  }
  return loader;
}

/** Share the view's shape and sequences without waiting for textures. */
export function loadProjectileShapeData(
  shapeName: string,
  manager: LoadingManager = DefaultLoadingManager,
): DTSShapeData | Promise<DTSShapeData> {
  const loader = getLoader(manager);
  const url = shapeToUrl(shapeName);
  return loader.peekShapeData(url) ?? loader.loadShapeData(url);
}

/**
 * Load a DTS shape (with its sequences) by shape file name.
 */
export async function loadShape(
  shapeName: string,
  manager = DefaultLoadingManager,
): Promise<DTSModel> {
  return getLoader(manager).loadAsync(shapeToUrl(shapeName));
}

/** Background work includes dependent image/atlas readiness, not GPU upload. */
export function loadShapeDependencies(
  shapeName: string,
  manager = DefaultLoadingManager,
  priority?: AssetLoadPriority,
): Promise<void> {
  return getLoader(manager).loadDependencies(shapeToUrl(shapeName), priority);
}

/**
 * The shape if it has already loaded, so a view can build it in the same
 * frame instead of showing its placeholder for one.
 */
export function peekShape(
  shapeName: string,
  manager = DefaultLoadingManager,
): DTSModel | undefined {
  try {
    return getLoader(manager).peekModel(shapeToUrl(shapeName));
  } catch {
    return undefined; // A custom shape may be absent from the manifest.
  }
}

/** Use a cached shape immediately when possible, or wait for the model and host. */
export function withShape(
  engine: GameEngine,
  shapeName: string,
  onLoad: (model: DTSModel) => void,
  onError: (error: unknown) => void,
): () => void {
  const manager = engine.assetLoadingManager;
  const cached = peekShape(shapeName, manager);
  if (cached && engine.currentHost) {
    onLoad(cached);
    return () => {};
  }

  const controller = new AbortController();
  const { signal } = controller;
  void Promise.all([
    cached ?? loadShape(shapeName, manager),
    engine.whenHost(signal),
  ]).then(
    ([model]) => {
      if (!signal.aborted) onLoad(model);
    },
    (error: unknown) => {
      if (signal.aborted) return;
      controller.abort();
      onError(error);
    },
  );
  return () => controller.abort();
}

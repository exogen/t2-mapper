import type { FileLoader, LoadingManager } from "three";
import { DTSLoader } from "./dts/dtsLoader";
import { getResourceMap } from "./manifest";
import { getUrlForPath, textureToUrl } from "./loaders";
import { loadTextureInstance } from "./textureUtils";
import { DTSMaterialFlags } from "./dts/dtsTypes";
import { registerShapeSequences } from "./stream/shapeSequences";
import { registerShapeBounds } from "./stream/shapeBounds";
import type { DTSModel } from "./dts/dtsModel";
import { batchDTSRigidMeshes } from "./dts/dtsRigidBatch";
import { loadShapeImageLists } from "./iflAtlas";

// Both R3F's useLoader and imperative effect pools request the same source model.
const models = new WeakMap<LoadingManager, Map<string, Promise<DTSModel>>>();
const sequencePaths = new WeakMap<
  ReturnType<typeof getResourceMap>,
  readonly string[]
>();

/** App resource resolution shared by React, prefetch, and ordinary loaders. */
export class ShapeLoader extends DTSLoader {
  constructor(manager?: LoadingManager) {
    super(manager);
    this.imageListResolver = () => null; // Atlases load progressively below.
    this.setSequenceResolver((url) => {
      const stem = decodeURIComponent(url.split("/").pop()!)
        .replace(/\.dts$/i, "")
        .toLowerCase();
      const prefix = `shapes/${stem}_`;
      const resources = getResourceMap();
      let paths = sequencePaths.get(resources);
      if (!paths) {
        paths = Object.keys(resources)
          .filter((path) => path.startsWith("shapes/") && path.endsWith(".dsq"))
          .sort();
        sequencePaths.set(resources, paths);
      }
      return paths
        .filter((path) => path.startsWith(prefix))
        .map((path) => ({
          url: getUrlForPath(path),
          name: path.slice(prefix.length, -4),
        }));
    });
    this.setTextureResolver((name, flags) => {
      return flags & DTSMaterialFlags.IflMaterial
        ? null
        : loadTextureInstance(textureToUrl(name));
    });
  }
  override load(
    url: string,
    onLoad: (model: DTSModel) => void,
    onProgress?: Parameters<FileLoader["load"]>[2],
    onError?: (error: unknown) => void,
  ): void {
    let cache = models.get(this.manager);
    if (!cache) models.set(this.manager, (cache = new Map()));
    let pending = cache.get(url);
    if (!pending) {
      pending = new Promise<DTSModel>((resolve, reject) => {
        this.loadModel(url, resolve, onProgress, reject);
      });
      cache.set(url, pending);
      void pending.catch(() => {
        if (cache.get(url) === pending) cache.delete(url);
      });
    }
    void pending.then(onLoad, onError ?? console.error);
  }
  private loadModel(
    url: string,
    onLoad: (model: DTSModel) => void,
    onProgress?: Parameters<FileLoader["load"]>[2],
    onError?: (error: unknown) => void,
  ): void {
    super.load(
      url,
      (model) => {
        batchDTSRigidMeshes(model.scene);
        void loadShapeImageLists(model).catch((error) => {
          console.warn(`Failed to load IFL textures for ${url}`, error);
        });
        const name = decodeURIComponent(url.split("/").pop()!);
        registerShapeSequences(name, model.animations);
        registerShapeBounds(name, model.data.bounds);
        onLoad(model);
      },
      onProgress,
      onError,
    );
  }
}

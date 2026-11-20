import { registerGroundEffectShape } from "./particles/groundEffectAssets";
import type { FileLoader, LoadingManager } from "three";
import { DTSLoader } from "./dts/dtsLoader";
import { shapeSequenceSources } from "./dts/shapeSequenceSources";
import { getUrlForPath, textureToUrl } from "./loaders";
import { loadTextureInstance } from "./textureUtils";
import { DTSMaterialFlags, type DTSShapeData } from "./dts/dtsTypes";
import { registerShapeSequences } from "./stream/shapeSequences";
import { registerShapeBounds } from "./stream/shapeBounds";
import type { DTSModel } from "./dts/dtsModel";
import { batchDTSRigidMeshes } from "./dts/dtsRigidBatch";
import { loadShapeImageLists } from "./iflAtlas";

// Shape views and imperative effect pools request the same source model.
interface ShapeSource {
  parsed?: DTSShapeData;
  data?: Promise<DTSShapeData>;
  resolvedModel?: DTSModel;
  model?: Promise<DTSModel>;
}
const sources = new WeakMap<LoadingManager, Map<string, ShapeSource>>();

function getSource(manager: LoadingManager, url: string): ShapeSource {
  let cache = sources.get(manager);
  if (!cache) sources.set(manager, (cache = new Map()));
  let source = cache.get(url);
  if (!source) cache.set(url, (source = {}));
  return source;
}

/** App resource resolution shared by React, prefetch, and ordinary loaders. */
export class ShapeLoader extends DTSLoader {
  constructor(manager?: LoadingManager) {
    super(manager);
    this.imageListResolver = () => null; // Atlases load progressively below.
    this.setSequenceResolver((url) =>
      shapeSequenceSources(decodeURIComponent(url.split("/").pop()!)).map(
        ({ path, name }) => ({ url: getUrlForPath(path), name }),
      ),
    );
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
    const source = getSource(this.manager, url);
    if (!source.model) {
      source.model = new Promise<DTSModel>((resolve, reject) => {
        this.loadModel(
          url,
          (model) => {
            source.resolvedModel = model;
            resolve(model);
          },
          onProgress,
          reject,
        );
      });
      void source.model.catch(() => {
        source.model = undefined;
      });
    }
    void source.model.then(onLoad, onError ?? console.error);
  }

  override loadShapeData(
    url: string,
    onProgress?: Parameters<FileLoader["load"]>[2],
  ): Promise<DTSShapeData> {
    const source = getSource(this.manager, url);
    if (!source.data) {
      source.data = super.loadShapeData(url, onProgress).then((data) => {
        source.parsed = data;
        return data;
      });
      void source.data.catch(() => {
        source.data = undefined;
      });
    }
    return source.data;
  }

  peekShapeData(url: string): DTSShapeData | undefined {
    return sources.get(this.manager)?.get(url)?.parsed;
  }

  peekModel(url: string): DTSModel | undefined {
    return sources.get(this.manager)?.get(url)?.resolvedModel;
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
        model.scene.detailLevel = null;
        void loadShapeImageLists(model).catch((error) => {
          console.warn(`Failed to load IFL textures for ${url}`, error);
        });
        const name = decodeURIComponent(url.split("/").pop()!);
        registerShapeSequences(name, model.animations);
        registerGroundEffectShape(name, model);
        registerShapeBounds(name, model.data.bounds);
        onLoad(model);
      },
      onProgress,
      onError,
    );
  }
}

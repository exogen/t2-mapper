import { registerGroundEffectShape } from "./particles/groundEffectAssets";
import type { FileLoader, LoadingManager } from "three";
import { DTSLoader } from "./dts/dtsLoader";
import { shapeSequenceSources } from "./dts/shapeSequenceSources";
import { getUrlForPath, textureToUrl } from "./loaders";
import {
  loadBitmapTextureAsync,
  loadBitmapTextureInstance,
} from "./assets/bitmapTextures";
import { DTSMaterialFlags, type DTSShapeData } from "./dts/dtsTypes";
import { registerShapeSequences } from "./stream/shapeSequences";
import { registerShapeBounds } from "./stream/shapeBounds";
import type { DTSModel } from "./dts/dtsModel";
import {
  batchDTSRigidMeshes,
  getDTSRigidBatchSources,
} from "./dts/dtsRigidBatch";
import { loadShapeImageLists } from "./iflAtlas";
import { repairBitmapSource } from "./assets/bitmapSourceRecovery";
import { markTextureSamplerUpdate } from "./textureUtils";
import {
  getSceneAssets,
  sharedSceneAssets,
  type SceneAssets,
} from "./assets/sceneAssets";
import { disposeDTSModel } from "./dts/dtsBuilder";

// Shape views and imperative effect pools request the same source model.
interface ShapeSource {
  parsed?: DTSShapeData;
  data?: Promise<DTSShapeData>;
  resolvedModel?: DTSModel;
  model?: Promise<DTSModel>;
  dependencies?: { textures: SceneAssets; pending: Promise<void> };
}
const shapeSourceCache = {};
const standaloneSources = new WeakMap<
  LoadingManager,
  Map<string, ShapeSource>
>();

function disposeModel(model: DTSModel): void {
  disposeDTSModel(model, getDTSRigidBatchSources(model.scene));
}

/** App resource resolution shared by React, prefetch, and ordinary loaders. */
export class ShapeLoader extends DTSLoader {
  private readonly assets: SceneAssets;
  private readonly sources: Map<string, ShapeSource>;

  constructor(manager?: LoadingManager) {
    super(manager);
    this.assets = getSceneAssets(this.manager);
    this.signal = this.assets.signal;
    if (this.assets === sharedSceneAssets) {
      let cache = standaloneSources.get(this.manager);
      if (!cache) standaloneSources.set(this.manager, (cache = new Map()));
      this.sources = cache;
    } else {
      this.sources = this.assets.cache<string, ShapeSource>(
        shapeSourceCache,
        (source) => {
          const model = source.resolvedModel;
          source.resolvedModel = undefined;
          if (model) disposeModel(model);
        },
      );
    }
    this.imageListResolver = () => null; // Atlases load progressively below.
    this.setSequenceResolver((url) =>
      shapeSequenceSources(decodeURIComponent(url.split("/").pop()!)).map(
        ({ path, name }) => ({ url: getUrlForPath(path), name }),
      ),
    );
    this.setTextureResolver((name, flags) => {
      return flags & DTSMaterialFlags.IflMaterial
        ? null
        : loadBitmapTextureInstance(
            () => [textureToUrl(name)],
            undefined,
            [],
            this.assets,
          );
    });
  }
  private getSource(url: string): ShapeSource {
    this.assets.signal.throwIfAborted();
    let source = this.sources.get(url);
    if (!source) this.sources.set(url, (source = {}));
    return source;
  }
  override load(
    url: string,
    onLoad: (model: DTSModel) => void,
    onProgress?: Parameters<FileLoader["load"]>[2],
    onError?: (error: unknown) => void,
  ): void {
    const source = this.getSource(url);
    if (!source.model) {
      source.model = new Promise<DTSModel>((resolve, reject) => {
        this.loadModel(url, source, resolve, onProgress, reject);
      });
      void source.model.catch(() => {
        source.model = undefined;
      });
    }
    const fail = onError ?? console.error;
    void source.model.then((model) => {
      if (this.assets.disposed) fail(this.assets.signal.reason);
      else onLoad(model);
    }, fail);
  }

  override loadShapeData(
    url: string,
    onProgress?: Parameters<FileLoader["load"]>[2],
  ): Promise<DTSShapeData> {
    const source = this.getSource(url);
    if (!source.data) {
      source.data = super.loadShapeData(url, onProgress).then((data) => {
        this.assets.signal.throwIfAborted();
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
    return this.sources.get(url)?.parsed;
  }

  peekModel(url: string): DTSModel | undefined {
    return this.sources.get(url)?.resolvedModel;
  }

  /** Model readiness remains progressive. Prefetch can explicitly wait for
   * ordinary images and IFL atlases without blocking model consumers. */
  async loadDependencies(url: string): Promise<void> {
    const source = this.getSource(url);
    const model = await this.loadAsync(url);
    await this.prepareDependencies(source, model, url);
  }

  private prepareDependencies(
    source: ShapeSource,
    model: DTSModel,
    url: string,
  ): Promise<void> {
    this.assets.signal.throwIfAborted();
    const textures = this.assets.textures;
    if (source.dependencies?.textures === textures)
      return source.dependencies.pending;
    const pending = Promise.allSettled([
      ...model.data.materials
        .map((material, index) => ({ material, index }))
        .filter(
          ({ material }) => !(material.flags & DTSMaterialFlags.IflMaterial),
        )
        .map(({ material, index }) =>
          Promise.resolve()
            .then(() => {
              textures.signal.throwIfAborted();
              return loadBitmapTextureAsync(
                textureToUrl(material.name),
                textures,
              );
            })
            .then((loaded) => {
              textures.signal.throwIfAborted();
              const texture = model.materials[index]?.map;
              // A failed bitmap is evicted from its source cache. A retry then
              // gets a new Source; repair the existing sampler shared by model
              // clones instead of leaving them bound to the failed placeholder.
              if (texture && !texture.image) {
                repairBitmapSource(texture.source, loaded);
                if (texture.source !== loaded.source) {
                  texture.source = loaded.source;
                  markTextureSamplerUpdate(texture);
                }
              }
            }),
        ),
      loadShapeImageLists(model, textures),
    ])
      .then((results) => {
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
      })
      .catch((error: unknown) => {
        if (source.dependencies?.pending === pending)
          source.dependencies = undefined;
        throw error;
      });
    source.dependencies = { textures, pending };
    void pending.catch((error) => {
      if (!textures.disposed)
        console.warn(`Failed to load shape textures for ${url}`, error);
    });
    return pending;
  }

  private loadModel(
    url: string,
    source: ShapeSource,
    onLoad: (model: DTSModel) => void,
    onProgress?: Parameters<FileLoader["load"]>[2],
    onError?: (error: unknown) => void,
  ): void {
    super.load(
      url,
      (model) => {
        if (this.assets.disposed) {
          disposeModel(model);
          onError?.(this.assets.signal.reason);
          return;
        }
        source.resolvedModel = model;
        try {
          batchDTSRigidMeshes(model.scene);
          model.scene.detailLevel = null;
          this.prepareDependencies(source, model, url);
          this.assets.signal.throwIfAborted();
          const name = decodeURIComponent(url.split("/").pop()!);
          registerShapeSequences(name, model.animations);
          registerGroundEffectShape(name, model, this.assets);
          registerShapeBounds(name, model.data.bounds);
          if (model.data.iflMaterials.length) {
            this.assets.onTexturesChanged(() =>
              this.prepareDependencies(source, model, url),
            );
          }
          onLoad(model);
        } catch (error) {
          if (source.resolvedModel === model) {
            source.resolvedModel = undefined;
            disposeModel(model);
          }
          onError?.(error);
        }
      },
      onProgress,
      onError,
    );
  }
}

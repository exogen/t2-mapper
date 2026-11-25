import { DIFLoader, disposeDIFModel, type DIFModel } from "../dif/difLoader";
import { textureToUrl } from "../loaders";
import { createLogger } from "../logger";
import { loadHtmlTexture } from "./htmlTextures";
import { sharedSceneAssets, type SceneAssets } from "./sceneAssets";

const log = createLogger("interiorAssets");
interface Entry {
  model: Promise<DIFModel>;
  ready?: DIFModel;
  dependencies?: Promise<void>;
}
const cacheKey = {};

async function warmTextures(
  model: DIFModel,
  assets: SceneAssets,
): Promise<void> {
  const urls = new Set(
    model.surfaceMeshes.map((mesh) => textureToUrl(mesh.material.resourcePath)),
  );
  const results = await Promise.allSettled(
    [...urls].map((url) => loadHtmlTexture(url, assets)),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

function rememberDependencies(
  entry: Entry,
  start: () => Promise<void>,
): Promise<void> {
  const pending = start().catch((error: unknown) => {
    if (entry.dependencies === pending) entry.dependencies = undefined;
    throw error;
  });
  entry.dependencies = pending;
  // Progressive model consumers need not subscribe to dependency readiness.
  void pending.catch(() => {});
  return pending;
}

function source(url: string, assets: SceneAssets): Entry {
  const entries = assets.cache<string, Entry>(cacheKey, (entry) => {
    if (entry.ready) disposeDIFModel(entry.ready);
  });
  let entry = entries.get(url);
  if (entry) return entry;
  const loader = new DIFLoader();
  loader.signal = assets.signal;
  let textures = Promise.resolve();
  // External images overlap embedded lightmap decoding as before, but this
  // application asset owner starts them explicitly; DIF parsing stays pure.
  loader.onModelParsed = (model) => {
    textures = warmTextures(model, assets);
    void textures.catch((error) => {
      if (!assets.disposed)
        log.warn("Interior textures failed for %s: %o", url, error);
    });
  };
  const model = loader.loadAsync(url).then((model) => {
    if (assets.disposed) {
      disposeDIFModel(model);
      assets.signal.throwIfAborted();
    }
    created.ready = model;
    return model;
  });
  entry = { model };
  rememberDependencies(entry, () =>
    model.then(
      () => textures,
      async (error: unknown) => {
        await textures.catch(() => {});
        throw error;
      },
    ),
  );
  entries.set(url, entry);
  const created = entry;
  void model.catch(() => {
    if (entries.get(url) === created) entries.delete(url);
  });
  return entry;
}

/** Geometry and embedded lightmaps; external surface images remain progressive. */
export function loadInterior(
  url: string,
  assets: SceneAssets = sharedSceneAssets,
): Promise<DIFModel> {
  return source(url, assets).model;
}

/** Prefetch completion includes all external image work, never GPU preparation. */
export function loadInteriorDependencies(
  url: string,
  assets: SceneAssets = sharedSceneAssets,
): Promise<void> {
  const entry = source(url, assets);
  return (
    entry.dependencies ??
    rememberDependencies(entry, () =>
      entry.model.then((model) => warmTextures(model, assets)),
    )
  );
}

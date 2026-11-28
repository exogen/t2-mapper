import { DIFLoader, disposeDIFModel, type DIFModel } from "../dif/difLoader";
import { textureToUrl } from "../loaders";
import { createLogger } from "../logger";
import { loadHtmlTexture } from "./htmlTextures";
import { sharedSceneAssets, type SceneAssets } from "./sceneAssets";

const log = createLogger("interiorAssets");
interface Entry {
  model: Promise<DIFModel>;
  ready?: DIFModel;
}
const cacheKey = {};
const dependenciesKey = {};

async function warmTextures(
  model: DIFModel,
  assets: SceneAssets,
): Promise<void> {
  const urls = new Set(
    model.surfaceMeshes.map((mesh) => textureToUrl(mesh.material.resourcePath)),
  );
  // A surface view can promote a queued image when it requests the same URL.
  const results = await Promise.allSettled(
    [...urls].map((url) => loadHtmlTexture(url, assets, "speculative")),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

function rememberDependencies(
  entry: Entry,
  textureAssets: SceneAssets,
  start: () => Promise<void>,
): Promise<void> {
  const cache = textureAssets.cache<Entry, Promise<void>>(dependenciesKey);
  const existing = cache.get(entry);
  if (existing) return existing;
  const pending = start().catch((error: unknown) => {
    if (cache.get(entry) === pending) cache.delete(entry);
    throw error;
  });
  cache.set(entry, pending);
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
  const initialTextures = assets.textures;
  let warmed: { assets: SceneAssets; ready: Promise<void> } | undefined;
  // External images overlap embedded lightmap decoding as before, but this
  // application asset owner starts them explicitly; DIF parsing stays pure.
  loader.onModelParsed = (model) => {
    const owner = assets.textures;
    const ready = warmTextures(model, owner);
    warmed = { assets: owner, ready };
    void ready.catch((error) => {
      if (!owner.disposed)
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
  rememberDependencies(entry, initialTextures, () =>
    model.then(
      (parsed) => {
        initialTextures.signal.throwIfAborted();
        return warmed?.assets === initialTextures
          ? warmed.ready
          : warmTextures(parsed, initialTextures);
      },
      async (error: unknown) => {
        await warmed?.ready.catch(() => {});
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
  const textureAssets = assets.textures;
  return rememberDependencies(entry, textureAssets, () =>
    entry.model.then((model) => warmTextures(model, textureAssets)),
  );
}

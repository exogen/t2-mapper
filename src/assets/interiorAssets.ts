import { DIFLoader, type DIFModel } from "../dif/difLoader";
import { textureToUrl } from "../loaders";
import { createLogger } from "../logger";
import { loadHtmlTexture } from "./htmlTextures";

const log = createLogger("interiorAssets");
interface Entry {
  model: Promise<DIFModel>;
  dependencies?: Promise<void>;
}
const entries = new Map<string, Entry>();

async function warmTextures(model: DIFModel): Promise<void> {
  const urls = new Set(
    model.surfaceMeshes.map((mesh) => textureToUrl(mesh.material.resourcePath)),
  );
  const results = await Promise.allSettled(
    [...urls].map((url) => loadHtmlTexture(url)),
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

function source(url: string): Entry {
  let entry = entries.get(url);
  if (entry) return entry;
  const loader = new DIFLoader();
  let textures = Promise.resolve();
  // External images overlap embedded lightmap decoding as before, but this
  // application asset owner starts them explicitly; DIF parsing stays pure.
  loader.onModelParsed = (model) => {
    textures = warmTextures(model);
    void textures.catch((error) =>
      log.warn("Interior textures failed for %s: %o", url, error),
    );
  };
  const model = loader.loadAsync(url);
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
export function loadInterior(url: string): Promise<DIFModel> {
  return source(url).model;
}

/** Prefetch completion includes all external image work, never GPU preparation. */
export function loadInteriorDependencies(url: string): Promise<void> {
  const entry = source(url);
  return (
    entry.dependencies ??
    rememberDependencies(entry, () => entry.model.then(warmTextures))
  );
}

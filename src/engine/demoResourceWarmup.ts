import type { LoadingManager, Texture } from "three";
import type { AssetLoadPriority } from "../assets/assetLoadQueue";
import { loadBitmapTextureAsync } from "../assets/bitmapTextures";
import type { SceneAssets } from "../assets/sceneAssets";
import { textureToUrl } from "../loaders";
import { warmParticleTexture } from "../particles/particleRenderer";
import type { DemoResourceHint } from "../stream/demoResourceLookahead";
import type { GameEngine } from "./gameEngine";
import {
  getPlayerSkinSelection,
  loadSkinManifest,
  playerSkinUrls,
} from "./playerSkins";
import { loadShape, loadShapeDependencies, peekShape } from "./shapeCache";

const TEXTURE_UPLOAD_SLICE_MS = 2;
type ResourceWarmupEngine = Pick<
  GameEngine,
  "assetLoadingManager" | "currentHost" | "sceneAssets" | "whenHost"
>;

async function warmFirstBitmap(
  urls: ReadonlySet<string>,
  textures: SceneAssets,
): Promise<void> {
  let failure: unknown;
  for (const url of urls) {
    textures.signal.throwIfAborted();
    try {
      await loadBitmapTextureAsync(url, textures, "speculative");
      return;
    } catch (error) {
      failure = error;
    }
  }
  if (failure !== undefined) throw failure;
}

/** Keep a prefetch slot occupied until all work it started is done. */
async function finishWarmups(
  warmups: readonly (Promise<void> | undefined)[],
): Promise<void> {
  const results = await Promise.allSettled(warmups);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

async function warmPlayerSkinVariants(
  hint: Extract<DemoResourceHint, { kind: "playerSkin" }>,
  manager: LoadingManager,
  textures: SceneAssets,
): Promise<void> {
  const [model] = await Promise.all([
    loadShape(hint.shapeName, manager),
    loadSkinManifest(),
  ]);
  textures.signal.throwIfAborted();
  const skin = getPlayerSkinSelection(
    hint.shapeName,
    hint.skinPrefName,
    hint.skinName,
  );
  await finishWarmups(
    model.materials.map((material) => {
      const path = material.resourcePath;
      if (!path || material.flagNames.has("IflMaterial")) return;
      const variants = playerSkinUrls(path, skin);
      if (variants.length)
        return warmFirstBitmap(
          new Set([...variants, textureToUrl(path)]),
          textures,
        );
    }),
  );
}

/** Upload the frame samplers DTS instances share. Frames in one atlas have
 * identical GPU parameters and differ only in their UV transforms. */
async function warmEffectShape(
  name: string,
  engine: ResourceWarmupEngine,
  textures: SceneAssets,
  priority: AssetLoadPriority,
): Promise<void> {
  const startingHost = engine.currentHost;
  const manager = engine.assetLoadingManager;
  await loadShapeDependencies(name, manager, priority);
  textures.signal.throwIfAborted();
  const model = peekShape(name, manager);
  if (!model?.scene.imageAnimations.length) return;
  const host = startingHost ?? (await engine.whenHost(textures.signal));
  if (host !== engine.currentHost || textures.disposed) return;
  let deadline = performance.now() + TEXTURE_UPLOAD_SLICE_MS;
  for (const animation of model.scene.imageAnimations) {
    const uploaded = new Set<Texture["source"]>();
    for (const { texture } of animation.frames) {
      if (!texture.image || uploaded.has(texture.source)) continue;
      if (performance.now() >= deadline) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        textures.signal.throwIfAborted();
        if (host !== engine.currentHost) return;
        deadline = performance.now() + TEXTURE_UPLOAD_SLICE_MS;
      }
      host.renderer.initTexture(texture);
      uploaded.add(texture.source);
    }
  }
}

/** Prepare resources in the caches and renderer used by the current scene. */
export async function warmDemoResource(
  hint: DemoResourceHint,
  engine: ResourceWarmupEngine,
): Promise<void> {
  const assets = engine.sceneAssets;
  const textures = assets.textures;
  const priority = hint.observedEffect ? "critical" : "speculative";

  switch (hint.kind) {
    case "shape":
      await loadShapeDependencies(hint.name, engine.assetLoadingManager);
      return;
    case "effectShape":
      await warmEffectShape(hint.name, engine, textures, priority);
      return;
    case "texture":
      await loadBitmapTextureAsync(textureToUrl(hint.name), textures, priority);
      return;
    case "particleTexture": {
      const startingHost = engine.currentHost;
      const texture = await warmParticleTexture(hint.name, assets, priority);
      const host = startingHost ?? (await engine.whenHost(textures.signal));
      if (host === engine.currentHost && !textures.disposed)
        host.renderer.initTexture(texture);
      return;
    }
    case "playerSkin": {
      const manager = engine.assetLoadingManager;
      await finishWarmups([
        loadShapeDependencies(hint.shapeName, manager),
        warmPlayerSkinVariants(hint, manager, textures),
      ]);
    }
  }
}

import { NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";
import type { Texture, ColorSpace } from "three";
import { ShapeLoader } from "../../shapeLoader";
import { shapeToUrl, textureToUrl } from "../../loaders";
import { loadTextureInstance } from "../../textureUtils";
import { setupEffectTexture } from "../../stream/playbackUtils";
import type { ProjectileEntity } from "../../state/projectileEntities";
import type { ProjectileFactory } from "./types";
import { createSpriteView, createTracerView } from "./tracer";
import { createBeamView, createLinkBeamView } from "./beam";
import { createShockLanceView } from "./shockLance";
import { createFlareView } from "./flare";
import { createExplosionView } from "./explosion";
import { createShapeProjectileView } from "./shape";
import { resolveEmapFromDatablock } from "../resolveEmap";
import { streamPlaybackStore } from "../../state/streamPlaybackStore";

/** Resources belong to the manager; recycled views only own their mutable state. */
export class ProjectileAssets {
  private textures = new Map<string, Texture>();
  private loader = new ShapeLoader();
  private disposed = false;
  anisotropy: number;
  animationEnabled: () => boolean;
  constructor(anisotropy: number, animationEnabled: () => boolean) {
    this.anisotropy = anisotropy;
    this.animationEnabled = animationEnabled;
  }
  private texture(
    name: string,
    colorSpace: ColorSpace = SRGBColorSpace,
    repeat: "none" | "s" | "st" = "none",
  ): Texture {
    const url = textureToUrl(name),
      key = JSON.stringify([url, colorSpace, repeat]);
    let texture = this.textures.get(key);
    if (!texture) {
      texture = loadTextureInstance(url);
      setupEffectTexture(texture, colorSpace);
      if (repeat !== "none") texture.wrapS = RepeatWrapping;
      if (repeat === "st") texture.wrapT = RepeatWrapping;
      this.textures.set(key, texture);
    }
    return texture;
  }
  async factory(entity: ProjectileEntity): Promise<ProjectileFactory> {
    const texture = (name: string) => this.texture(name);
    const repeat = (name: string) => this.texture(name, SRGBColorSpace, "s");
    switch (entity.renderType) {
      case "Sprite": {
        const map = texture(entity.visual.texture);
        return (() =>
          createSpriteView(entity.visual, map)) as ProjectileFactory;
      }
      case "Tracer": {
        const maps = [
          texture(entity.visual.texture),
          texture(entity.visual.crossTexture ?? entity.visual.texture),
        ];
        return (() =>
          createTracerView(entity.visual, maps)) as ProjectileFactory;
      }
      case "Beam": {
        const maps = entity.visual.textures.slice(1).map(repeat);
        return (() => createBeamView(entity.visual, maps)) as ProjectileFactory;
      }
      case "LinkBeam": {
        const v = entity.visual,
          maps = [repeat(v.texture)];
        if (v.flareTexture) maps.push(repeat(v.flareTexture));
        if (v.lightningTexture) maps.push(repeat(v.lightningTexture));
        return (() => createLinkBeamView(v, maps)) as ProjectileFactory;
      }
      case "ShockLance": {
        const maps = entity.visual.textures
          .slice(0, 4)
          .map((name) => this.texture(name, SRGBColorSpace, "st"));
        return (() =>
          createShockLanceView(
            entity.visual,
            maps,
            entity.beamHit,
          )) as ProjectileFactory;
      }
      case "Flare": {
        const v = entity.visual,
          maps = {
            base: v.baseTexture ? texture(v.baseTexture) : undefined,
            mod: v.modTexture
              ? this.texture(v.modTexture, NoColorSpace)
              : undefined,
          };
        const model = v.shapeName
          ? await this.loader.loadAsync(shapeToUrl(v.shapeName))
          : undefined;
        if (this.disposed) throw new Error("Projectile assets disposed");
        return (() =>
          createFlareView(
            v,
            maps,
            model,
            this.anisotropy,
          )) as ProjectileFactory;
      }
      case "Explosion": {
        const model = await this.loader.loadAsync(
          shapeToUrl(entity.shapeName!),
        );
        const block =
          entity.explosionDataBlockId != null
            ? streamPlaybackStore
                .getState()
                .playback?.getDataBlockData(entity.explosionDataBlockId)
            : undefined;
        if (this.disposed) throw new Error("Projectile assets disposed");
        return (() =>
          createExplosionView(
            model,
            entity.shapeName!,
            block,
            this.anisotropy,
          )) as ProjectileFactory;
      }
      case "Shape": {
        const emap = resolveEmapFromDatablock(
          entity.dataBlockId,
          entity.dataBlock,
        );
        const model = await this.loader.loadAsync(
          shapeToUrl(entity.shapeName!),
        );
        if (this.disposed) throw new Error("Projectile assets disposed");
        return (() =>
          createShapeProjectileView(
            model,
            entity,
            this.anisotropy,
            emap,
            this.animationEnabled,
          )) as ProjectileFactory;
      }
    }
  }
  dispose() {
    this.disposed = true;
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
  }
}

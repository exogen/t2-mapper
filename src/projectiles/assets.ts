import { NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";
import type { Texture, ColorSpace } from "three";
import type { DTSModel } from "../dts/dtsModel";
import { ShapeLoader } from "../shapeLoader";
import { shapeToUrl, textureToUrl } from "../loaders";
import { loadTextureInstance } from "../textureUtils";
import { setupEffectTexture } from "../stream/playbackUtils";
import type { ProjectileEntity } from "../state/projectileEntities";
import type { ProjectileEntityLookup, ProjectileFactory } from "./types";
import { createSpriteView, createTracerView } from "./tracer";
import { createBeamView, createLinkBeamView } from "./beam";
import { createTargetBeamView } from "./targetBeam";
import { createShockLanceView } from "./shockLance";
import { createFlareView } from "./flare";
import { createExplosionView } from "./explosion";
import { createShapeProjectileView } from "./shape";
import { resolveEmapFromDatablock } from "../engine/resolveEmap";
import { streamPlaybackStore } from "../state/streamPlaybackStore";

/** Resources belong to the manager; recycled views only own their mutable state. */
export class ProjectileAssets {
  private textures = new Map<string, Texture>();
  private loader = new ShapeLoader();
  private disposed = false;
  anisotropy: number;
  animationEnabled: () => boolean;
  private readonly viewportHeight: () => number;
  private readonly findEntity: ProjectileEntityLookup;
  constructor(
    anisotropy: number,
    animationEnabled: () => boolean,
    viewportHeight: () => number = () => 0,
    findEntity: ProjectileEntityLookup = () => undefined,
  ) {
    this.anisotropy = anisotropy;
    this.animationEnabled = animationEnabled;
    this.viewportHeight = viewportHeight;
    this.findEntity = findEntity;
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
  private loadModelFactory(
    name: string,
    create: (model: DTSModel) => ProjectileFactory,
  ): Promise<ProjectileFactory> {
    return this.loader.loadAsync(shapeToUrl(name)).then((model) => {
      if (this.disposed) throw new Error("Projectile assets disposed");
      return create(model);
    });
  }

  factory(
    entity: ProjectileEntity,
  ): ProjectileFactory | Promise<ProjectileFactory> {
    const texture = (name: string) => this.texture(name);
    const repeat = (name: string) => this.texture(name, SRGBColorSpace, "s");
    switch (entity.renderType) {
      case "Sprite": {
        const map = texture(entity.visual.texture);
        return () => createSpriteView(entity.visual, map);
      }
      case "Tracer": {
        const maps = [
          texture(entity.visual.texture),
          texture(entity.visual.crossTexture ?? entity.visual.texture),
        ];
        return () => createTracerView(entity.visual, maps);
      }
      case "Beam": {
        const maps = entity.visual.textures.slice(1).map(repeat);
        return () => createBeamView(entity.visual, maps);
      }
      case "TargetBeam": {
        const v = entity.visual;
        const [core, flare, pulse, impact] = v.textures;
        const maps = [
          texture(core),
          texture(flare),
          repeat(pulse),
          texture(impact),
        ];
        return () =>
          createTargetBeamView(v, maps, this.viewportHeight, this.findEntity);
      }
      case "LinkBeam": {
        const v = entity.visual,
          maps = [repeat(v.texture)];
        if (v.flareTexture) maps.push(repeat(v.flareTexture));
        if (v.lightningTexture) maps.push(repeat(v.lightningTexture));
        return () => createLinkBeamView(v, maps, this.findEntity);
      }
      case "ShockLance": {
        const maps = entity.visual.textures
          .slice(0, 4)
          .map((name) => this.texture(name, SRGBColorSpace, "st"));
        return () =>
          createShockLanceView(
            entity.visual,
            maps,
            entity.beamHit,
            this.findEntity,
          );
      }
      case "Flare": {
        const v = entity.visual,
          maps = {
            base: v.baseTexture ? texture(v.baseTexture) : undefined,
            mod: v.modTexture
              ? this.texture(v.modTexture, NoColorSpace)
              : undefined,
          };
        const create = (model?: DTSModel) => () =>
          createFlareView(v, maps, model, this.anisotropy);
        return v.shapeName
          ? this.loadModelFactory(v.shapeName, create)
          : create();
      }
      case "Explosion": {
        return this.loadModelFactory(entity.shapeName!, (model) => {
          const block =
            entity.explosionDataBlockId != null
              ? streamPlaybackStore
                  .getState()
                  .playback?.getDataBlockData(entity.explosionDataBlockId)
              : undefined;
          return () =>
            createExplosionView(
              model,
              entity.shapeName!,
              block,
              this.anisotropy,
            );
        });
      }
      case "Shape": {
        const emap = resolveEmapFromDatablock(
          entity.dataBlockId,
          entity.dataBlock,
        );
        return this.loadModelFactory(
          entity.shapeName!,
          (model) => () =>
            createShapeProjectileView(
              model,
              entity,
              this.anisotropy,
              emap,
              this.animationEnabled,
            ),
        );
      }
    }
  }
  dispose() {
    this.disposed = true;
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
  }
}

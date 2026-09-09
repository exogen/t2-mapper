import {
  ClampToEdgeWrapping,
  FileLoader,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type LoadingManager,
  type Texture,
} from "three";
import { installDTSZeroBorderMipmaps } from "./dtsMipmaps";
import { parseImageFileList } from "../imageFileList";
import type { DTSModel } from "./dtsModel";
import { DTSMaterialFlags, type DTSShapeData } from "./dtsTypes";

export interface DTSImageFrames {
  frames: readonly { texture: Texture; endTime: number }[];
  duration: number;
}
export interface DTSImageAnimation extends DTSImageFrames {
  materialIndex: number;
  iflIndex: number;
  sequenceControlled: boolean;
}
export interface DTSImageListSource {
  url: string;
  texture: (name: string) => Texture;
}

/** Shared by ordinary textures and atlas frames; IFL counts are 30 Hz ticks. */
export function createDTSImageFrames(
  entries: readonly { name: string; frameCount: number }[],
  texture: (name: string) => Texture,
): DTSImageFrames {
  let duration = 0;
  const frames = entries
    .filter((entry) => entry.frameCount > 0)
    .map((entry) => {
      duration += entry.frameCount / 30;
      return { texture: texture(entry.name), endTime: duration };
    });
  return { frames, duration };
}

export function createDTSImageAnimation(
  data: DTSShapeData,
  iflIndex: number,
  frames: DTSImageFrames,
): DTSImageAnimation {
  return {
    ...frames,
    iflIndex,
    materialIndex: data.iflMaterials[iflIndex].materialSlot,
    sequenceControlled: data.sequences.some((s) =>
      s.iflMatters.includes(iflIndex),
    ),
  };
}

/** Torque uses an inclusive frame end, including the end of a full cycle. */
export function getDTSImageFrame(
  animation: DTSImageFrames,
  time: number,
  loop: boolean,
): Texture | null {
  if (animation.duration <= 0) return null;
  if (loop && time > animation.duration) time %= animation.duration;
  return (
    (
      animation.frames.find((frame) => time <= frame.endTime) ??
      animation.frames.at(-1)
    )?.texture ?? null
  );
}

export function configureDTSImageTexture(
  texture: Texture,
  flags: number,
): Texture {
  if (
    flags & DTSMaterialFlags.MipMapZeroBorder &&
    !(flags & DTSMaterialFlags.NoMipMap)
  )
    installDTSZeroBorderMipmaps(texture);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS =
    flags & DTSMaterialFlags.SWrap ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT =
    flags & DTSMaterialFlags.TWrap ? RepeatWrapping : ClampToEdgeWrapping;
  if (flags & DTSMaterialFlags.NoMipMap) {
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
  }
  return texture;
}

/** Native texture animation uses texture instances and NumberKeyframeTracks,
 * with no atlas/exporter-specific material extras. */
export async function loadDTSImageLists(
  model: DTSModel,
  resolve: (name: string) => DTSImageListSource | null,
  manager: LoadingManager,
): Promise<void> {
  const lists = await Promise.all(
    model.data.iflMaterials.map(
      async (ifl, iflIndex): Promise<DTSImageAnimation | null> => {
        const material = model.data.materials[ifl.materialSlot];
        if (!material || !(material.flags & DTSMaterialFlags.IflMaterial))
          return null;
        const source = resolve(
          model.data.names[ifl.nameIndex] || `${material.name}.ifl`,
        );
        if (!source) return null;
        const text = await new FileLoader(manager).loadAsync(source.url);
        const textures = new Map<string, Texture>();
        return createDTSImageAnimation(
          model.data,
          iflIndex,
          createDTSImageFrames(parseImageFileList(text as string), (name) => {
            let texture = textures.get(name);
            if (!texture) {
              texture = configureDTSImageTexture(
                source.texture(name),
                material.flags,
              );
              textures.set(name, texture);
            }
            return texture;
          }),
        );
      },
    ),
  );
  model.scene.imageAnimations = lists.filter(
    (list): list is DTSImageAnimation => list !== null,
  );
}

export function defaultDTSImageResolver(
  path: string,
  manager: LoadingManager,
): (name: string) => DTSImageListSource {
  const textures = new TextureLoader(manager);
  return (name) => {
    const url = path + name.replace(/\\/g, "/");
    return {
      url,
      texture: (frame) =>
        textures.load(url.slice(0, url.lastIndexOf("/") + 1) + frame),
    };
  };
}

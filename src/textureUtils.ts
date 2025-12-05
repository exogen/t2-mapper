/**
 * Generic texture setup utilities.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";

export function setupColor(tex, repeat = [1, 1]) {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.repeat.set(...repeat);
  tex.flipY = false; // DDS/DIF textures are already flipped
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;

  tex.needsUpdate = true;

  return tex;
}

export function setupMask(data) {
  const tex = new DataTexture(
    data,
    256,
    256,
    RedFormat, // 1 channel
    UnsignedByteType, // 8-bit
  );

  // Masks should stay linear
  tex.colorSpace = NoColorSpace;

  // Set tiling / sampling. For NPOT sizes, disable mips or use power-of-two.
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = false; // if width/height are not powers of two
  tex.minFilter = LinearFilter; // avoid mips if generateMipmaps=false
  tex.magFilter = LinearFilter;

  tex.needsUpdate = true;

  return tex;
}

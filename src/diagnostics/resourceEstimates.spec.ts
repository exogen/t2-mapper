import { describe, expect, it } from "vitest";
import {
  CompressedTexture,
  CubeTexture,
  Data3DTexture,
  DataArrayTexture,
  DataTexture,
  DepthTexture,
  HalfFloatType,
  RGBAFormat,
  RGB_S3TC_DXT1_Format,
  UnsignedIntType,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
} from "three";
import {
  estimateDecodedImageBytes,
  estimateRenderTargetBytes,
  estimateTextureBytes,
} from "./resourceEstimates";

describe("texture payload estimates", () => {
  it("accounts RGBA8 and half-float formats and decoded image storage separately", () => {
    const image = { width: 8, height: 4 };
    expect(estimateTextureBytes({ image, format: RGBAFormat })).toBe(128);
    expect(estimateTextureBytes({ image, type: HalfFloatType })).toBe(256);
    expect(estimateDecodedImageBytes(image)).toBe(128);
    expect(
      estimateDecodedImageBytes({ ...image, data: new Uint8Array(32) }),
    ).toBe(32);
    expect(estimateTextureBytes({ image: null })).toBeNull();
    expect(estimateTextureBytes({ image, format: -1 })).toBeNull();
  });

  it("counts every non-square generated mip instead of assuming 4/3", () => {
    const texture = new DataTexture(new Uint8Array(8 * 2 * 4), 8, 2);
    texture.generateMipmaps = true;
    // 8x2, 4x1, 2x1, 1x1.
    expect(estimateTextureBytes(texture)).toBe((16 + 4 + 2 + 1) * 4);
  });

  it("counts six cube faces and their mip chains", () => {
    const cube = new CubeTexture(
      Array.from({ length: 6 }, () => ({ width: 4, height: 4 })),
    );
    expect(estimateTextureBytes(cube)).toBe(6 * (16 + 4 + 1) * 4);
    cube.generateMipmaps = false;
    expect(estimateTextureBytes(cube)).toBe(6 * 16 * 4);
  });

  it("uses compressed block data lengths even for tiny mips and cube faces", () => {
    const mipmaps = [4, 2, 1].map((size) => ({
      width: size,
      height: size,
      data: new Uint8Array(8),
    }));
    const texture = new CompressedTexture(mipmaps, 4, 4, RGB_S3TC_DXT1_Format);
    expect(estimateTextureBytes(texture)).toBe(24);
    expect(
      estimateTextureBytes({
        isCubeTexture: true,
        isCompressedTexture: true,
        image: Array.from({ length: 6 }, () => ({ mipmaps })),
      }),
    ).toBe(6 * 24);
  });

  it("halves 3D depth across mips while preserving array layer count", () => {
    const volume = new Data3DTexture(new Uint8Array(4 * 4 * 4 * 4), 4, 4, 4);
    const layers = new DataArrayTexture(new Uint8Array(4 * 4 * 4 * 4), 4, 4, 4);
    volume.generateMipmaps = layers.generateMipmaps = true;
    expect(estimateTextureBytes(volume)).toBe((64 + 8 + 1) * 4);
    expect(estimateTextureBytes(layers)).toBe((16 + 4 + 1) * 4 * 4);
  });
});

describe("render-target payload estimates", () => {
  it("counts depth24 conservatively as four bytes and avoids counting it twice", () => {
    const target = new WebGLRenderTarget(8, 4);
    expect(estimateRenderTargetBytes(target)).toBe(8 * 4 * (4 + 4));
    target.depthTexture = new DepthTexture(8, 4, UnsignedIntType);
    expect(estimateTextureBytes(target.depthTexture)).toBe(8 * 4 * 4);
    expect(estimateRenderTargetBytes(target)).toBe(8 * 4 * (4 + 4));
    target.dispose();
  });

  it("counts separate multisample color/depth buffers in addition to resolved storage", () => {
    const target = new WebGLRenderTarget(8, 4, { samples: 4 });
    expect(estimateRenderTargetBytes(target)).toBe(8 * 4 * (4 + 4) * 5);
    target.depthBuffer = false;
    expect(estimateRenderTargetBytes(target)).toBe(8 * 4 * 4 * 5);
    target.dispose();
  });

  it("handles half-float composer targets, multiple color attachments, and cubes", () => {
    const hdr = new WebGLRenderTarget(8, 4, {
      type: HalfFloatType,
      depthBuffer: false,
    });
    expect(estimateRenderTargetBytes(hdr)).toBe(8 * 4 * 8);
    const mrt = new WebGLRenderTarget(8, 4, { count: 2 });
    expect(estimateRenderTargetBytes(mrt)).toBe(8 * 4 * (4 + 4 + 4));
    const cube = new WebGLCubeRenderTarget(4);
    expect(estimateRenderTargetBytes(cube)).toBe(6 * 4 * 4 * (4 + 4));
    hdr.dispose();
    mrt.dispose();
    cube.dispose();
  });
});

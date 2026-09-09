import { afterEach, expect, it, vi } from "vitest";
import { LinearFilter, Texture } from "three";
import { createDTSMaterial } from "./dtsModel";
import { createDTSTestShape } from "./dtsTestFixtures";
import { DTSMaterialFlags } from "./dtsTypes";

afterEach(() => vi.unstubAllGlobals());

it("keeps zero-border mip levels transparent and preserves their interior", () => {
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return {
          drawImage() {},
          getImageData: () => ({
            width: this.width,
            height: this.height,
            data: new Uint8ClampedArray(this.width * this.height * 4).fill(255),
          }),
        };
      }
    },
  );
  const texture = new Texture({ width: 8, height: 8 });
  createDTSMaterial(
    {
      ...createDTSTestShape().materials[0],
      flags: DTSMaterialFlags.MipMapZeroBorder,
    },
    texture,
  );
  texture.onUpdate!(texture);
  expect(texture.generateMipmaps).toBe(false);
  expect(texture.mipmaps).toHaveLength(4);
  const mip = texture.mipmaps[1] as { data: Uint8ClampedArray };
  expect(Array.from(mip.data.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  expect(Array.from(mip.data.subarray(20, 24))).toEqual([255, 255, 255, 255]);
});

it("lets NoMipMap override border-mipmap generation", () => {
  const texture = new Texture();
  const update = texture.onUpdate;
  createDTSMaterial(
    {
      ...createDTSTestShape().materials[0],
      flags: DTSMaterialFlags.NoMipMap | DTSMaterialFlags.MipMapZeroBorder,
    },
    texture,
  );
  expect(texture.onUpdate).toBe(update);
  expect(texture.generateMipmaps).toBe(false);
  expect(texture.minFilter).toBe(LinearFilter);
});

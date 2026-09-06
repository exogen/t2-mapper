import { afterEach, describe, expect, it } from "vitest";
import {
  globalFogUniforms,
  hazeAndFog,
  packFogVolumeData,
  resetGlobalFogUniforms,
} from "./globalFogUniforms";

afterEach(() => {
  resetGlobalFogUniforms();
  globalFogUniforms.fogEnabled.value = true;
  globalFogUniforms.fogDistanceScale.value = 1;
});

describe("hazeAndFog", () => {
  it("is the quadratic distance haze with no volumes", () => {
    expect(hazeAndFog(50, 0, 100, 500)).toBe(0);
    expect(hazeAndFog(300, 0, 100, 500)).toBeCloseTo(0.75);
    expect(hazeAndFog(600, 0, 100, 500)).toBe(1);
  });

  it("adds a volume for the part of the sight line inside it", () => {
    // A volume 0..100 m at 50% over 1000 m; camera at 200 m looking down
    // to an object at 0 m: half the 400 m line is inside the volume.
    globalFogUniforms.cameraHeight.value = 200;
    globalFogUniforms.fogVolumeData.value.set(
      packFogVolumeData([
        {
          visibleDistance: 1000,
          minHeight: 0,
          maxHeight: 100,
          percentage: 0.5,
        },
      ]),
    );
    expect(hazeAndFog(400, 0, 1000, 2000)).toBeCloseTo(200 * 0.0005);
  });

  it("counts the whole distance for a level line inside a volume", () => {
    globalFogUniforms.cameraHeight.value = 50;
    globalFogUniforms.fogVolumeData.value.set(
      packFogVolumeData([
        { visibleDistance: 1000, minHeight: 0, maxHeight: 100, percentage: 1 },
      ]),
    );
    expect(hazeAndFog(300, 50, 1000, 2000)).toBeCloseTo(0.3);
    expect(hazeAndFog(3000, 50, 5000, 6000)).toBe(1);
  });

  it("is nothing when fog is off", () => {
    globalFogUniforms.fogEnabled.value = false;
    expect(hazeAndFog(600, 0, 100, 500)).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createDIFModel } from "./difLoader";
import { createDIFTestBuffer } from "./difTestFixtures";
import { DIFLighting, sampleDIFLight } from "./difLighting";
import { texturePixels } from "../texturePixels";

function model() {
  const model = createDIFModel(
    createDIFTestBuffer({ alarm: true, animated: true }).buffer,
  );
  model.lightMaps[0].image = {
    width: 1,
    height: 1,
    data: new Uint8Array([80, 90, 100, 255]),
  };
  model.lightMaps[1].image = {
    width: 1,
    height: 1,
    data: new Uint8Array([5, 6, 7, 255]),
  };
  return model;
}

describe("DIF alarm lighting", () => {
  it("reads authored states and interpolates colors without blending their intensity maps", () => {
    const { interior } = model();
    const light = interior.animatedLights[0];
    const sample = { state: -1, color: [0, 0, 0] as [number, number, number] };
    expect(light).toMatchObject({ flags: 11, duration: 1000, stateCount: 2 });
    for (const [time, state, red] of [
      [0, 0, 255],
      [250, 0, 128],
      [500, 1, 0],
      [750, 1, 128],
      [1000, 0, 255],
    ]) {
      sampleDIFLight(light, interior.lightStates, time, sample);
      expect(sample).toEqual({ state, color: [red, 0, 0] });
    }
  });

  it("isolates buildings, shares static resources, and restores power without shader recompilation", () => {
    const asset = model();
    const a = new DIFLighting(asset),
      b = new DIFLighting(asset);
    const material = a.materials[0];
    const version = material.version;
    expect(a.setAlarmState(true)).toBe(true);
    a.prepare(material, 0);
    expect(Array.from(texturePixels(material.lightMap!)!.data)).toEqual([
      255, 6, 7, 255,
    ]);
    expect(material.lightMap).not.toBe(asset.lightMaps[1]);
    expect(b.materials[0].lightMap).toBe(asset.lightMaps[0]);
    expect(asset.surfaceMeshes[0].material.lightMap).toBe(asset.lightMaps[0]);
    expect(Array.from(texturePixels(asset.lightMaps[1])!.data)).toEqual([
      5, 6, 7, 255,
    ]);
    expect(a.setAlarmState(false)).toBe(true);
    expect(material.lightMap).toBe(asset.lightMaps[0]);
    expect(material.version).toBe(version);
    a.dispose();
    b.dispose();
  });

  it("uploads once per visible atlas/update interval, holds while paused, and recomputes on rewind", () => {
    const lighting = new DIFLighting(model());
    lighting.setAlarmState(true);
    const material = lighting.materials[0];
    lighting.prepare(material, 264);
    const map = material.lightMap!;
    const version = map.version;
    const pixels = Array.from(texturePixels(map)!.data);
    expect(pixels).toEqual([125, 6, 7, 255]);
    lighting.prepare(material, 264);
    lighting.prepare(lighting.materials[1], 300);
    expect(map.version).toBe(version);
    expect(lighting.materials[1].lightMap).toBe(map);
    lighting.prepare(material, 528);
    expect(Array.from(texturePixels(map)!.data)).toEqual([12, 6, 7, 255]);
    lighting.prepare(material, 264);
    expect(Array.from(texturePixels(map)!.data)).toEqual(pixels);
    const dispose = vi.fn();
    map.addEventListener("dispose", dispose);
    lighting.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("ignores alarm mode for assets without an alarm state", () => {
    const asset = createDIFModel(createDIFTestBuffer().buffer);
    const lighting = new DIFLighting(asset);
    const dispose = vi.fn();
    asset.surfaceMeshes[0].material.addEventListener("dispose", dispose);
    expect(lighting.setAlarmState(true)).toBe(false);
    lighting.prepare(lighting.materials[0], 100);
    expect(lighting.materials[0].lightMap).toBe(asset.lightMaps[0]);
    lighting.dispose();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("installs duplicate state slots once, taking the last map like the binary", () => {
    const asset = model();
    const { interior } = asset;
    interior.lightStateData.splice(1, 0, {
      ...interior.lightStateData[0],
      mapIndex: 1,
    });
    interior.lightStates[0].dataCount = 2;
    interior.lightStates[1].dataIndex = 2;
    const lighting = new DIFLighting(asset);
    lighting.setAlarmState(true);
    lighting.prepare(lighting.materials[0], 0);
    expect(
      Array.from(texturePixels(lighting.materials[0].lightMap!)!.data),
    ).toEqual([133, 6, 7, 255]);
    lighting.dispose();
  });

  it("flicker selects authored states reproducibly across seeks", () => {
    const { interior } = model();
    const light = { ...interior.animatedLights[0], flags: 13 };
    const sample = { state: -1, color: [0, 0, 0] as [number, number, number] };
    sampleDIFLight(light, interior.lightStates, 1750, sample);
    const expected = structuredClone(sample);
    sampleDIFLight(light, interior.lightStates, 8000, sample);
    sampleDIFLight(light, interior.lightStates, 1750, sample);
    expect(sample).toEqual(expected);
    expect(sample.color).toEqual(interior.lightStates[sample.state].color);
  });

  it("only needs render callbacks while the selected atlas is animated", () => {
    const lighting = new DIFLighting(model());
    // Both materials share the atlas, even though only one surface is animated.
    for (const material of lighting.materials) {
      expect(lighting.hasAnimatedLightMap(material, false)).toBe(false);
      expect(lighting.hasAnimatedLightMap(material, true)).toBe(true);
    }
    const staticLighting = new DIFLighting(
      createDIFModel(createDIFTestBuffer({ alarm: true }).buffer),
    );
    for (const material of staticLighting.materials) {
      expect(staticLighting.hasAnimatedLightMap(material, false)).toBe(false);
      expect(staticLighting.hasAnimatedLightMap(material, true)).toBe(false);
    }
    lighting.dispose();
    staticLighting.dispose();
  });

  it("reuses animated atlases when toggling power in the same update interval", () => {
    const lighting = new DIFLighting(model());
    const material = lighting.materials[0];
    lighting.setAlarmState(true);
    lighting.prepare(material, 264);
    const map = material.lightMap!;
    const version = map.version;
    lighting.setAlarmState(false);
    lighting.prepare(material, 500);
    expect(material.lightMap).toBe(lighting.model.lightMaps[0]);
    lighting.setAlarmState(true);
    lighting.prepare(material, 264);
    expect(material.lightMap).toBe(map);
    expect(map.version).toBe(version);
    lighting.dispose();
  });
});

import { describe, it, expect } from "vitest";
import {
  terrainFromGhost,
  interiorFromGhost,
  skyFromGhost,
  sunFromGhost,
  missionAreaFromGhost,
  waterBlockFromGhost,
  ghostToSceneObject,
} from "./ghostToScene";

describe("terrainFromGhost", () => {
  it("extracts terrain fields", () => {
    const result = terrainFromGhost(5, {
      terrFileName: "ice.ter",
      detailTextureName: "details/detail1.png",
      squareSize: 8,
      emptySquareRuns: [0, 10, 256, 5],
    });
    expect(result.className).toBe("TerrainBlock");
    expect(result.ghostIndex).toBe(5);
    expect(result.terrFileName).toBe("ice.ter");
    expect(result.squareSize).toBe(8);
    expect(result.emptySquareRuns).toEqual([0, 10, 256, 5]);
  });

  it("uses defaults for missing fields", () => {
    const result = terrainFromGhost(0, {});
    expect(result.terrFileName).toBe("");
    expect(result.squareSize).toBe(8);
    expect(result.emptySquareRuns).toBeUndefined();
  });
});

describe("interiorFromGhost", () => {
  it("extracts transform and scale", () => {
    const transform = {
      elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 200, 300, 1],
      position: { x: 100, y: 200, z: 300 },
    };
    const result = interiorFromGhost(10, {
      interiorFile: "building.dif",
      transform,
      scale: { x: 2, y: 3, z: 4 },
      showTerrainInside: true,
      skinBase: "base",
      alarmState: false,
    });
    expect(result.interiorFile).toBe("building.dif");
    expect(result.transform).toBe(transform);
    expect(result.scale).toEqual({ x: 2, y: 3, z: 4 });
    expect(result.showTerrainInside).toBe(true);
  });

  it("uses identity transform for missing data", () => {
    const result = interiorFromGhost(0, {});
    expect(result.transform.elements).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    expect(result.scale).toEqual({ x: 1, y: 1, z: 1 });
  });
});

describe("skyFromGhost", () => {
  it("extracts fog volumes and cloud layers", () => {
    const result = skyFromGhost(1, {
      materialList: "sky_ice.dml",
      fogColor: { r: 0.5, g: 0.5, b: 0.5 },
      visibleDistance: 2000,
      fogDistance: 500,
      skySolidColor: { r: 0.1, g: 0.2, b: 0.3 },
      useSkyTextures: true,
      fogVolumes: [
        {
          visibleDistance: 500,
          minHeight: 0,
          maxHeight: 300,
          color: { r: 0.5, g: 0.5, b: 0.5 },
        },
      ],
      cloudLayers: [
        { texture: "cloud1.png", heightPercent: 0.35, speed: 0.001 },
      ],
      windVelocity: { x: 1, y: 0, z: 0 },
    });
    expect(result.fogVolumes).toHaveLength(1);
    expect(result.fogVolumes[0].visibleDistance).toBe(500);
    expect(result.cloudLayers).toHaveLength(1);
    expect(result.cloudLayers[0].texture).toBe("cloud1.png");
    expect(result.visibleDistance).toBe(2000);
  });

  it("defaults to empty arrays for missing volumes/layers", () => {
    const result = skyFromGhost(1, {});
    expect(result.fogVolumes).toEqual([]);
    expect(result.cloudLayers).toEqual([]);
  });
});

describe("sunFromGhost", () => {
  it("extracts direction and colors", () => {
    const result = sunFromGhost(2, {
      direction: { x: 0.57735, y: 0.57735, z: -0.57735 },
      color: { r: 0.8, g: 0.8, b: 0.7, a: 1.0 },
      ambient: { r: 0.3, g: 0.3, b: 0.4, a: 1.0 },
      textures: ["sun.png"],
    });
    expect(result.direction.x).toBeCloseTo(0.57735);
    expect(result.color.r).toBe(0.8);
    expect(result.textures).toEqual(["sun.png"]);
  });

  it("uses defaults for missing data", () => {
    const result = sunFromGhost(0, {});
    expect(result.direction).toEqual({ x: 0.57735, y: 0.57735, z: -0.57735 });
    expect(result.color).toEqual({ r: 0.7, g: 0.7, b: 0.7, a: 1 });
  });
});

describe("missionAreaFromGhost", () => {
  it("extracts area and flight ceiling", () => {
    const result = missionAreaFromGhost(3, {
      area: { x: -1024, y: -1024, w: 2048, h: 2048 },
      flightCeiling: 5000,
      flightCeilingRange: 100,
    });
    expect(result.area).toEqual({ x: -1024, y: -1024, w: 2048, h: 2048 });
    expect(result.flightCeiling).toBe(5000);
  });
});

describe("waterBlockFromGhost", () => {
  it("extracts surface textures", () => {
    const result = waterBlockFromGhost(4, {
      surfaceName: "water.png",
      envMapName: "envmap.png",
      scale: { x: 512, y: 512, z: 10 },
    });
    expect(result.surfaceName).toBe("water.png");
    expect(result.envMapName).toBe("envmap.png");
  });
});

describe("ghostToSceneObject", () => {
  it("dispatches by className", () => {
    const terrain = ghostToSceneObject("TerrainBlock", 1, {
      terrFileName: "test.ter",
    });
    expect(terrain?.className).toBe("TerrainBlock");

    const interior = ghostToSceneObject("InteriorInstance", 2, {
      interiorFile: "test.dif",
    });
    expect(interior?.className).toBe("InteriorInstance");

    const sky = ghostToSceneObject("Sky", 3, {});
    expect(sky?.className).toBe("Sky");
  });

  it("returns null for non-scene classes", () => {
    expect(ghostToSceneObject("Player", 1, {})).toBeNull();
    expect(ghostToSceneObject("Vehicle", 2, {})).toBeNull();
  });
});

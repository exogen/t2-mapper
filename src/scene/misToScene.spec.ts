import { describe, it, expect } from "vitest";
import {
  terrainFromMis,
  interiorFromMis,
  skyFromMis,
  sunFromMis,
  missionAreaFromMis,
  waterBlockFromMis,
  misToSceneObject,
} from "./misToScene";
import type { TorqueObject } from "../torqueScript";

function makeObj(
  className: string,
  props: Record<string, string>,
  id = 0,
): TorqueObject {
  const obj: TorqueObject = {
    _class: className.toLowerCase(),
    _className: className,
    _name: "",
    _id: id,
    _children: [],
  };
  for (const [k, v] of Object.entries(props)) {
    obj[k.toLowerCase()] = v;
  }
  return obj;
}

describe("terrainFromMis", () => {
  it("extracts terrain properties", () => {
    const obj = makeObj("TerrainBlock", {
      terrainFile: "ice.ter",
      detailTexture: "details/detail1.png",
      squareSize: "8",
    });
    const result = terrainFromMis(obj);
    expect(result.className).toBe("TerrainBlock");
    expect(result.terrFileName).toBe("ice.ter");
    expect(result.detailTextureName).toBe("details/detail1.png");
    expect(result.squareSize).toBe(8);
  });

  it("uses defaults for missing properties", () => {
    const result = terrainFromMis(makeObj("TerrainBlock", {}));
    expect(result.terrFileName).toBe("");
    expect(result.squareSize).toBe(8);
  });

  it("parses emptySquares", () => {
    const obj = makeObj("TerrainBlock", {
      terrainFile: "ice.ter",
      emptySquares: "0 10 256 5",
    });
    const result = terrainFromMis(obj);
    expect(result.emptySquareRuns).toEqual([0, 10, 256, 5]);
  });
});

describe("interiorFromMis", () => {
  it("builds transform from position and rotation", () => {
    const obj = makeObj("InteriorInstance", {
      interiorFile: "building.dif",
      position: "100 200 300",
      rotation: "0 0 1 90",
      scale: "2 3 4",
    });
    const result = interiorFromMis(obj);
    expect(result.className).toBe("InteriorInstance");
    expect(result.interiorFile).toBe("building.dif");

    // Position should be at elements[12..14]
    const e = result.transform.elements;
    expect(e[12]).toBeCloseTo(100);
    expect(e[13]).toBeCloseTo(200);
    expect(e[14]).toBeCloseTo(300);

    // Position object should match
    expect(result.transform.position).toEqual({ x: 100, y: 200, z: 300 });

    // Scale
    expect(result.scale).toEqual({ x: 2, y: 3, z: 4 });
  });

  it("handles identity rotation (0 0 1 0)", () => {
    const obj = makeObj("InteriorInstance", {
      interiorFile: "test.dif",
      position: "10 20 30",
      rotation: "1 0 0 0",
    });
    const result = interiorFromMis(obj);
    const e = result.transform.elements;
    // Should be identity rotation
    expect(e[0]).toBeCloseTo(1);
    expect(e[5]).toBeCloseTo(1);
    expect(e[10]).toBeCloseTo(1);
    // Off-diagonals should be 0
    expect(e[1]).toBeCloseTo(0);
    expect(e[2]).toBeCloseTo(0);
    expect(e[4]).toBeCloseTo(0);
  });

  it("90° rotation around Z produces correct rotation matrix", () => {
    const obj = makeObj("InteriorInstance", {
      interiorFile: "test.dif",
      position: "0 0 0",
      rotation: "0 0 1 90",
    });
    const result = interiorFromMis(obj);
    const e = result.transform.elements;

    // Rotation around Z by 90°:
    // cos(90°) = 0, sin(90°) = 1
    // Row-major, idx = row + col*4:
    //   [0]=cos  [4]=-sin [8]=0
    //   [1]=sin  [5]=cos  [9]=0
    //   [2]=0    [6]=0    [10]=1
    expect(e[0]).toBeCloseTo(0, 4);
    expect(e[1]).toBeCloseTo(1, 4);
    expect(e[4]).toBeCloseTo(-1, 4);
    expect(e[5]).toBeCloseTo(0, 4);
    expect(e[10]).toBeCloseTo(1, 4);
  });

  it("180° rotation is self-consistent", () => {
    const obj = makeObj("InteriorInstance", {
      interiorFile: "test.dif",
      position: "0 0 0",
      rotation: "0 0 1 180",
    });
    const result = interiorFromMis(obj);
    const e = result.transform.elements;
    // cos(180°) = -1, sin(180°) = 0
    expect(e[0]).toBeCloseTo(-1, 4);
    expect(e[5]).toBeCloseTo(-1, 4);
    expect(e[10]).toBeCloseTo(1, 4);
  });
});

describe("skyFromMis", () => {
  it("parses fog volumes", () => {
    const obj = makeObj("Sky", {
      materialList: "sky_ice.dml",
      fogVolume1: "500 0 300",
      fogVolume2: "0 0 0",
      fogVolume3: "1000 100 500",
      visibleDistance: "2000",
      fogDistance: "500",
    });
    const result = skyFromMis(obj);
    expect(result.className).toBe("Sky");
    // fogVolume2 is all zeros, should be filtered out
    expect(result.fogVolumes).toHaveLength(2);
    expect(result.fogVolumes[0].visibleDistance).toBe(500);
    expect(result.fogVolumes[0].maxHeight).toBe(300);
    expect(result.fogVolumes[1].visibleDistance).toBe(1000);
  });

  it("parses cloud layers", () => {
    const obj = makeObj("Sky", {
      cloudText1: "cloud1.png",
      cloudText2: "cloud2.png",
      cloudText3: "",
      cloudheightper0: "0.35",
      cloudheightper1: "0.25",
      cloudSpeed1: "0.001",
    });
    const result = skyFromMis(obj);
    expect(result.cloudLayers).toHaveLength(3);
    expect(result.cloudLayers[0].texture).toBe("cloud1.png");
    expect(result.cloudLayers[0].heightPercent).toBeCloseTo(0.35);
    expect(result.cloudLayers[0].speed).toBeCloseTo(0.001);
  });

  it("parses fog and sky colors", () => {
    const obj = makeObj("Sky", {
      fogColor: "0.5 0.6 0.7",
      SkySolidColor: "0.1 0.2 0.3",
    });
    const result = skyFromMis(obj);
    expect(result.fogColor).toEqual({ r: 0.5, g: 0.6, b: 0.7 });
    expect(result.skySolidColor).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
  });
});

describe("sunFromMis", () => {
  it("parses direction and colors", () => {
    const obj = makeObj("Sun", {
      direction: "0.57735 0.57735 -0.57735",
      color: "0.8 0.8 0.7 1.0",
      ambient: "0.3 0.3 0.4 1.0",
    });
    const result = sunFromMis(obj);
    expect(result.direction.x).toBeCloseTo(0.57735);
    expect(result.color).toEqual({ r: 0.8, g: 0.8, b: 0.7, a: 1.0 });
    expect(result.ambient).toEqual({ r: 0.3, g: 0.3, b: 0.4, a: 1.0 });
  });
});

describe("missionAreaFromMis", () => {
  it("parses area string", () => {
    const obj = makeObj("MissionArea", {
      area: "-1024 -1024 2048 2048",
      flightCeiling: "5000",
      flightCeilingRange: "100",
    });
    const result = missionAreaFromMis(obj);
    expect(result.area).toEqual({ x: -1024, y: -1024, w: 2048, h: 2048 });
    expect(result.flightCeiling).toBe(5000);
    expect(result.flightCeilingRange).toBe(100);
  });
});

describe("waterBlockFromMis", () => {
  it("extracts surface and env map", () => {
    const obj = makeObj("WaterBlock", {
      position: "0 0 50",
      rotation: "1 0 0 0",
      scale: "512 512 10",
      surfaceTexture: "water.png",
      envMapTexture: "envmap.png",
    });
    const result = waterBlockFromMis(obj);
    expect(result.surfaceName).toBe("water.png");
    expect(result.envMapName).toBe("envmap.png");
    expect(result.scale).toEqual({ x: 512, y: 512, z: 10 });
  });
});

describe("misToSceneObject", () => {
  it("dispatches to correct converter by className", () => {
    const terrain = misToSceneObject(
      makeObj("TerrainBlock", { terrainFile: "test.ter" }),
    );
    expect(terrain?.className).toBe("TerrainBlock");

    const interior = misToSceneObject(
      makeObj("InteriorInstance", { interiorFile: "test.dif" }),
    );
    expect(interior?.className).toBe("InteriorInstance");
  });

  it("returns null for unknown className", () => {
    expect(misToSceneObject(makeObj("Player", {}))).toBeNull();
    expect(misToSceneObject(makeObj("SimGroup", {}))).toBeNull();
  });
});

/**
 * Cross-validation: misToScene and ghostToScene should produce equivalent
 * scene objects for the same logical data. This catches drift between the
 * two adapter paths.
 */
import { describe, it, expect } from "vitest";
import { interiorFromMis, tsStaticFromMis, skyFromMis } from "./misToScene";
import {
  interiorFromGhost,
  tsStaticFromGhost,
  skyFromGhost,
} from "./ghostToScene";
import type { TorqueObject } from "../torqueScript";

function makeObj(
  className: string,
  props: Record<string, string>,
  id = 42,
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

describe("misToScene ↔ ghostToScene cross-validation", () => {
  it("InteriorInstance: identity rotation produces same transform", () => {
    const misResult = interiorFromMis(
      makeObj("InteriorInstance", {
        interiorFile: "building.dif",
        position: "100 200 300",
        rotation: "1 0 0 0",
        scale: "1 1 1",
        showTerrainInside: "0",
      }),
    );

    const ghostResult = interiorFromGhost(42, {
      interiorFile: "building.dif",
      transform: {
        elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 200, 300, 1],
        position: { x: 100, y: 200, z: 300 },
      },
      scale: { x: 1, y: 1, z: 1 },
      showTerrainInside: false,
      skinBase: "",
      alarmState: false,
    });

    expect(misResult.interiorFile).toBe(ghostResult.interiorFile);
    expect(misResult.scale).toEqual(ghostResult.scale);
    expect(misResult.showTerrainInside).toBe(ghostResult.showTerrainInside);

    // Transform position
    expect(misResult.transform.position.x).toBeCloseTo(
      ghostResult.transform.position.x,
    );
    expect(misResult.transform.position.y).toBeCloseTo(
      ghostResult.transform.position.y,
    );
    expect(misResult.transform.position.z).toBeCloseTo(
      ghostResult.transform.position.z,
    );

    // Rotation elements (identity case)
    for (let i = 0; i < 16; i++) {
      expect(misResult.transform.elements[i]).toBeCloseTo(
        ghostResult.transform.elements[i],
        4,
      );
    }
  });

  it("InteriorInstance: 90° Z rotation matches", () => {
    const misResult = interiorFromMis(
      makeObj("InteriorInstance", {
        interiorFile: "building.dif",
        position: "0 0 0",
        rotation: "0 0 1 90",
      }),
    );

    // Build the same matrix manually: 90° around Z
    const c = Math.cos(Math.PI / 2);
    const s = Math.sin(Math.PI / 2);
    const elements = [
      c, s, 0, 0,
      -s, c, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];

    const ghostResult = interiorFromGhost(42, {
      interiorFile: "building.dif",
      transform: { elements, position: { x: 0, y: 0, z: 0 } },
      scale: { x: 1, y: 1, z: 1 },
    });

    for (let i = 0; i < 16; i++) {
      expect(misResult.transform.elements[i]).toBeCloseTo(
        ghostResult.transform.elements[i],
        4,
      );
    }
  });

  it("TSStatic: position and scale match", () => {
    const misResult = tsStaticFromMis(
      makeObj("TSStatic", {
        shapeName: "tree.dts",
        position: "50 60 70",
        rotation: "1 0 0 0",
        scale: "2 3 4",
      }),
    );

    const ghostResult = tsStaticFromGhost(42, {
      shapeName: "tree.dts",
      transform: {
        elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 60, 70, 1],
        position: { x: 50, y: 60, z: 70 },
      },
      scale: { x: 2, y: 3, z: 4 },
    });

    expect(misResult.shapeName).toBe(ghostResult.shapeName);
    expect(misResult.scale).toEqual(ghostResult.scale);
    expect(misResult.transform.position).toEqual(ghostResult.transform.position);
  });

  it("Sky: fog and cloud data match", () => {
    const misResult = skyFromMis(
      makeObj("Sky", {
        materialList: "sky_ice.dml",
        fogColor: "0.5 0.6 0.7",
        visibleDistance: "2000",
        fogDistance: "500",
        SkySolidColor: "0.1 0.2 0.3",
        useSkyTextures: "1",
        windVelocity: "1 0 0",
      }),
    );

    const ghostResult = skyFromGhost(42, {
      materialList: "sky_ice.dml",
      fogColor: { r: 0.5, g: 0.6, b: 0.7 },
      visibleDistance: 2000,
      fogDistance: 500,
      skySolidColor: { r: 0.1, g: 0.2, b: 0.3 },
      useSkyTextures: true,
      fogVolumes: [],
      cloudLayers: [],
      windVelocity: { x: 1, y: 0, z: 0 },
    });

    expect(misResult.materialList).toBe(ghostResult.materialList);
    expect(misResult.fogColor).toEqual(ghostResult.fogColor);
    expect(misResult.visibleDistance).toBe(ghostResult.visibleDistance);
    expect(misResult.fogDistance).toBe(ghostResult.fogDistance);
    expect(misResult.skySolidColor).toEqual(ghostResult.skySolidColor);
    expect(misResult.useSkyTextures).toBe(ghostResult.useSkyTextures);
    expect(misResult.windVelocity).toEqual(ghostResult.windVelocity);
  });
});

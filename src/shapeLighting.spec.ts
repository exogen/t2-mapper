import { afterEach, describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Color,
  DataTexture,
  Group,
  type Material,
  Mesh,
  Object3D,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from "three";
import { setTerrainCollisionData } from "./collision/terrainCollision";
import {
  clearWorldColliders,
  registerInteriorCollider,
} from "./collision/worldCollision";
import {
  createShapeLightState,
  probeShapeLighting,
  SHAPE_LIGHT_SLEW_PER_MS,
  setShapeSun,
  setTerrainLightmap,
  updateShapeLighting,
  type ShapeLightProbe,
} from "./shapeLighting";

const TERRAIN_SIZE = 256;

/** Flat heightmap at a uniform world height. */
function flatHeightMap(worldHeight: number): Uint16Array {
  return new Uint16Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(worldHeight * 32);
}

/** A uniformly coloured 2×2 lightmap. */
function lightmap(r: number, g: number, b: number): DataTexture {
  const data = new Uint8Array(16);
  for (let i = 0; i < 4; i++) data.set([r, g, b, 255], i * 4);
  return new DataTexture(data, 2, 2, RGBAFormat, UnsignedByteType);
}

/**
 * A 10 m interior box at a Three-space position, with lightmap UVs and a
 * lightmap the way InteriorMesh stores them.
 */
function interiorBox(position: Vector3, map: DataTexture | null): Mesh {
  const geometry = new BoxGeometry(10, 10, 10);
  // One material slot, as a DIF surface mesh has.
  geometry.clearGroups();
  geometry.setAttribute("uv1", geometry.attributes.uv);
  geometry.userData.lightMaps = [map];
  const mesh = new Mesh(geometry);
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function probe(): ShapeLightProbe {
  return { mode: 0, color: new Color(0, 0, 0) };
}

afterEach(() => {
  setTerrainCollisionData(null);
  setTerrainLightmap(null);
  clearWorldColliders();
});

describe("probeShapeLighting", () => {
  it("takes the floor lightmap under a roof", () => {
    // Torque (0, 0, 10) is Three (0, 10, 0): a roof box 25–35 m up and a
    // floor box whose top is 5 m below the probe.
    registerInteriorCollider("roof", [
      interiorBox(new Vector3(0, 30, 0), lightmap(255, 255, 255)),
    ]);
    registerInteriorCollider("floor", [
      interiorBox(new Vector3(0, 0, 0), lightmap(128, 64, 32)),
    ]);
    const out = probe();
    probeShapeLighting([0, 0, 10], out);
    expect(out.mode).toBe(1);
    expect(out.color.r).toBeCloseTo(128 / 255, 3);
    expect(out.color.g).toBeCloseTo(64 / 255, 3);
    expect(out.color.b).toBeCloseTo(32 / 255, 3);
  });

  it("adds the sun and ambient on an outside-visible floor", () => {
    setShapeSun(
      new Color(0.6, 0.6, 0.6),
      new Color(0.2, 0.1, 0.0),
      new Vector3(0, 1, 0),
    );
    const floor = interiorBox(new Vector3(0, 0, 0), lightmap(0, 0, 0));
    floor.geometry.userData.outsideVisible = [true];
    registerInteriorCollider("roof", [
      interiorBox(new Vector3(0, 30, 0), null),
    ]);
    registerInteriorCollider("floor", [floor]);
    const out = probe();
    probeShapeLighting([0, 0, 10], out);
    expect(out.mode).toBe(1);
    // The box top faces straight up at the sun: sun × 1 + ambient.
    expect(out.color.r).toBeCloseTo(0.8);
    expect(out.color.g).toBeCloseTo(0.7);
    expect(out.color.b).toBeCloseTo(0.6);
  });

  it("lights white under a roof whose floor has no lightmap", () => {
    registerInteriorCollider("roof", [
      interiorBox(new Vector3(0, 30, 0), null),
    ]);
    registerInteriorCollider("floor", [
      interiorBox(new Vector3(0, 0, 0), null),
    ]);
    const out = probe();
    probeShapeLighting([0, 0, 10], out);
    expect(out.mode).toBe(1);
    expect(out.color.r).toBe(1);
  });

  it("keeps the previous result under a roof with no floor beneath", () => {
    registerInteriorCollider("roof", [
      interiorBox(new Vector3(0, 30, 0), null),
    ]);
    const out: ShapeLightProbe = { mode: 2, color: new Color(0.2, 0.2, 0.2) };
    probeShapeLighting([0, 0, 10], out);
    expect(out.mode).toBe(2);
    expect(out.color.r).toBeCloseTo(0.2);
  });

  it("takes the terrain lighting with nothing above", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(50), squareSize: 8 });
    setTerrainLightmap({
      ndotl: new Uint8Array(512 * 512).fill(255),
      size: 512,
      squareSize: 8,
      originX: -1024,
      originY: -1024,
      sunColor: new Color(0.6, 0.6, 0.6),
      ambient: new Color(0.3, 0.2, 0.1),
    });
    const out = probe();
    probeShapeLighting([0, 0, 60], out);
    expect(out.mode).toBe(2);
    expect(out.color.r).toBeCloseTo(0.9);
    expect(out.color.g).toBeCloseTo(0.8);
    expect(out.color.b).toBeCloseTo(0.7);
  });

  it("gives up beyond the probe's reach", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(50), squareSize: 8 });
    const out = probe();
    probeShapeLighting([0, 0, 200], out);
    expect(out.mode).toBe(0);
  });
});

describe("updateShapeLighting", () => {
  it("snaps from nothing below, then slews at the engine's rate", () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(1, 1, 1)));
    root.position.set(0, 10, 0);
    root.updateMatrixWorld(true);
    const state = createShapeLightState(root, undefined);
    registerInteriorCollider("roof", [
      interiorBox(new Vector3(0, 30, 0), lightmap(255, 255, 255)),
    ]);
    registerInteriorCollider("floor", [
      interiorBox(new Vector3(0, 0, 0), lightmap(255, 0, 0)),
    ]);
    updateShapeLighting(state, 16);
    const color = state.uniforms.shapeLightColor.value;
    expect(state.uniforms.shapeLightMode.value).toBe(1);
    expect(color.r).toBe(1);
    expect(color.g).toBe(0);

    // A darker floor: the colour walks toward it, clamped per step.
    clearWorldColliders();
    registerInteriorCollider("roof", [
      interiorBox(new Vector3(0, 30, 0), lightmap(255, 255, 255)),
    ]);
    registerInteriorCollider("floor", [
      interiorBox(new Vector3(0, 0, 0), lightmap(0, 255, 0)),
    ]);
    updateShapeLighting(state, 100);
    expect(color.r).toBeCloseTo(1 - SHAPE_LIGHT_SLEW_PER_MS * 100, 5);
    expect(color.g).toBeCloseTo(SHAPE_LIGHT_SLEW_PER_MS * 100, 5);
    updateShapeLighting(state, 10000);
    expect(color.r).toBe(0);
    expect(color.g).toBe(1);
  });

  it("hands every material the shape's uniforms", () => {
    const root = new Object3D();
    const mesh = new Mesh(new BoxGeometry(1, 1, 1));
    root.add(mesh);
    const state = createShapeLightState(root, undefined);
    expect((mesh.material as Material).userData.shapeLight).toBe(
      state.uniforms,
    );
    expect(state.uniforms.shapeBoundRadius.value).toBeCloseTo(Math.sqrt(3) / 2);
  });
});

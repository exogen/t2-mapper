import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Group, Mesh } from "three";
import { getActualResourceKey, getSourceAndPath } from "../manifest";
import { createDIFTestBuffer } from "../dif/difTestFixtures";
import { createDTSTestBuffer } from "../dts/dtsTestFixtures";
import { DTSLoader } from "../dts/dtsLoader";
import {
  interiorPlacement,
  streamEntityPlacement,
  SHAPE_MODEL_ROTATION_Y,
} from "./placement";
import { createDIFModel } from "../dif/difLoader";
import {
  interiorColliderMeshes,
  staticShapeColliderMeshes,
} from "./colliderPolicy";
import { IDENTITY_MATRIX } from "../scene/types";
import { describe, expect, it } from "vitest";
import { HeadlessWorld, type WorldEntity } from "./headlessWorld";
import {
  getColliderDump,
  pointObstructed,
  registerInteriorCollider,
  registerStaticShapeCollider,
} from "../collision/worldCollision";
import { getWaterBodies } from "../collision/waterLevel";

/**
 * Force fields are the cheapest collider to test with: they need no
 * GLB, just a position and dimensions, so these run without assets.
 */
function field(
  id: string,
  ghostIndex: number,
  dims: [number, number, number],
): WorldEntity {
  return {
    id,
    ghostIndex,
    className: "ForceFieldBare",
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    forceFieldData: { dimensions: dims },
  };
}

describe("HeadlessWorld slot reuse", () => {
  it("re-registers when a ghost slot changes occupant", async () => {
    // Ghost indices are SLOTS. The engine frees one on destroy and
    // hands it to whatever spawns next, so "same slot" does not mean
    // "same object" — measured on s5-damnation, ghost 91 goes from a
    // projectile to a deployed inventory station. Keying on the slot
    // alone meant the newcomer never registered and the old geometry
    // stayed behind at the old size, forever.
    const world = new HeadlessWorld();

    await world.sync([field("100", 5, [10, 10, 10])]);
    const first = await world.run(() => getColliderDump());
    expect(first).toHaveLength(1);
    expect(first[0].worldBoxMax).toEqual([10, 10, 10]);

    // Same slot, DIFFERENT object.
    await world.sync([field("200", 5, [50, 50, 50])]);
    const second = await world.run(() => getColliderDump());
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe("ghost:5");
    expect(second[0].worldBoxMax).toEqual([50, 50, 50]);
  });

  it("leaves an unchanged occupant alone", async () => {
    const world = new HeadlessWorld();
    await world.sync([field("100", 5, [10, 10, 10])]);
    await world.sync([field("100", 5, [10, 10, 10])]);
    const dump = await world.run(() => getColliderDump());
    expect(dump).toHaveLength(1);
    expect(dump[0].worldBoxMax).toEqual([10, 10, 10]);
  });

  it("drops a collider whose slot empties", async () => {
    const world = new HeadlessWorld();
    await world.sync([field("100", 5, [10, 10, 10])]);
    await world.sync([]);
    expect(await world.run(() => getColliderDump())).toHaveLength(0);
  });

  it("tracks several slots independently", async () => {
    const world = new HeadlessWorld();
    await world.sync([
      field("100", 5, [10, 10, 10]),
      field("101", 6, [20, 20, 20]),
    ]);
    // Slot 5 recycles; slot 6 does not.
    await world.sync([
      field("200", 5, [30, 30, 30]),
      field("101", 6, [20, 20, 20]),
    ]);
    const dump = await world.run(() => getColliderDump());
    const bySlot = new Map(dump.map((d) => [d.id, d.worldBoxMax]));
    expect(bySlot.get("ghost:5")).toEqual([30, 30, 30]);
    expect(bySlot.get("ghost:6")).toEqual([20, 20, 20]);
  });

  it("replaces a water body when its slot is recycled", async () => {
    const water = (id: string, ghostIndex: number, z: number): WorldEntity => ({
      id,
      ghostIndex,
      className: "WaterBlock",
      sceneData: {
        className: "WaterBlock",
        ghostIndex,
        transform: {
          elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          position: { x: 0, y: 0, z },
        },
        scale: { x: 100, y: 100, z: 0 },
        surfaceName: "",
        envMapName: "",
        surfaceOpacity: 1,
        waveMagnitude: 0,
        envMapIntensity: 0,
        liquidType: 0,
      },
    });

    const world = new HeadlessWorld();
    await world.sync([water("100", 7, 50)]);
    expect(await world.run(() => getWaterBodies())).toHaveLength(1);
    expect((await world.run(() => getWaterBodies()))[0].surfaceZ).toBe(50);

    await world.sync([water("200", 7, 90)]);
    const bodies = await world.run(() => getWaterBodies());
    expect(bodies).toHaveLength(1);
    expect(bodies[0].surfaceZ).toBe(90);
  });
});

describe("HeadlessWorld native DTS collision", () => {
  it.each(["TSStatic", "StaticShape"])(
    "loads tree collision for %s with browser-equivalent placement",
    async (type) => {
      const root = await mkdtemp(path.join(tmpdir(), "native-dts-collision-"));
      try {
        const name = "borg18.dts";
        const [source, actual] = getSourceAndPath(
          getActualResourceKey(`shapes/${name}`),
        );
        const file = path.join(
          root,
          ...(source ? ["@vl2", source] : []),
          actual,
        );
        const buffer = createDTSTestBuffer(
          24,
          type === "TSStatic" ? "Collision-1" : "LOS-9",
        );
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, new Uint8Array(buffer));
        const entity: WorldEntity = {
          id: "native",
          ghostIndex: 5,
          className: type,
          shapeHint: name,
          sceneData: { shapeName: name },
          position: [1, 2, 3],
          rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
          scale: [0.5, 2, 3],
        };
        const headlessWorld = new HeadlessWorld({ assetRoot: root });
        await headlessWorld.sync([entity]);
        expect(headlessWorld.stats().failedAssets).toBe(0);
        const headless = await headlessWorld.run(() => getColliderDump());
        expect(headless).toHaveLength(1);

        const placement = streamEntityPlacement(entity);
        const group = new Group(),
          model = new Group();
        group.position.set(...placement.position);
        group.quaternion.set(...placement.rotation);
        group.scale.set(...entity.scale!);
        model.rotation.y = SHAPE_MODEL_ROTATION_Y;
        group.add(model);
        const instance = new DTSLoader().parse(buffer).scene.clone(true);
        model.add(instance);
        const browserWorld = new HeadlessWorld();
        await browserWorld.run(() =>
          registerStaticShapeCollider(
            "ghost:5",
            staticShapeColliderMeshes({ root: instance, type })!,
          ),
        );
        expect(await browserWorld.run(() => getColliderDump())).toEqual(
          headless,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

describe("HeadlessWorld native DIF", () => {
  it("loads a DIF without a GLB and applies the same placement as the browser", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "native-dif-"));
    try {
      const name = "bbunk1.dif";
      const [source, actual] = getSourceAndPath(
        getActualResourceKey(`interiors/${name}`),
      );
      const file = path.join(root, ...(source ? ["@vl2", source] : []), actual);
      const { buffer } = createDIFTestBuffer({
        collision: true,
        vehicleCollision: "box",
      });
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, new Uint8Array(buffer));
      const scene = {
        className: "InteriorInstance" as const,
        ghostIndex: 5,
        interiorFile: name,
        transform: { ...IDENTITY_MATRIX, position: { x: 1, y: 2, z: 3 } },
        scale: { x: 1, y: 2, z: 3 },
        showTerrainInside: false,
        skinBase: "base",
        alarmState: false,
      };
      const world = new HeadlessWorld({ assetRoot: root });
      await world.sync([
        {
          id: "native",
          ghostIndex: 5,
          className: "InteriorInstance",
          sceneData: scene,
        },
      ]);
      expect(world.stats().failedAssets).toBe(0);
      const headless = await world.run(() => getColliderDump());
      expect(headless).toHaveLength(1);
      expect(headless[0].worldBoxMin).toEqual([2, -3, 1]);
      expect(headless[0].worldBoxMax).toEqual([6, 3, 4]);
      const probeHulls = () => [
        pointObstructed([3, 4, 0], 0.1),
        pointObstructed([3, 4, 0], 0.1, { interiorHullType: "vehicle" }),
      ];
      expect(await world.run(probeHulls)).toEqual([true, false]);

      // Mirror InteriorInstance's component groups, using the shared loader.
      const browserWorld = new HeadlessWorld();
      const group = new Group();
      const placement = interiorPlacement(scene);
      group.position.set(...placement.position);
      group.quaternion.copy(placement.quaternion);
      group.scale.set(...placement.scale);
      const modelGroup = new Group();
      group.add(modelGroup);
      const model = createDIFModel(buffer);
      for (const mesh of model.surfaceMeshes)
        modelGroup.add(new Mesh(mesh.geometry, mesh.material));
      await browserWorld.run(() =>
        registerInteriorCollider(
          "ghost:5",
          interiorColliderMeshes(modelGroup, model),
        ),
      );
      expect(await browserWorld.run(() => getColliderDump())).toEqual(headless);
      expect(await browserWorld.run(probeHulls)).toEqual([true, false]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

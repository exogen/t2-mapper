import { describe, expect, it } from "vitest";
import { HeadlessWorld, type WorldEntity } from "./headlessWorld";
import { getColliderDump } from "../collision/worldCollision";
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

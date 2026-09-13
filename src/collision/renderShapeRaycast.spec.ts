import { afterEach, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, Vector3 } from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { createDTSCollisionTestShape } from "../dts/dtsTestFixtures";
import { RenderShapeRaycast } from "./renderShapeRaycast";
import {
  clearWorldColliders,
  registerInteriorCollider,
} from "./worldCollision";

afterEach(clearWorldColliders);

function shape() {
  const data = createDTSCollisionTestShape();
  data.bounds = { min: [-10, -10, -10], max: [10, 10, 10] };
  return buildDTS(data).scene;
}

it("contacts LOS hulls, not the larger visual mesh, and follows parent motion", () => {
  const rays = new RenderShapeRaycast(),
    target = shape(),
    parent = new Group();
  parent.add(target);
  rays.register("target", target, "StaticShape");
  const start = new Vector3(-15, 0, 0),
    end = new Vector3(15, 0, 0),
    out = new Vector3();
  expect(rays.repairHit(start, end, "target", out)).toBe(true);
  expect(out.x).toBeCloseTo(-2); // render extent is 10, collision extent is 1.
  parent.position.x = 5;
  expect(rays.repairHit(start, end, "target", out)).toBe(true);
  expect(out.x).toBeCloseTo(3);
  target.getShapeObject(0)!.opacity = 0;
  expect(rays.repairHit(start, end, "target", out)).toBe(false);
});

it("requires the closest eligible object to be the target, preserving the old contact on miss", () => {
  const rays = new RenderShapeRaycast(),
    target = shape(),
    blocker = shape();
  const start = new Vector3(-15, 0, 0),
    end = new Vector3(15, 0, 0),
    out = new Vector3(99, 0, 0);
  blocker.position.x = -6;
  rays.register("target", target, "Turret");
  const stop = rays.register("blocker", blocker, "Vehicle");
  expect(rays.repairHit(start, end, "target", out)).toBe(false);
  expect(out.x).toBe(99);
  stop();
  expect(rays.repairHit(start, end, "target", out)).toBe(true);
  expect(out.x).toBeCloseTo(-2);
});

it("matches the target's type mask for TSStatic and interior occluders", () => {
  const rays = new RenderShapeRaycast(),
    target = shape(),
    tree = shape();
  const start = new Vector3(-15, 0, 0),
    end = new Vector3(15, 0, 0),
    out = new Vector3();
  tree.position.x = -6;
  rays.register("tree", tree, "TSStatic");
  rays.register("target", target, "Turret");
  expect(rays.repairHit(start, end, "target", out)).toBe(false);
  rays.register("target", target, "Vehicle");
  expect(rays.repairHit(start, end, "target", out)).toBe(true);
  const wall = new Mesh(new BoxGeometry(1, 4, 4));
  wall.position.x = -10;
  wall.updateMatrixWorld();
  registerInteriorCollider("wall", [wall]);
  expect(rays.repairHit(start, end, "target", out)).toBe(true);
  rays.register("target", target, "StaticShape");
  expect(rays.repairHit(start, end, "target", out)).toBe(false);
});

it("uses the enabled player's configured box, including inside starts and rotation", () => {
  const rays = new RenderShapeRaycast(),
    target = shape();
  let alive = true;
  rays.register("player", target, "Player", () => alive, { x: 1, y: 2, z: 3 });
  const start = new Vector3(-5, 2.5, 0),
    end = new Vector3(5, 2.5, 0),
    out = new Vector3();
  expect(rays.repairHit(start, end, "player", out)).toBe(true);
  expect(out.x).toBeCloseTo(-0.5);
  target.rotation.y = Math.PI / 2;
  expect(rays.repairHit(start, end, "player", out)).toBe(true);
  expect(out.x).toBeCloseTo(-1);
  start.x = 0;
  expect(rays.repairHit(start, end, "player", out)).toBe(true);
  expect(out.toArray()).toEqual(start.toArray());
  alive = false;
  expect(rays.repairHit(start, end, "player", out)).toBe(false);
});

it("keeps mounted shapes out of the parent's hull and unregisters replacements safely", () => {
  const rays = new RenderShapeRaycast(),
    target = shape(),
    image = shape();
  image.position.x = -6;
  target.add(image);
  const stopOld = rays.register("target", shape(), "StaticShape");
  const stop = rays.register("target", target, "StaticShape");
  stopOld();
  const start = new Vector3(-15, 0, 0),
    end = new Vector3(15, 0, 0),
    out = new Vector3();
  expect(rays.repairHit(start, end, "target", out)).toBe(true);
  expect(out.x).toBeCloseTo(-2);
  stop();
  expect(rays.repairHit(start, end, "target", out)).toBe(false);
});

it("occludes the impact flare from the back and behind other objects, excluding its target", () => {
  const rays = new RenderShapeRaycast(),
    target = shape(),
    blocker = shape();
  const end = new Vector3(-2, 0, 0),
    muzzle = new Vector3(-10, 0, 0);
  const camera = new Vector3(-12, 0, 0);
  rays.register("target", target, "StaticShape");
  expect(rays.repairFlareVisible(camera, muzzle, end, "target", "source")).toBe(
    true,
  );
  expect(
    rays.repairFlareVisible(
      new Vector3(12, 0, 0),
      muzzle,
      end,
      "target",
      "source",
    ),
  ).toBe(false);
  blocker.position.x = -6;
  const stop = rays.register("blocker", blocker, "StaticShape");
  expect(rays.repairFlareVisible(camera, muzzle, end, "target", "source")).toBe(
    false,
  );
  stop();
  rays.register("source", blocker, "StaticShape");
  expect(
    rays.repairFlareVisible(camera, muzzle, end, "target", "source", true),
  ).toBe(true);
  expect(
    rays.repairFlareVisible(camera, muzzle, end, "target", "source", false),
  ).toBe(false);
});

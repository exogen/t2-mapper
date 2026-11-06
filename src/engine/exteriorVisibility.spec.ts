import { afterEach, expect, it } from "vitest";
import { Group, PerspectiveCamera, Vector3 } from "three";
import { createDIFModel } from "../dif/difLoader";
import { createDIFTestBuffer } from "../dif/difTestFixtures";
import { interiorColliderMeshes } from "../world/colliderPolicy";
import {
  clearWorldColliders,
  registerInteriorCollider,
  unregisterInteriorCollider,
} from "../collision/worldCollision";
import {
  createCollisionState,
  setCollisionStateResolver,
} from "../collision/collisionContext";
import { exteriorViewRect } from "./exteriorVisibility";

afterEach(() => {
  setCollisionStateResolver(null);
  clearWorldColliders();
});

function building(options: { sealed?: boolean; transformed?: boolean } = {}) {
  const model = createDIFModel(createDIFTestBuffer({ portals: true }).buffer);
  if (options.sealed) {
    model.interior.zones[1].portalCount = 0;
  }
  const group = new Group();
  if (options.transformed) {
    group.position.set(100, 20, -50);
    group.rotation.set(0.2, 0.7, -0.1);
    group.scale.set(2, 3, 4);
  }
  registerInteriorCollider("building", interiorColliderMeshes(group, model));
  const camera = new PerspectiveCamera(120, 1, 0.1, 1000);
  // Native local (x,y,z)=(1.5,1,-1.9): a room beneath the roof portal.
  camera.position.copy(group.localToWorld(new Vector3(1, -1.9, 1.5)));
  camera.up.set(0, 0, 1).transformDirection(group.matrixWorld);
  const portal = group.localToWorld(new Vector3(1, 0, 1.5));
  camera.lookAt(portal);
  return { group, camera, portal };
}

it("keeps an outdoor camera unrestricted, including within an interior's bounding box", () => {
  const { camera } = building();
  camera.position.set(1, 1, 1.5);
  expect(exteriorViewRect(camera)).toEqual([-1, -1, 1, 1]);
  camera.position.set(1000, 1000, 1000);
  expect(exteriorViewRect(camera)).toEqual([-1, -1, 1, 1]);
});

it.each([false, true])(
  "clips an indoor view to the exterior portal with transformed=%s",
  (transformed) => {
    const { camera, portal } = building({ transformed });
    const rect = exteriorViewRect(camera);
    expect(rect).not.toBeNull();
    expect(rect![0]).toBeGreaterThan(-1);
    expect(rect![1]).toBeGreaterThan(-1);
    expect(rect![2]).toBeLessThan(1);
    expect(rect![3]).toBeLessThan(1);
    // Looking away closes the outdoor part of the view without moving rooms.
    camera.lookAt(camera.position.clone().multiplyScalar(2).sub(portal));
    expect(exteriorViewRect(camera)).toBeNull();
  },
);

it("hides outdoor effects in sealed rooms and releases the restriction when the building unloads", () => {
  const { camera } = building({ sealed: true });
  expect(exteriorViewRect(camera)).toBeNull();
  unregisterInteriorCollider("building");
  expect(exteriorViewRect(camera)).toEqual([-1, -1, 1, 1]);
});

it("keeps the portal registry scoped to the current collision world", () => {
  const first = createCollisionState(),
    second = createCollisionState();
  setCollisionStateResolver(() => first);
  const { camera } = building({ sealed: true });
  expect(exteriorViewRect(camera)).toBeNull();
  setCollisionStateResolver(() => second);
  expect(exteriorViewRect(camera)).toEqual([-1, -1, 1, 1]);
  setCollisionStateResolver(() => first);
  expect(exteriorViewRect(camera)).toBeNull();
});

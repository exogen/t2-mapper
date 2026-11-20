import { afterEach, expect, it, vi } from "vitest";
import { Group, Vector3 } from "three";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import type { StreamEntity } from "../stream/types";
import {
  createWeaponPushback,
  readUnshiftedMountedImagePosition,
} from "./weaponPushback";

afterEach(() => vi.restoreAllMocks());

const player: StreamEntity = {
  id: "player",
  type: "Player",
  position: [5, 0, 0],
};

function gun() {
  const body = new Group(),
    mount = new Group(),
    model = new Group();
  const image = new Group(),
    muzzle = new Group(),
    retraction = new Group();
  body.add(mount);
  mount.add(model);
  model.add(image);
  image.add(muzzle, retraction);
  mount.position.z = 0.5;
  model.matrixAutoUpdate = false;
  muzzle.name = "Muzzlepoint";
  muzzle.position.z = 3;
  retraction.name = "RetractionPoint";
  retraction.position.z = 2;
  return { body, mount, model, image, muzzle, retraction };
}

it("casts the simulation mount-to-retraction ray, then only shifts the rendered gun by the muzzle vector", () => {
  const { body, mount, model, image, muzzle } = gun();
  body.position.z = 2;
  const cast = vi
    .spyOn(renderShapeRaycast, "weaponRetractionHit")
    .mockImplementation((start, end, owner, includeWater) => {
      expect(start).toEqual(new Vector3(0, 0, 5.5));
      expect(end).toEqual(new Vector3(0, 0, 7.5));
      expect(owner).toBe("player");
      expect(includeWater).toBe(false);
      return 0.25;
    });
  const pushback = createWeaponPushback(mount, model, image);
  pushback.update(player, body);
  expect(model.position.z).toBeCloseTo(-2.25);
  expect(model.rotation.y).toBe(0);
  const out = new Vector3();
  expect(muzzle.getWorldPosition(out).z).toBeCloseTo(3.25);
  expect(readUnshiftedMountedImagePosition(image, muzzle, out).z).toBeCloseTo(
    5.5,
  );
  pushback.update(player, body);
  expect(model.position.z).toBeCloseTo(-2.25);

  // The translation is interpreted under the parent's new orientation even
  // before the next weapon pose pass.
  body.rotation.y = Math.PI / 2;
  expect(readUnshiftedMountedImagePosition(image, muzzle, out).x).toBeCloseTo(
    3.5,
  );
  cast.mockReturnValue(undefined);
  pushback.update(player, body);
  expect(model.position.length()).toBe(0);
});

it("falls back to the muzzle and releases the weapon immediately on death", () => {
  const { body, mount, model, image, retraction } = gun();
  retraction.removeFromParent();
  const cast = vi
    .spyOn(renderShapeRaycast, "weaponRetractionHit")
    .mockReturnValue(0.5);
  const pushback = createWeaponPushback(mount, model, image);
  pushback.update(player, body);
  expect(cast).toHaveBeenCalledWith(
    new Vector3(0, 0, 5.5),
    new Vector3(0, 0, 8.5),
    "player",
    false,
  );
  expect(model.position.z).toBeCloseTo(-1.5);
  pushback.update({ ...player, damageState: 1 }, body);
  expect(cast).toHaveBeenCalledTimes(1);
  expect(model.position.length()).toBe(0);
});

it("uses the vehicle's simulation pose and the passenger's simulation yaw", () => {
  const { body, mount, model, image } = gun();
  const carrierRoot = new Group(),
    seat = new Group();
  carrierRoot.add(seat);
  seat.add(body);
  carrierRoot.position.z = 10;
  seat.position.z = 1;
  body.rotation.y = Math.PI / 2;
  const cast = vi
    .spyOn(renderShapeRaycast, "weaponRetractionHit")
    .mockReturnValue(0.5);
  createWeaponPushback(mount, model, image).update(
    { ...player, mountObjectId: "carrier", rotation: [0, 0, 0, 1] },
    body,
    { position: [20, 0, 0] },
    carrierRoot,
  );
  const [start, end] = cast.mock.calls[0];
  expect(start.x).toBeCloseTo(0);
  expect(end.x).toBeCloseTo(0);
  expect(start.z).toBeCloseTo(21.5);
  expect(end.z).toBeCloseTo(23.5);
  expect(model.position.z).toBeCloseTo(-1.5);
});

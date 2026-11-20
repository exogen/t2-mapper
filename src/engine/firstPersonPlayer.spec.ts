import { Quaternion, Vector3 } from "three";
import { expect, it } from "vitest";
import type { StreamCamera, StreamEntity } from "../stream/types";
import { yawPitchToQuaternion } from "../stream/streamHelpers";
import { firstPersonPlayerId, readClipViewAngles } from "./firstPersonPlayer";

const camera: StreamCamera = {
  time: 0,
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  fov: 90,
  mode: "first-person",
  controlEntityId: "recorder",
};

const recorder = { id: "recorder", type: "Player" } as StreamEntity;
const followed = { id: "followed", type: "Player" } as StreamEntity;
const vehicle = { id: "vehicle", type: "FlyingVehicle" } as StreamEntity;
const entities = new Map([recorder, followed, vehicle].map((e) => [e.id, e]));

it("recovers aim for a mounted weapon from the clip camera's orientation", () => {
  const quaternion = yawPitchToQuaternion(-2.7, 1.1);
  const aim = { yaw: 0, pitch: 0, headYaw: 0.4 };
  readClipViewAngles(quaternion, aim);
  expect(aim.yaw).toBeCloseTo(-2.7);
  expect(aim.pitch).toBeCloseTo(1.1);
  expect(aim.headYaw).toBe(0.4);
});

it("recovers a passenger's aim relative to their seat in a clip", () => {
  const seat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.7);
  const camera = new Quaternion()
    .fromArray(yawPitchToQuaternion(-2.7, 1.1))
    .premultiply(seat);
  const aim = { yaw: 0, pitch: 0 };
  readClipViewAngles(camera.toArray(), aim, seat);
  expect(aim.yaw).toBeCloseTo(-2.7);
  expect(aim.pitch).toBeCloseTo(1.1);
});

it("masks the control player in the recorded first-person view", () => {
  expect(firstPersonPlayerId(entities, camera, "original", undefined)).toBe(
    "recorder",
  );
  expect(
    firstPersonPlayerId(
      entities,
      { ...camera, mode: "third-person" },
      "original",
      undefined,
    ),
  ).toBeNull();
  expect(
    firstPersonPlayerId(
      entities,
      { ...camera, controlEntityId: "vehicle" },
      "original",
      undefined,
    ),
  ).toBeNull();
});

it("masks the followed player only in first-person follow", () => {
  expect(
    firstPersonPlayerId(entities, camera, "firstPersonOverride", followed.id),
  ).toBe("followed");
  expect(
    firstPersonPlayerId(entities, camera, "orbitOverride", followed.id),
  ).toBeNull();
  expect(
    firstPersonPlayerId(entities, camera, "freeFly", followed.id),
  ).toBeNull();
});

it("leaves the player's pose alone when the follow camera uses their vehicle", () => {
  const mounted = new Map(entities).set(followed.id, {
    ...followed,
    mountObjectId: vehicle.id,
  });
  expect(
    firstPersonPlayerId(mounted, camera, "firstPersonOverride", vehicle.id),
  ).toBeNull();
});

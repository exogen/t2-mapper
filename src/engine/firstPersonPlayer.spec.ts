import { expect, it } from "vitest";
import type { StreamCamera, StreamEntity } from "../stream/types";
import {
  firstPersonPlayerId,
  shouldUseClipFollowEye,
} from "./firstPersonPlayer";

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

it("uses the followed player's eye for steady first-person shots, including legacy clips", () => {
  const sample = { cameraMode: "firstPersonOverride" };
  for (const firstPersonPose of [true, undefined])
    expect(
      shouldUseClipFollowEye(
        { ...sample, firstPersonPose },
        followed.id,
        followed.id,
      ),
    ).toBe(true);
  expect(
    shouldUseClipFollowEye(
      { ...sample, firstPersonPose: false },
      followed.id,
      followed.id,
    ),
  ).toBe(false);
  expect(shouldUseClipFollowEye(sample, followed.id, null)).toBe(false);
  expect(shouldUseClipFollowEye(sample, recorder.id, followed.id)).toBe(false);
  expect(
    shouldUseClipFollowEye(
      { cameraMode: "orbitOverride" },
      followed.id,
      followed.id,
    ),
  ).toBe(false);
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

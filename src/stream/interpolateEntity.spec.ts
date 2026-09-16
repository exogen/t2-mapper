import { expect, it } from "vitest";
import { Group, PerspectiveCamera, Quaternion } from "three";
import {
  applyStreamEntityPose,
  applyStreamEntityRotation,
} from "./interpolateEntity";
import { playerYawToQuaternion } from "./streamHelpers";
import type { StreamEntity } from "./types";

it("interpolates mounted body yaw between packets along the shortest turn", () => {
  const before = { rotation: playerYawToQuaternion((170 * Math.PI) / 180) };
  const after = { rotation: playerYawToQuaternion((190 * Math.PI) / 180) };
  const mounted = new Quaternion();
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    applyStreamEntityRotation(mounted, after, before, t);
    const expected = new Quaternion().fromArray(
      playerYawToQuaternion(((170 + 20 * t) * Math.PI) / 180),
    );
    expect(mounted.angleTo(expected)).toBeLessThan(1e-7);
  }
  // A backwards seek samples the same frame without inheriting the last one.
  applyStreamEntityRotation(mounted, after, before, 0);
  expect(mounted.toArray()).toEqual(before.rotation);
});

it("uses the same prediction delta for mounted and unmounted players", () => {
  const player: StreamEntity = {
    id: "player",
    type: "Player",
    position: [1, 2, 3],
    rotation: playerYawToQuaternion(0.8),
    playerDelta: {
      rot: 0.8,
      rotVec: -0.4,
      posVec: [0, 0, 0],
      head: [0, 0],
      headVec: [0, 0],
      maxLookAngle: 1.4,
    },
  };
  const mounted = new Quaternion(),
    unmounted = new Group();
  const camera = new PerspectiveCamera();
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    applyStreamEntityRotation(mounted, player, undefined, t);
    applyStreamEntityPose(unmounted, undefined, player, undefined, t, camera);
    const expected = playerYawToQuaternion(0.4 + 0.4 * t);
    expect(mounted.toArray()).toEqual(unmounted.quaternion.toArray());
    mounted
      .toArray()
      .forEach((component, i) => expect(component).toBeCloseTo(expected[i]));
  }
});

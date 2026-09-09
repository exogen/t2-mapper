import { expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { getImageMountOffset } from "./imageMount";

it("decodes matching script and network image offsets into DTS model space", () => {
  const script = { offset: "1 2 3", rotation: "1 2 3 67" };
  const q = new Quaternion().setFromAxisAngle(
    new Vector3(1, 2, 3).normalize(),
    (67 * Math.PI) / 180,
  );
  const network = {
    offset: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
    },
  };
  const a = getImageMountOffset(script)!,
    b = getImageMountOffset(network)!;
  expect(a.position).toEqual([-1, 3, 2]);
  expect(b.position).toEqual(a.position);
  a.quaternion.forEach((v, i) => expect(v).toBeCloseTo(b.quaternion[i], 8));
  expect(getImageMountOffset(script)).toBe(a);
  expect(getImageMountOffset(network)).toBe(b);
});

it("keeps identity offsets absent and does not re-read cached datablocks", () => {
  let reads = 0;
  const identity = {
    get offset() {
      reads++;
      return "0 0 0";
    },
    rotation: "0 0 1 0",
  };
  expect(getImageMountOffset(identity)).toBeUndefined();
  expect(getImageMountOffset(identity)).toBeUndefined();
  expect(reads).toBe(1);
  expect(getImageMountOffset(undefined)).toBeUndefined();
});

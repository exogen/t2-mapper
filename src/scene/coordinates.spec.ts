import { describe, it, expect } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  torqueToThree,
  torqueScaleToThree,
  matrixFToQuaternion,
  torqueAxisAngleToQuaternion,
} from "./coordinates";
import type { MatrixF } from "./types";
import { IDENTITY_MATRIX } from "./types";

describe("torqueToThree", () => {
  it("swizzles Torque (X,Y,Z) to Three.js (Y,Z,X)", () => {
    expect(torqueToThree({ x: 1, y: 2, z: 3 })).toEqual([2, 3, 1]);
  });

  it("handles zero vector", () => {
    expect(torqueToThree({ x: 0, y: 0, z: 0 })).toEqual([0, 0, 0]);
  });
});

describe("torqueScaleToThree", () => {
  it("applies same swizzle as position", () => {
    expect(torqueScaleToThree({ x: 10, y: 20, z: 30 })).toEqual([20, 30, 10]);
  });
});

describe("matrixFToQuaternion", () => {
  it("returns identity quaternion for identity matrix", () => {
    const q = matrixFToQuaternion(IDENTITY_MATRIX);
    expect(q.x).toBeCloseTo(0, 5);
    expect(q.y).toBeCloseTo(0, 5);
    expect(q.z).toBeCloseTo(0, 5);
    expect(q.w).toBeCloseTo(1, 5);
  });

  it("handles 90° rotation around Torque Z-axis (up)", () => {
    // Torque Z-up → Three.js Y-up
    // 90° around Torque Z maps to -90° around Three.js Y
    // (negative due to conjugation for row-vector → column-vector convention)
    const angleRad = Math.PI / 2;
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);

    const elements = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

    const m: MatrixF = { elements, position: { x: 0, y: 0, z: 0 } };
    const q = matrixFToQuaternion(m);

    const expected = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      -angleRad,
    );

    expect(q.x).toBeCloseTo(expected.x, 4);
    expect(q.y).toBeCloseTo(expected.y, 4);
    expect(q.z).toBeCloseTo(expected.z, 4);
    expect(q.w).toBeCloseTo(expected.w, 4);
  });

  it("handles 90° rotation around Torque X-axis (right)", () => {
    // Torque X → Three.js Z, angle negated
    const angleRad = Math.PI / 2;
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);

    const elements = [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];

    const m: MatrixF = { elements, position: { x: 0, y: 0, z: 0 } };
    const q = matrixFToQuaternion(m);

    const expected = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      -angleRad,
    );

    expect(q.x).toBeCloseTo(expected.x, 4);
    expect(q.y).toBeCloseTo(expected.y, 4);
    expect(q.z).toBeCloseTo(expected.z, 4);
    expect(q.w).toBeCloseTo(expected.w, 4);
  });

  it("handles 90° rotation around Torque Y-axis (forward)", () => {
    // Torque Y → Three.js X, angle negated
    const angleRad = Math.PI / 2;
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);

    const elements = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];

    const m: MatrixF = { elements, position: { x: 0, y: 0, z: 0 } };
    const q = matrixFToQuaternion(m);

    const expected = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -angleRad,
    );

    expect(q.x).toBeCloseTo(expected.x, 4);
    expect(q.y).toBeCloseTo(expected.y, 4);
    expect(q.z).toBeCloseTo(expected.z, 4);
    expect(q.w).toBeCloseTo(expected.w, 4);
  });

  it("produces unit quaternion from valid rotation matrix", () => {
    // Arbitrary rotation: 45° around Torque (1,1,0) normalized
    const len = Math.sqrt(2);
    const nx = 1 / len,
      ny = 1 / len,
      nz = 0;
    const angle = Math.PI / 4;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;

    const elements = new Array(16).fill(0);
    elements[0] = t * nx * nx + c;
    elements[1] = t * nx * ny + s * nz;
    elements[2] = t * nx * nz - s * ny;
    elements[4] = t * nx * ny - s * nz;
    elements[5] = t * ny * ny + c;
    elements[6] = t * ny * nz + s * nx;
    elements[8] = t * nx * nz + s * ny;
    elements[9] = t * ny * nz - s * nx;
    elements[10] = t * nz * nz + c;
    elements[15] = 1;

    const m: MatrixF = { elements, position: { x: 0, y: 0, z: 0 } };
    const q = matrixFToQuaternion(m);
    const qLen = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
    expect(qLen).toBeCloseTo(1, 5);
  });
});

describe("torqueAxisAngleToQuaternion", () => {
  it("returns identity for zero angle", () => {
    const q = torqueAxisAngleToQuaternion(1, 0, 0, 0);
    expect(q.x).toBeCloseTo(0, 5);
    expect(q.y).toBeCloseTo(0, 5);
    expect(q.z).toBeCloseTo(0, 5);
    expect(q.w).toBeCloseTo(1, 5);
  });

  it("returns identity for zero-length axis", () => {
    const q = torqueAxisAngleToQuaternion(0, 0, 0, 90);
    expect(q.w).toBeCloseTo(1, 5);
  });

  it("90° around Torque Z maps to Three.js Y rotation", () => {
    // Torque Z-axis = (0,0,1), swizzled to Three.js = (0,1,0)
    const q = torqueAxisAngleToQuaternion(0, 0, 1, 90);

    // Negative angle because of coordinate system handedness flip
    const expected = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      -90 * (Math.PI / 180),
    );

    expect(q.x).toBeCloseTo(expected.x, 4);
    expect(q.y).toBeCloseTo(expected.y, 4);
    expect(q.z).toBeCloseTo(expected.z, 4);
    expect(q.w).toBeCloseTo(expected.w, 4);
  });

  it("produces unit quaternion", () => {
    const q = torqueAxisAngleToQuaternion(1, 2, 3, 45);
    const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
    expect(len).toBeCloseTo(1, 5);
  });

  it("agrees with matrixFToQuaternion for same rotation", () => {
    // 60° around Torque Z-axis
    // Both functions should produce the same quaternion.
    const ax = 0,
      ay = 0,
      az = 1,
      angleDeg = 60;
    const angleRad = angleDeg * (Math.PI / 180);

    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const elements = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m: MatrixF = { elements, position: { x: 0, y: 0, z: 0 } };

    const qFromMatrix = matrixFToQuaternion(m);
    const qFromAxisAngle = torqueAxisAngleToQuaternion(ax, ay, az, angleDeg);

    const dot =
      qFromMatrix.x * qFromAxisAngle.x +
      qFromMatrix.y * qFromAxisAngle.y +
      qFromMatrix.z * qFromAxisAngle.z +
      qFromMatrix.w * qFromAxisAngle.w;

    expect(Math.abs(dot)).toBeCloseTo(1, 4);
  });
});

describe("matrixFToQuaternion on a ghosted interior", () => {
  it("turns the wire's row-major mObjToWorld the way the engine does", () => {
    // dox_bb_rustbox_x2.dif on Beach Blitz, straight off the ghost: a
    // 65.3° turn about Torque Z, M·v convention (column 0 is where +X
    // lands). Torque east (+X) is Three +Z and north (+Y) is Three +X, so
    // +X→(0.418, 0.909) about up is +65.3° about Three +Y.
    const m: MatrixF = {
      elements: [
        0.418, -0.909, 0, -207.977, 0.909, 0.418, 0, 498.179, 0, 0, 1, 157.5, 0,
        0, 0, 1,
      ],
      position: { x: -207.977, y: 498.179, z: 157.5 },
    };
    const q = matrixFToQuaternion(m);
    const angle = Math.atan2(0.909, 0.418);
    const expected = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      angle,
    );
    // Three decimals of wire data are not exactly orthonormal.
    expect(q.x).toBeCloseTo(expected.x, 2);
    expect(q.y).toBeCloseTo(expected.y, 2);
    expect(q.z).toBeCloseTo(expected.z, 2);
    expect(q.w).toBeCloseTo(expected.w, 2);
    // The rotated east axis, checked directly.
    const east = new Vector3(0, 0, 1).applyQuaternion(q);
    expect(east.z).toBeCloseTo(0.418, 2);
    expect(east.x).toBeCloseTo(0.909, 2);
  });
});

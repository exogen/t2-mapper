import { Matrix4, Quaternion } from "three";
import type { MatrixF, Vec3 } from "./types";

/**
 * Convert a Torque Vec3 (X-right, Y-forward, Z-up) to Three.js (X-right, Y-up, Z-backward).
 * Swizzle: three.x = torque.y, three.y = torque.z, three.z = torque.x
 *
 * Note: this is the same swizzle used by getPosition() in mission.ts.
 */
export function torqueToThree(v: Vec3): [number, number, number] {
  return [v.y, v.z, v.x];
}

/** Convert a Torque scale Vec3 to Three.js axis order. */
export function torqueScaleToThree(v: Vec3): [number, number, number] {
  return [v.y, v.z, v.x];
}

/**
 * Convert a Torque MatrixF to a Three.js Quaternion.
 *
 * Torque MatrixF layout (row-major, idx = row*4 + col):
 *   [0]  [1]  [2]  [3]      m00 m01 m02 tx
 *   [4]  [5]  [6]  [7]   =  m10 m11 m12 ty
 *   [8]  [9]  [10] [11]     m20 m21 m22 tz
 *   [12] [13] [14] [15]     0   0   0   1
 *
 * Three.js Matrix4 is column-major, with elements in the same index layout
 * but interpreted differently. We extract the 3×3 rotation, apply the
 * Torque→Three.js coordinate transform, then decompose to quaternion.
 */
export function matrixFToQuaternion(m: MatrixF): Quaternion {
  const e = m.elements;

  // Extract the Torque 3×3 rotation columns (row-major storage)
  // Column 0: e[0], e[1], e[2]
  // Column 1: e[4], e[5], e[6]
  // Column 2: e[8], e[9], e[10]

  // Apply Torque→Three.js coordinate transform to the rotation matrix.
  // Torque (X,Y,Z) → Three.js (Y,Z,X) means:
  //   Three.js row i, col j = Torque row swizzle[i], col swizzle[j]
  // where swizzle maps Three axis → Torque axis: X→Y(1), Y→Z(2), Z→X(0)
  //
  // Build a Three.js column-major Matrix4 from the transformed rotation.
  const mat4 = new Matrix4();
  // Three.js Matrix4.elements is column-major:
  // [m11, m21, m31, m41, m12, m22, m32, m42, m13, m23, m33, m43, m14, m24, m34, m44]
  const t = mat4.elements;

  // Torque col 0 (X-axis) maps to Three.js col 2 (Z-axis after swizzle)
  // Torque col 1 (Y-axis) maps to Three.js col 0 (X-axis after swizzle)
  // Torque col 2 (Z-axis) maps to Three.js col 1 (Y-axis after swizzle)
  //
  // Within each column, rows are also swizzled:
  // Torque row 0 (X) → Three.js row 2 (Z)
  // Torque row 1 (Y) → Three.js row 0 (X)
  // Torque row 2 (Z) → Three.js row 1 (Y)

  // Three.js column 0 ← Torque column 1 (Y→X), rows swizzled
  t[0] = e[5]; // T_Y_Y → Three X_X
  t[1] = e[6]; // T_Z_Y → Three Y_X
  t[2] = e[4]; // T_X_Y → Three Z_X
  t[3] = 0;

  // Three.js column 1 ← Torque column 2 (Z→Y), rows swizzled
  t[4] = e[9]; // T_Y_Z → Three X_Y
  t[5] = e[10]; // T_Z_Z → Three Y_Y
  t[6] = e[8]; // T_X_Z → Three Z_Y
  t[7] = 0;

  // Three.js column 2 ← Torque column 0 (X→Z), rows swizzled
  t[8] = e[1]; // T_Y_X → Three X_Z
  t[9] = e[2]; // T_Z_X → Three Y_Z
  t[10] = e[0]; // T_X_X → Three Z_Z
  t[11] = 0;

  // Translation column (not used for quaternion, but set for completeness)
  t[12] = 0;
  t[13] = 0;
  t[14] = 0;
  t[15] = 1;

  const q = new Quaternion();
  q.setFromRotationMatrix(mat4);
  // Torque uses row-vector convention (v * M), Three.js uses column-vector (M * v).
  // The extracted rotation is the transpose, so conjugate to invert.
  q.conjugate();
  return q;
}

/**
 * Convert a Torque axis-angle rotation string ("ax ay az angleDeg") to a Quaternion.
 * This is the format used in .mis files. The axis is in Torque coordinates.
 */
export function torqueAxisAngleToQuaternion(
  ax: number,
  ay: number,
  az: number,
  angleDeg: number,
): Quaternion {
  // Swizzle axis: Torque (X,Y,Z) → Three.js (Y,Z,X)
  const threeAx = ay;
  const threeAy = az;
  const threeAz = ax;
  const len = Math.sqrt(threeAx * threeAx + threeAy * threeAy + threeAz * threeAz);
  if (len < 1e-8) return new Quaternion();
  const angleRad = -angleDeg * (Math.PI / 180);
  return new Quaternion().setFromAxisAngle(
    { x: threeAx / len, y: threeAy / len, z: threeAz / len } as any,
    angleRad,
  );
}

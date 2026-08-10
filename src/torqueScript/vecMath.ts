/**
 * Quaternion/vector math for engine methods that manipulate Torque
 * transforms. All composition happens in the renderer's Three.js space
 * using exactly the same field conventions as the mission entity bridge
 * (axis swizzle three = [ty, tz, tx], negated angle), so transforms that
 * scripts compute round-trip losslessly through `.mis`-style position and
 * rotation fields.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x, y, z, w]

export function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function rotateVec3(v: Vec3, q: Quat): Vec3 {
  const [vx, vy, vz] = v;
  const [qx, qy, qz, qw] = q;
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function parseNumbers(value: string): number[] {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((word) => {
      const n = parseFloat(word);
      return Number.isFinite(n) ? n : 0;
    });
}

/** Torque "x y z" position → Three.js [ty, tz, tx]. */
export function misPositionToThree(value: string): Vec3 {
  const [x = 0, y = 0, z = 0] = parseNumbers(value);
  return [y, z, x];
}

/** Three.js position → Torque "x y z" field words. */
export function threeToMisPosition([tx, ty, tz]: Vec3): Vec3 {
  return [tz, tx, ty];
}

/**
 * Torque "ax ay az deg" rotation field → Three.js quaternion, matching the
 * mission entity bridge (axis swizzle plus angle negation).
 */
export function misRotationToThreeQuat(value: string): Quat {
  const [ax = 0, ay = 0, az = 0, angleDeg = 0] = parseNumbers(value);
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-8) return [0, 0, 0, 1];
  const halfRad = (-angleDeg * Math.PI) / 360;
  const s = Math.sin(halfRad);
  const c = Math.cos(halfRad);
  return [(ay / len) * s, (az / len) * s, (ax / len) * s, c];
}

/**
 * Three.js quaternion → Torque axis-angle [ax, ay, az, deg] with the field
 * conventions inverted back (swizzle undone, angle negated).
 */
export function threeQuatToMisRotation(
  q: Quat,
): [number, number, number, number] {
  const [x, y, z, w] = q;
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < 1e-8) return [1, 0, 0, 0];
  const halfRad = Math.atan2(s, w);
  const angleDeg = (-2 * halfRad * 180) / Math.PI;
  // Undo the axis swizzle: three [x, y, z] came from torque [ay, az, ax].
  return [z / s, x / s, y / s, angleDeg];
}

export interface ThreeTransform {
  position: Vec3;
  quaternion: Quat;
}

/**
 * Parse a Torque transform string "px py pz ax ay az angleRad" into Three
 * space. Transform-string angles are radians; rotation fields are degrees.
 */
export function transformStringToThree(value: string): ThreeTransform {
  const words = parseNumbers(value);
  const [px = 0, py = 0, pz = 0, ax = 1, ay = 0, az = 0, rad = 0] = words;
  const deg = (rad * 180) / Math.PI;
  return {
    position: misPositionToThree(`${px} ${py} ${pz}`),
    quaternion: misRotationToThreeQuat(`${ax} ${ay} ${az} ${deg}`),
  };
}

/** Compose Three-space transforms and format a Torque transform string. */
export function threeToTransformString(transform: ThreeTransform): string {
  const [px, py, pz] = threeToMisPosition(transform.position);
  const [ax, ay, az, deg] = threeQuatToMisRotation(transform.quaternion);
  const rad = (deg * Math.PI) / 180;
  return `${fmt(px)} ${fmt(py)} ${fmt(pz)} ${fmt(ax)} ${fmt(ay)} ${fmt(az)} ${fmt(rad)}`;
}

/** parent ∘ local composition in Three space. */
export function composeThreeTransforms(
  parent: ThreeTransform,
  local: ThreeTransform,
): ThreeTransform {
  const rotated = rotateVec3(local.position, parent.quaternion);
  return {
    position: [
      parent.position[0] + rotated[0],
      parent.position[1] + rotated[1],
      parent.position[2] + rotated[2],
    ],
    quaternion: multiplyQuat(parent.quaternion, local.quaternion),
  };
}

function fmt(n: number): string {
  // Trim float noise while keeping enough precision for placement.
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Read an object's position/rotation fields into a Three-space transform. */
export function objectFieldsToThree(fields: {
  position?: unknown;
  rotation?: unknown;
  [key: string]: unknown;
}): ThreeTransform {
  return {
    position: misPositionToThree(String(fields.position ?? "0 0 0")),
    quaternion: misRotationToThreeQuat(String(fields.rotation ?? "1 0 0 0")),
  };
}

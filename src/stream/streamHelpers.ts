import { Matrix4, Quaternion, Vector3 } from "three";
import type { ParsedData } from "t2-demo-parser";
import { resolveShapeName } from "../../relay/shared";
import type {
  StreamVisual,
  WeaponImageDataBlockState,
  ChatSegment,
} from "./types";

export type Vec3 = { x: number; y: number; z: number };

// ── Math helpers ──

const _rotMat = new Matrix4();
const _rotQuat = new Quaternion();

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export const MAX_PITCH = Math.PI * 0.494;
export const CameraMode_OrbitObject = 3;

/**
 * Build a Three.js quaternion from Torque observer yaw/pitch angles.
 * Uses a shared Matrix4/Quaternion to avoid per-frame allocations.
 */
export function yawPitchToQuaternion(
  yaw: number,
  pitch: number,
): [number, number, number, number] {
  const sx = Math.sin(pitch);
  const cx = Math.cos(pitch);
  const sz = Math.sin(yaw);
  const cz = Math.cos(yaw);

  _rotMat.set(
    -sz,
    cz * sx,
    -cz * cx,
    0,
    0,
    cx,
    sx,
    0,
    cz,
    sz * sx,
    -sz * cx,
    0,
    0,
    0,
    0,
    1,
  );

  _rotQuat.setFromRotationMatrix(_rotMat);
  return [_rotQuat.x, _rotQuat.y, _rotQuat.z, _rotQuat.w];
}

/** Player body rotation: yaw only, around Three.js Y axis. */
export function playerYawToQuaternion(
  rotZ: number,
): [number, number, number, number] {
  const halfAngle = -rotZ / 2;
  return [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)];
}

/** Convert a Torque quaternion (x-right, y-forward, z-up) to Three.js. */
export function torqueQuatToThreeJS(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): [number, number, number, number] | null {
  if (
    !Number.isFinite(q.x) ||
    !Number.isFinite(q.y) ||
    !Number.isFinite(q.z) ||
    !Number.isFinite(q.w)
  ) {
    return null;
  }

  // Axis swizzle (x,y,z)->(y,z,x) and inverted rotation direction.
  const x = -q.y;
  const y = -q.z;
  const z = -q.x;
  const w = q.w;

  const lenSq = x * x + y * y + z * z + w * w;
  if (lenSq <= 1e-12) return null;

  const invLen = 1 / Math.sqrt(lenSq);
  return [x * invLen, y * invLen, z * invLen, w * invLen];
}

/**
 * Extract a quaternion from a Torque row-major MatrixF (16 floats) and
 * convert to Three.js coordinate system. The 3x3 upper-left submatrix
 * contains the rotation. MatrixF is row-major: m[row*4+col].
 */
export function matrixFToThreeJSQuat(
  elements: number[],
): [number, number, number, number] | null {
  if (elements.length < 12) return null;

  // Extract 3x3 rotation from row-major MatrixF.
  // Row i, col j = elements[i*4 + j]
  const m00 = elements[0],
    m01 = elements[1],
    m02 = elements[2];
  const m10 = elements[4],
    m11 = elements[5],
    m12 = elements[6];
  const m20 = elements[8],
    m21 = elements[9],
    m22 = elements[10];

  // Shepperd's method for matrix → quaternion.
  const trace = m00 + m11 + m22;
  let qx: number, qy: number, qz: number, qw: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m20 + m12) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  // Convert Torque quat to Three.js.
  return torqueQuatToThreeJS({ x: qx, y: qy, z: qz, w: qw });
}

/** Extract heading (yaw around Torque Z axis) from a Torque quaternion. */
export function torqueQuatHeading(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): number {
  return Math.atan2(
    2 * (q.w * q.z + q.x * q.y),
    q.w * q.w + q.x * q.x - q.y * q.y - q.z * q.z,
  );
}

/**
 * Heading (radians) of a Three.js quaternion's +X-forward direction in the
 * XZ plane — the yaw the orbit/follow camera faces (Three.js +X = Torque
 * north, +Z = east). Distinct from torqueQuatHeading, which reads a
 * Torque-space quaternion; this reads an already-Three.js quaternion
 * (entity.rotation / a rendered group's quaternion).
 */
export function threeForwardHeading(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): number {
  const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
  const fz = 2 * (q.x * q.z - q.w * q.y);
  return Math.atan2(fz, fx);
}

/**
 * Unit direction from an orbit target back to the camera (Three.js space)
 * for a view facing `yaw`/`pitch`. Positive pitch pulls the camera UP to
 * look down at the target, matching applyOrbitCamera / Tribes2.exe
 * (camZ = centerZ + sin(pitch)·dist). Writes into and returns `out`.
 */
export function orbitPullbackDir(
  yaw: number,
  pitch: number,
  out: Vector3,
): Vector3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return out.set(-cy * cp, sp, -sy * cp);
}

/** Extract pitch (rotation around Torque X axis) from a Torque quaternion. */
export function torqueQuatPitch(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): number {
  const sinp = 2 * (q.w * q.x - q.y * q.z);
  // Clamp for numerical stability near poles.
  return Math.asin(Math.max(-1, Math.min(1, sinp)));
}

// ── Position / type guards ──

export function isValidPosition(
  pos: { x: number; y: number; z: number } | undefined | null,
): pos is { x: number; y: number; z: number } {
  return (
    pos != null &&
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y) &&
    Number.isFinite(pos.z)
  );
}

export function isVec3Like(
  value: unknown,
): value is { x: number; y: number; z: number } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number" &&
    typeof (value as { z?: unknown }).z === "number"
  );
}

export function isQuatLike(value: unknown): value is {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number" &&
    typeof (value as { z?: unknown }).z === "number" &&
    typeof (value as { w?: unknown }).w === "number"
  );
}

// ── DataBlock field accessors ──

export { resolveShapeName };

/** Datablock classes whose shapes are certain to render in any session
 *  (players, everything they carry, and static scenery) — the
 *  shape-prefetch scope. Vehicles/turrets/deployables load on demand at
 *  first sight. */
export const PRELOAD_DATA_BLOCK_CLASSES: ReadonlySet<string> = new Set([
  "PlayerData",
  "ShapeBaseImageData",
  "ItemData",
  "StaticShapeData",
]);

/** Unique shape names from datablocks in the prefetch categories. */
export function collectPreloadShapeNames(
  dataBlocks: Iterable<{ className: string; data: ParsedData | undefined }>,
): string[] {
  const names = new Set<string>();
  for (const { className, data } of dataBlocks) {
    if (!PRELOAD_DATA_BLOCK_CLASSES.has(className)) continue;
    const name = resolveShapeName(className, data);
    if (name) names.add(name);
  }
  return [...names];
}

export function getNumberField(
  data: ParsedData | undefined,
  keys: readonly string[],
): number | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/** Datablock booleans arrive as true/false, 1/0, or "1"/"true". */
export function isTruthyField(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower !== "" && lower !== "0" && lower !== "false";
  }
  return !!value;
}

export function getStringField(
  data: ParsedData | undefined,
  keys: readonly string[],
): string | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function getBooleanField(
  data: ParsedData | undefined,
  keys: readonly string[],
): boolean | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

// ── Visual resolution ──

export function resolveTracerVisual(
  className: string,
  data: ParsedData | undefined,
): StreamVisual | undefined {
  if (!data) return undefined;

  // Field names are binary-verified in t2-demo-parser's
  // TracerProjectileData decode — no alias fallbacks needed.
  const texture = getStringField(data, ["tracerTex0"]) ?? "";
  const hasTracerHints =
    className === "TracerProjectile" ||
    (texture.length > 0 && getNumberField(data, ["tracerLength"]) != null);
  if (!hasTracerHints || !texture) return undefined;

  return {
    kind: "tracer",
    texture,
    crossTexture: getStringField(data, ["tracerTex1"]),
    tracerLength: getNumberField(data, ["tracerLength"]) ?? 10,
    tracerWidth: getNumberField(data, ["tracerWidth"]) ?? 0.5,
    crossViewAng: getNumberField(data, ["crossViewAng"]) ?? 0.98,
    crossSize: getNumberField(data, ["crossSize"]) ?? 0.45,
    renderCross: getBooleanField(data, ["renderCross"]) ?? true,
  };
}

export function resolveSpriteVisual(
  className: string,
  data: ParsedData | undefined,
): StreamVisual | undefined {
  if (!data) return undefined;

  if (className === "LinearFlareProjectile") {
    const texture = getStringField(data, ["smokeTexture", "flareTexture"]);
    if (!texture) return undefined;
    const color = data.flareColor as
      { r: number; g: number; b: number } | undefined;
    const size = getNumberField(data, ["size"]) ?? 0.5;
    return {
      kind: "sprite",
      texture,
      color: color
        ? { r: color.r, g: color.g, b: color.b }
        : { r: 1, g: 1, b: 1 },
      size,
    };
  }

  if (className === "FlareProjectile") {
    const texture = getStringField(data, ["flareTexture"]);
    if (!texture) return undefined;
    const size = getNumberField(data, ["size"]) ?? 4.0;
    return {
      kind: "sprite",
      texture,
      color: { r: 1, g: 0.9, b: 0.5 },
      size,
    };
  }

  return undefined;
}

// ── Weapon image state parsing ──

/**
 * Parse weapon image state machine from a ShapeBaseImageData datablock.
 *
 * CRITICAL: The parser's field names for transitions are MISALIGNED with
 * the actual engine packing order. See demoStreaming.ts for details on the
 * remap table.
 */
export function parseWeaponImageStates(
  blockData: ParsedData,
): WeaponImageDataBlockState[] | undefined {
  const rawStates = blockData.states as Array<ParsedData> | undefined;
  if (!Array.isArray(rawStates) || rawStates.length === 0) return undefined;

  return rawStates.map((s) => {
    const remap = (v: unknown): number => {
      const n = v as number;
      if (n == null) return -1;
      return n - 1;
    };

    return {
      name: (s.name as string) ?? "",
      transitionOnNotLoaded: remap(s.transitionOnAmmo),
      transitionOnLoaded: remap(s.transitionOnNoAmmo),
      transitionOnNoAmmo: remap(s.transitionOnTarget),
      transitionOnAmmo: remap(s.transitionOnNoTarget),
      transitionOnNoTarget: remap(s.transitionOnWet),
      transitionOnTarget: remap(s.transitionOnNotWet),
      transitionOnNotWet: remap(s.transitionOnTriggerUp),
      transitionOnWet: remap(s.transitionOnTriggerDown),
      transitionOnTriggerUp: remap(s.transitionOnTimeout),
      transitionOnTriggerDown: remap(s.transitionGeneric0In),
      transitionOnTimeout: remap(s.transitionGeneric0Out),
      timeoutValue: s.timeoutValue as number | undefined,
      waitForTimeout: (s.waitForTimeout as boolean) ?? false,
      fire: (s.fire as boolean) ?? false,
      sequence: s.sequence as number | undefined,
      spin: (s.spin as number) ?? 0,
      direction: (s.direction as boolean) ?? true,
      scaleAnimation: (s.scaleAnimation as boolean) ?? false,
      loaded: (s.loaded as number) ?? 0,
      soundDataBlockId: (s.sound as number) ?? -1,
    };
  });
}

// ── Chat / text helpers ──

/** Strip non-printable Torque tagged string markup from a string. */
export function stripTaggedStringMarkup(s: string): string {
  let stripped = "";
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 0x20) stripped += s[i];
  }
  return stripped;
}

/**
 * Byte-to-fontColors-index remap table from the Torque V12 renderer (dgl.cc).
 *
 * TorqueScript `\cN` escapes are encoded via `collapseRemap` in scan.l,
 * producing byte values that skip \t (0x9), \n (0xa), and \r (0xd).
 */
const BYTE_TO_COLOR_INDEX: Record<number, number> = {
  0x2: 0,
  0x3: 1,
  0x4: 2,
  0x5: 3,
  0x6: 4,
  0x7: 5,
  0x8: 6,
  0xb: 7,
  0xc: 8,
  0xe: 9,
};

const BYTE_COLOR_RESET = 0x0f;
const BYTE_COLOR_PUSH = 0x10;
const BYTE_COLOR_POP = 0x11;

/**
 * Extract the leading Torque \c color index (0–9) from a tagged string.
 */
export function detectColorCode(s: string): number | undefined {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const colorIndex = BYTE_TO_COLOR_INDEX[code];
    if (colorIndex !== undefined) return colorIndex;
    if (code >= 0x20) return undefined;
  }
  return undefined;
}

/** Parse a raw Torque HudMessageVector line into colored segments. */
export function parseColorSegments(raw: string): ChatSegment[] {
  const segments: ChatSegment[] = [];
  let currentColor = 0;
  let currentText = "";
  let inTaggedString = false;

  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);

    if (code === BYTE_COLOR_PUSH) {
      inTaggedString = true;
      continue;
    }
    if (code === BYTE_COLOR_POP) {
      inTaggedString = false;
      continue;
    }

    if (inTaggedString) {
      if (code >= 0x20) currentText += raw[i];
      continue;
    }

    const colorIndex = BYTE_TO_COLOR_INDEX[code];
    if (colorIndex !== undefined) {
      if (currentText) {
        segments.push({ text: currentText, colorCode: currentColor });
        currentText = "";
      }
      currentColor = colorIndex;
    } else if (code === BYTE_COLOR_RESET) {
      if (currentText) {
        segments.push({ text: currentText, colorCode: currentColor });
        currentText = "";
      }
      currentColor = 0;
    } else if (code >= 0x20) {
      currentText += raw[i];
    }
  }

  if (currentText) {
    segments.push({ text: currentText, colorCode: currentColor });
  }
  return segments;
}

/** Extract an embedded `~w<path>` sound tag from a message string. */
export function extractWavTag(text: string): {
  text: string;
  wavPath: string | null;
} {
  const idx = text.indexOf("~w");
  if (idx === -1) return { text, wavPath: null };
  return {
    text: text.substring(0, idx),
    wavPath: text.substring(idx + 2),
  };
}

// ── Control object detection ──

export type ControlObjectType = "camera" | "player";

export function detectControlObjectType(
  data: ParsedData | undefined,
): ControlObjectType | null {
  if (!data) return null;
  if (typeof data.cameraMode === "number") return "camera";
  if (typeof data.rotationZ === "number") return "player";
  return null;
}

// ── Backpack HUD ──

const BACKPACK_BITMAP_TO_INDEX = new Map<string, number>([
  ["gui/hud_new_packammo", 0],
  ["gui/hud_new_packcloak", 1],
  ["gui/hud_new_packenergy", 2],
  ["gui/hud_new_packrepair", 3],
  ["gui/hud_new_packsatchel", 4],
  ["gui/hud_new_packshield", 5],
  ["gui/hud_new_packinventory", 6],
  ["gui/hud_new_packmotionsens", 7],
  ["gui/hud_new_packradar", 8],
  ["gui/hud_new_packturretout", 9],
  ["gui/hud_new_packturretin", 10],
  ["gui/hud_new_packsensjam", 11],
  ["gui/hud_new_packturret", 12],
  ["gui/hud_satchel_unarmed", 18],
]);

export function backpackBitmapToIndex(bitmap: string): number {
  const lower = bitmap.toLowerCase();
  for (const [key, val] of BACKPACK_BITMAP_TO_INDEX) {
    if (key === lower) return val;
  }
  return -1;
}

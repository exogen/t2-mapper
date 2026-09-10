import { Quaternion, Vector3 } from "three";
import type { DTSImageOffset } from "../dts/dtsMount";
import type { ImageSlot } from "./types";

/** Condition-flag changes update playback without rebuilding mounted models. */
export function sameImageMounts(
  a: readonly (ImageSlot | undefined)[] | undefined,
  b: readonly (ImageSlot | undefined)[] | undefined,
): boolean {
  if (a === b) return true;
  for (let i = 0; i < Math.max(a?.length ?? 0, b?.length ?? 0); i++) {
    const left = a?.[i],
      right = b?.[i];
    if (left === right) continue;
    if (
      !left ||
      !right ||
      left.dataBlockId !== right.dataBlockId ||
      left.shapeName !== right.shapeName ||
      left.skinName !== right.skinName ||
      left.mountPoint !== right.mountPoint ||
      left.mountOffset !== right.mountOffset ||
      left.mountedAtSec !== right.mountedAtSec
    )
      return false;
  }
  return true;
}

interface AffineTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}
const offsets = new WeakMap<object, DTSImageOffset | undefined>();

/** Datablock preload converts this once. Network values are QuatF; script
 * rotation fields are axis-angle in degrees. Both become DTS model space. */
export function getImageMountOffset(
  data: object | undefined,
  read: (name: string) => unknown = (name) =>
    (data as Record<string, unknown>)?.[name],
): DTSImageOffset | undefined {
  if (!data) return;
  if (offsets.has(data)) return offsets.get(data);
  const offset = read("offset"),
    rotation = read("rotation");
  let position: [number, number, number], quaternion: Quaternion;
  if (
    offset &&
    typeof offset === "object" &&
    "position" in offset &&
    "rotation" in offset
  ) {
    const { position: p, rotation: q } = offset as AffineTransform;
    position = [-p.x, p.z, p.y];
    quaternion = new Quaternion(q.x, -q.z, -q.y, q.w).normalize();
  } else {
    const [x = 0, y = 0, z = 0] = words(offset);
    const [ax = 0, ay = 0, az = 0, degrees = 0] = words(rotation);
    position = [-x, z, y];
    const axis = new Vector3(ax, -az, -ay);
    quaternion = axis.lengthSq()
      ? new Quaternion().setFromAxisAngle(
          axis.normalize(),
          (degrees * Math.PI) / 180,
        )
      : new Quaternion();
  }
  const result =
    position.some((v) => v !== 0) ||
    quaternion.x !== 0 ||
    quaternion.y !== 0 ||
    quaternion.z !== 0
      ? {
          position,
          quaternion: quaternion.toArray() as DTSImageOffset["quaternion"],
        }
      : undefined;
  offsets.set(data, result);
  return result;
}

function words(value: unknown): number[] {
  return typeof value === "string" ? value.trim().split(/\s+/).map(Number) : [];
}

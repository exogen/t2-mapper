/**
 * Shape bounding boxes, keyed by DTS name — the runtime stand-in for
 * TSShape::bounds, which the engine copies into every ShapeBase's object
 * box (mObjBox) and uses to place blowUp explosions at the box centre.
 * ShapeLoader registers the native DTS header during normal loads and prefetch.
 */
import { Vector3 } from "three";
import { shapeKey } from "./shapeSequences";

/** Axis-aligned box in Torque object space (x, y, z-up), metres. */
export interface ShapeBounds {
  min: [number, number, number];
  max: [number, number, number];
}

const boundsByShape = new Map<string, ShapeBounds>();

/** First registration wins; later calls for the same shape are no-ops. */
export function registerShapeBounds(
  shapeName: string,
  bounds: ShapeBounds,
): void {
  const key = shapeKey(shapeName);
  if (!boundsByShape.has(key)) boundsByShape.set(key, bounds);
}

export function getShapeBounds(
  shapeName: string | undefined,
): ShapeBounds | undefined {
  if (!shapeName) return undefined;
  return boundsByShape.get(shapeKey(shapeName));
}

/** Native box centre in the stream entity's local Three.js axes. */
export function getShapeLocalCenter(
  shapeName: string | undefined,
  out: Vector3,
): Vector3 | undefined {
  const bounds = getShapeBounds(shapeName);
  if (!bounds) return undefined;
  const { min, max } = bounds;
  return out.set(
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5,
    (min[0] + max[0]) * 0.5,
  );
}

const localCenter = new Vector3();

/** Native object-box centre transformed at a captured pose. Position is
 * Torque space; rotation and scale use the stream's Three.js axes. */
export function getShapeCenter(
  shapeName: string | undefined,
  transform: {
    position: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
  },
): [number, number, number] | undefined {
  const center = getShapeLocalCenter(shapeName, localCenter);
  if (!center) return undefined;
  const scale = transform.scale ?? [1, 1, 1];
  const x = center.x * scale[0];
  const y = center.y * scale[1];
  const z = center.z * scale[2];
  const [qx, qy, qz, qw] = transform.rotation ?? [0, 0, 0, 1];
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    transform.position[0] + z + qw * tz + qx * ty - qy * tx,
    transform.position[1] + x + qw * tx + qy * tz - qz * ty,
    transform.position[2] + y + qw * ty + qz * tx - qx * tz,
  ];
}

/** Test-only: forget every registered shape. */
export function clearShapeBounds(): void {
  boundsByShape.clear();
}

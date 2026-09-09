/**
 * Shape bounding boxes, keyed by DTS name — the runtime stand-in for
 * TSShape::bounds, which the engine copies into every ShapeBase's object
 * box (mObjBox) and uses to place blowUp explosions at the box centre.
 * ShapeLoader registers the native DTS header during normal loads and prefetch.
 */
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

/** Test-only: forget every registered shape. */
export function clearShapeBounds(): void {
  boundsByShape.clear();
}

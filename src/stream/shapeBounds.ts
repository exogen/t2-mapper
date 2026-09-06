/**
 * Shape bounding boxes, keyed by DTS name — the runtime stand-in for
 * TSShape::bounds, which the engine copies into every ShapeBase's object
 * box (mObjBox) and uses to place blowUp explosions at the box centre.
 * The DTS converter writes the shape header into the glTF scene extras
 * (`dts_bounds`, raw Torque space); registered wherever a shape GLB is
 * parsed — the asset prefetcher (GLB JSON chunk) and useStaticShape.
 */
import { shapeKey } from "./shapeSequences";

/** Axis-aligned box in Torque object space (x, y, z-up), metres. */
export interface ShapeBounds {
  min: [number, number, number];
  max: [number, number, number];
}

const boundsByShape = new Map<string, ShapeBounds>();

/**
 * The `dts_bounds` scene extra: six numbers, min then max, as the JSON
 * string the converter writes (or an array, should an exporter keep it).
 */
export function shapeBoundsFromExtras(
  extras: Record<string, unknown> | undefined,
): ShapeBounds | undefined {
  const raw = extras?.dts_bounds;
  let values: unknown;
  if (typeof raw === "string") {
    try {
      values = JSON.parse(raw);
    } catch {
      return undefined;
    }
  } else {
    values = raw;
  }
  if (
    !Array.isArray(values) ||
    values.length !== 6 ||
    !values.every((v) => typeof v === "number" && Number.isFinite(v))
  )
    return undefined;
  const [x0, y0, z0, x1, y1, z1] = values as number[];
  return { min: [x0, y0, z0], max: [x1, y1, z1] };
}

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

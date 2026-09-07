import type { Object3D } from "three";

const MARKERS = ["vis", "dts_detail_size", "vis_sequence", "ifl_sequence"];

function hasDtsExtras(ud: Record<string, unknown> | undefined): boolean {
  return !!ud && MARKERS.some((k) => k in ud);
}

/**
 * The DTS extras the addon wrote for the node an object came from. A node
 * with several materials loads as a Group carrying the extras, with one
 * Mesh per primitive whose own userData is empty — so a primitive's vis,
 * IFL and detail data live on its parent.
 */
export function dtsNodeExtras(object: Object3D): Record<string, unknown> {
  const own = object.userData as Record<string, unknown> | undefined;
  if (hasDtsExtras(own)) return own!;
  const parent = object.parent?.userData as Record<string, unknown> | undefined;
  if (hasDtsExtras(parent)) return parent!;
  return own ?? {};
}

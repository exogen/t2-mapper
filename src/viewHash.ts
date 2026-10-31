import { Quaternion, Vector3 } from "three";

/**
 * Serialization of camera viewpoints for shareable URLs, in the form
 * `#c<x>,<y>,<z>~<qx>,<qy>,<qz>,<qw>[~<zoom>]`. The zoom segment is only
 * present on command circuit (orthographic camera) links.
 */

export interface ParsedViewHash {
  position: Vector3;
  quaternion: Quaternion | null;
  zoom: number | null;
}

export function encodeViewHash({
  position,
  quaternion,
  zoom,
}: {
  position: Vector3;
  quaternion: Quaternion;
  zoom?: number;
}): string {
  const trunc = (num: number) => parseFloat(num.toFixed(3));
  const encodedPosition = `${trunc(position.x)},${trunc(position.y)},${trunc(position.z)}`;
  const encodedQuaternion = `${trunc(quaternion.x)},${trunc(quaternion.y)},${trunc(quaternion.z)},${trunc(quaternion.w)}`;
  const base = `#c${encodedPosition}~${encodedQuaternion}`;
  return zoom != null ? `${base}~${trunc(zoom)}` : base;
}

/**
 * Returns null for anything malformed rather than propagating NaN values
 * into camera transforms.
 */
export function parseViewHash(hash: string): ParsedViewHash | null {
  if (!hash.startsWith("#c")) return null;
  const [positionString, quaternionString, zoomString] = hash
    .slice(2)
    .split("~");
  const p = positionString.split(",").map((s) => parseFloat(s));
  if (p.length !== 3 || !p.every(Number.isFinite)) return null;
  const q = quaternionString?.split(",").map((s) => parseFloat(s)) ?? [];
  const quaternion =
    q.length === 4 && q.every(Number.isFinite)
      ? new Quaternion(q[0], q[1], q[2], q[3])
      : null;
  const zoom = zoomString ? parseFloat(zoomString) : NaN;
  return {
    position: new Vector3(p[0], p[1], p[2]),
    quaternion,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : null,
  };
}

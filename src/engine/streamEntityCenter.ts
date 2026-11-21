import type { Object3D, Vector3 } from "three";
import { torqueVecToThree } from "../scene/coordinates";
import { getShapeCenter, getShapeLocalCenter } from "../stream/shapeBounds";
import type { StreamEntity, StreamingPlayback } from "../stream/types";

/** Resolve the native object-box center, using the rendered pose when available. */
export function readStreamEntityCenter(
  out: Vector3,
  entity: StreamEntity,
  group: Object3D | undefined,
  playback: StreamingPlayback | null,
  playerHeightFraction = 0.5,
): boolean {
  const shape = entity.shapeHint ?? entity.dataBlock;
  const player = entity.type === "Player";
  const box =
    player && entity.dataBlockId !== undefined
      ? (playback?.getDataBlockData(entity.dataBlockId)?.boxSize as
          { z?: number } | undefined)
      : undefined;
  const height = player ? (box?.z ?? 2.3) * playerHeightFraction : 0;
  if (group) {
    out.set(0, height, 0);
    if (!player) getShapeLocalCenter(shape, out);
    group.localToWorld(out);
  } else if (entity.position) {
    const center = player
      ? entity.position
      : (getShapeCenter(shape, {
          position: entity.position,
          rotation: entity.rotation,
          scale: entity.scale,
        }) ?? entity.position);
    torqueVecToThree(center, out);
    out.y += height * (entity.scale?.[1] ?? 1);
  } else return false;
  return true;
}

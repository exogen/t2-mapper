/**
 * How game data becomes world transforms.
 *
 * Every one of these was inline in a React component, which meant the
 * only way to place a interior/terrain/force field correctly was to
 * mount it. The director's camera rig raycasts against exactly this
 * geometry, so a headless scan has to reproduce the placement bit for
 * bit — hence the extraction. Nothing here touches React, the DOM, or a
 * renderer.
 *
 * See `headlessWorld.ts` for the Node consumer and
 * `components/InteriorInstance.tsx` / `TerrainBlock.tsx` for the
 * browser ones. They must agree; that is the whole point.
 */

import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import {
  matrixFToQuaternion,
  torqueScaleToThree,
  torqueToThree,
} from "../scene/coordinates";
import type {
  SceneInteriorInstance,
  SceneTerrainBlock,
  SceneWaterBlock,
} from "../scene/types";
import type { WaterInfo } from "../collision/waterLevel";
import type { TerrainFile } from "../terrain";

/**
 * Interiors are authored Z-up and converted .dif → .glb with the axes
 * already swizzled, leaving a fixed -90° yaw between the model's frame
 * and the ghost's transform. Applied as a nested group in the browser,
 * so it composes AFTER the ghost placement below — order matters.
 */
export const INTERIOR_MODEL_ROTATION_Y = -Math.PI / 2;

/**
 * The same idea for `.dts` shapes, which land a quarter turn the OTHER
 * way — note the sign differs from interiors. Applied as a nested group
 * inside GenericShape, so it composes after the entity's own rotation.
 * Skipped only for bone-mounted shapes (`noRotation`), whose orientation
 * comes from the mount point.
 */
export const SHAPE_MODEL_ROTATION_Y = Math.PI / 2;

/**
 * Where a streamed ghost sits, matching what `StreamingController`
 * applies imperatively each frame.
 *
 * The asymmetry here is easy to get wrong and silent when you do:
 * position is in TORQUE space and must be swizzled, while rotation is
 * already a three-convention quaternion and is used RAW. Scene entities
 * (interiors, terrain) do NOT come through here — they position
 * themselves from their own scene data.
 */
export function streamEntityPlacement(entity: {
  position?: [number, number, number];
  rotation?: [number, number, number, number];
}): {
  position: [number, number, number];
  rotation: [number, number, number, number];
} {
  const p = entity.position ?? [0, 0, 0];
  return {
    position: [p[1], p[2], p[0]],
    rotation: entity.rotation ?? [0, 0, 0, 1],
  };
}

/** Torque's default when a TerrainBlock ghost omits squareSize. */
export const DEFAULT_TERRAIN_SQUARE_SIZE = 8;

export interface Placement {
  position: [number, number, number];
  quaternion: Quaternion;
  scale: [number, number, number];
}

/**
 * Where a ghosted interior sits in world space.
 *
 * The Torque→three conversion is the fiddly part: `transform` is a
 * row-major MatrixF and three's Matrix4 is column-major, on top of an
 * axis swizzle (Torque X-fwd/Z-up → three Y-up). `matrixFToQuaternion`
 * owns that and is unit-tested in `scene/coordinates.spec.ts` — do not
 * reimplement it, a transposed rotation produces geometry that looks
 * plausible and collides wrongly.
 */
export function interiorPlacement(scene: SceneInteriorInstance): Placement {
  return {
    position: torqueToThree(scene.transform.position),
    quaternion: matrixFToQuaternion(scene.transform),
    scale: torqueScaleToThree(scene.scale),
  };
}

/**
 * The heightfield the collision system needs, with the ghost's
 * squareSize default applied. Kept beside the placement helpers so the
 * browser and Node can't drift on the default.
 */
export function terrainCollisionInput(
  scene: SceneTerrainBlock,
  terrain: Pick<TerrainFile, "heightMap">,
): { heightMap: Uint16Array; squareSize: number; emptySquareRuns: number[] } {
  return {
    heightMap: terrain.heightMap,
    squareSize: scene.squareSize || DEFAULT_TERRAIN_SQUARE_SIZE,
    emptySquareRuns: scene.emptySquareRuns ?? [],
  };
}

/** Torque's world→terrain-space offset, used when snapping the fluid
 *  region to terrain squares. */
const TERRAIN_OFFSET = 1024;

/**
 * The fluid region a WaterBlock ghost describes.
 *
 * Matches Torque's `UpdateFluidRegion()` / `fluid::SetInfo()`: shift
 * into terrain space, round to the nearest terrain square, clamp, and
 * convert back. Surface height is `position.z + scale.z`
 * (WaterBlock's `mSurfaceZ`).
 *
 * Shared because projectiles that explode on water impact resolve
 * against this, and the scan simulates projectiles — so a headless
 * build that skipped water would diverge from the browser on any map
 * with a water body. Both damnation and beachblitz have one.
 */
export function waterInfoFor(scene: SceneWaterBlock): WaterInfo {
  const pos = scene.transform.position;
  const snap = (v: number) =>
    Math.max(0, Math.min(2040, Math.round((v + TERRAIN_OFFSET) / 8))) * 8;
  return {
    surfaceZ: pos.z + scene.scale.z,
    waveMagnitude: scene.waveMagnitude,
    liquidType: scene.liquidType,
    minX: snap(pos.x),
    minY: snap(pos.y),
    sizeX: scene.scale.x,
    sizeY: scene.scale.y,
  };
}

/**
 * A force field's collider box. Torque collides with any field that is
 * not fully OPEN (castRay FUN_00676900), so `enabled` tracks `fieldOpen`
 * — the one collider in the world that changes during a match.
 *
 * The box is corner-origin (0,0,0)→dimensions, matching
 * `useCornerBoxGeometry`; the matrix carries the placement, so scale
 * stays 1 and the dimensions live in the box.
 */
export function forceFieldCollider(entity: {
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  forceFieldData?: { dimensions: [number, number, number] };
  fieldOpen?: boolean;
}): { matrix: Matrix4; box: Box3; enabled: boolean } | null {
  const dims = entity.forceFieldData?.dimensions;
  if (!dims) return null;
  const matrix = new Matrix4().compose(
    new Vector3(...(entity.position ?? [0, 0, 0])),
    new Quaternion(...(entity.rotation ?? [0, 0, 0, 1])),
    new Vector3(1, 1, 1),
  );
  const box = new Box3(new Vector3(0, 0, 0), new Vector3(...dims));
  return { matrix, box, enabled: !entity.fieldOpen };
}

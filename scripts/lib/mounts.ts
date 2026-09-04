/**
 * Mount-node transforms (mount0..31 and Mountpoint) from a shape GLB. The
 * TorqueScript runtime's getSlotTransform() engine method reads these to
 * place script-spawned objects (e.g. vehicle station terminals at a pad's
 * mount0) exactly like the engine, before the GLB itself is loaded.
 *
 * Transforms are in the renderer's entity-local Three.js space — the space
 * a shape's GLB content occupies after ShapeRenderer's +90° Y scene
 * rotation (STANDARD_90_ROTATION) — because that's the frame in which
 * mount math composes with entity transforms:
 *   position: (gx, gy, gz) → (gz, gy, -gx)
 *   rotation: M = R90 ⊗ q_glbWorld ⊗ RootRot⁻¹ ⊗ R90⁻¹
 * The RootRot⁻¹ term cancels the Blender export's baked Z-up→Y-up root
 * rotation (every GLB's Shape root carries Rx(-90°)); a mounted shape's
 * own GLB re-applies the same root, so DTS-identity mount nodes come out
 * as identity here (verified against vehicle_pad Mount0).
 */
import type { MountTransform } from "@/src/manifest";
import {
  computeWorldTransform,
  inverseQuat,
  multiplyQuat,
  type GlbDoc,
  type Quat,
  type Vec3,
} from "./glb";

export type { MountTransform };

const MOUNT_NODE_RE = /^(mount\d+|mountpoint)$/i;

/** ShapeRenderer's scene rotation: +90° about Y. */
const R90: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
const R90_INV = inverseQuat(R90);
/** The Blender export's baked root rotation (Z-up → Y-up): Rx(-90°). */
const ROOT_ROT: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const ROOT_ROT_INV = inverseQuat(ROOT_ROT);

function glbToEntityPosition([gx, gy, gz]: Vec3): Vec3 {
  return [gz, gy, -gx];
}

function glbToEntityQuat(q: Quat): Quat {
  return multiplyQuat(
    multiplyQuat(multiplyQuat(R90, q), ROOT_ROT_INV),
    R90_INV,
  );
}

function round(values: number[]): number[] {
  return values.map((v) => {
    const r = Math.round(v * 1e5) / 1e5;
    // Avoid -0 in the JSON output.
    return Object.is(r, -0) ? 0 : r;
  });
}

/**
 * The shape's mount nodes keyed by lowercased node name, or null when it
 * has none.
 */
export function extractMountTransforms(
  doc: GlbDoc,
): Record<string, MountTransform> | null {
  const nodes = doc.nodes ?? [];
  let mounts: Record<string, MountTransform> | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const name = nodes[i].name;
    if (!name || !MOUNT_NODE_RE.test(name)) continue;
    const world = computeWorldTransform(doc, i);
    mounts ??= {};
    mounts[name.toLowerCase()] = {
      position: round(glbToEntityPosition(world.position)),
      rotation: round(glbToEntityQuat(world.quaternion)),
    };
  }
  return mounts;
}

/**
 * Extracts mount-node transforms (mount0..31 and Mountpoint) from all shape
 * GLBs into src/torqueScript/generated/mountTransforms.json. The
 * TorqueScript runtime's getSlotTransform() engine method reads this to
 * place script-spawned objects (e.g. vehicle station terminals at a pad's
 * mount0) exactly like the engine.
 *
 * Transforms are stored in the renderer's entity-local Three.js space —
 * the space a shape's GLB content occupies after ShapeRenderer's +90° Y
 * scene rotation (STANDARD_90_ROTATION) — because that's the frame in
 * which mount math composes with entity transforms:
 *   position: (gx, gy, gz) → (gz, gy, -gx)
 *   rotation: M = R90 ⊗ q_glbWorld ⊗ RootRot⁻¹ ⊗ R90⁻¹
 * The RootRot⁻¹ term cancels the Blender export's baked Z-up→Y-up root
 * rotation (every GLB's Shape root carries Rx(-90°)); a mounted shape's
 * own GLB re-applies the same root, so DTS-identity mount nodes come out
 * as identity here (verified against vehicle_pad Mount0).
 *
 * Run from the repository root: npx tsx scripts/generate-mount-transforms.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  computeWorldTransform,
  inverseQuat,
  multiplyQuat,
  parseGlbJson,
  type Quat,
  type Vec3,
} from "./lib/glb";

const BASE_DIR = process.env.BASE_DIR || "docs/base";
const OUTPUT_PATH = "src/torqueScript/generated/mountTransforms.json";

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

async function* walkGlbFiles(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkGlbFiles(fullPath);
    } else if (entry.name.toLowerCase().endsWith(".glb")) {
      yield fullPath;
    }
  }
}

interface MountTransform {
  position: number[]; // entity-local Three.js space
  rotation: number[]; // quaternion [x, y, z, w], entity-local Three.js space
}

async function main() {
  const shapes: Record<string, Record<string, MountTransform>> = {};
  let fileCount = 0;
  let sanityChecked = false;

  for await (const filePath of walkGlbFiles(BASE_DIR)) {
    let doc;
    try {
      doc = parseGlbJson(await fs.readFile(filePath));
    } catch (err) {
      console.warn(`Skipping ${filePath}: ${(err as Error).message}`);
      continue;
    }
    const nodes = doc.nodes ?? [];
    let mounts: Record<string, MountTransform> | null = null;
    for (let i = 0; i < nodes.length; i++) {
      const name = nodes[i].name;
      if (!name || !MOUNT_NODE_RE.test(name)) continue;
      const world = computeWorldTransform(doc, i);
      const entityPos = glbToEntityPosition(world.position);
      const entityQuat = glbToEntityQuat(world.quaternion);
      mounts ??= {};
      mounts[name.toLowerCase()] = {
        position: round(entityPos),
        rotation: round(entityQuat),
      };
    }
    if (mounts) {
      const key = path.basename(filePath, path.extname(filePath)).toLowerCase();
      // Later sources override earlier ones, mirroring VL2 precedence
      // (walk order is lexicographic like the manifest generator's).
      shapes[key] = mounts;
      fileCount++;
      if (key === "vehicle_pad") {
        // Sanity: the pad's mount0 must sit above the pad surface with a
        // plausible offset (station terminal placement).
        const m0 = mounts["mount0"];
        if (!m0) throw new Error("vehicle_pad.glb has no mount0 node");
        sanityChecked = true;
        console.log(
          `vehicle_pad mount0 (entity space): pos=[${m0.position}] rot=[${m0.rotation}]`,
        );
      }
    }
  }

  if (!sanityChecked) {
    console.warn("Warning: vehicle_pad.glb not found for sanity check");
  }

  const sorted = Object.fromEntries(
    Object.entries(shapes).sort(([a], [b]) => a.localeCompare(b)),
  );
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(sorted, null, 1) + "\n");
  console.log(`Wrote ${OUTPUT_PATH}: ${fileCount} shapes with mount nodes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

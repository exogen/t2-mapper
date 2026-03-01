/**
 * Extract right-hand mesh centroids from player GLBs and Mountpoint positions
 * from weapon GLBs. Used to derive correct mount offsets for demo playback.
 */
import fs from "node:fs/promises";
import path from "node:path";

// Minimal GLB/glTF parser — just enough to read node names and mesh positions.

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

interface GltfAccessor {
  bufferView: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
  byteOffset?: number;
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GltfMesh {
  name?: string;
  primitives: Array<{ attributes: Record<string, number> }>;
}

interface GltfJson {
  nodes: GltfNode[];
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
}

function parseGlb(buffer: Buffer): { json: GltfJson; bin: Buffer } {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("Not a GLB file");
  // Chunk 0: JSON
  const jsonLen = buffer.readUInt32LE(12);
  const jsonStr = buffer.subarray(20, 20 + jsonLen).toString("utf-8");
  const json = JSON.parse(jsonStr) as GltfJson;
  // Chunk 1: BIN
  const binOffset = 20 + jsonLen;
  const binLen = buffer.readUInt32LE(binOffset);
  const bin = buffer.subarray(binOffset + 8, binOffset + 8 + binLen);
  return { json, bin };
}

/** Compute the centroid (average of min/max) of a mesh's POSITION accessor. */
function getMeshCentroid(
  json: GltfJson,
  bin: Buffer,
  meshIndex: number,
): [number, number, number] | null {
  const mesh = json.meshes?.[meshIndex];
  if (!mesh) return null;
  const posAccessorIdx = mesh.primitives[0]?.attributes?.POSITION;
  if (posAccessorIdx == null) return null;
  const accessor = json.accessors?.[posAccessorIdx];
  if (!accessor || !accessor.min || !accessor.max) return null;
  // Centroid from bounding box
  return [
    (accessor.min[0] + accessor.max[0]) / 2,
    (accessor.min[1] + accessor.max[1]) / 2,
    (accessor.min[2] + accessor.max[2]) / 2,
  ];
}

/** Get the world-space position of a named node, accounting for parent chain. */
function getNodeWorldPosition(
  json: GltfJson,
  nodeName: string,
): [number, number, number] | null {
  // Build parent map
  const parentMap = new Map<number, number>();
  for (let i = 0; i < json.nodes.length; i++) {
    const node = json.nodes[i];
    if (node.children) {
      for (const child of node.children) {
        parentMap.set(child, i);
      }
    }
  }

  // Find the node
  const nodeIdx = json.nodes.findIndex(
    (n) => n.name?.toLowerCase() === nodeName.toLowerCase(),
  );
  if (nodeIdx === -1) return null;

  // Walk up parent chain accumulating translations (ignoring rotation for now)
  let pos: [number, number, number] = [0, 0, 0];
  let current: number | undefined = nodeIdx;
  while (current != null) {
    const node = json.nodes[current];
    const t = node.translation;
    if (t) {
      pos[0] += t[0];
      pos[1] += t[1];
      pos[2] += t[2];
    }
    current = parentMap.get(current);
  }
  return pos;
}

const baseDir = "/Users/exogen/Projects/t2-mapper/docs/base";

// Player models
const playerModels = [
  "@vl2/shapes.vl2/shapes/light_male.glb",
  "@vl2/shapes.vl2/shapes/medium_male.glb",
  "@vl2/shapes.vl2/shapes/heavy_male.glb",
  "@vl2/shapes.vl2/shapes/bioderm_light.glb",
  "@vl2/shapes.vl2/shapes/bioderm_medium.glb",
  "@vl2/shapes.vl2/shapes/bioderm_heavy.glb",
  "@vl2/shapes.vl2/shapes/light_female.glb",
  "@vl2/shapes.vl2/shapes/medium_female.glb",
];

// Weapon models
const weaponModels = [
  "@vl2/shapes.vl2/shapes/weapon_disc.glb",
  "@vl2/shapes.vl2/shapes/weapon_chaingun.glb",
  "@vl2/shapes.vl2/shapes/weapon_mortar.glb",
  "@vl2/shapes.vl2/shapes/weapon_plasma.glb",
  "@vl2/shapes.vl2/shapes/weapon_grenade_launcher.glb",
  "@vl2/shapes.vl2/shapes/weapon_repair.glb",
  "@vl2/shapes.vl2/shapes/weapon_shocklance.glb",
  "@vl2/shapes.vl2/shapes/weapon_missile.glb",
  "@vl2/shapes.vl2/shapes/weapon_sniper.glb",
  "@vl2/shapes.vl2/shapes/weapon_energy.glb",
  "@vl2/shapes.vl2/shapes/weapon_elf.glb",
  "@vl2/shapes.vl2/shapes/weapon_targeting.glb",
];

console.log("=== PLAYER RIGHT-HAND MESH CENTROIDS ===\n");

for (const rel of playerModels) {
  const filePath = path.join(baseDir, rel);
  try {
    const buf = await fs.readFile(filePath);
    const { json, bin } = parseGlb(buf);
    const name = path.basename(rel, ".glb");

    // Find right-hand mesh node
    const rhNodeIdx = json.nodes.findIndex((n) => {
      const lower = n.name?.toLowerCase() ?? "";
      return lower.includes("rhand") || lower.includes("r_hand");
    });

    if (rhNodeIdx === -1) {
      console.log(`${name}: no rhand mesh found`);
      continue;
    }

    const rhNode = json.nodes[rhNodeIdx];
    let centroid: [number, number, number] | null = null;
    if (rhNode.mesh != null) {
      centroid = getMeshCentroid(json, bin, rhNode.mesh);
    }

    // Also get the node's own translation
    const translation = rhNode.translation ?? [0, 0, 0];

    // Apply ShapeModel's 90° Y rotation: (x,y,z) → (z, y, -x)
    if (centroid) {
      const entitySpace: [number, number, number] = [
        centroid[2],
        centroid[1],
        -centroid[0],
      ];
      console.log(
        `${name}: rhand mesh="${rhNode.name}" glbCentroid=(${centroid.map((v) => v.toFixed(3)).join(", ")}) entitySpace=(${entitySpace.map((v) => v.toFixed(3)).join(", ")})`,
      );
    } else {
      console.log(
        `${name}: rhand node="${rhNode.name}" translation=(${translation.map((v: number) => v.toFixed(3)).join(", ")}) (no mesh centroid)`,
      );
    }
  } catch (e: any) {
    console.log(`${name}: error - ${e.message}`);
  }
}

console.log("\n=== WEAPON MOUNTPOINT POSITIONS ===\n");

for (const rel of weaponModels) {
  const filePath = path.join(baseDir, rel);
  try {
    const buf = await fs.readFile(filePath);
    const { json } = parseGlb(buf);
    const name = path.basename(rel, ".glb");

    // List all node names
    const nodeNames = json.nodes.map((n) => n.name ?? "(unnamed)");

    // Find Mountpoint
    const mpIdx = json.nodes.findIndex((n) => {
      const lower = n.name?.toLowerCase() ?? "";
      return lower === "mountpoint";
    });

    if (mpIdx === -1) {
      console.log(`${name}: NO Mountpoint node. Nodes: [${nodeNames.join(", ")}]`);
      continue;
    }

    // Get world position (walking parent chain)
    const worldPos = getNodeWorldPosition(json, "Mountpoint");
    const localTrans = json.nodes[mpIdx].translation ?? [0, 0, 0];
    const localRot = json.nodes[mpIdx].rotation;

    console.log(
      `${name}: Mountpoint localTranslation=(${localTrans.map((v: number) => v.toFixed(4)).join(", ")})` +
        (localRot
          ? ` localRotation=(${localRot.map((v: number) => v.toFixed(4)).join(", ")})`
          : "") +
        (worldPos
          ? ` worldPos=(${worldPos.map((v) => v.toFixed(4)).join(", ")})`
          : ""),
    );
  } catch (e: any) {
    console.log(`${path.basename(rel, ".glb")}: error - ${e.message}`);
  }
}

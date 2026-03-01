/**
 * Inspect nodes in GLB files, showing names, translations, rotations,
 * and hierarchy. Useful for finding eye nodes, mount points, etc.
 *
 * Usage: npx tsx scripts/inspect-glb-nodes.ts <glb-file> [glb-file...]
 */
import fs from "node:fs/promises";
import path from "node:path";

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  mesh?: number;
  skin?: number;
  camera?: number;
  matrix?: number[];
  extras?: Record<string, unknown>;
}

interface GltfSkin {
  name?: string;
  joints: number[];
  skeleton?: number;
  inverseBindMatrices?: number;
}

interface GltfScene {
  name?: string;
  nodes?: number[];
}

interface GltfDocument {
  scenes?: GltfScene[];
  scene?: number;
  nodes?: GltfNode[];
  skins?: GltfSkin[];
  meshes?: { name?: string }[];
  animations?: { name?: string; channels?: unknown[] }[];
}

function parseGlb(buffer: Buffer): GltfDocument {
  // GLB header: magic(4) + version(4) + length(4)
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    throw new Error("Not a valid GLB file");
  }
  // First chunk should be JSON
  const chunk0Length = buffer.readUInt32LE(12);
  const chunk0Type = buffer.readUInt32LE(16);
  if (chunk0Type !== 0x4e4f534a) {
    throw new Error("Expected JSON chunk");
  }

  const jsonStr = buffer.toString("utf-8", 20, 20 + chunk0Length);
  return JSON.parse(jsonStr);
}

function formatVec3(v: [number, number, number] | undefined): string {
  if (!v) return "(0, 0, 0)";
  return `(${v.map((n) => n.toFixed(4)).join(", ")})`;
}

function formatQuat(q: [number, number, number, number] | undefined): string {
  if (!q) return "(0, 0, 0, 1)";
  return `(${q.map((n) => n.toFixed(4)).join(", ")})`;
}

function printNodeTree(
  doc: GltfDocument,
  nodeIndex: number,
  depth: number,
  visited: Set<number>
): void {
  if (visited.has(nodeIndex)) return;
  visited.add(nodeIndex);

  const node = doc.nodes![nodeIndex];
  const indent = "  ".repeat(depth);
  const name = node.name || `(unnamed #${nodeIndex})`;

  let extras = "";
  if (node.mesh != null) {
    const meshName = doc.meshes?.[node.mesh]?.name;
    extras += ` [mesh: ${meshName ?? node.mesh}]`;
  }
  if (node.skin != null) extras += ` [skin: ${node.skin}]`;
  if (node.camera != null) extras += ` [camera: ${node.camera}]`;

  console.log(`${indent}[${nodeIndex}] ${name}${extras}`);
  console.log(`${indent}  T: ${formatVec3(node.translation)}`);

  // Only show rotation if non-identity
  const r = node.rotation;
  if (r && (r[0] !== 0 || r[1] !== 0 || r[2] !== 0 || r[3] !== 1)) {
    console.log(`${indent}  R: ${formatQuat(node.rotation)}`);
  }

  // Only show scale if non-identity
  const s = node.scale;
  if (s && (s[0] !== 1 || s[1] !== 1 || s[2] !== 1)) {
    console.log(`${indent}  S: ${formatVec3(node.scale as [number, number, number])}`);
  }

  // Show matrix if present
  if (node.matrix) {
    console.log(`${indent}  Matrix: [${node.matrix.map((n) => n.toFixed(4)).join(", ")}]`);
  }

  if (node.children) {
    for (const childIdx of node.children) {
      printNodeTree(doc, childIdx, depth + 1, visited);
    }
  }
}

async function inspectGlb(filePath: string): Promise<void> {
  const absPath = path.resolve(filePath);
  console.log(`\n${"=".repeat(80)}`);
  console.log(`FILE: ${absPath}`);
  console.log(`${"=".repeat(80)}\n`);

  const buffer = await fs.readFile(absPath);
  const doc = parseGlb(buffer);

  const nodeCount = doc.nodes?.length ?? 0;
  const meshCount = doc.meshes?.length ?? 0;
  const skinCount = doc.skins?.length ?? 0;
  const animCount = doc.animations?.length ?? 0;

  console.log(`Nodes: ${nodeCount}, Meshes: ${meshCount}, Skins: ${skinCount}, Animations: ${animCount}`);

  // Show skins (skeletons)
  if (doc.skins && doc.skins.length > 0) {
    console.log(`\n--- Skins ---`);
    for (let i = 0; i < doc.skins.length; i++) {
      const skin = doc.skins[i];
      console.log(`Skin ${i}: "${skin.name ?? "(unnamed)"}" - ${skin.joints.length} joints`);
      console.log(`  Root skeleton node: ${skin.skeleton ?? "unset"}`);
      console.log(
        `  Joint node indices: [${skin.joints.join(", ")}]`
      );
    }
  }

  // Show animations
  if (doc.animations && doc.animations.length > 0) {
    console.log(`\n--- Animations ---`);
    for (let i = 0; i < doc.animations.length; i++) {
      const anim = doc.animations[i];
      console.log(`  [${i}] "${anim.name ?? "(unnamed)"}" (${anim.channels?.length ?? 0} channels)`);
    }
  }

  // Print full node tree
  console.log(`\n--- Node Tree ---`);
  const visited = new Set<number>();

  // Start from scene root nodes
  const sceneIdx = doc.scene ?? 0;
  const scene = doc.scenes?.[sceneIdx];
  if (scene?.nodes) {
    for (const rootIdx of scene.nodes) {
      printNodeTree(doc, rootIdx, 0, visited);
    }
  }

  // Print any orphan nodes not reached from scene
  if (doc.nodes) {
    for (let i = 0; i < doc.nodes.length; i++) {
      if (!visited.has(i)) {
        console.log(`\n  (orphan node not in scene tree:)`);
        printNodeTree(doc, i, 1, visited);
      }
    }
  }

  // Highlight interesting nodes
  const keywords = ["eye", "mount", "hand", "cam", "head", "weapon", "muzzle", "node", "jet", "contrail"];
  const interesting: { index: number; name: string; node: GltfNode }[] = [];
  if (doc.nodes) {
    for (let i = 0; i < doc.nodes.length; i++) {
      const node = doc.nodes[i];
      const name = (node.name || "").toLowerCase();
      if (keywords.some((kw) => name.includes(kw))) {
        interesting.push({ index: i, name: node.name || "", node });
      }
    }
  }

  if (interesting.length > 0) {
    console.log(`\n--- Interesting Nodes (matching: ${keywords.join(", ")}) ---`);
    for (const { index, name, node } of interesting) {
      console.log(`  [${index}] "${name}"`);
      console.log(`    Translation: ${formatVec3(node.translation)}`);
      if (node.rotation) {
        console.log(`    Rotation:    ${formatQuat(node.rotation)}`);
      }
      if (node.scale) {
        console.log(`    Scale:       ${formatVec3(node.scale as [number, number, number])}`);
      }
      // Find parent
      if (doc.nodes) {
        for (let j = 0; j < doc.nodes.length; j++) {
          if (doc.nodes[j].children?.includes(index)) {
            console.log(`    Parent:      [${j}] "${doc.nodes[j].name || "(unnamed)"}"`);
            break;
          }
        }
      }
    }
  }

  // Also show a flat list of ALL node names for easy scanning
  console.log(`\n--- All Node Names (flat list) ---`);
  if (doc.nodes) {
    for (let i = 0; i < doc.nodes.length; i++) {
      const node = doc.nodes[i];
      console.log(`  [${i}] "${node.name || "(unnamed)"}" T:${formatVec3(node.translation)}`);
    }
  }
}

// Main
const files = process.argv.slice(2);
if (files.length === 0) {
  // Default files to inspect
  const defaultFiles = [
    "docs/base/@vl2/shapes.vl2/shapes/light_male.glb",
    "docs/base/@vl2/shapes.vl2/shapes/weapon_disc.glb",
  ];
  for (const f of defaultFiles) {
    await inspectGlb(f);
  }
} else {
  for (const f of files) {
    await inspectGlb(f);
  }
}

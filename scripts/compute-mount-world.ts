/**
 * Compute world-space positions of Mount0 and weapon Mountpoint from GLB data,
 * then compute the mount transform needed to align them.
 */
import fs from "node:fs/promises";

type Vec3 = [number, number, number];
type Quat = [number, number, number, number]; // [x, y, z, w]

function rotateVec3(v: Vec3, q: Quat): Vec3 {
  const [vx, vy, vz] = v;
  const [qx, qy, qz, qw] = q;
  // q * v * q^(-1), optimized
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function inverseQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: Vec3;
  rotation?: Quat;
}

interface GltfDoc {
  nodes: GltfNode[];
  scenes: { nodes: number[] }[];
  scene?: number;
}

function parseGlb(buffer: Buffer): GltfDoc {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("Not GLB");
  const chunk0Length = buffer.readUInt32LE(12);
  const jsonStr = buffer.toString("utf-8", 20, 20 + chunk0Length);
  return JSON.parse(jsonStr);
}

function findParent(doc: GltfDoc, nodeIndex: number): number | null {
  for (let i = 0; i < doc.nodes.length; i++) {
    if (doc.nodes[i].children?.includes(nodeIndex)) return i;
  }
  return null;
}

function getAncestorChain(doc: GltfDoc, nodeIndex: number): number[] {
  const chain: number[] = [];
  let idx: number | null = nodeIndex;
  while (idx != null) {
    chain.unshift(idx);
    idx = findParent(doc, idx);
  }
  return chain;
}

function computeWorldTransform(
  doc: GltfDoc,
  nodeIndex: number,
): { position: Vec3; quaternion: Quat } {
  const chain = getAncestorChain(doc, nodeIndex);
  let pos: Vec3 = [0, 0, 0];
  let quat: Quat = [0, 0, 0, 1];

  for (const idx of chain) {
    const node = doc.nodes[idx];
    const t: Vec3 = node.translation ?? [0, 0, 0];
    const r: Quat = node.rotation ?? [0, 0, 0, 1];

    // World = parent * local
    // new_pos = parent_pos + rotate(local_pos, parent_quat)
    const rotatedT = rotateVec3(t, quat);
    pos = [pos[0] + rotatedT[0], pos[1] + rotatedT[1], pos[2] + rotatedT[2]];
    quat = multiplyQuat(quat, r);
  }

  return { position: pos, quaternion: quat };
}

function findNodeByName(doc: GltfDoc, name: string): number | null {
  for (let i = 0; i < doc.nodes.length; i++) {
    if (doc.nodes[i].name === name) return i;
  }
  return null;
}

function fmt(v: number[]): string {
  return `(${v.map((n) => n.toFixed(4)).join(", ")})`;
}

async function main() {
  const playerBuf = await fs.readFile(
    "docs/base/@vl2/shapes.vl2/shapes/light_male.glb",
  );
  const weaponBuf = await fs.readFile(
    "docs/base/@vl2/shapes.vl2/shapes/weapon_disc.glb",
  );

  const playerDoc = parseGlb(playerBuf);
  const weaponDoc = parseGlb(weaponBuf);

  // Compute Mount0 world transform
  const mount0Idx = findNodeByName(playerDoc, "Mount0")!;
  const mount0 = computeWorldTransform(playerDoc, mount0Idx);
  console.log("Mount0 world position (GLB space):", fmt(mount0.position));
  console.log("Mount0 world rotation (GLB space):", fmt(mount0.quaternion));

  // Compute Mountpoint world transform
  const mpIdx = findNodeByName(weaponDoc, "Mountpoint")!;
  const mp = computeWorldTransform(weaponDoc, mpIdx);
  console.log("\nMountpoint world position (GLB space):", fmt(mp.position));
  console.log("Mountpoint world rotation (GLB space):", fmt(mp.quaternion));

  // The ShapeRenderer applies a 90° Y rotation to the GLB scene.
  // R90 = quaternion for 90° around Y = (0, sin(45°), 0, cos(45°)) = (0, 0.7071, 0, 0.7071)
  const R90: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
  const R90_inv = inverseQuat(R90);

  // Mount0 in entity space (after ShapeRenderer rotation)
  const m0_entity_pos = rotateVec3(mount0.position, R90);
  const m0_entity_quat = multiplyQuat(R90, mount0.quaternion);
  console.log("\nMount0 entity-space position:", fmt(m0_entity_pos));
  console.log("Mount0 entity-space rotation:", fmt(m0_entity_quat));

  // The mount transform T_mount must satisfy:
  // T_mount * R90 * MP = R90 * M0
  // So: T_mount = R90 * M0 * MP^(-1) * R90^(-1)
  //
  // For position: mount_pos = R90 * (M0_pos - R_M0 * R_MP^(-1) * MP_pos)
  // Wait, let me use the full matrix formula:
  // T_mount = R90 * M0 * MP^(-1) * R90^(-1)

  // Step 1: MP^(-1)
  const mp_inv_quat = inverseQuat(mp.quaternion);
  const mp_inv_pos: Vec3 = rotateVec3(
    [-mp.position[0], -mp.position[1], -mp.position[2]],
    mp_inv_quat,
  );

  // Step 2: M0 * MP^(-1)
  const combined_pos: Vec3 = (() => {
    const rotated = rotateVec3(mp_inv_pos, mount0.quaternion);
    return [
      mount0.position[0] + rotated[0],
      mount0.position[1] + rotated[1],
      mount0.position[2] + rotated[2],
    ] as Vec3;
  })();
  const combined_quat = multiplyQuat(mount0.quaternion, mp_inv_quat);

  // Step 3: R90 * combined * R90^(-1)
  const mount_pos = rotateVec3(combined_pos, R90);
  // For rotation: R90 * combined_quat * R90^(-1)
  const mount_quat = multiplyQuat(multiplyQuat(R90, combined_quat), R90_inv);

  console.log("\n=== CORRECT MOUNT TRANSFORM ===");
  console.log("Position:", fmt(mount_pos));
  console.log("Quaternion:", fmt(mount_quat));

  // For comparison, show what the current code computes:
  // Current: pos = (mount0Pos.z, mount0Pos.y, -mount0Pos.x)
  // Current: quat = rot90 * mount0Quat
  const current_pos: Vec3 = [
    mount0.position[2],
    mount0.position[1],
    -mount0.position[0],
  ];
  const current_quat = multiplyQuat(R90, mount0.quaternion);
  console.log("\n=== CURRENT CODE COMPUTES ===");
  console.log("Position:", fmt(current_pos));
  console.log("Quaternion:", fmt(current_quat));

  // Show Cam node for reference
  const camIdx = findNodeByName(playerDoc, "Cam")!;
  const cam = computeWorldTransform(playerDoc, camIdx);
  console.log("\nCam world position (GLB space):", fmt(cam.position));
}

main().catch(console.error);

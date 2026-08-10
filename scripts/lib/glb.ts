/**
 * Minimal GLB helpers for build scripts: parse the JSON chunk and compute
 * node world transforms (TRS composition). No buffer/mesh access.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x, y, z, w]

export interface GlbNode {
  name?: string;
  children?: number[];
  translation?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
  matrix?: number[];
}

export interface GlbDoc {
  nodes?: GlbNode[];
  scenes?: { nodes: number[] }[];
  scene?: number;
}

export function parseGlbJson(buffer: Buffer): GlbDoc {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("Not a GLB file");
  const jsonLength = buffer.readUInt32LE(12);
  const jsonStr = buffer.toString("utf-8", 20, 20 + jsonLength);
  return JSON.parse(jsonStr);
}

export function rotateVec3(v: Vec3, q: Quat): Vec3 {
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

export function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function inverseQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

function findParent(doc: GlbDoc, nodeIndex: number): number | null {
  const nodes = doc.nodes ?? [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].children?.includes(nodeIndex)) return i;
  }
  return null;
}

function getAncestorChain(doc: GlbDoc, nodeIndex: number): number[] {
  const chain: number[] = [];
  let idx: number | null = nodeIndex;
  while (idx != null) {
    chain.unshift(idx);
    idx = findParent(doc, idx);
  }
  return chain;
}

/**
 * World TRS of a node by composing translation/rotation down the ancestor
 * chain. Throws on baked matrices (the Blender DTS pipeline exports TRS).
 */
export function computeWorldTransform(
  doc: GlbDoc,
  nodeIndex: number,
): { position: Vec3; quaternion: Quat } {
  const chain = getAncestorChain(doc, nodeIndex);
  let pos: Vec3 = [0, 0, 0];
  let quat: Quat = [0, 0, 0, 1];

  for (const idx of chain) {
    const node = (doc.nodes ?? [])[idx];
    if (node.matrix) {
      throw new Error(
        `Node ${node.name ?? idx} uses a baked matrix; expected TRS`,
      );
    }
    const t: Vec3 = node.translation ?? [0, 0, 0];
    const r: Quat = node.rotation ?? [0, 0, 0, 1];
    const rotatedT = rotateVec3(t, quat);
    pos = [pos[0] + rotatedT[0], pos[1] + rotatedT[1], pos[2] + rotatedT[2]];
    quat = multiplyQuat(quat, r);
  }

  return { position: pos, quaternion: quat };
}

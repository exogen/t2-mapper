import { Box3, Matrix4, Vector3 } from "three";
import type { BufferGeometry, Frustum, SkinnedMesh } from "three";

interface SkinBounds {
  position: BufferGeometry["attributes"][string];
  indices: BufferGeometry["attributes"][string];
  weights: BufferGeometry["attributes"][string];
  versions: readonly [position: number, indices: number, weights: number];
  bones: { index: number; box: Box3 }[];
  minWeight: number;
  maxWeight: number;
  valid: boolean;
}

const cache = new WeakMap<BufferGeometry, SkinBounds>();
const vertex = new Vector3();
const boneBox = new Box3();
const bounds = new Box3();
const transform = new Matrix4();

function attributeVersion(attribute: SkinBounds["position"]): number {
  return "data" in attribute ? attribute.data.version : attribute.version;
}

function getSkinBounds(geometry: BufferGeometry): SkinBounds | undefined {
  const {
    position,
    skinIndex: indices,
    skinWeight: weights,
  } = geometry.attributes;
  if (
    !position ||
    !indices ||
    !weights ||
    indices.itemSize !== 4 ||
    weights.itemSize !== 4 ||
    indices.count !== position.count ||
    weights.count !== position.count ||
    geometry.morphAttributes.position?.length
  )
    return;
  const previous = cache.get(geometry);
  if (
    previous?.position === position &&
    previous.indices === indices &&
    previous.weights === weights &&
    previous.versions[0] === attributeVersion(position) &&
    previous.versions[1] === attributeVersion(indices) &&
    previous.versions[2] === attributeVersion(weights)
  )
    return previous;
  const result: SkinBounds = {
    position,
    indices,
    weights,
    versions: [
      attributeVersion(position),
      attributeVersion(indices),
      attributeVersion(weights),
    ],
    bones: [],
    minWeight: Infinity,
    maxWeight: 0,
    valid: true,
  };
  cache.set(geometry, result);
  const boxes = new Map<number, Box3>();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    let sum = 0;
    if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) {
      result.valid = false;
      break;
    }
    for (let j = 0; j < 4; j++) {
      const weight = weights.getComponent(i, j);
      const index = indices.getComponent(i, j);
      if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(index)) {
        result.valid = false;
        break;
      }
      sum += weight;
      if (weight === 0) continue;
      let box = boxes.get(index);
      if (!box) boxes.set(index, (box = new Box3()));
      box.expandByPoint(vertex);
    }
    // DTS weights are normalized. Keep unusual/custom data on the uncullable
    // path; small float32 rounding differences are covered below.
    if (!result.valid || Math.abs(sum - 1) > 1e-6) {
      result.valid = false;
      break;
    }
    result.minWeight = Math.min(result.minWeight, sum);
    result.maxWeight = Math.max(result.maxWeight, sum);
  }
  result.bones = Array.from(boxes, ([index, box]) => ({ index, box }));
  return result;
}

/** Bounds the current pose without skinning every vertex. A normalized,
 * nonnegative weighted vertex lies inside the box enclosing its bone boxes.
 * Returns false when a safe bound cannot be established. */
export function computeDTSSkinBounds(mesh: SkinnedMesh, out: Box3): boolean {
  const data = getSkinBounds(mesh.geometry);
  if (!data?.valid || !data.bones.length || !mesh.skeleton) return false;
  out.makeEmpty();
  for (const { index, box } of data.bones) {
    const bone = mesh.skeleton.bones[index];
    const inverse = mesh.skeleton.boneInverses[index];
    if (!bone || !inverse) return false;
    transform
      .multiplyMatrices(mesh.bindMatrixInverse, bone.matrixWorld)
      .multiply(inverse)
      .multiply(mesh.bindMatrix);
    out.union(boneBox.copy(box).applyMatrix4(transform));
  }
  // Include both sides of the weight-sum rounding error, plus a small margin
  // for float32 shader arithmetic. Box transforms also support scale/shear.
  return expandBoundsForRounding(
    out,
    Math.max(1 - data.minWeight, data.maxWeight - 1),
  );
}

function expandBoundsForRounding(box: Box3, weightError = 0): boolean {
  const { min, max } = box;
  const magnitude = Math.max(
    Math.abs(min.x),
    Math.abs(min.y),
    Math.abs(min.z),
    Math.abs(max.x),
    Math.abs(max.y),
    Math.abs(max.z),
  );
  if (!Number.isFinite(magnitude)) return false;
  box.expandByScalar(magnitude * (weightError + 1e-5) + 1e-4);
  return true;
}

export function intersectsDTSSkinFrustum(
  mesh: SkinnedMesh,
  frustum: Frustum,
): boolean {
  if (!computeDTSSkinBounds(mesh, bounds)) return true;
  // Do not replace boundingSphere: Three also uses its center to sort draws.
  bounds.applyMatrix4(mesh.matrixWorld);
  if (!expandBoundsForRounding(bounds)) return true;
  return frustum.intersectsBox(bounds);
}

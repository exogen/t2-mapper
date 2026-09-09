import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Skeleton,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  DTSDetail,
  DTSMaterial,
  DTSMesh,
  DTSRigidMeshBatch,
  DTSStaticMeshBatch,
  DTSShape,
  isDTSMeshBatch,
  type DTSMeshBatch,
} from "./dtsModel";
import { getDTSObject } from "./dtsScene";
import { DTSMaterialFlags, type DTSShapeData } from "./dtsTypes";

const geometries = new WeakMap<DTSShapeData, Map<string, BufferGeometry>>();

/** Call on a fresh model before cloning, material replacement or animation.
 * Instances share immutable geometry and own their materials and skeletons.
 * Only full-resolution rigid opaque parts are combined; other DTS paths remain
 * available, including lower LODs, merge vertices, effects and damage decals. */
export function batchDTSRigidMeshes(scene: DTSShape): DTSMeshBatch[] {
  const existing = scene.children.filter(isDTSMeshBatch);
  if (existing.length) return existing;
  // Three's skin normal transform is not an inverse transpose. Keep authored
  // scale animations on rigid meshes so nonuniform scale/shear stays correct.
  if (scene.data.nodes.length > 65536) return [];

  const scaledNodes = new Set(
    scene.data.sequences.flatMap((sequence) => sequence.scaleMatters),
  );

  const animatedNodes = new Set(
    scene.data.sequences.flatMap((sequence) => [
      ...sequence.rotationMatters,
      ...sequence.translationMatters,
    ]),
  );
  const affected = (index: number, members: ReadonlySet<number>): boolean => {
    for (let node = index; node >= 0; node = scene.data.nodes[node].parentIndex)
      if (members.has(node)) return true;
    return false;
  };
  const groups = new Map<string, DTSMesh[]>();
  const visit = (node: Object3D) => {
    if (node !== scene && node instanceof DTSShape) return;
    if (
      node instanceof DTSMesh &&
      eligible(node, scene) &&
      !affected(
        scene.data.objects[node.binding!.objectIndex].nodeIndex,
        scaledNodes,
      )
    ) {
      const key = `${node.binding!.materialIndex}/${attributeLayout(node.geometry)}`;
      const parts = groups.get(key) ?? [];
      parts.push(node);
      groups.set(key, parts);
    }
    for (const child of node.children) visit(child);
  };
  visit(scene);
  let cache = geometries.get(scene.data);
  if (!cache) geometries.set(scene.data, (cache = new Map()));
  scene.updateMatrixWorld(true);
  const inverseRoot = scene.matrixWorld.clone().invert();
  const batches: DTSMeshBatch[] = [];
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const boneIndices = parts.map(
      (part) => scene.data.objects[part.binding!.objectIndex].nodeIndex,
    );
    const animated = boneIndices.some((index) =>
      affected(index, animatedNodes),
    );
    const palette = [...new Set(boneIndices)];
    const paletteIndices = boneIndices.map((index) => palette.indexOf(index));
    const transforms = animated
      ? []
      : parts.map((part) =>
          getDTSObject(part)!.matrixWorld.clone().premultiply(inverseRoot),
        );
    const key =
      `${animated ? "skin" : "static"}/` +
      parts
        .map((part, i) => `${part.geometry.uuid}:${boneIndices[i]}`)
        .join("/");
    let geometry = cache.get(key);
    if (!geometry) {
      geometry = animated
        ? combineGeometry(parts, paletteIndices)
        : mergeGeometries(
            parts.map((part, index) =>
              part.geometry.clone().applyMatrix4(transforms[index]),
            ),
          )!;
      if (!geometry) continue;
      if (!animated) {
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
      }
      cache.set(key, geometry);
    }
    const material = (parts[0].material as DTSMaterial).clone();
    const batch = animated
      ? new DTSRigidMeshBatch(geometry, material)
      : new DTSStaticMeshBatch(geometry, material);
    batch.name = `__dts_rigid_batch_${parts[0].binding!.materialIndex}`;
    batch.bindings = parts.map((part) => part.binding!);
    // Vertices retain their authored node-local coordinates. Identity inverses
    // make each bone directly supply that node's complete animated transform.
    if (batch instanceof DTSRigidMeshBatch)
      batch.bind(
        new Skeleton(
          palette.map((index) => scene.getNode(index)!),
          palette.map(() => new Matrix4()),
        ),
        new Matrix4(),
      );
    if (batch instanceof DTSRigidMeshBatch) batch.frustumCulled = false;
    else batch.restTransforms = transforms;
    batch.visible = false;
    scene.add(batch);
    batches.push(batch);
  }
  scene.invalidateRuntime();
  return batches;
}

function eligible(mesh: DTSMesh, scene: DTSShape): boolean {
  const binding = mesh.binding;
  if (!binding) return false;
  const { source, detailIndices, materialIndex, objectIndex } = binding;
  const material = mesh.material;
  return (
    mesh.visible &&
    mesh.parent instanceof DTSDetail &&
    mesh.parent.children.length === 1 &&
    detailIndices.length === 1 &&
    detailIndices[0] === 0 &&
    scene.data.details[0]?.size >= 0 &&
    scene.data.objects[objectIndex]?.nodeIndex >= 0 &&
    getDTSObject(mesh)?.defaultVisibility === 1 &&
    material instanceof DTSMaterial &&
    !!material.source &&
    !material.transparent &&
    materialIndex >= 0 &&
    !(material.source.flags & DTSMaterialFlags.IflMaterial) &&
    !source.skin &&
    !source.sorted &&
    !source.decal &&
    binding.decalIndex === undefined &&
    !(source.flags & 0x80000000) &&
    source.numFrames === 1 &&
    source.numMaterialFrames === 1 &&
    !!mesh.geometry.index
  );
}

function attributeLayout(geometry: BufferGeometry): string {
  return Object.entries(geometry.attributes)
    .map(
      ([name, attr]) =>
        `${name}:${attr.array.constructor.name}:${attr.itemSize}:${attr.normalized}`,
    )
    .sort()
    .join(",");
}

function combineGeometry(parts: DTSMesh[], bones: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  const vertexCount = parts.reduce(
    (n, part) => n + part.geometry.getAttribute("position").count,
    0,
  );
  const indexCount = parts.reduce(
    (n, part) => n + part.geometry.index!.count,
    0,
  );
  for (const name of Object.keys(parts[0].geometry.attributes)) {
    const source = parts[0].geometry.getAttribute(name) as BufferAttribute;
    const ArrayType = source.array.constructor as {
      new (length: number): typeof source.array;
    };
    const array = new ArrayType(vertexCount * source.itemSize);
    let offset = 0;
    for (const part of parts) {
      const attribute = part.geometry.getAttribute(name);
      array.set(attribute.array, offset);
      offset += attribute.array.length;
    }
    geometry.setAttribute(
      name,
      new BufferAttribute(array, source.itemSize, source.normalized),
    );
  }
  const indices =
    vertexCount <= 65536
      ? new Uint16Array(indexCount)
      : new Uint32Array(indexCount);
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  let vertexOffset = 0,
    indexOffset = 0;
  for (let i = 0; i < parts.length; i++) {
    const source = parts[i].geometry;
    for (const index of source.index!.array)
      indices[indexOffset++] = index + vertexOffset;
    for (
      let vertex = 0;
      vertex < source.getAttribute("position").count;
      vertex++
    ) {
      skinIndices[(vertexOffset + vertex) * 4] = bones[i];
      skinWeights[(vertexOffset + vertex) * 4] = 1;
    }
    vertexOffset += source.getAttribute("position").count;
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setAttribute("skinIndex", new BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new BufferAttribute(skinWeights, 4));
  return geometry;
}

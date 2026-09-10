import { applyDTSMaterialMaps } from "./dtsMaterialMaps";
import {
  Box3,
  BufferAttribute,
  Matrix4,
  MeshLambertMaterial,
  Skeleton,
  type BufferGeometry,
  type Texture,
} from "three";
import { buildDTSAnimations } from "./dtsAnimation";
import {
  buildDTSGeometry,
  shareDTSGeometry,
  dtsTriangles,
  dtsVector,
  DTS_BASIS,
  type DTSGeometryFrames,
} from "./dtsGeometry";
import {
  createDTSMaterial,
  DTSMaterial,
  DTSMesh,
  DTSDetail,
  DTSNode,
  DTSObject,
  DTSShape,
  DTSSkinnedMesh,
  type DTSModel,
  type DTSRenderable,
  type DTSBranch,
} from "./dtsModel";
import {
  DTSMeshType,
  DTSPrimitiveFlags,
  type DTSMeshData,
  type DTSShapeData,
} from "./dtsTypes";

export interface DTSBuildOptions {
  /** Eager expansion is useful for offline inspection and regression comparisons. */
  lazy?: boolean;
  /** Resolve/load textures separately from binary parsing. Returning null is
   * useful for collision, servers, and tools without a DOM. */
  texture?: (name: string, materialIndex: number) => Texture | null;
}

export function buildDTS(
  shape: DTSShapeData,
  options: DTSBuildOptions = {},
): DTSModel {
  const scene = new DTSShape();
  scene.data = shape;
  scene.iflTimes = shape.iflMaterials.map(() => -1);
  scene.iflLoops = shape.iflMaterials.map(() => true);
  scene.decalFrames = Array.from(
    shape.decalStates.subarray(0, shape.decals.length),
  );
  const materials = shape.materials.map((m, i) =>
    createDTSMaterial(m, options.texture?.(m.name, i) ?? null),
  );
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i],
      source = shape.materials[i];
    material.detailMap =
      source.detailMap !== i
        ? (materials[source.detailMap]?.map ?? null)
        : null;
    material.detailScale = source.detailScale;
    material.bumpMap =
      source.bumpMap !== i ? (materials[source.bumpMap]?.map ?? null) : null;
    material.specularMap =
      source.reflectanceMap !== i
        ? (materials[source.reflectanceMap]?.map ?? null)
        : null;
    applyDTSMaterialMaps(material, material);
  }
  const unassigned = new MeshLambertMaterial();
  unassigned.name = "Unassigned";
  const geometries = new Map<
    DTSMeshData,
    { geometry: BufferGeometry; frames: DTSGeometryFrames }
  >();
  const getGeometry = (source: DTSMeshData) => {
    let result = geometries.get(source);
    if (!result) {
      result = buildDTSGeometry(source);
      geometries.set(source, result);
    }
    return result;
  };
  const renderable = (
    source: DTSMeshData,
    geometry: BufferGeometry,
    material: MeshLambertMaterial | MeshLambertMaterial[],
  ): DTSRenderable => {
    for (const m of Array.isArray(material) ? material : [material])
      m.vertexColors = geometry.hasAttribute("color");
    if (!source.skin) return new DTSMesh(geometry, material);
    const skin = source.skin,
      count = geometry.getAttribute("position").count;
    const indices = new Uint16Array(count * 4),
      weights = new Float32Array(count * 4),
      influences = new Uint32Array(count);
    for (const vertex of skin.vertexIndices) influences[vertex]++;
    // Arbitrary influence counts are legal in DTS. Use exact CPU deformation
    // when the data exceeds Three's four-component skin attributes.
    if (influences.some((n) => n > 4)) {
      const mesh = new DTSMesh(geometry, material);
      mesh.geometry = shareDTSGeometry(geometry);
      mesh.geometry.setAttribute(
        "position",
        geometry.getAttribute("position").clone(),
      );
      mesh.geometry.setAttribute(
        "normal",
        geometry.getAttribute("normal").clone(),
      );
      return mesh;
    }
    influences.fill(0);
    for (let i = 0; i < skin.weights.length; i++) {
      const vertex = skin.vertexIndices[i],
        slot = influences[vertex]++;
      indices[vertex * 4 + slot] = skin.boneIndices[i];
      weights[vertex * 4 + slot] = skin.weights[i];
    }
    geometry.setAttribute("skinIndex", new BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new BufferAttribute(weights, 4));
    const inverses = Array.from(skin.nodeIndices, (_, i) =>
      new Matrix4()
        .fromArray(skin.inverseBindMatrices, i * 16)
        .transpose()
        .premultiply(DTS_BASIS)
        .multiply(DTS_BASIS),
    );
    const skeleton = new Skeleton(
      Array.from(skin.nodeIndices, (index) => {
        const bone = new DTSNode();
        bone.nodeIndex = index;
        return bone;
      }),
      inverses,
    );
    const mesh = new DTSSkinnedMesh(geometry, material);
    mesh.bind(skeleton, new Matrix4());
    return mesh;
  };
  const branches: DTSBranch[] = [];
  const addMesh = (
    source: DTSMeshData,
    objectIndex: number,
    detailIndices: number[],
    label: string,
  ) => {
    if (
      source.type === DTSMeshType.Null ||
      source.type === DTSMeshType.Decal ||
      !source.primitives.length
    )
      return;
    let template: DTSDetail | undefined;
    const branch: DTSBranch = {
      objectIndex,
      detailIndices,
      create: () => {
        if (template) return template;
        const { geometry, frames } = getGeometry(source);
        const detail = new DTSDetail();
        detail.name = `${label}_detail_${detailIndices.join("_")}`;
        template = detail;
        detail.visible =
          detailIndices.includes(0) && shape.details[0]?.size >= 0;
        if (source.sorted) {
          for (const group of geometry.groups)
            if (group.materialIndex === -1)
              group.materialIndex = materials.length;
          const mesh = renderable(
            source,
            geometry,
            [...materials, unassigned].map((m) => {
              const material = m.clone();
              if (source.sorted!.alwaysWriteDepth) material.depthWrite = true;
              return material;
            }),
          );
          mesh.name = label;
          mesh.binding = {
            source,
            frames,
            detailIndices,
            objectIndex,
            materialIndex: -1,
          };
          detail.add(mesh);
          return detail;
        }
        // One mesh per material makes IFL, fade, and skin replacement conventional.
        const byMaterial = new Map<number, number[]>();
        geometry.groups.forEach((group, i) => {
          const slot = group.materialIndex ?? 0;
          const indices = byMaterial.get(slot) ?? [];
          indices.push(i);
          byMaterial.set(slot, indices);
        });
        for (const [materialIndex, primitiveIndices] of byMaterial) {
          const partition = shareDTSGeometry(geometry);
          partition.clearGroups();
          const size = primitiveIndices.reduce(
            (n, i) => n + frames.triangles[i].length,
            0,
          );
          const index =
            geometry.getAttribute("position").count <= 65536
              ? new Uint16Array(size)
              : new Uint32Array(size);
          let offset = 0;
          for (const i of primitiveIndices) {
            index.set(frames.triangles[i], offset);
            offset += frames.triangles[i].length;
          }
          partition.setIndex(new BufferAttribute(index, 1));
          const mesh = renderable(
            source,
            partition,
            materials[materialIndex]?.clone() ?? unassigned.clone(),
          );
          mesh.name = `${label}${byMaterial.size > 1 ? `_${materialIndex}` : ""}`;
          mesh.binding = {
            source,
            frames,
            detailIndices,
            objectIndex,
            materialIndex,
          };
          mesh.updateMorphTargets();
          detail.add(mesh);
        }
        return detail;
      },
    };
    branches.push(branch);
  };
  for (let i = 0; i < shape.objects.length; i++) {
    const source = shape.objects[i];
    const subShapeIndex = shape.subShapes.findIndex(
      (s) => i >= s.firstObject && i < s.firstObject + s.numObjects,
    );
    for (let meshIndex = 0; meshIndex < source.numMeshes; meshIndex++) {
      const details = shape.details.flatMap((d, index) =>
        d.subShape === subShapeIndex && d.objectDetail === meshIndex
          ? [index]
          : [],
      );
      addMesh(
        shape.meshes[source.startMeshIndex + meshIndex],
        i,
        details,
        shape.names[source.nameIndex],
      );
    }
  }
  // DTS <23 keeps skins outside the object mesh table. Preserve every detail.
  let legacyObjectIndex = -1;
  for (
    let detailIndex = 0;
    detailIndex < shape.skinDetails.length;
    detailIndex++
  ) {
    const { first, count } = shape.skinDetails[detailIndex];
    for (let i = first; i < first + count; i++) {
      const object = new DTSObject();
      object.name = `__dts_skin_${i}_${detailIndex}`;
      object.objectIndex = legacyObjectIndex--;
      scene.add(object);
      addMesh(shape.meshes[i], object.objectIndex, [detailIndex], `skin_${i}`);
    }
  }
  // Decals reuse the target's frame buffers and have their own UV projection.
  for (let i = 0; i < shape.decals.length; i++) {
    const decal = shape.decals[i],
      target = shape.objects[decal.objectIndex];
    if (!target) continue;
    for (let level = 0; level < decal.numMeshes; level++) {
      const source = shape.meshes[decal.startMeshIndex + level];
      if (!source.decal?.texgenS.length || !source.indices.length) continue;
      // Decals use the same packed material field as ordinary primitives
      // (TSMesh::setMaterial / FUN_006a67d0).
      const materialIndex =
        source.decal.materialIndex & DTSPrimitiveFlags.NoMaterial
          ? -1
          : source.decal.materialIndex & DTSPrimitiveFlags.MaterialMask;
      const targetMesh = shape.meshes[target.startMeshIndex + level];
      if (!targetMesh || targetMesh.type === DTSMeshType.Null) continue;
      const subShape = shape.subShapes.findIndex(
        (s) => i >= s.firstDecal && i < s.firstDecal + s.numDecals,
      );
      const detailIndices = shape.details.flatMap((d, index) =>
        d.subShape === subShape && d.objectDetail === level ? [index] : [],
      );
      let template: DTSDetail | undefined;
      branches.push({
        objectIndex: decal.objectIndex,
        detailIndices,
        decalIndex: i,
        create: () => {
          if (template) return template;
          const { geometry: base, frames: targetFrames } =
            getGeometry(targetMesh);
          const geometry = shareDTSGeometry(base);
          geometry.clearGroups();
          geometry.morphAttributes = {};
          geometry.setAttribute(
            "uv",
            new BufferAttribute(
              new Float32Array(base.getAttribute("position").count * 2),
              2,
            ),
          );
          const frames = {
            ...targetFrames,
            triangles: source.primitives.map((p) => dtsTriangles(source, p)),
          };
          const material =
            materials[materialIndex]?.clone() ?? new DTSMaterial();
          // TSDecalMesh::initDecalMaterials (Tribes2.exe FUN_006ae090).
          material.polygonOffset = true;
          material.polygonOffsetFactor = -2;
          material.polygonOffsetUnits = -2;
          const mesh = new DTSMesh(geometry, material);
          mesh.name = shape.names[decal.nameIndex];
          mesh.binding = {
            source,
            frames,
            detailIndices,
            objectIndex: decal.objectIndex,
            materialIndex,
            decalIndex: i,
          };
          const detail = new DTSDetail();
          detail.visible =
            detailIndices.includes(0) &&
            shape.details[0]?.size >= 0 &&
            (scene.decalFrames[i] ?? -1) >= 0;
          detail.add(mesh);
          template = detail;
          mesh.visible = true;
          return detail;
        },
      });
    }
  }
  scene.branches = branches;
  scene.prepareAnimationTargets();
  if (options.lazy === false) {
    scene.ensureNodes();
    for (let i = 0; i < shape.objects.length; i++) scene.getShapeObject(i);
    scene.ensureAllDetails();
  } else scene.ensureDetail(0);
  scene.updateMatrixWorld(true);
  const animations = buildDTSAnimations(shape);
  scene.animations = animations;
  const bounds = new Box3(
    dtsVector(shape.bounds.min),
    dtsVector(shape.bounds.max),
  );
  // The X basis is reversed, so restore increasing min/max.
  [bounds.min.x, bounds.max.x] = [bounds.max.x, bounds.min.x];
  // Keep indexed inspection lazy. React Three Fiber can still replace the
  // model's nodes property with its name-based scene graph.
  const nodes: DTSNode[] = new Array(shape.nodes.length);
  shape.nodes.forEach((_, index) => {
    Object.defineProperty(nodes, index, {
      configurable: true,
      enumerable: true,
      get: () => scene.getNode(index)!,
    });
  });
  return {
    scene,
    animations,
    materials,
    data: shape,
    bounds,
    nodes,
  };
}

import {
  BufferAttribute,
  Box3,
  Matrix3,
  Mesh,
  Sphere,
  Vector3,
  type BufferGeometry,
} from "three";
import {
  DTSMesh,
  DTSRigidMeshBatch,
  DTSStaticMeshBatch,
  type DTSShape,
} from "../dts/dtsModel";
import { getDTSShape, observeShapeMeshes } from "../dts/dtsScene";
import {
  subdivideChestGeometry,
  type ChestRegion,
} from "./subdivideChestGeometry";

interface ChestProfile {
  object: string;
  /** Authored torso-bone coordinates: -X up, Y across, +Z forward. */
  centerX: number;
  halfHeight: number;
  halfWidth: number;
  rootZ: number;
  frontZ: number;
  separation: number;
}

// Calibrated against the actual torso vertices, including the different
// Bioderm skeleton. Object selection excludes arms, shoulder guards and packs.
export const CHEST_PROFILES: Readonly<Record<string, ChestProfile>> = {
  "light_male.dts": {
    object: "submesh_torso",
    centerX: -0.025,
    halfHeight: 0.23,
    halfWidth: 0.32,
    rootZ: 0.06,
    frontZ: 0.23,
    separation: 0.13,
  },
  "light_female.dts": {
    object: "submesh_torso",
    centerX: -0.025,
    halfHeight: 0.18,
    halfWidth: 0.25,
    rootZ: 0.1,
    frontZ: 0.25,
    separation: 0.135,
  },
  "medium_male.dts": {
    object: "submesh_torso",
    centerX: -0.035,
    halfHeight: 0.25,
    halfWidth: 0.39,
    rootZ: 0.07,
    frontZ: 0.23,
    separation: 0.19,
  },
  "medium_female.dts": {
    object: "submesh_torso",
    centerX: -0.035,
    halfHeight: 0.18,
    halfWidth: 0.25,
    rootZ: 0.1,
    frontZ: 0.24,
    separation: 0.125,
  },
  "heavy_male.dts": {
    object: "submesh_torso",
    centerX: -0.1,
    halfHeight: 0.34,
    halfWidth: 0.46,
    rootZ: 0.12,
    frontZ: 0.33,
    separation: 0.21,
  },
  "bioderm_light.dts": {
    object: "bio_light_torso",
    centerX: -0.2,
    halfHeight: 0.26,
    halfWidth: 0.43,
    rootZ: 0.08,
    frontZ: 0.28,
    separation: 0.19,
  },
  "bioderm_medium.dts": {
    object: "bio_medtorso",
    centerX: -0.23,
    halfHeight: 0.27,
    halfWidth: 0.43,
    rootZ: 0.04,
    frontZ: 0.22,
    separation: 0.2,
  },
  "bioderm_heavy.dts": {
    object: "bio_heavytorso",
    centerX: -0.04,
    halfHeight: 0.3,
    halfWidth: 0.58,
    rootZ: 0.1,
    frontZ: 0.37,
    separation: 0.25,
  },
};

function smooth(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

// The spherical growth target moves each lobe's center outward and down. Its
// influence rises from zero at 100%, leaving the original mesh and shrinking
// intact. Drop is relative to the armor's chest height; +X is down locally.
const MAX_SIZE_LOBE_SPREAD = 2.1;
const MAX_SIZE_LOBE_DROP = 0.75;

function roundingWeight(p: Vector3, profile: ChestProfile): number {
  return (
    smooth((1 - Math.abs(p.x - profile.centerX) / profile.halfHeight) / 0.5) *
    smooth((1 - Math.abs(p.y) / (profile.halfWidth * 1.35)) / 0.4) *
    smooth((p.z - profile.rootZ) / ((profile.frontZ - profile.rootZ) * 0.5))
  );
}

/** A smooth positive depth keeps attachment vertices on the front hemisphere,
 * rather than projecting the inside of a collar backward through the torso. */
function sphericalDepth(p: Vector3, profile: ChestProfile): number {
  const depth = profile.frontZ - profile.rootZ;
  const forward = (p.z - profile.rootZ - depth * 0.5) / (depth * 0.7);
  return (forward + Math.hypot(forward, 0.4)) * 0.5;
}

/** Smooth shading across the authored flat panels as they become round. */
function sphericalNormal(p: Vector3, profile: ChestProfile, out: Vector3) {
  const nx = (p.x - profile.centerX) / (profile.halfHeight * 0.8);
  const nz = sphericalDepth(p, profile);
  const right = smooth((p.y / profile.separation + 1) / 2);
  out.set(0, 0, 0);
  for (const side of [-1, 1]) {
    const ny = (p.y - side * profile.separation) / (profile.halfWidth * 0.5);
    const weight =
      (side < 0 ? 1 - right : right) / Math.max(Math.hypot(nx, ny, nz), 1e-6);
    out.x += nx * weight;
    out.y += ny * weight;
    out.z += nz * weight;
  }
  return out.normalize();
}

/** Continuous in position so duplicated UV/hard-normal seam vertices agree. */
function displacement(
  p: Vector3,
  profile: ChestProfile,
  target: number,
  out: Vector3,
) {
  const height = (p.x - profile.centerX) / profile.halfHeight;
  const width = p.y / profile.halfWidth;
  const weight =
    smooth((1 - Math.abs(height)) / 0.5) *
    smooth((1 - Math.abs(width)) / 0.4) *
    smooth((p.z - profile.rootZ) / (profile.frontZ - profile.rootZ));
  const right = smooth((p.y / profile.separation + 1) / 2);
  out.set(0, 0, 0);
  if (target === 0 || target === 7) {
    // Widen the front shell, including the sides of each lobe. The narrower
    // forward/translation mask tapers away at those sides and, if reused for
    // every axis, mostly extrudes the tips into long, thin shapes.
    const roundWeight = roundingWeight(p, profile);
    // Let the lobe centers spread as their radii grow. Scaling only around
    // fixed centers squeezes the inner vertices across the middle seam.
    const centerY = profile.separation * (right * 2 - 1);
    out.set(
      (p.x - profile.centerX) * 0.9 * roundWeight,
      (p.y - centerY * 0.35) * roundWeight,
      Math.max(0, p.z - profile.rootZ) * weight,
    );
    if (target === 0) return out;

    // Project each front lobe toward a spherical shell at maximum size. Blend
    // the two projections at the sternum so the center seam stays continuous
    // without filling the valley between the lobes. Moving the sphere's center
    // into the front shell lets panel corners roll back around its sides.
    const depth = profile.frontZ - profile.rootZ;
    const centerX = profile.centerX + profile.halfHeight * MAX_SIZE_LOBE_DROP;
    const centerZ = profile.rootZ + depth * 0.5;
    const nx = (p.x - profile.centerX) / (profile.halfHeight * 0.8);
    const nz = sphericalDepth(p, profile);
    let sphereX = 0,
      sphereY = 0,
      sphereZ = 0;
    for (const side of [-1, 1]) {
      const ny = (p.y - side * profile.separation) / (profile.halfWidth * 0.5);
      const radius = (depth * 3) / Math.max(Math.hypot(nx, ny, nz), 1e-6);
      const influence = side < 0 ? 1 - right : right;
      sphereX += (centerX + nx * radius) * influence;
      sphereY +=
        (side * profile.separation * MAX_SIZE_LOBE_SPREAD + ny * radius) *
        influence;
      sphereZ += (centerZ + nz * radius) * influence;
    }
    return out.set(
      (((sphereX - p.x) * roundWeight) / 2 - out.x) * 0.8,
      (((sphereY - p.y) * roundWeight) / 2 - out.y) * 0.8,
      (((sphereZ - p.z) * roundWeight) / 2 - out.z) * 0.8,
    );
  }
  const side = target <= 3 ? 1 - right : right;
  return out.setComponent((target - 1) % 3, weight * side);
}

interface CachedMorphs {
  geometry: BufferGeometry;
  users: number;
  matches(source: BufferGeometry): boolean;
}
const cache = new WeakMap<
  object,
  Map<ChestProfile, Map<number, CachedMorphs>>
>();

/** Mutable native LOD/decal buffers can retain identity while changing data. */
function geometryStamp(source: BufferGeometry) {
  const attributes = Object.entries(source.attributes).map(
    ([name, attribute]) =>
      [
        name,
        attribute,
        "version" in attribute ? attribute.version : attribute.data.version,
      ] as const,
  );
  const index = source.index,
    version = index?.version;
  const groups = source.groups.map((group) => ({ ...group }));
  const { start, count } = source.drawRange;
  return (geometry: BufferGeometry) =>
    geometry.index === index &&
    geometry.index?.version === version &&
    attributes.every(
      ([name, attribute, version]) =>
        geometry.getAttribute(name) === attribute &&
        ("version" in attribute
          ? attribute.version
          : attribute.data.version) === version,
    ) &&
    geometry.drawRange.start === start &&
    geometry.drawRange.count === count &&
    geometry.groups.length === groups.length &&
    groups.every(
      (group, i) =>
        group.start === geometry.groups[i].start &&
        group.count === geometry.groups[i].count &&
        group.materialIndex === geometry.groups[i].materialIndex,
    );
}

function hasMorphTargets(geometry: BufferGeometry) {
  return Object.values(geometry.morphAttributes).some(
    (targets) => targets?.length,
  );
}

function buildMorphs(
  mesh: Mesh,
  shape: DTSShape,
  profile: ChestProfile,
  source: BufferGeometry,
  subdivisions: number,
): BufferGeometry | undefined {
  const bindings =
    mesh instanceof DTSRigidMeshBatch || mesh instanceof DTSStaticMeshBatch
      ? mesh.bindings
      : mesh instanceof DTSMesh && mesh.binding
        ? [mesh.binding]
        : [];
  const spans: ChestRegion[] = [];
  let offset = 0;
  bindings.forEach((binding, index) => {
    const count = binding.frames.positions[0].count;
    const object = shape.data.objects[binding.objectIndex];
    if (
      shape.data.names[object.nameIndex].toLowerCase() === profile.object &&
      !binding.source.skin &&
      binding.frames.positions.length === 1
    ) {
      spans.push({
        start: offset,
        count,
        transform:
          mesh instanceof DTSStaticMeshBatch
            ? mesh.restTransforms[index]
            : undefined,
      });
    }
    offset += count;
  });
  if (!spans.length || hasMorphTargets(source)) return;
  const { geometry, owners } = subdivideChestGeometry(
    source,
    spans,
    (a, b) =>
      Math.max(a.x, b.x) > profile.centerX - profile.halfHeight &&
      Math.min(a.x, b.x) < profile.centerX + profile.halfHeight &&
      Math.max(a.y, b.y) > -profile.halfWidth * 1.35 &&
      Math.min(a.y, b.y) < profile.halfWidth * 1.35 &&
      Math.max(a.z, b.z) > profile.rootZ,
    subdivisions,
  );
  const vertices = spans.map(() => [] as number[]);
  owners.forEach((owner, vertex) => {
    if (owner >= 0) vertices[owner].push(vertex);
  });
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const p = new Vector3(),
    n = new Vector3(),
    delta = new Vector3();
  const plus = new Vector3(),
    minus = new Vector3(),
    sample = new Vector3(),
    baseDelta = new Vector3();
  const jacobian = new Matrix3();
  const epsilon = 0.0001;
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [];
  geometry.morphAttributes.normal = [];
  for (let target = 0; target < 8; target++) {
    const positions = new Float32Array(position.count * 3);
    const normals = new Float32Array(position.count * 3);
    for (let region = 0; region < spans.length; region++) {
      const span = spans[region];
      const inverse = span.transform?.clone().invert();
      const linear =
        span.transform && new Matrix3().setFromMatrix4(span.transform);
      const normalTransform =
        span.transform && new Matrix3().getNormalMatrix(span.transform);
      const inverseNormal = inverse && new Matrix3().getNormalMatrix(inverse);
      const normalStep = target === 7 ? 2 : target === 0 ? 1 : 0.001;
      for (const i of vertices[region]) {
        p.fromBufferAttribute(position, i);
        n.fromBufferAttribute(normal, i);
        const normalLength = n.length();
        if (inverse) p.applyMatrix4(inverse);
        if (inverseNormal) n.applyMatrix3(inverseNormal).normalize();
        if (
          target === 0 &&
          (!Number.isFinite(p.lengthSq()) || !Number.isFinite(n.lengthSq()))
        )
          throw new Error("Non-finite chest geometry");
        // All displacement masks are contained in this wider growth mask.
        // Back/waist vertices keep zero deltas and need no normal Jacobian.
        if (roundingWeight(p, profile) === 0) continue;
        displacement(p, profile, target, delta);
        if (linear) delta.applyMatrix3(linear);
        delta.toArray(positions, i * 3);
        // Transform authored normals by the deformation's local Jacobian.
        // The extra rounding target also softens hard panel edges at full size.
        jacobian.identity();
        for (let axis = 0; axis < 3; axis++) {
          sample.copy(p).setComponent(axis, p.getComponent(axis) + epsilon);
          displacement(sample, profile, target, plus);
          if (target === 7)
            plus.add(displacement(sample, profile, 0, baseDelta));
          sample.copy(p).setComponent(axis, p.getComponent(axis) - epsilon);
          displacement(sample, profile, target, minus);
          if (target === 7)
            minus.add(displacement(sample, profile, 0, baseDelta));
          plus.sub(minus).multiplyScalar(0.5 / epsilon);
          // Linearize normals at a small displacement. A unit translation
          // target is one metre, far beyond the spring's actual excursion.
          for (let row = 0; row < 3; row++)
            jacobian.elements[axis * 3 + row] +=
              plus.getComponent(row) * normalStep;
        }
        n.applyMatrix3(jacobian.invert().transpose()).normalize();
        if (target === 7)
          n.lerp(
            sphericalNormal(p, profile, sample),
            roundingWeight(p, profile) * 0.8,
          ).normalize();
        if (normalTransform) n.applyMatrix3(normalTransform).normalize();
        // Subdivision interpolates normals, so their lengths need not be one.
        // Preserve that baseline before taking the finite difference; otherwise
        // even a rigid translation turns (1 - length) / 0.001 into a huge pulse.
        n.multiplyScalar(normalLength)
          .sub(sample.fromBufferAttribute(normal, i))
          .multiplyScalar(1 / normalStep);
        // The rounding target is added on top of the size target, so its
        // normals describe the difference from that already-expanded shell.
        // At maximum size, both growth targets have weight 2.
        if (target === 7)
          n.sub(
            sample.fromBufferAttribute(geometry.morphAttributes.normal[0], i),
          );
        n.toArray(normals, i * 3);
      }
    }
    geometry.morphAttributes.position.push(new BufferAttribute(positions, 3));
    geometry.morphAttributes.normal.push(new BufferAttribute(normals, 3));
  }
  // Raycasts also need bounds covering enlarged vertices (frustumCulled alone
  // does not affect Mesh.raycast). Include both size limits and spring travel.
  const bounds = new Box3().setFromBufferAttribute(position as BufferAttribute);
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    delta.fromBufferAttribute(geometry.morphAttributes.position[0], i);
    bounds.expandByPoint(sample.copy(p).addScaledVector(delta, -0.3));
    delta.add(
      baseDelta.fromBufferAttribute(geometry.morphAttributes.position[7], i),
    );
    bounds.expandByPoint(p.addScaledVector(delta, 2));
  }
  geometry.boundingBox = bounds.expandByScalar(0.5);
  geometry.boundingSphere = bounds.getBoundingSphere(new Sphere());
  return geometry;
}

/** Shared surface buffers with per-player weights; native DTS state stays intact. */
export function createChestDeformation(shape: DTSShape, shapeName: string) {
  const profile = CHEST_PROFILES[shapeName.toLowerCase()];
  if (!profile) return;
  const isTorso = (objectIndex: number) =>
    shape.data.names[
      shape.data.objects[objectIndex].nameIndex
    ].toLowerCase() === profile.object;
  const objectIndex = shape.data.objects.findIndex((_, i) => isTorso(i));
  if (objectIndex < 0) return;
  const bone = shape.getNode(shape.data.objects[objectIndex].nodeIndex);
  if (!bone) return;
  const meshes = new Map<Mesh, { refresh(): void; dispose(): void }>();
  const anchor = new Vector3(),
    anchorDelta = new Vector3();
  const weights = new Array<number>(8).fill(0);
  let disabled = false;
  let stop = () => {};
  const dispose = () => {
    disabled = true;
    stop();
    for (const mesh of meshes.values()) mesh.dispose();
    meshes.clear();
  };
  const fail = (error: unknown) => {
    if (disabled) return;
    dispose();
    console.warn(`Disabled chest deformation for ${shapeName}`, error);
  };
  const initialize = (mesh: Mesh) => {
    if (getDTSShape(mesh) !== shape || meshes.has(mesh)) return;
    const bindings =
      mesh instanceof DTSMesh && mesh.binding
        ? [mesh.binding]
        : mesh instanceof DTSRigidMeshBatch ||
            mesh instanceof DTSStaticMeshBatch
          ? mesh.bindings
          : [];
    if (
      !bindings.some(
        (binding) =>
          isTorso(binding.objectIndex) &&
          !binding.source.skin &&
          !binding.source.sorted &&
          binding.frames.positions.length === 1,
      )
    )
      return;
    const source = mesh.geometry;
    if (hasMorphTargets(source)) return;
    const originalStamp = geometryStamp(source);
    const originalKey = mesh instanceof DTSMesh ? mesh.binding! : source;
    const culled = mesh.frustumCulled;
    const influences = mesh.morphTargetInfluences;
    const dictionary = mesh.morphTargetDictionary;
    let active:
      | {
          entry: CachedMorphs;
          entries: Map<number, CachedMorphs>;
          level: number;
        }
      | undefined;
    const release = () => {
      if (active && --active.entry.users === 0) {
        active.entry.geometry.dispose();
        if (active.entries.get(active.level) === active.entry)
          active.entries.delete(active.level);
      }
      active = undefined;
    };
    const processNative = (native: BufferGeometry): BufferGeometry => {
      // Preserve the exact authored surface and shading at rest and 100% size.
      // Retain the last cached surface until disposal to avoid rebuilding it
      // whenever the spring settles or the slider passes through 100%.
      if (weights.every((weight) => weight === 0)) return native;
      const level =
        weights[0] > 0
          ? bindings.some((binding) => binding.detailIndices.includes(0))
            ? 3
            : 1
          : 0;
      if (active?.level === level && active.entry.matches(native))
        return active.entry.geometry;
      const key = originalStamp(native) ? originalKey : native;
      let profiles = cache.get(key);
      if (!profiles) cache.set(key, (profiles = new Map()));
      let entries = profiles.get(profile);
      if (!entries) profiles.set(profile, (entries = new Map()));
      let entry = entries.get(level);
      if (!entry?.matches(native)) {
        const geometry = buildMorphs(mesh, shape, profile, native, level);
        if (!geometry) return native;
        entry = { geometry, matches: geometryStamp(native), users: 0 };
        entries.set(level, entry);
      }
      if (active?.entry !== entry) {
        release();
        entry.users++;
        active = { entry, entries, level };
      }
      return entry.geometry;
    };
    // This also runs from DTS's lazy LOD/decal updates, outside the physics
    // callback. A failure must restore every mesh without escaping that loop.
    const process = (native: BufferGeometry): BufferGeometry => {
      if (disabled) return native;
      try {
        const geometry = processNative(native);
        // Weights on a mesh with no morph attributes create an invalid
        // instanced shader (USE_INSTANCING_MORPH without MORPHTARGETS_COUNT).
        mesh.morphTargetInfluences = geometry === native ? influences : weights;
        return geometry;
      } catch (error) {
        fail(error);
        return native;
      }
    };
    mesh.frustumCulled = false;
    const refresh = () => {
      if (mesh instanceof DTSMesh) mesh.refreshProcessedGeometry();
      else mesh.geometry = process(source);
    };
    meshes.set(mesh, {
      refresh,
      dispose() {
        if (mesh instanceof DTSMesh) mesh.setGeometryProcessor();
        else mesh.geometry = source;
        mesh.morphTargetInfluences = influences;
        mesh.morphTargetDictionary = dictionary;
        mesh.frustumCulled = culled;
        release();
      },
    });
    if (mesh instanceof DTSMesh) mesh.setGeometryProcessor(process);
    else refresh();
  };
  stop = observeShapeMeshes(shape, (mesh) => {
    if (disabled) return;
    try {
      initialize(mesh);
    } catch (error) {
      fail(error);
    }
  });
  // Initialization can fail before observeShapeMeshes returns its unsubscribe.
  if (disabled) stop();
  return {
    bone,
    get disabled() {
      return disabled;
    },
    getAnchor(side: number, size: number, out: Vector3) {
      anchor.set(
        profile.centerX,
        (side === 0 ? -1 : 1) * profile.separation,
        profile.frontZ,
      );
      out
        .copy(anchor)
        .addScaledVector(
          displacement(anchor, profile, 0, anchorDelta),
          size - 1,
        );
      return out.addScaledVector(
        displacement(anchor, profile, 7, anchorDelta),
        Math.max(0, size - 1),
      );
    },
    apply(size: number, left: Vector3, right: Vector3) {
      if (disabled) return;
      if (
        !Number.isFinite(size) ||
        !Number.isFinite(left.lengthSq()) ||
        !Number.isFinite(right.lengthSq())
      ) {
        fail(new Error("Non-finite chest deformation"));
        return;
      }
      weights[0] = size - 1;
      left.toArray(weights, 1);
      right.toArray(weights, 4);
      weights[7] = Math.max(0, size - 1);
      for (const mesh of meshes.values()) mesh.refresh();
    },
    dispose,
  };
}

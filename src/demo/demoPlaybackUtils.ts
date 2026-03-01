import {
  AnimationClip,
  AnimationMixer,
  ClampToEdgeWrapping,
  Group,
  LinearFilter,
  Matrix4,
  MeshLambertMaterial,
  NoColorSpace,
  Object3D,
  Quaternion,
  TextureLoader,
  Vector3,
} from "three";
import type {
  BufferGeometry,
  MeshStandardMaterial,
  Texture,
} from "three";
import {
  createMaterialFromFlags,
  applyShapeShaderModifications,
} from "../components/GenericShape";
import { getHullBoneIndices, filterGeometryByVertexGroups } from "../meshUtils";
import { setupTexture } from "../textureUtils";
import { textureToUrl } from "../loaders";
import type {
  DemoEntity,
  DemoKeyframe,
  DemoStreamSnapshot,
} from "./types";

/** Fallback eye height when the player model isn't loaded or has no Cam node. */
export const DEFAULT_EYE_HEIGHT = 2.1;

/** Torque's animation crossfade duration (seconds). */
export const ANIM_TRANSITION_TIME = 0.25;

export const STREAM_TICK_MS = 32;
export const STREAM_TICK_SEC = STREAM_TICK_MS / 1000;
export const CAMERA_COLLISION_RADIUS = 0.05;

// ── Temp vectors / quaternions (module-level to avoid per-frame alloc) ──

const _tracerOrientI = new Vector3();
const _tracerOrientK = new Vector3();
const _tracerOrientMat = new Matrix4();
const _upY = new Vector3(0, 1, 0);

/** ShapeRenderer's 90° Y rotation and its inverse, used for mount transforms. */
export const _r90 = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  Math.PI / 2,
);
export const _r90inv = _r90.clone().invert();

// ── Lifecycle tracking ──

let lifecycleInstanceIdSeed = 0;

export function nextLifecycleInstanceId(prefix: string): string {
  lifecycleInstanceIdSeed += 1;
  return `${prefix}-${lifecycleInstanceIdSeed}`;
}

// ── Pure functions ──

/**
 * Torque/Tribes stores camera FOV as horizontal degrees, while Three.js
 * PerspectiveCamera.fov expects vertical degrees.
 */
export function torqueHorizontalFovToThreeVerticalFov(
  torqueFovDeg: number,
  aspect: number,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0.000001 ? aspect : 4 / 3;
  const clampedFov = Math.max(0.01, Math.min(179.99, torqueFovDeg));
  const hRad = (clampedFov * Math.PI) / 180;
  const vRad = 2 * Math.atan(Math.tan(hRad / 2) / safeAspect);
  return (vRad * 180) / Math.PI;
}

export function setupEffectTexture(tex: Texture): void {
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.colorSpace = NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
}

export function torqueVecToThree(
  v: [number, number, number],
  out: Vector3,
): Vector3 {
  return out.set(v[1], v[2], v[0]);
}

export function setQuaternionFromDir(dir: Vector3, out: Quaternion): void {
  // Equivalent to MathUtils::createOrientFromDir in Torque:
  // column1 = direction, with Torque up-vector converted to Three up-vector.
  _tracerOrientI.crossVectors(dir, _upY);
  if (_tracerOrientI.lengthSq() < 1e-8) {
    _tracerOrientI.set(-1, 0, 0);
  }
  _tracerOrientI.normalize();
  _tracerOrientK.crossVectors(_tracerOrientI, dir).normalize();

  _tracerOrientMat.set(
    _tracerOrientI.x,
    dir.x,
    _tracerOrientK.x,
    0,
    _tracerOrientI.y,
    dir.y,
    _tracerOrientK.y,
    0,
    _tracerOrientI.z,
    dir.z,
    _tracerOrientK.z,
    0,
    0,
    0,
    0,
    1,
  );
  out.setFromRotationMatrix(_tracerOrientMat);
}

/** Binary search for the keyframe at or before the given time. */
export function getKeyframeAtTime(
  keyframes: DemoKeyframe[],
  time: number,
): DemoKeyframe | null {
  if (keyframes.length === 0) return null;
  if (time <= keyframes[0].time) return keyframes[0];
  if (time >= keyframes[keyframes.length - 1].time)
    return keyframes[keyframes.length - 1];

  let lo = 0;
  let hi = keyframes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return keyframes[lo];
}

/**
 * Clone a shape scene, apply the "Root" idle animation at t=0, and return the
 * world-space transform of the named node. This evaluates the skeleton at its
 * idle pose rather than using the collapsed bind pose.
 */
export function getPosedNodeTransform(
  scene: Group,
  animations: AnimationClip[],
  nodeName: string,
): { position: Vector3; quaternion: Quaternion } | null {
  const clone = scene.clone(true);

  const rootClip = animations.find((a) => a.name === "Root");
  if (rootClip) {
    const mixer = new AnimationMixer(clone);
    mixer.clipAction(rootClip).play();
    mixer.setTime(0);
  }

  clone.updateMatrixWorld(true);

  let position: Vector3 | null = null;
  let quaternion: Quaternion | null = null;
  clone.traverse((n) => {
    if (!position && n.name === nodeName) {
      position = new Vector3();
      quaternion = new Quaternion();
      n.getWorldPosition(position);
      n.getWorldQuaternion(quaternion);
    }
  });

  if (!position || !quaternion) return null;
  return { position, quaternion };
}

/**
 * Smooth vertex normals across co-located split vertices (same position, different
 * UVs). Matches the technique used by ShapeModel for consistent lighting.
 */
export function smoothVertexNormals(geometry: BufferGeometry): void {
  geometry.computeVertexNormals();

  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  if (!posAttr || !normAttr) return;

  const positions = posAttr.array as Float32Array;
  const normals = normAttr.array as Float32Array;

  // Build map of position -> vertex indices at that position.
  const positionMap = new Map<string, number[]>();
  for (let i = 0; i < posAttr.count; i++) {
    const key = `${positions[i * 3].toFixed(4)},${positions[i * 3 + 1].toFixed(4)},${positions[i * 3 + 2].toFixed(4)}`;
    if (!positionMap.has(key)) {
      positionMap.set(key, []);
    }
    positionMap.get(key)!.push(i);
  }

  // Average normals for vertices at the same position.
  for (const indices of positionMap.values()) {
    if (indices.length > 1) {
      let nx = 0,
        ny = 0,
        nz = 0;
      for (const idx of indices) {
        nx += normals[idx * 3];
        ny += normals[idx * 3 + 1];
        nz += normals[idx * 3 + 2];
      }
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      for (const idx of indices) {
        normals[idx * 3] = nx;
        normals[idx * 3 + 1] = ny;
        normals[idx * 3 + 2] = nz;
      }
    }
  }
  normAttr.needsUpdate = true;
}

const _textureLoader = new TextureLoader();

/**
 * Replace a PBR MeshStandardMaterial with a diffuse-only Lambert/Basic material
 * matching the Tribes 2 material pipeline. Textures are loaded asynchronously
 * from URLs (GLB files don't embed texture data; they store a resource_path in
 * material userData instead).
 */
export function replaceWithShapeMaterial(mat: MeshStandardMaterial, vis: number) {
  const resourcePath: string | undefined = mat.userData?.resource_path;
  const flagNames = new Set<string>(mat.userData?.flag_names ?? []);

  if (!resourcePath) {
    // No texture path — plain Lambert fallback with fog/lighting shaders.
    const fallback = new MeshLambertMaterial({
      color: mat.color,
      side: 2, // DoubleSide
      reflectivity: 0,
    });
    applyShapeShaderModifications(fallback);
    return fallback;
  }

  // Load texture asynchronously via Three.js TextureLoader. The returned
  // Texture is empty initially and gets populated when the image arrives;
  // Three.js re-renders automatically once loaded.
  const url = textureToUrl(resourcePath);
  const texture = _textureLoader.load(url);
  setupTexture(texture);

  const result = createMaterialFromFlags(mat, texture, flagNames, false, vis);
  // createMaterialFromFlags may return a [back, front] pair for translucent
  // materials. Use the front material since we can't split meshes imperatively.
  if (Array.isArray(result)) {
    return result[1];
  }
  return result;
}

/**
 * Post-process a cloned shape scene: hide collision/hull geometry, smooth
 * normals, and replace PBR materials with diffuse-only Lambert materials.
 */
export function processShapeScene(scene: Object3D): void {
  // Find skeleton for hull bone filtering.
  let skeleton: any = null;
  scene.traverse((n: any) => {
    if (!skeleton && n.skeleton) skeleton = n.skeleton;
  });
  const hullBoneIndices = skeleton
    ? getHullBoneIndices(skeleton)
    : new Set<number>();

  scene.traverse((node: any) => {
    if (!node.isMesh) return;

    // Hide unwanted nodes: hull geometry, unassigned materials, invisible objects.
    if (
      node.name.match(/^Hulk/i) ||
      node.material?.name === "Unassigned" ||
      (node.userData?.vis ?? 1) < 0.01
    ) {
      node.visible = false;
      return;
    }

    // Filter hull-influenced triangles and smooth normals.
    if (node.geometry) {
      let geometry = filterGeometryByVertexGroups(
        node.geometry,
        hullBoneIndices,
      );
      geometry = geometry.clone();
      smoothVertexNormals(geometry);
      node.geometry = geometry;
    }

    // Replace PBR materials with diffuse-only Lambert materials.
    const vis: number = node.userData?.vis ?? 1;
    if (Array.isArray(node.material)) {
      node.material = node.material.map((m: MeshStandardMaterial) =>
        replaceWithShapeMaterial(m, vis),
      );
    } else if (node.material) {
      node.material = replaceWithShapeMaterial(node.material, vis);
    }
  });
}

export function collectSceneObjectCounts(scene: Object3D): {
  sceneObjects: number;
  visibleSceneObjects: number;
} {
  let sceneObjects = 0;
  let visibleSceneObjects = 0;
  scene.traverse((node) => {
    sceneObjects += 1;
    if (node.visible) {
      visibleSceneObjects += 1;
    }
  });
  return { sceneObjects, visibleSceneObjects };
}

export function streamSnapshotSignature(snapshot: DemoStreamSnapshot): string {
  const parts: string[] = [];
  for (const entity of snapshot.entities) {
    const visualPart =
      entity.visual?.kind === "tracer"
        ? `tracer:${entity.visual.texture}:${entity.visual.crossTexture ?? ""}:${entity.visual.tracerLength}:${entity.visual.tracerWidth}:${entity.visual.crossViewAng}:${entity.visual.crossSize}:${entity.visual.renderCross ? 1 : 0}`
        : entity.visual?.kind === "sprite"
          ? `sprite:${entity.visual.texture}:${entity.visual.color.r}:${entity.visual.color.g}:${entity.visual.color.b}:${entity.visual.size}`
          : "";
    parts.push(
      `${entity.id}|${entity.type}|${entity.dataBlock ?? ""}|${entity.weaponShape ?? ""}|${entity.playerName ?? ""}|${entity.className ?? ""}|${entity.ghostIndex ?? ""}|${entity.dataBlockId ?? ""}|${entity.shapeHint ?? ""}|${entity.faceViewer ? "fv" : ""}|${visualPart}`,
    );
  }
  parts.sort();
  return parts.join(";");
}

export function buildStreamDemoEntity(
  id: string,
  type: string,
  dataBlock: string | undefined,
  visual: DemoEntity["visual"] | undefined,
  direction: DemoEntity["direction"] | undefined,
  weaponShape: string | undefined,
  playerName: string | undefined,
  className: string | undefined,
  ghostIndex: number | undefined,
  dataBlockId: number | undefined,
  shapeHint: string | undefined,
): DemoEntity {
  return {
    id,
    type,
    dataBlock,
    visual,
    direction,
    weaponShape,
    playerName,
    className,
    ghostIndex,
    dataBlockId,
    shapeHint,
    keyframes: [
      {
        time: 0,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    ],
  };
}

export function hasAncestorNamed(object: Object3D | null, name: string): boolean {
  let node: Object3D | null = object;
  while (node) {
    if (node.name === name) return true;
    node = node.parent;
  }
  return false;
}

export function entityTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case "player":
      return "#00ff88";
    case "vehicle":
      return "#ff8800";
    case "projectile":
      return "#ff0044";
    case "deployable":
      return "#ffcc00";
    default:
      return "#8888ff";
  }
}

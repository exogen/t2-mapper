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
  Vector3,
} from "three";
import type {
  BufferGeometry,
  Material,
  MeshStandardMaterial,
  Texture,
} from "three";
import {
  createMaterialFromFlags,
  applyShapeShaderModifications,
} from "../components/GenericShape";
import {
  loadIflAtlas,
  getFrameIndexForTime,
  updateAtlasFrame,
} from "../components/useIflTexture";
import { getHullBoneIndices, filterGeometryByVertexGroups } from "../meshUtils";
import { loadTexture, setupTexture } from "../textureUtils";
import { textureToUrl } from "../loaders";
import type {
  DemoEntity,
  DemoKeyframe,
} from "./types";

/** Fallback eye height when the player model isn't loaded or has no Cam node. */
export const DEFAULT_EYE_HEIGHT = 2.1;

/** Torque's animation crossfade duration (seconds). */
export const ANIM_TRANSITION_TIME = 0.25;

export const STREAM_TICK_MS = 32;
export const STREAM_TICK_SEC = STREAM_TICK_MS / 1000;

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
  overrideClipNames?: string[],
): { position: Vector3; quaternion: Quaternion } | null {
  const clone = scene.clone(true);

  const rootClip = animations.find((a) => a.name === "Root");
  if (rootClip) {
    const mixer = new AnimationMixer(clone);
    mixer.clipAction(rootClip).play();
    // Play override clips (e.g. arm pose) which replace bone transforms
    // on the bones they animate, at clip midpoint (neutral pose).
    if (overrideClipNames) {
      for (const name of overrideClipNames) {
        const clip = animations.find(
          (a) => a.name.toLowerCase() === name.toLowerCase(),
        );
        if (clip) {
          const action = mixer.clipAction(clip);
          action.time = clip.duration / 2;
          action.setEffectiveTimeScale(0);
          action.play();
        }
      }
    }
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

export interface ShapeMaterialResult {
  material: Material;
  /** For IFL materials: loads atlas, configures texture, sets up animation. */
  initialize?: (mesh: Object3D, getTime: () => number) => Promise<() => void>;
}

/**
 * Replace a PBR MeshStandardMaterial with a diffuse-only Lambert/Basic material
 * matching the Tribes 2 material pipeline. Textures are loaded asynchronously
 * from URLs (GLB files don't embed texture data; they store a resource_path in
 * material userData instead).
 */
export function replaceWithShapeMaterial(
  mat: MeshStandardMaterial,
  vis: number,
): ShapeMaterialResult {
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
    return { material: fallback };
  }

  // IFL materials need async atlas loading — create with null map to avoid
  // "Resource not found" warnings from textureToUrl, and return an initializer
  // that loads the atlas and sets up per-frame animation.
  if (flagNames.has("IflMaterial")) {
    const result = createMaterialFromFlags(mat, null, flagNames, false, vis);
    const material = Array.isArray(result) ? result[1] : result;
    return {
      material,
      initialize: (mesh, getTime) =>
        initializeIflMaterial(material, resourcePath, mesh, getTime),
    };
  }

  // Load texture via ImageBitmapLoader (decodes off main thread). The returned
  // Texture is empty initially and gets populated when the image arrives;
  // Three.js re-renders automatically once loaded.
  const url = textureToUrl(resourcePath);
  const texture = loadTexture(url);
  setupTexture(texture);

  const result = createMaterialFromFlags(mat, texture, flagNames, false, vis);
  // createMaterialFromFlags may return a [back, front] pair for translucent
  // materials. Use the front material since we can't split meshes imperatively.
  const material = Array.isArray(result) ? result[1] : result;
  return { material };
}

export interface IflInitializer {
  mesh: Object3D;
  initialize: (mesh: Object3D, getTime: () => number) => Promise<() => void>;
}

async function initializeIflMaterial(
  material: Material,
  resourcePath: string,
  mesh: Object3D,
  getTime: () => number,
): Promise<() => void> {
  const iflPath = `textures/${resourcePath}.ifl`;
  const atlas = await loadIflAtlas(iflPath);

  (material as any).map = atlas.texture;
  material.needsUpdate = true;

  let disposed = false;
  const prevOnBeforeRender = mesh.onBeforeRender;
  mesh.onBeforeRender = function (this: any, ...args: any[]) {
    prevOnBeforeRender?.apply(this, args);
    if (disposed) return;
    updateAtlasFrame(atlas, getFrameIndexForTime(atlas, getTime()));
  };

  return () => {
    disposed = true;
    mesh.onBeforeRender = prevOnBeforeRender ?? (() => {});
  };
}

/**
 * Post-process a cloned shape scene: hide collision/hull geometry, smooth
 * normals, and replace PBR materials with diffuse-only Lambert materials.
 * Returns IFL initializers for any IFL materials found.
 */
export function processShapeScene(scene: Object3D): IflInitializer[] {
  const iflInitializers: IflInitializer[] = [];

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

    // Hide unwanted nodes: hull geometry, unassigned materials.
    if (node.name.match(/^Hulk/i) || node.material?.name === "Unassigned") {
      node.visible = false;
      return;
    }

    // Hide vis-animated meshes (default vis < 0.01) but DON'T skip material
    // replacement — they need correct textures for when they become visible
    // (e.g. disc launcher's Disc mesh toggles visibility via state machine).
    const hasVisSequence = !!node.userData?.vis_sequence;
    if ((node.userData?.vis ?? 1) < 0.01) {
      node.visible = false;
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
    // For vis-animated meshes, use vis=1 so the material is fully opaque —
    // their visibility is toggled via node.visible, not material opacity.
    const vis: number = hasVisSequence ? 1 : (node.userData?.vis ?? 1);
    if (Array.isArray(node.material)) {
      node.material = node.material.map((m: MeshStandardMaterial) => {
        const result = replaceWithShapeMaterial(m, vis);
        if (result.initialize) {
          iflInitializers.push({ mesh: node, initialize: result.initialize });
        }
        return result.material;
      });
    } else if (node.material) {
      const result = replaceWithShapeMaterial(node.material, vis);
      if (result.initialize) {
        iflInitializers.push({ mesh: node, initialize: result.initialize });
      }
      node.material = result.material;
    }
  });

  return iflInitializers;
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
  explosionDataBlockId?: number,
  faceViewer?: boolean,
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
    explosionDataBlockId,
    faceViewer,
    keyframes: [
      {
        time: 0,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    ],
  };
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

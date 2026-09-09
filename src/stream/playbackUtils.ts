import {
  ClampToEdgeWrapping,
  LinearFilter,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
  SRGBColorSpace,
  SkinnedMesh,
} from "three";
import type { ColorSpace } from "three";
import type {
  BufferGeometry,
  Material,
  MeshStandardMaterial,
  Texture,
} from "three";
import {
  createMaterialFromFlags,
  applyShapeShaderModifications,
} from "../shapeMaterial";
import { configureDTSImageTexture } from "../dts/dtsTextures";
import { applyDTSMaterialMaps } from "../dts/dtsMaterialMaps";
import {
  DTSMaterial,
  DTSMesh,
  DTSShape,
  isDTSMesh,
  isDTSMeshBatch,
} from "../dts/dtsModel";
import { observeShapeMeshes, getDTSObject } from "../dts/dtsScene";
import {
  loadTexture,
  loadTextureInstance,
  setupTexture,
} from "../textureUtils";
import { textureToUrl } from "../loaders";
import type { Keyframe } from "./types";

/** Fallback eye height when the player model isn't loaded or has no Cam node. */
export const DEFAULT_EYE_HEIGHT = 2.1;

/** Torque's animation crossfade duration (seconds). */
export const ANIM_TRANSITION_TIME = 0.25;

export { STREAM_TICK_SEC } from "./streamHelpers";

// ── Temp vectors / quaternions (module-level to avoid per-frame alloc) ──

const _tracerOrientI = new Vector3();
const _tracerOrientK = new Vector3();
const _tracerOrientMat = new Matrix4();
const _upY = new Vector3(0, 1, 0);

/** ShapeRenderer's 90° Y rotation and its inverse, used for mount transforms. */

// ── Pure functions ──

/**
 * Torque/Tribes stores camera FOV as horizontal degrees, while Three.js
 * PerspectiveCamera.fov expects vertical degrees.
 */
export function torqueHorizontalFovToThreeVerticalFov(
  torqueFovDeg: number,
  aspect: number,
): number {
  const safeAspect =
    Number.isFinite(aspect) && aspect > 0.000001 ? aspect : 4 / 3;
  const clampedFov = Math.max(0.01, Math.min(179.99, torqueFovDeg));
  const hRad = (clampedFov * Math.PI) / 180;
  const vRad = 2 * Math.atan(Math.tan(hRad / 2) / safeAspect);
  return (vRad * 180) / Math.PI;
}

/**
 * Clamped, mip-less setup for an effect texture whose raw texel values
 * should reach the framebuffer unchanged, as the engine's GL_MODULATE
 * did. Built-in materials (MeshBasic, Sprite) re-encode their output to
 * sRGB, so the texture must be tagged sRGB for the round trip to be the
 * identity — tagged NoColorSpace, a near-black border texel (9/255) is
 * taken as linear and comes out as 53/255 grey, a visible box around an
 * additive quad. Raw ShaderMaterials that skip the encode (particles,
 * flare spikes) pass NoColorSpace.
 */
export function setupEffectTexture(
  tex: Texture,
  colorSpace: ColorSpace = SRGBColorSpace,
): void {
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.colorSpace = colorSpace;
  tex.flipY = false;
  if (tex.image) {
    tex.needsUpdate = true;
  }
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
  keyframes: Keyframe[],
  time: number,
): Keyframe | null {
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
 * Smooth vertex normals across co-located split vertices (same position, different
 * UVs). Matches the technique used by ShapeModel for consistent lighting.
 */
function smoothVertexNormals(geometry: BufferGeometry): void {
  // Cloned scenes share geometry with the loader cache, so this runs once
  // per geometry, not per clone — the result is identical every time.
  if (geometry.userData.normalsSmoothed) return;
  geometry.userData.normalsSmoothed = true;

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

interface ShapeMaterialResult {
  material: Material;
}

/**
 * Instance a native material with the viewer's lighting, fog, and skin settings.
 * Texture paths and flags come directly from the typed DTS material.
 */
export function replaceWithShapeMaterial(
  mat: MeshStandardMaterial | DTSMaterial,
  vis: number,
  options: {
    anisotropy?: number;
    emap?: boolean;
    skinUrl?: string;
    skinName?: string;
  } = {},
): ShapeMaterialResult {
  const resourcePath =
    mat instanceof DTSMaterial ? mat.resourcePath : undefined;
  const flagNames =
    mat instanceof DTSMaterial ? mat.flagNames : new Set<string>();
  const reflectionAmount =
    mat instanceof DTSMaterial ? (mat.source?.reflectionAmount ?? 1) : 1;

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

  // The DTS runtime assigns IFL frames as the loader decodes their textures.
  const emapEnabled = !!options.emap;
  const effectiveReflectionAmount = emapEnabled ? reflectionAmount : 0;

  if (flagNames.has("IflMaterial")) {
    const result = createMaterialFromFlags(
      mat,
      null,
      flagNames,
      vis,
      false,
      effectiveReflectionAmount,
    );
    return {
      material: result,
    };
  }

  // Torque reSkin: replace "base." prefix with "{skinName}." in the resource
  // path, then resolve to a URL. skinUrl takes precedence (pre-computed URL
  // for player custom skins from external sources). skinName does the
  // replacement locally (for flag team skins and other built-in skins).
  const isBaseTexture = /[/\\]base\./i.test(resourcePath);
  let skinTextureUrl: string | undefined;
  if (isBaseTexture && options.skinUrl) {
    skinTextureUrl = options.skinUrl;
  } else if (isBaseTexture && options.skinName && options.skinName !== "base") {
    const skinnedPath = resourcePath.replace(
      /\bbase\./i,
      `${options.skinName}.`,
    );
    try {
      skinTextureUrl = textureToUrl(skinnedPath, null);
    } catch {
      // Skin texture not found — fall through to default.
    }
  }
  const usingSkin = !!skinTextureUrl;
  const url = skinTextureUrl ?? textureToUrl(resourcePath);
  const texture = loadTextureInstance(
    url,
    usingSkin
      ? () => {
          // Skin failed (404) — load the default texture into the same object.
          const fallbackUrl = textureToUrl(resourcePath);
          loadTexture(fallbackUrl, (loaded) => {
            texture.image = loaded.image;
            texture.needsUpdate = true;
          });
        }
      : undefined,
  );
  setupTexture(texture, { anisotropy: options.anisotropy });

  configureDTSImageTexture(
    texture,
    mat instanceof DTSMaterial ? (mat.source?.flags ?? 0) : 0,
  );

  const result = createMaterialFromFlags(
    mat,
    texture,
    flagNames,
    vis,
    false,
    effectiveReflectionAmount,
  );
  // Only this sampler is instance-owned; IFL, cloak, and secondary maps are shared.
  result.addEventListener("dispose", () => texture.dispose());
  return { material: result };
}

/**
 * Post-process a cloned shape scene: hide collision/hull geometry, smooth
 * normals, and replace PBR materials with diffuse-only Lambert materials.
 */
export function processShapeScene(
  scene: Object3D,
  _shapeName?: string,
  options: {
    anisotropy?: number;
    emap?: boolean;
    skinUrl?: string;
    skinName?: string;
    /**
     * Render meshes in negative-size detail levels. Explosion shapes put
     * their meshes in a "Detail-1" level: Explosion::renderObject never
     * runs size-based detail selection, so detail 0 always renders.
     */
    ignoreDetailSize?: boolean;
  } = {},
): void {
  if (scene instanceof DTSShape)
    scene.ignoreDetailSize = !!options.ignoreDetailSize;

  observeShapeMeshes(scene, (node: any) => {
    if (!node.isMesh) return;

    // NoMaterial primitives contribute geometry for collision only.
    if (node.material?.name === "Unassigned") {
      node.visible = false;
      return;
    }
    const owner = getDTSObject(node);
    const defaultVis = owner?.opacity ?? 1;

    if (node.geometry && !isDTSMesh(node) && !isDTSMeshBatch(node))
      smoothVertexNormals(node.geometry);

    // Replace PBR materials with diffuse-only Lambert materials.
    // DTSObject owns visibility; hiding the mesh as well would prevent a
    // native visibility track from revealing an initially hidden object.
    const vis = defaultVis;
    const replace = (
      material: MeshStandardMaterial | DTSMaterial,
    ): Material => {
      const result = replaceWithShapeMaterial(material, vis, options);
      if (material instanceof DTSMaterial)
        applyDTSMaterialMaps(result.material, material);
      return result.material;
    };
    // Keep the material table aligned with the sorted mesh's primitive groups.
    // A single-material copy would paint every group with that texture.
    if (Array.isArray(node.material))
      node.material = node.material.map(replace);
    else if (node.material) node.material = replace(node.material);
  });
}

/**
 * Dispose instance-owned geometry, skeletons and materials. Material disposal
 * releases owned samplers while cached images and shared maps remain alive.
 */
export function disposeClonedScene(root: Object3D): void {
  root.traverse((node: any) => {
    if (node instanceof DTSMesh) node.disposeGeometry();
    if (node instanceof SkinnedMesh) node.skeleton?.dispose();
    // Do NOT dispose shared node.geometry: SkeletonUtils.clone shares
    // BufferGeometry with the loader cache and every other live instance
    // of the shape — disposing here frees the master's GPU buffers and
    // forces a re-upload for all survivors and future spawns. Materials
    // are created per-clone by processShapeScene, so they are ours to
    // dispose.
    if (node.material) {
      const mats: Material[] = Array.isArray(node.material)
        ? node.material
        : [node.material];
      for (const mat of mats) {
        mat.dispose();
      }
    }
  });
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

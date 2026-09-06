/**
 * How Tribes2.exe lights shapes (players, items, stations, vehicles):
 * never with the raw mission sun and never shadow-mapped. Before a
 * ShapeBase or Item draws, SceneObject::getLightingColor (FUN_0058fa80)
 * probes the world when the object has moved: from the centre of its render
 * world box it casts 100 m UP looking only for interiors. A hit means a
 * roof: it casts DOWN to the floor surface and takes the interior's
 * per-vertex lighting colour there (the .ml vertex colours, interpolated
 * across the hit triangle — the DIF lightmap texel at the floor is the
 * closest data the app has). With no roof it casts down to the terrain and
 * takes the terrain lightmap texel under the object. The colour is slewed
 * toward its new value over time so a doorway does not pop.
 *
 * installLights (FUN_0058f8a0) then feeds the GL lights: under a roof the
 * sun is switched off and a temporary light supplies ambient = colour × 0.7
 * and diffuse = colour × 0.3 from a fixed diagonal direction; on terrain
 * the sun stays, its diffuse scaled by clamp(avg(colour) − avg(sunAmbient))
 * (LightManager brightness, FUN_00573aa0), with the sun's ambient as GL
 * ambient. Point lights add colour × radius/d. All of it is gamma-space
 * numbers: clamp(ambient + diffuse·N·L) × texture, clamped.
 *
 * This module runs the probe per shape and hands the result to the shape
 * shader through per-shape uniforms; `glslShapeLighting` does the rest.
 */
import {
  Box3,
  Color,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import {
  castInteriorRay,
  interiorColliderVersion,
  type InteriorRayHit,
} from "./collision/worldCollision";
import { castTerrainRay, type Vec3 } from "./collision/terrainCollision";
import { getShapeBounds } from "./stream/shapeBounds";

/** How far the probe casts up (for a roof) and down (for the floor). */
export const SHAPE_LIGHT_PROBE_REACH = 100;
/** Under a roof: ambient share of the probed colour. */
export const SHAPE_LIGHT_INTERIOR_AMBIENT = 0.7;
/** Under a roof: diffuse share of the probed colour. */
export const SHAPE_LIGHT_INTERIOR_DIFFUSE = 0.3;
/** Colour slew per millisecond (0.01 × 0.2, FUN_0058fa80). */
export const SHAPE_LIGHT_SLEW_PER_MS = 0.01 * 0.2;
/** Torque-space direction the indoor light travels (DAT_009e4b4c). */
export const SHAPE_LIGHT_INTERIOR_DIRECTION: Vec3 = [
  0.57735, 0.57735, -0.57735,
];
/** A shape moving less than this since its last probe keeps its result. */
const PROBE_MOVE_EPSILON = 0.05;

/** 0: nothing below (sun at full brightness), 1: under a roof, 2: on terrain. */
export type ShapeLightMode = 0 | 1 | 2;

export interface ShapeLightUniforms {
  shapeLightMode: { value: ShapeLightMode };
  /** The probed colour, slewed (sRGB values). */
  shapeLightColor: { value: Color };
  /** Bounding-sphere radius: point lights reach the shape within radius + this. */
  shapeBoundRadius: { value: number };
}

/** Uniforms shared by every shape: the sun and the fixed indoor light. */
export const shapeSunUniforms = {
  shapeSunColor: { value: new Color(0.7, 0.7, 0.7) },
  shapeSunAmbient: { value: new Color(0.533, 0.533, 0.533) },
  /** Toward the light, view space; LightPool refreshes it each render. */
  shapeSunViewDir: { value: new Vector3(0, 1, 0) },
  shapeInteriorViewDir: { value: new Vector3(0, 1, 0) },
};

/** Toward the sun, Three world space (set by SceneLighting). */
export const shapeSunWorldDir = new Vector3(0, 1, 0);
/** Toward the indoor light, Three world space: −direction, Torque→Three. */
export const shapeInteriorWorldDir = new Vector3(
  -SHAPE_LIGHT_INTERIOR_DIRECTION[1],
  -SHAPE_LIGHT_INTERIOR_DIRECTION[2],
  -SHAPE_LIGHT_INTERIOR_DIRECTION[0],
);

export function setShapeSun(
  color: Color,
  ambient: Color,
  towardSunWorld: Vector3,
): void {
  shapeSunUniforms.shapeSunColor.value.copy(color);
  shapeSunUniforms.shapeSunAmbient.value.copy(ambient);
  shapeSunWorldDir.copy(towardSunWorld).normalize();
}

/** Materials compiled without a shape's own uniforms: sun, full brightness. */
export const defaultShapeLightUniforms: ShapeLightUniforms = {
  shapeLightMode: { value: 0 },
  shapeLightColor: { value: new Color(1, 1, 1) },
  shapeBoundRadius: { value: 1 },
};

// ── Terrain lighting samples ──

interface TerrainLightmap {
  /** NdotL × shadow per texel, 0–255, `size` texels per side. */
  ndotl: Uint8Array;
  size: number;
  squareSize: number;
  /** Torque-space position of texel (0, 0). */
  originX: number;
  originY: number;
  sunColor: Color;
  ambient: Color;
}

let terrainLightmap: TerrainLightmap | null = null;
let terrainLightmapVersion = 0;

/** TerrainBlock registers its generated lightmap here; null on unmount. */
export function setTerrainLightmap(data: TerrainLightmap | null): void {
  terrainLightmap = data;
  terrainLightmapVersion++;
}

/**
 * The engine's terrain lightmap texel is the full lighting,
 * clamp(ambient + NdotL·shadow × sun), at two texels per square
 * (round((pos − origin) / (squareSize/2)), wrapped).
 */
function sampleTerrainLighting(x: number, y: number, out: Color): boolean {
  const lm = terrainLightmap;
  if (!lm) return false;
  const half = lm.squareSize * 0.5;
  const mask = lm.size - 1;
  const col = Math.round((x - lm.originX) / half) & mask;
  const row = Math.round((y - lm.originY) / half) & mask;
  const ndotl = lm.ndotl[row * lm.size + col] / 255;
  out.r = Math.min(1, lm.ambient.r + ndotl * lm.sunColor.r);
  out.g = Math.min(1, lm.ambient.g + ndotl * lm.sunColor.g);
  out.b = Math.min(1, lm.ambient.b + ndotl * lm.sunColor.b);
  return true;
}

// ── Interior lightmap samples ──

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const pixelCache = new WeakMap<Texture, Pixels | null>();

function texturePixels(texture: Texture): Pixels | null {
  const cached = pixelCache.get(texture);
  if (cached !== undefined) return cached;
  const image = texture.image as
    { width: number; height: number; data?: Uint8ClampedArray } | undefined;
  let pixels: Pixels | null = null;
  if (image && image.width > 0 && image.height > 0) {
    if (image.data) {
      pixels = { data: image.data, width: image.width, height: image.height };
    } else if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(image as unknown as CanvasImageSource, 0, 0);
        const { data } = ctx.getImageData(0, 0, image.width, image.height);
        pixels = { data, width: image.width, height: image.height };
      }
    }
  }
  // An image that has not arrived yet is retried; a failed readback is not.
  if (image && image.width > 0) pixelCache.set(texture, pixels);
  return pixels;
}

function faceMaterialIndex(
  geometry: BufferGeometry,
  faceIndex: number,
): number {
  const first = faceIndex * 3;
  for (const group of geometry.groups) {
    if (first >= group.start && first < group.start + group.count) {
      return group.materialIndex ?? 0;
    }
  }
  return 0;
}

/**
 * The lightmap for a face: the DIF export's lightmaps that InteriorMesh
 * stores on the geometry (`userData.lightMaps`, per material slot), else
 * the current material's own lightmap or emissive map.
 */
function faceLightmap(mesh: Mesh, materialIndex: number): Texture | null {
  const stored = mesh.geometry.userData.lightMaps as
    (Texture | null)[] | undefined;
  if (stored) return stored[materialIndex] ?? null;
  const material = (
    Array.isArray(mesh.material) ? mesh.material[materialIndex] : mesh.material
  ) as
    | (Material & { emissiveMap?: Texture | null; lightMap?: Texture | null })
    | undefined;
  return material?.lightMap ?? material?.emissiveMap ?? null;
}

/**
 * Whether a face is SurfaceOutsideVisible: its baked lightmap holds only
 * the interior's own lights, and the mission's sun and ambient are added
 * when the scene is lit (the .ml pass), exactly as injectInteriorLighting
 * draws it.
 */
function faceOutsideVisible(mesh: Mesh, materialIndex: number): boolean {
  const flags = mesh.geometry.userData.outsideVisible as boolean[] | undefined;
  return flags?.[materialIndex] ?? false;
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _v0 = new Vector3();
const _v1 = new Vector3();
const _v2 = new Vector3();

/** Barycentric weights of `p` in triangle (a, b, c), written to `out`. */
function barycentric(
  p: Vector3,
  a: Vector3,
  b: Vector3,
  c: Vector3,
  out: [number, number, number],
): void {
  _v0.subVectors(b, a);
  _v1.subVectors(c, a);
  _v2.subVectors(p, a);
  const d00 = _v0.dot(_v0);
  const d01 = _v0.dot(_v1);
  const d11 = _v1.dot(_v1);
  const d20 = _v2.dot(_v0);
  const d21 = _v2.dot(_v1);
  const denom = d00 * d11 - d01 * d01;
  if (Math.abs(denom) < 1e-12) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  out[0] = 1 - v - w;
  out[1] = v;
  out[2] = w;
}

const _weights: [number, number, number] = [0, 0, 0];
const _faceNormal = new Vector3();

/**
 * The interior lightmap colour at a ray hit: the hit triangle's lightmap
 * UVs (glTF TEXCOORD_1) interpolated at the hit point, sampled bilinearly
 * from the lightmap the DIF export put in the material's emissive slot.
 */
export function sampleInteriorLightmap(
  hit: InteriorRayHit,
  out: Color,
): boolean {
  const mesh = hit.collider.mesh;
  const geometry: BufferGeometry = mesh.geometry;
  // Lightmap UVs are the DIF export's TEXCOORD_1; base UVs would sample
  // the wrong place, so a mesh without them has no lightmap to give.
  const uv = geometry.attributes.uv1;
  const position = geometry.attributes.position;
  if (!uv || !position) return false;
  const materialIndex = faceMaterialIndex(geometry, hit.faceIndex);
  const lightmap = faceLightmap(mesh, materialIndex);
  if (!lightmap) return false;
  const pixels = texturePixels(lightmap);
  if (!pixels) return false;
  const index = geometry.index;
  const i0 = index ? index.getX(hit.faceIndex * 3) : hit.faceIndex * 3;
  const i1 = index ? index.getX(hit.faceIndex * 3 + 1) : hit.faceIndex * 3 + 1;
  const i2 = index ? index.getX(hit.faceIndex * 3 + 2) : hit.faceIndex * 3 + 2;
  _a.fromBufferAttribute(position, i0);
  _b.fromBufferAttribute(position, i1);
  _c.fromBufferAttribute(position, i2);
  barycentric(hit.localPoint, _a, _b, _c, _weights);
  const u =
    uv.getX(i0) * _weights[0] +
    uv.getX(i1) * _weights[1] +
    uv.getX(i2) * _weights[2];
  const v =
    uv.getY(i0) * _weights[0] +
    uv.getY(i1) * _weights[1] +
    uv.getY(i2) * _weights[2];
  // glTF UVs have their origin at the image's top-left, so v maps straight
  // onto rows. Bilinear, wrapping.
  const fx = (u - Math.floor(u)) * pixels.width - 0.5;
  const fy = (v - Math.floor(v)) * pixels.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const wrapX = (x: number) =>
    ((x % pixels.width) + pixels.width) % pixels.width;
  const wrapY = (y: number) =>
    ((y % pixels.height) + pixels.height) % pixels.height;
  const xa = wrapX(x0);
  const xb = wrapX(x0 + 1);
  const ya = wrapY(y0);
  const yb = wrapY(y0 + 1);
  const { data, width } = pixels;
  for (let channel = 0; channel < 3; channel++) {
    const p00 = data[(ya * width + xa) * 4 + channel];
    const p10 = data[(ya * width + xb) * 4 + channel];
    const p01 = data[(yb * width + xa) * 4 + channel];
    const p11 = data[(yb * width + xb) * 4 + channel];
    const value =
      (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
    if (channel === 0) out.r = value / 255;
    else if (channel === 1) out.g = value / 255;
    else out.b = value / 255;
  }
  if (faceOutsideVisible(mesh, materialIndex)) {
    // Scene lighting for outside surfaces: clamp(sun·N·L + ambient), added
    // to the lightmap and clamped again (sceneLighting.cc, as the interior
    // shader does per fragment). N is the face's world normal.
    _faceNormal
      .crossVectors(_v0.subVectors(_b, _a), _v1.subVectors(_c, _a))
      .applyMatrix3(hit.collider.normalMatrix)
      .normalize();
    const nDotL = Math.max(_faceNormal.dot(shapeSunWorldDir), 0);
    const sun = shapeSunUniforms.shapeSunColor.value;
    const ambient = shapeSunUniforms.shapeSunAmbient.value;
    out.r = Math.min(1, out.r + Math.min(1, sun.r * nDotL + ambient.r));
    out.g = Math.min(1, out.g + Math.min(1, sun.g * nDotL + ambient.g));
    out.b = Math.min(1, out.b + Math.min(1, sun.b * nDotL + ambient.b));
  }
  return true;
}

// ── The probe ──

export interface ShapeLightProbe {
  mode: ShapeLightMode;
  color: Color;
}

/**
 * The engine's getLightingColor for a shape whose render box centre is at
 * `center` (Torque space). A roof with no interior floor beneath leaves the
 * previous result standing, as the engine leaves its stored colour; nothing
 * below at all means the sun at full brightness.
 */
export function probeShapeLighting(center: Vec3, out: ShapeLightProbe): void {
  const [x, y, z] = center;
  const roof = castInteriorRay(center, [x, y, z + SHAPE_LIGHT_PROBE_REACH]);
  if (roof) {
    const floor = castInteriorRay(center, [x, y, z - SHAPE_LIGHT_PROBE_REACH]);
    if (!floor) return;
    // Interiors without lighting data light shapes white (FUN_0058fa80).
    if (!sampleInteriorLightmap(floor, out.color)) out.color.setRGB(1, 1, 1);
    out.mode = 1;
    return;
  }
  const ground = castTerrainRay(center, [x, y, z - SHAPE_LIGHT_PROBE_REACH]);
  if (
    ground &&
    sampleTerrainLighting(ground.point[0], ground.point[1], out.color)
  ) {
    out.mode = 2;
    return;
  }
  out.mode = 0;
}

// ── Per-shape state ──

/**
 * The shape's box in the GLB's frame. The converter writes GLB axes as
 * (−x, z, y) of DTS object space, so the engine's box (TSShape::bounds,
 * mObjBox) maps the same way; the mesh box is the fallback for shapes
 * converted without the header extras.
 */
export function shapeBox(shapeName: string | undefined, scene: Object3D): Box3 {
  const bounds = getShapeBounds(shapeName);
  if (!bounds) return new Box3().setFromObject(scene);
  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  return new Box3(new Vector3(-x1, z0, y0), new Vector3(-x0, z1, y1));
}

/** The engine's box centre, in the GLB's frame (see shapeBox). */
export function shapeBoxCenter(
  shapeName: string | undefined,
  scene: Object3D,
): Vector3 {
  return shapeBox(shapeName, scene).getCenter(new Vector3());
}

export interface ShapeLightState {
  uniforms: ShapeLightUniforms;
  root: Object3D;
  /** Root-local box centre (the probe origin). */
  center: Vector3;
  target: ShapeLightProbe;
  /** Whether a slew is in progress (the engine's +0x7c flag). */
  slewing: boolean;
  lastProbe: Vector3 | null;
  /** The world the last probe saw: interior and terrain versions. */
  lastInteriors: number;
  lastTerrain: number;
}

const _world = new Vector3();
const _torque: Vec3 = [0, 0, 0];

/** Give every material under `root` this shape's uniforms (see shapeMaterial). */
export function attachShapeLightUniforms(
  root: Object3D,
  uniforms: ShapeLightUniforms,
): void {
  root.traverse((node) => {
    const material = (node as Mesh).material;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      m.userData.shapeLight = uniforms;
    }
  });
}

export function createShapeLightState(
  root: Object3D,
  shapeName: string | undefined,
): ShapeLightState {
  const box = shapeBox(shapeName, root);
  const uniforms: ShapeLightUniforms = {
    shapeLightMode: { value: 0 },
    shapeLightColor: { value: new Color(1, 1, 1) },
    shapeBoundRadius: { value: box.getSize(new Vector3()).length() * 0.5 },
  };
  attachShapeLightUniforms(root, uniforms);
  return {
    uniforms,
    root,
    center: box.getCenter(new Vector3()),
    target: { mode: 0, color: new Color(1, 1, 1) },
    slewing: false,
    lastProbe: null,
    lastInteriors: -1,
    lastTerrain: -1,
  };
}

function slewChannel(current: number, target: number, step: number): number {
  if (current < target) return Math.min(Math.min(current + step, target), 1);
  if (current > target) return Math.max(Math.max(current - step, target), 0);
  return current;
}

/**
 * Per frame: re-probe when the shape moved (or the world changed under
 * it), then slew the uniform colour toward the probe's colour at the
 * engine's rate — except from "nothing below", where the engine has no
 * previous colour and snaps.
 */
export function updateShapeLighting(
  state: ShapeLightState,
  dtMs: number,
): void {
  _world.copy(state.center).applyMatrix4(state.root.matrixWorld);
  const interiors = interiorColliderVersion();
  const moved =
    !state.lastProbe ||
    state.lastProbe.distanceToSquared(_world) > PROBE_MOVE_EPSILON ** 2;
  if (
    moved ||
    interiors !== state.lastInteriors ||
    terrainLightmapVersion !== state.lastTerrain
  ) {
    _torque[0] = _world.z;
    _torque[1] = _world.x;
    _torque[2] = _world.y;
    probeShapeLighting(_torque, state.target);
    state.lastProbe = (state.lastProbe ?? new Vector3()).copy(_world);
    state.lastInteriors = interiors;
    state.lastTerrain = terrainLightmapVersion;
  }
  const { uniforms, target } = state;
  uniforms.shapeLightMode.value = target.mode;
  if (target.mode === 0) {
    state.slewing = false;
    return;
  }
  const color = uniforms.shapeLightColor.value;
  if (!state.slewing) {
    color.copy(target.color);
    state.slewing = true;
    return;
  }
  const step = SHAPE_LIGHT_SLEW_PER_MS * dtMs;
  color.r = slewChannel(color.r, target.color.r, step);
  color.g = slewChannel(color.g, target.color.g, step);
  color.b = slewChannel(color.b, target.color.b, step);
}

// ── GLSL ──

/**
 * Gamma-space shape lighting for a Lambert fragment: the engine's GL light
 * set for this object (indoor split or brightness-scaled sun) plus the
 * pooled point lights at radius/d, clamped, then multiplied into the sRGB
 * texture. Declares the per-shape and shared uniforms; needs the
 * effect-light uniform arrays (glslEffectLightsPars) in scope.
 */
export const glslShapeLightingPars = `
uniform int shapeLightMode;
uniform vec3 shapeLightColor;
uniform float shapeBoundRadius;
uniform vec3 shapeSunColor;
uniform vec3 shapeSunAmbient;
uniform vec3 shapeSunViewDir;
uniform vec3 shapeInteriorViewDir;

vec3 shapeLightingSRGB(vec3 n, vec3 viewPosition) {
  vec3 lighting;
  if (shapeLightMode == 1) {
    lighting = shapeLightColor * ${SHAPE_LIGHT_INTERIOR_AMBIENT}
      + shapeLightColor * ${SHAPE_LIGHT_INTERIOR_DIFFUSE} * max(dot(n, shapeInteriorViewDir), 0.0);
  } else {
    float brightness = shapeLightMode == 2
      ? clamp((shapeLightColor.r + shapeLightColor.g + shapeLightColor.b) / 3.0, 0.0, 1.0)
      : 1.0;
    float ambientAverage = (shapeSunAmbient.r + shapeSunAmbient.g + shapeSunAmbient.b) / 3.0;
    vec3 diffuse = shapeSunColor * clamp(brightness - ambientAverage, 0.0, 1.0);
    lighting = shapeSunAmbient + diffuse * max(dot(n, shapeSunViewDir), 0.0);
  }
  for (int i = 0; i < EFFECT_LIGHT_COUNT; i++) {
    float radius = effectLightRadius[i];
    if (radius <= 0.0) continue;
    vec3 toLight = effectLightViewPosition[i] - viewPosition;
    float dist = length(toLight);
    if (dist > radius + shapeBoundRadius) continue;
    lighting += effectLightColor[i] * (radius / max(dist, 1e-3)) * max(dot(n, toLight / max(dist, 1e-3)), 0.0);
  }
  return clamp(lighting, 0.0, 1.0);
}
`;

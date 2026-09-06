import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PositionalAudio,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  Uint16BufferAttribute,
  UnsignedByteType,
  Vector3,
  NoColorSpace,
  SRGBColorSpace,
} from "three";
import { audioToUrl, textureToUrl } from "../loaders";
import { loadTexture } from "../textureUtils";
import { setupEffectTexture } from "../stream/playbackUtils";
import {
  EmitterInstance,
  resolveEmitterData,
} from "../particles/ParticleSystem";
import {
  particleVertexShader,
  particleFragmentShader,
} from "../particles/shaders";
import type { EmitterDataResolved } from "../particles/types";
import type { StreamSnapshot, StreamingPlayback } from "../stream/types";
import { createLogger } from "../logger";

const log = createLogger("ParticleEffects");
import { useDebug, useSettings } from "./SettingsProvider";
import { useAudio } from "./AudioContext";
import {
  resolveAudioProfile,
  playOneShotSound,
  createPositionalAudio,
  getCachedAudioBuffer,
  getSoundGeneration,
  trackSound,
  stopAndDetachSound,
} from "./AudioEmitter";
import { effectNow, engineStore } from "../state/engineStore";
import { getEffectiveSoundRate } from "./AudioEmitter";

// ── Constants ──

const MAX_PARTICLES_PER_EMITTER = 256;
const QUAD_CORNERS = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
]);

// ── Texture cache ──

const _textureCache = new Map<string, Texture>();
/** Set of textures whose image data has finished loading. */
const _texturesReady = new Set<Texture>();

/** 1×1 white placeholder so particles are visible before async textures load. */
const _placeholderTexture = new DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
  RGBAFormat,
  UnsignedByteType,
);
_placeholderTexture.needsUpdate = true;

function getParticleTexture(textureName: string): Texture {
  if (!textureName) return _placeholderTexture;
  const cached = _textureCache.get(textureName);
  if (cached) return cached;
  try {
    const url = textureToUrl(textureName);
    const tex = loadTexture(url, (t) => {
      setupEffectTexture(t, NoColorSpace);
      _texturesReady.add(t);
    });
    setupEffectTexture(tex, NoColorSpace);
    _textureCache.set(textureName, tex);
    return tex;
  } catch {
    return _placeholderTexture;
  }
}

// ── Debug geometry (reusable) ──

// Per-frame scratch collections, cleared and refilled each frame to avoid
// Set/Map allocation churn in the useFrame hot loop.
const _currentEntityIds = new Set<string>();
const _entitiesById = new Map<string, StreamSnapshot["entities"][number]>();

const _debugOriginGeo = new SphereGeometry(1, 6, 6);
const _debugOriginMat = new MeshBasicMaterial({
  color: 0xff0000,
  wireframe: true,
});
const _debugParticleGeo = new BoxGeometry(0.3, 0.3, 0.3);
const _debugParticleMat = new MeshBasicMaterial({
  color: 0x00ff00,
  wireframe: true,
});

// ── Explosion wireframe sphere geometry (reusable) ──

const _explosionSphereGeo = new SphereGeometry(1, 12, 8);

interface ActiveExplosionSphere {
  entityId: string;
  mesh: Mesh;
  material: MeshBasicMaterial;
  label: Sprite;
  labelMaterial: SpriteMaterial;
  creationTime: number;
  lifetimeMS: number;
  targetRadius: number;
}

/** Create a text label sprite for an explosion sphere. */
function createExplosionLabel(
  text: string,
  color: number,
): { sprite: Sprite; material: SpriteMaterial } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontSize = 32;
  ctx.font = `bold ${fontSize}px monospace`;
  const metrics = ctx.measureText(text);
  const padding = 8;
  canvas.width = Math.ceil(metrics.width) + padding * 2;
  canvas.height = fontSize + padding * 2;

  // Redraw with correct canvas size.
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, padding, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  // Scale to be readable in world space (roughly 1 unit tall).
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(aspect * 2, 2, 1);
  return { sprite, material };
}

// ── Shockwave ring rendering ──

interface ShockwaveData {
  width: number;
  numSegments: number;
  velocity: number;
  height: number;
  verticalCurve: number;
  acceleration: number;
  texWrap: number;
  lifetimeMS: number;
  is2D: boolean;
  renderSquare: boolean;
  renderBottom: boolean;
  mapToTerrain: boolean;
  colors: { r: number; g: number; b: number; a: number }[];
  times: number[];
  textureName: string;
  mapToTexture: string;
}

interface ActiveShockwave {
  entityId: string;
  mesh: Mesh;
  bottomMesh: Mesh | null;
  geometry: BufferGeometry;
  bottomGeometry: BufferGeometry | null;
  material: ShaderMaterial;
  creationTime: number;
  lifetimeMS: number;
  data: ShockwaveData;
  radius: number;
  velocity: number;
}

/** Resolve a ShockwaveData datablock from an explosion's shockwave ref. */
function resolveShockwaveData(
  shockwaveId: number,
  getDataBlockData: (id: number) => Record<string, unknown> | undefined,
): ShockwaveData | null {
  const raw = getDataBlockData(shockwaveId);
  if (!raw) return null;

  const colors = (raw.colors as ShockwaveData["colors"]) ?? [];
  const times = (raw.times as number[]) ?? [0, 0.5, 1, 1];

  return {
    width: (raw.width as number) ?? 1,
    numSegments: Math.max((raw.numSegments as number) ?? 16, 4),
    velocity: (raw.velocity as number) ?? 0,
    height: (raw.height as number) ?? 0,
    verticalCurve: (raw.verticalCurve as number) ?? 0,
    acceleration: (raw.acceleration as number) ?? 0,
    texWrap: (raw.texWrap as number) ?? 1,
    lifetimeMS: (raw.lifetimeMS as number) ?? 500,
    is2D: !!raw.is2D,
    renderSquare: !!raw.renderSquare,
    renderBottom: !!raw.renderBottom,
    mapToTerrain: !!raw.mapToTerrain,
    colors,
    times,
    textureName: (raw.textureName as string) ?? "",
    mapToTexture: (raw.mapToTexture as string) ?? "",
  };
}

/** Interpolate RGBA color from shockwave keyframes at normalized time t. */
function interpolateShockwaveColor(
  data: ShockwaveData,
  t: number,
): [number, number, number, number] {
  const { colors, times } = data;
  if (colors.length === 0) return [1, 1, 1, 1];

  // Find the active keyframe segment.
  let idx = 0;
  for (let i = 0; i < times.length - 1; i++) {
    if (t >= times[i]) idx = i;
  }
  const nextIdx = Math.min(idx + 1, colors.length - 1);

  const t0 = times[idx] ?? 0;
  const t1 = times[nextIdx] ?? 1;
  const span = t1 - t0;
  const frac = span > 0 ? Math.min((t - t0) / span, 1) : 0;

  const c0 = colors[idx] ?? colors[0];
  const c1 = colors[nextIdx] ?? colors[0];

  return [
    c0.r + (c1.r - c0.r) * frac,
    c0.g + (c1.g - c0.g) * frac,
    c0.b + (c1.b - c0.b) * frac,
    c0.a + (c1.a - c0.a) * frac,
  ];
}

// Shockwave ring shader — additive blending, vertex colors with alpha.
const shockwaveVertexShader = /* glsl */ `
  attribute vec4 vertexColor;
  attribute vec2 texCoord;
  varying vec4 vColor;
  varying vec2 vUV;
  void main() {
    vColor = vertexColor;
    vUV = texCoord;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const shockwaveFragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  varying vec4 vColor;
  varying vec2 vUV;
  void main() {
    vec4 tex = texture2D(uTexture, vUV);
    gl_FragColor = vec4(vColor.rgb * tex.rgb, vColor.a * tex.a);
  }
`;

/**
 * Create ring geometry buffers for a shockwave with the given segment count.
 * Each segment is a quad (2 triangles) between inner and outer ring vertices.
 * Returns the geometry with position, texCoord, vertexColor attributes and
 * index buffer pre-allocated for numSegments quads.
 */
function createShockwaveGeometry(numSegments: number): BufferGeometry {
  // 2 vertices per segment (inner + outer) + 2 to close the loop.
  const numVerts = (numSegments + 1) * 2;
  const positions = new Float32Array(numVerts * 3);
  const texCoords = new Float32Array(numVerts * 2);
  const vertexColors = new Float32Array(numVerts * 4);

  // 2 triangles per segment = 6 indices.
  const numIndices = numSegments * 6;
  const indices = new Uint16Array(numIndices);

  for (let i = 0; i < numSegments; i++) {
    const base = i * 2;
    const j = i * 6;
    // Outer-inner-outer, inner-inner-outer (CCW winding).
    indices[j] = base;
    indices[j + 1] = base + 1;
    indices[j + 2] = base + 2;
    indices[j + 3] = base + 1;
    indices[j + 4] = base + 3;
    indices[j + 5] = base + 2;
  }

  const geo = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  posAttr.setUsage(35048); // DynamicDrawUsage
  geo.setAttribute("position", posAttr);

  const texAttr = new BufferAttribute(texCoords, 2);
  texAttr.setUsage(35048);
  geo.setAttribute("texCoord", texAttr);

  const colorAttr = new BufferAttribute(vertexColors, 4);
  colorAttr.setUsage(35048);
  geo.setAttribute("vertexColor", colorAttr);

  geo.setIndex(new BufferAttribute(indices, 1));

  return geo;
}

/**
 * Update shockwave ring vertex positions, UVs, and colors for the current
 * frame. Implements the V12 renderWave algorithm: an expanding annular ring
 * with optional height on the outer edge.
 */
function updateShockwaveGeometry(
  geo: BufferGeometry,
  sw: ShockwaveData,
  radius: number,
  color: [number, number, number, number],
  is2D: boolean,
): void {
  const posArr = (geo.getAttribute("position") as BufferAttribute)
    .array as Float32Array;
  const texArr = (geo.getAttribute("texCoord") as BufferAttribute)
    .array as Float32Array;
  const colArr = (geo.getAttribute("vertexColor") as BufferAttribute)
    .array as Float32Array;

  const innerRad = Math.max(radius - sw.width * 0.5, 0);
  const outerRad = radius + sw.width * 0.5;
  const numSegs = sw.numSegments;

  // Pass colors as-is (gamma space) — ShaderMaterial has no automatic
  // output encoding, matching V12's direct gamma-space rendering.
  const lr = color[0];
  const lg = color[1];
  const lb = color[2];
  const la = color[3];

  for (let i = 0; i <= numSegs; i++) {
    const angle = (i / numSegs) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // In Three.js space: ring lies in XZ plane, Y is up.
    const outerIdx = i * 2;
    const innerIdx = outerIdx + 1;

    // Outer vertex — raised by height along Y.
    const opi = outerIdx * 3;
    posArr[opi] = cos * outerRad;
    posArr[opi + 1] = is2D ? 0 : sw.height;
    posArr[opi + 2] = sin * outerRad;

    // Inner vertex — on ground plane.
    const ipi = innerIdx * 3;
    posArr[ipi] = cos * innerRad;
    posArr[ipi + 1] = 0;
    posArr[ipi + 2] = sin * innerRad;

    // UV: U wraps around ring, V spans inner→outer.
    const u = (i / numSegs) * sw.texWrap;
    const oti = outerIdx * 2;
    texArr[oti] = u;
    texArr[oti + 1] = 0.05; // outer edge

    const iti = innerIdx * 2;
    texArr[iti] = u;
    texArr[iti + 1] = 0.95; // inner edge

    // Vertex colors (uniform across ring).
    const oci = outerIdx * 4;
    colArr[oci] = lr;
    colArr[oci + 1] = lg;
    colArr[oci + 2] = lb;
    colArr[oci + 3] = la;

    const ici = innerIdx * 4;
    colArr[ici] = lr;
    colArr[ici + 1] = lg;
    colArr[ici + 2] = lb;
    colArr[ici + 3] = la;
  }

  geo.getAttribute("position").needsUpdate = true;
  geo.getAttribute("texCoord").needsUpdate = true;
  geo.getAttribute("vertexColor").needsUpdate = true;
  geo.computeBoundingSphere();
}

/** Create the ShaderMaterial for a shockwave ring. */
function createShockwaveMaterial(texture: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: shockwaveVertexShader,
    fragmentShader: shockwaveFragmentShader,
    uniforms: { uTexture: { value: texture } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

/** Map explosion dataBlock shape name to a debug wireframe color. */
function getExplosionColor(dataBlock: string | undefined): number {
  if (!dataBlock) return 0xff00ff;
  const name = dataBlock.toLowerCase();
  if (name.includes("disc")) return 0x4488ff;
  if (name.includes("grenade")) return 0xff8800;
  if (name.includes("mortar")) return 0xff4400;
  if (name.includes("plasma")) return 0x44ff44;
  if (name.includes("laser")) return 0xff2222;
  if (name.includes("blaster")) return 0xffff00;
  if (name.includes("missile")) return 0xff6600;
  if (name.includes("bomb")) return 0xff0000;
  if (name.includes("mine")) return 0xff8844;
  if (name.includes("concussion")) return 0xffaa00;
  if (name.includes("shocklance")) return 0x8844ff;
  if (name.includes("chaingun") || name.includes("bullet")) return 0xcccccc;
  return 0xff00ff;
}

/**
 * Extract approximate radius from an ExplosionData datablock's `sizes` array.
 * Each entry is `{x, y, z}` with values in range 0–16000 (scale multiplier).
 * Falls back to `particleRadius` or a default of 5.
 */
function getExplosionRadius(expBlock: Record<string, unknown>): number {
  const sizes = expBlock.sizes as
    Array<{ x: number; y: number; z: number }> | undefined;
  if (Array.isArray(sizes) && sizes.length > 0) {
    let maxVal = 0;
    for (const s of sizes) {
      maxVal = Math.max(maxVal, s.x, s.y, s.z);
    }
    if (maxVal > 0) {
      // Values are in 0–16000 range, treat as a scale factor.
      // Typical explosions have values like 2000–8000; map to reasonable world radii.
      return maxVal / 1000;
    }
  }
  const particleRadius = expBlock.particleRadius as number | undefined;
  if (typeof particleRadius === "number" && particleRadius > 0) {
    return particleRadius;
  }
  return 5;
}

// ── Geometry builder ──

function createParticleGeometry(maxParticles: number): BufferGeometry {
  const geo = new BufferGeometry();
  const vertCount = maxParticles * 4;
  const indexCount = maxParticles * 6;

  // Per-vertex quad corner offsets.
  const corners = new Float32Array(vertCount * 2);
  for (let i = 0; i < maxParticles; i++) {
    corners.set(QUAD_CORNERS, i * 8);
  }

  // Index buffer.
  const indices = new Uint16Array(indexCount);
  for (let i = 0; i < maxParticles; i++) {
    const vBase = i * 4;
    const iBase = i * 6;
    indices[iBase] = vBase;
    indices[iBase + 1] = vBase + 1;
    indices[iBase + 2] = vBase + 2;
    indices[iBase + 3] = vBase;
    indices[iBase + 4] = vBase + 2;
    indices[iBase + 5] = vBase + 3;
  }

  // Per-particle attributes (4 verts share the same value).
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 4);
  const sizes = new Float32Array(vertCount);
  const spins = new Float32Array(vertCount);
  const orientDirs = new Float32Array(vertCount * 3);

  geo.setIndex(new Uint16BufferAttribute(indices, 1));
  geo.setAttribute("quadCorner", new Float32BufferAttribute(corners, 2));
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("particleColor", new Float32BufferAttribute(colors, 4));
  geo.setAttribute("particleSize", new Float32BufferAttribute(sizes, 1));
  geo.setAttribute("particleSpin", new Float32BufferAttribute(spins, 1));
  geo.setAttribute("orientDir", new Float32BufferAttribute(orientDirs, 3));

  geo.setDrawRange(0, 0);
  return geo;
}

function createParticleMaterial(
  texture: Texture,
  useInvAlpha: boolean,
  orientParticles = false,
): ShaderMaterial {
  // Use the placeholder until the real texture's image data is ready.
  const ready = _texturesReady.has(texture);
  return new ShaderMaterial({
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    uniforms: {
      particleTexture: { value: ready ? texture : _placeholderTexture },
      hasTexture: { value: true },
      debugOpacity: { value: 1.0 },
      uOrientParticles: { value: orientParticles },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: useInvAlpha ? NormalBlending : AdditiveBlending,
  });
}

// ── Per-emitter rendering state ──

interface ActiveEmitter {
  emitter: EmitterInstance;
  mesh: Mesh;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  /** The intended texture (may still be loading). */
  targetTexture: Texture;
  /** Current emission point (Torque space). */
  origin: [number, number, number];
  /** Emission point last frame; trails spawn along prevOrigin→origin. */
  prevOrigin?: [number, number, number];
  /** Driver velocity (Torque space) for inheritedVelFactor. */
  emitVelocity?: [number, number, number];
  isBurst: boolean;
  /** Whether shader compilation has been verified. */
  shaderChecked?: boolean;
  /** Particle count uploaded last frame (bounds partial buffer uploads). */
  prevCount?: number;
  /** Entity whose lifetime bounds emission: a trail's projectile or a
   *  streaming emitter's explosion. Emission stops once it leaves the scene. */
  driverEntityId?: string;
  /** Trails: origin and axis track the driver each frame. */
  followsDriver?: boolean;
  /** Emission axis in Torque space (defaults to [0,0,1] = up). */
  emitAxis?: [number, number, number];
  /** Debug: origin marker mesh. */
  debugOriginMesh?: Mesh;
  /** Debug: particle marker meshes. */
  debugParticleMeshes?: Mesh[];
}

/** Check if a ShaderMaterial compiled successfully. Must call after first render. */
function checkShaderCompilation(
  renderer: import("three").WebGLRenderer,
  material: ShaderMaterial,
  label: string,
): void {
  const props = renderer.properties.get(material) as {
    currentProgram?: { program: WebGLProgram };
  };
  const program = props.currentProgram;
  if (!program) return; // Not yet compiled.
  const glProgram = program!.program;
  const glContext = renderer.getContext();
  if (!glContext.getProgramParameter(glProgram, glContext.LINK_STATUS)) {
    log.error(
      "Shader LINK ERROR (%s): %s",
      label,
      glContext.getProgramInfoLog(glProgram),
    );
  }
}

// ── Explosion resolution ──

interface ResolvedExplosion {
  burstEmitters: Array<{ data: EmitterDataResolved; density: number }>;
  streamingEmitters: EmitterDataResolved[];
}

function resolveExplosion(
  explosionDataBlockId: number,
  getDataBlockData: (id: number) => Record<string, unknown> | undefined,
): ResolvedExplosion | null {
  const expBlock = getDataBlockData(explosionDataBlockId);
  if (!expBlock) return null;

  const burstEmitters: ResolvedExplosion["burstEmitters"] = [];
  const streamingEmitters: EmitterDataResolved[] = [];

  // Burst emitter: particleEmitter + particleDensity.
  const particleEmitterId = expBlock.particleEmitter as number | null;
  if (typeof particleEmitterId === "number") {
    const emitterRaw = getDataBlockData(particleEmitterId);
    if (emitterRaw) {
      const resolved = resolveEmitterData(emitterRaw, getDataBlockData);
      if (resolved) {
        const density = (expBlock.particleDensity as number) ?? 10;
        burstEmitters.push({ data: resolved, density });
      }
    }
  }

  // Streaming emitters: emitters[0..3].
  const emitterRefs = expBlock.emitters as (number | null)[] | undefined;
  if (Array.isArray(emitterRefs)) {
    for (const ref of emitterRefs) {
      if (typeof ref !== "number") continue;
      const emitterRaw = getDataBlockData(ref);
      if (!emitterRaw) continue;
      const resolved = resolveEmitterData(emitterRaw, getDataBlockData);
      if (resolved) {
        streamingEmitters.push(resolved);
      }
    }
  }

  if (burstEmitters.length === 0 && streamingEmitters.length === 0) {
    return null;
  }

  return { burstEmitters, streamingEmitters };
}

// ── Update GPU buffers from particle state ──

function syncBuffers(active: ActiveEmitter): void {
  const particles = active.emitter.particles;
  const geo = active.geometry;
  const posAttr = geo.getAttribute("position") as Float32BufferAttribute;
  const colorAttr = geo.getAttribute("particleColor") as Float32BufferAttribute;
  const sizeAttr = geo.getAttribute("particleSize") as Float32BufferAttribute;
  const spinAttr = geo.getAttribute("particleSpin") as Float32BufferAttribute;
  const orientAttr = geo.getAttribute("orientDir") as Float32BufferAttribute;

  const posArr = posAttr.array as Float32Array;
  const colArr = colorAttr.array as Float32Array;
  const sizeArr = sizeAttr.array as Float32Array;
  const spinArr = spinAttr.array as Float32Array;
  const orientArr = orientAttr.array as Float32Array;

  const count = Math.min(particles.length, MAX_PARTICLES_PER_EMITTER);
  const useVelocity = active.emitter.data.orientOnVelocity;

  for (let i = 0; i < count; i++) {
    const p = particles[i];

    // Swizzle Torque [x,y,z] → Three.js [y,z,x].
    const tx = p.pos[1];
    const ty = p.pos[2];
    const tz = p.pos[0];

    // Orient direction: use velocity or initial orientDir, swizzled.
    const dir = useVelocity ? p.vel : p.orientDir;
    const odx = dir[1];
    const ody = dir[2];
    const odz = dir[0];

    // Pass particle colors as-is (sRGB / gamma space). ShaderMaterial does
    // not get automatic linear→sRGB output encoding, so linearizing here
    // would darken colors without compensation — matching V12's direct
    // gamma-space rendering.
    const lr = p.r;
    const lg = p.g;
    const lb = p.b;
    const la = p.a;

    // Write the same values to all 4 vertices of the quad.
    for (let v = 0; v < 4; v++) {
      const vi = i * 4 + v;
      const pi = vi * 3;
      posArr[pi] = tx;
      posArr[pi + 1] = ty;
      posArr[pi + 2] = tz;

      const ci = vi * 4;
      colArr[ci] = lr;
      colArr[ci + 1] = lg;
      colArr[ci + 2] = lb;
      colArr[ci + 3] = la;

      const oi = vi * 3;
      orientArr[oi] = odx;
      orientArr[oi + 1] = ody;
      orientArr[oi + 2] = odz;

      sizeArr[vi] = p.size;
      spinArr[vi] = p.currentSpin;
    }
  }

  // Zero out sizes for quads that were live last frame but aren't now, so
  // they collapse to zero-area. Only the previously-written range needs it.
  const prevCount = active.prevCount ?? MAX_PARTICLES_PER_EMITTER;
  for (let i = count; i < prevCount; i++) {
    for (let v = 0; v < 4; v++) {
      sizeArr[i * 4 + v] = 0;
    }
  }
  active.prevCount = count;

  // Upload only the touched prefix of each buffer instead of all
  // MAX_PARTICLES_PER_EMITTER quads (sizes extend to prevCount for the
  // zero-fill above).
  const quads = Math.max(count, 0);
  const sizeQuads = Math.max(
    count,
    Math.min(prevCount, MAX_PARTICLES_PER_EMITTER),
  );
  setPrefixUpdateRange(posAttr, quads * 4 * 3);
  setPrefixUpdateRange(colorAttr, quads * 4 * 4);
  setPrefixUpdateRange(sizeAttr, sizeQuads * 4);
  setPrefixUpdateRange(spinAttr, quads * 4);
  setPrefixUpdateRange(orientAttr, quads * 4 * 3);

  geo.setDrawRange(0, count * 6);
}

/** Mark only the first `floatCount` floats of the attribute for upload. */
function setPrefixUpdateRange(
  attr: Float32BufferAttribute,
  floatCount: number,
): void {
  attr.clearUpdateRanges();
  if (floatCount > 0) {
    attr.addUpdateRange(0, floatCount);
    attr.needsUpdate = true;
  }
}

// ── Main component ──

const MAX_PROJECTILE_SOUNDS = 20;

/** A projectile's looping in-flight sound plus the profile values needed
 *  for the per-frame maxDistance gate. */
interface ProjectileSound {
  sound: PositionalAudio;
  volume: number;
  maxDist: number;
  muted: boolean;
}

const _listenerWorldPos = new Vector3();

/** out = −normalize(v), or straight up when v is (near) zero — the
 *  engine's emission axis for projectile trails. */
function reversedDirection(
  v: [number, number, number],
  out: [number, number, number],
): void {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-4) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 1;
  } else {
    out[0] = -v[0] / len;
    out[1] = -v[1] / len;
    out[2] = -v[2] / len;
  }
}

/** Stop, detach, and forget a projectile's in-flight loop. */
function stopProjectileSound(
  projSounds: Map<string, ProjectileSound>,
  entityId: string,
): void {
  const entry = projSounds.get(entityId);
  if (!entry) return;
  stopAndDetachSound(entry.sound);
  projSounds.delete(entityId);
}

export function ParticleEffects({
  playback,
  snapshotRef,
}: {
  playback: StreamingPlayback;
  snapshotRef: React.RefObject<StreamSnapshot | null>;
}) {
  const { debugMode } = useDebug();
  const { audioEnabled } = useSettings();
  const { audioLoader, audioListener } = useAudio();
  const gl = useThree((s) => s.gl);
  const groupRef = useRef<Group>(null);
  const activeEmittersRef = useRef<ActiveEmitter[]>([]);
  /** Track which explosion entity IDs we've already processed. */
  const processedExplosionsRef = useRef<Set<string>>(new Set());
  /** Track which projectile entity IDs have trail emitters attached. */
  const trailEntitiesRef = useRef<Set<string>>(new Set());
  /** Active looping projectile sounds keyed by entity ID. */
  const projectileSoundsRef = useRef<Map<string, ProjectileSound>>(new Map());
  /** Explosion entity IDs whose impact sound already played. */
  const processedExplosionSoundsRef = useRef<Set<string>>(new Set());
  /** Track processed audio event keys to prevent replays on seek. */
  const processedAudioEventsRef = useRef<Set<string>>(new Set());
  /** Active wireframe explosion spheres. */
  const activeExplosionSpheresRef = useRef<ActiveExplosionSphere[]>([]);
  /** Active shockwave ring effects. */
  const activeShockwavesRef = useRef<ActiveShockwave[]>([]);
  const getDataBlockData = useMemo(
    () => playback.getDataBlockData.bind(playback),
    [playback],
  );

  // Turning audio off must silence projectile loops that are already
  // playing — the per-frame audio block (including its despawn/stop pass)
  // is gated on audioEnabled, so it can't.
  useEffect(() => {
    if (audioEnabled) return;
    for (const entityId of [...projectileSoundsRef.current.keys()]) {
      stopProjectileSound(projectileSoundsRef.current, entityId);
    }
  }, [audioEnabled]);

  // A new recording reuses entity ids and event keys — stale dedupe entries
  // from the previous demo would silently suppress its sounds.
  useEffect(() => {
    processedExplosionSoundsRef.current.clear();
    processedAudioEventsRef.current.clear();
  }, [playback]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const snapshot = snapshotRef.current;
    if (!group || !snapshot) return;

    const playbackState = engineStore.getState().playback;
    const isPlaying = playbackState.status === "playing";
    // Scale delta by playback rate; 0 when paused.
    const effectDelta = isPlaying ? delta * playbackState.rate : 0;
    const dtMS = effectDelta * 1000;

    // Detect new explosion entities and create emitters.
    for (const entity of snapshot.entities) {
      if (
        entity.type !== "Explosion" ||
        !entity.explosionDataBlockId ||
        !entity.position
      ) {
        continue;
      }
      if (processedExplosionsRef.current.has(entity.id)) continue;
      processedExplosionsRef.current.add(entity.id);

      const resolved = resolveExplosion(
        entity.explosionDataBlockId,
        getDataBlockData,
      );
      if (!resolved) continue;

      const origin: [number, number, number] = [...entity.position];

      // Create burst emitters.
      for (const burst of resolved.burstEmitters) {
        const emitter = new EmitterInstance(
          burst.data,
          MAX_PARTICLES_PER_EMITTER,
        );
        emitter.emitBurst(origin, burst.density);
        // Explosion::explode → deleteWhenEmpty on the burst emitter.
        emitter.kill();

        const texture = getParticleTexture(burst.data.particles.textureName);
        const geometry = createParticleGeometry(MAX_PARTICLES_PER_EMITTER);
        const material = createParticleMaterial(
          texture,
          burst.data.particles.useInvAlpha,
          burst.data.orientParticles,
        );
        const mesh = new Mesh(geometry, material);
        mesh.frustumCulled = false;
        group.add(mesh);

        activeEmittersRef.current.push({
          emitter,
          mesh,
          geometry,
          material,
          targetTexture: texture,
          origin,
          isBurst: true,
        });
      }

      // Streaming emitters (emitter[0..3]) are fed every frame while the
      // explosion lives and stop at their own datablock lifetime, whichever
      // comes first; already-emitted particles then live out their lifetime.
      for (const emitterData of resolved.streamingEmitters) {
        const emitter = new EmitterInstance(
          emitterData,
          MAX_PARTICLES_PER_EMITTER,
        );

        const texture = getParticleTexture(emitterData.particles.textureName);
        const geometry = createParticleGeometry(MAX_PARTICLES_PER_EMITTER);
        const material = createParticleMaterial(
          texture,
          emitterData.particles.useInvAlpha,
          emitterData.orientParticles,
        );
        const mesh = new Mesh(geometry, material);
        mesh.frustumCulled = false;
        group.add(mesh);

        activeEmittersRef.current.push({
          emitter,
          mesh,
          geometry,
          material,
          targetTexture: texture,
          origin,
          isBurst: false,
          driverEntityId: entity.id,
        });
      }

      const expBlock = getDataBlockData(entity.explosionDataBlockId);

      // Debug mode: show wireframe spheres and labels.
      if (debugMode) {
        const radius = expBlock ? getExplosionRadius(expBlock) : 5;
        const color = getExplosionColor(entity.dataBlock);
        const sphereMat = new MeshBasicMaterial({
          color,
          wireframe: true,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        });
        const sphereMesh = new Mesh(_explosionSphereGeo, sphereMat);
        sphereMesh.frustumCulled = false;
        sphereMesh.scale.setScalar(radius);
        sphereMesh.position.set(origin[1], origin[2], origin[0]);
        group.add(sphereMesh);

        const labelText = `${entity.id}: ${entity.dataBlock ?? `expId:${entity.explosionDataBlockId}`}`;
        const { sprite: labelSprite, material: labelMat } =
          createExplosionLabel(labelText, color);
        labelSprite.position.set(origin[1], origin[2] + radius + 2, origin[0]);
        labelSprite.frustumCulled = false;
        group.add(labelSprite);

        activeExplosionSpheresRef.current.push({
          entityId: entity.id as string,
          mesh: sphereMesh,
          material: sphereMat,
          label: labelSprite,
          labelMaterial: labelMat,
          creationTime: effectNow(),
          lifetimeMS: Math.max(entity.explosionLifetimeMS ?? 0, 3000),
          targetRadius: radius,
        });
      }

      // Spawn shockwave ring if the explosion datablock references one.
      const shockwaveId = expBlock?.shockwave as number | null | undefined;
      if (typeof shockwaveId === "number") {
        const swData = resolveShockwaveData(shockwaveId, getDataBlockData);
        if (swData) {
          const texture = getParticleTexture(swData.textureName);
          const geo = createShockwaveGeometry(swData.numSegments);
          const mat = createShockwaveMaterial(texture);
          const mesh = new Mesh(geo, mat);
          mesh.frustumCulled = false;
          mesh.position.set(origin[1], origin[2], origin[0]);
          group.add(mesh);

          // Optional bottom face (renders the underside of the ring).
          let bottomMesh: Mesh | null = null;
          let bottomGeo: BufferGeometry | null = null;
          if (swData.renderBottom) {
            bottomGeo = createShockwaveGeometry(swData.numSegments);
            bottomMesh = new Mesh(bottomGeo, mat);
            bottomMesh.frustumCulled = false;
            bottomMesh.position.set(origin[1], origin[2], origin[0]);
            // Flip Y to render the underside.
            bottomMesh.scale.y = -1;
            group.add(bottomMesh);
          }

          // Clamp denormalized velocity values (parser bug workaround).
          const initVelocity =
            Math.abs(swData.velocity) > 1e-10 ? swData.velocity : 0;

          activeShockwavesRef.current.push({
            entityId: entity.id as string,
            mesh,
            bottomMesh,
            geometry: geo,
            bottomGeometry: bottomGeo,
            material: mat,
            creationTime: effectNow(),
            lifetimeMS: swData.lifetimeMS,
            data: swData,
            radius: 0,
            velocity: initVelocity,
          });
        }
      }
    }

    // Detect projectile entities with trail emitters (maintainEmitterId).
    const currentEntityIds = _currentEntityIds;
    currentEntityIds.clear();
    _entitiesById.clear();
    for (const entity of snapshot.entities) {
      currentEntityIds.add(entity.id);
      _entitiesById.set(entity.id, entity);

      if (
        !entity.maintainEmitterId ||
        trailEntitiesRef.current.has(entity.id)
      ) {
        continue;
      }
      trailEntitiesRef.current.add(entity.id);

      const emitterRaw = getDataBlockData(entity.maintainEmitterId);
      if (!emitterRaw) continue;

      const emitterData = resolveEmitterData(emitterRaw, getDataBlockData);
      if (!emitterData) continue;

      const origin: [number, number, number] = entity.position
        ? [...entity.position]
        : [0, 0, 0];

      const emitter = new EmitterInstance(
        emitterData,
        MAX_PARTICLES_PER_EMITTER,
      );

      const texture = getParticleTexture(emitterData.particles.textureName);
      const geometry = createParticleGeometry(MAX_PARTICLES_PER_EMITTER);
      const material = createParticleMaterial(
        texture,
        emitterData.particles.useInvAlpha,
        emitterData.orientParticles,
      );
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      group.add(mesh);

      activeEmittersRef.current.push({
        emitter,
        mesh,
        geometry,
        material,
        targetTexture: texture,
        origin,
        prevOrigin: [...origin],
        emitVelocity: [0, 0, 0],
        emitAxis: [0, 0, 1],
        isBurst: false,
        driverEntityId: entity.id,
        followsDriver: true,
      });
    }

    // Stop emitting once the driving entity is gone: a trail's projectile, or
    // a streaming emitter's explosion (Explosion::onRemove → deleteWhenEmpty).
    for (const entry of activeEmittersRef.current) {
      if (entry.driverEntityId && !currentEntityIds.has(entry.driverEntityId)) {
        entry.emitter.kill();
      }
    }

    // Prune trail entity tracking set.
    for (const id of trailEntitiesRef.current) {
      if (!currentEntityIds.has(id)) {
        trailEntitiesRef.current.delete(id);
      }
    }

    // Update all active emitters.
    const active = activeEmittersRef.current;
    for (let i = active.length - 1; i >= 0; i--) {
      const entry = active[i];

      // One-time shader compilation check.
      if (!entry.shaderChecked) {
        checkShaderCompilation(
          gl,
          entry.material,
          entry.isBurst ? "burst" : "stream",
        );
        entry.shaderChecked = true;
      }

      // Trails follow the projectile: this frame's segment runs from the
      // previous emission point to the new one, and — as in
      // Projectile::updateEmitters — the emission axis is the velocity
      // direction reversed, with the velocity itself passed for
      // inheritedVelFactor.
      if (entry.followsDriver && entry.driverEntityId) {
        const tracked = _entitiesById.get(entry.driverEntityId);
        const prev = entry.prevOrigin!;
        const vel = entry.emitVelocity!;
        if (tracked?.position) {
          prev[0] = entry.origin[0];
          prev[1] = entry.origin[1];
          prev[2] = entry.origin[2];
          entry.origin[0] = tracked.position[0];
          entry.origin[1] = tracked.position[1];
          entry.origin[2] = tracked.position[2];
          if (tracked.velocity) {
            vel[0] = tracked.velocity[0];
            vel[1] = tracked.velocity[1];
            vel[2] = tracked.velocity[2];
          } else if (effectDelta > 0) {
            vel[0] = (entry.origin[0] - prev[0]) / effectDelta;
            vel[1] = (entry.origin[1] - prev[1]) / effectDelta;
            vel[2] = (entry.origin[2] - prev[2]) / effectDelta;
          }
          reversedDirection(vel, entry.emitAxis!);
        }
      }

      // Streaming emitters emit periodically along the frame's segment.
      if (!entry.isBurst) {
        entry.emitter.emitPeriodic(
          entry.prevOrigin ?? entry.origin,
          entry.origin,
          dtMS,
          entry.emitAxis,
          entry.emitVelocity,
        );
      }

      // Advance physics and interpolation.
      entry.emitter.worldGravity = snapshot.gravity;
      entry.emitter.update(dtMS);

      // Swap in the real texture once it finishes loading.
      if (
        _texturesReady.has(entry.targetTexture) &&
        entry.material.uniforms.particleTexture.value !== entry.targetTexture
      ) {
        entry.material.uniforms.particleTexture.value = entry.targetTexture;
      }

      // Reduce particle opacity in debug mode for visibility.
      entry.material.uniforms.debugOpacity.value = debugMode ? 0.2 : 1.0;

      // Sync GPU buffers.
      syncBuffers(entry);

      // Debug visualization: place markers at origin and particle positions.
      if (debugMode) {
        // Origin marker (red wireframe sphere).
        if (!entry.debugOriginMesh) {
          entry.debugOriginMesh = new Mesh(_debugOriginGeo, _debugOriginMat);
          entry.debugOriginMesh.frustumCulled = false;
          group.add(entry.debugOriginMesh);
        }
        // Swizzle origin to Three.js coordinates.
        entry.debugOriginMesh.position.set(
          entry.origin[1],
          entry.origin[2],
          entry.origin[0],
        );

        // Particle markers (green wireframe boxes) — show up to 8.
        if (!entry.debugParticleMeshes) {
          entry.debugParticleMeshes = [];
        }
        const maxDebugParticles = Math.min(entry.emitter.particles.length, 8);
        // Add meshes if needed.
        while (entry.debugParticleMeshes.length < maxDebugParticles) {
          const m = new Mesh(_debugParticleGeo, _debugParticleMat);
          m.frustumCulled = false;
          group.add(m);
          entry.debugParticleMeshes.push(m);
        }
        // Update positions or hide extras.
        for (let j = 0; j < entry.debugParticleMeshes.length; j++) {
          const dm = entry.debugParticleMeshes[j];
          if (j < entry.emitter.particles.length) {
            const p = entry.emitter.particles[j];
            dm.position.set(p.pos[1], p.pos[2], p.pos[0]);
            dm.visible = true;
          } else {
            dm.visible = false;
          }
        }
      } else {
        // Clean up debug meshes when debug mode is off.
        if (entry.debugOriginMesh) {
          group.remove(entry.debugOriginMesh);
          entry.debugOriginMesh = undefined;
        }
        if (entry.debugParticleMeshes) {
          for (const dm of entry.debugParticleMeshes) {
            group.remove(dm);
          }
          entry.debugParticleMeshes = undefined;
        }
      }

      // Remove dead emitters.
      if (entry.emitter.isDead()) {
        group.remove(entry.mesh);
        entry.geometry.dispose();
        entry.material.dispose();
        if (entry.debugOriginMesh) group.remove(entry.debugOriginMesh);
        if (entry.debugParticleMeshes) {
          for (const dm of entry.debugParticleMeshes) group.remove(dm);
        }
        active.splice(i, 1);
      }
    }

    // ── Update explosion wireframe spheres ──
    const spheres = activeExplosionSpheresRef.current;
    const now = effectNow();
    for (let i = spheres.length - 1; i >= 0; i--) {
      const sphere = spheres[i];
      const elapsed = now - sphere.creationTime;
      const frac = Math.min(elapsed / sphere.lifetimeMS, 1);

      // Quick scale-up in first 10%, then hold.
      const scaleFrac = Math.min(frac / 0.1, 1);
      sphere.mesh.scale.setScalar(sphere.targetRadius * scaleFrac);

      // Fade opacity over lifetime.
      sphere.material.opacity = 1 - frac;
      sphere.labelMaterial.opacity = 1 - frac;

      // Remove when lifetime expires.
      if (frac >= 1) {
        group.remove(sphere.mesh);
        group.remove(sphere.label);
        sphere.material.dispose();
        sphere.labelMaterial.dispose();
        spheres.splice(i, 1);
      }
    }

    // ── Update shockwave rings ──
    const shockwaves = activeShockwavesRef.current;
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      const elapsed = now - sw.creationTime;
      const t = Math.min(elapsed / sw.lifetimeMS, 1);
      const dtSec = effectDelta;

      // V12 expansion physics: velocity += acceleration * dt; radius += velocity * dt
      sw.velocity += sw.data.acceleration * dtSec;
      sw.radius += sw.velocity * dtSec;

      // Interpolate color from keyframes.
      const color = interpolateShockwaveColor(sw.data, t);

      // Update ring geometry.
      updateShockwaveGeometry(
        sw.geometry,
        sw.data,
        sw.radius,
        color,
        sw.data.is2D,
      );

      // Update bottom ring if present.
      if (sw.bottomGeometry) {
        updateShockwaveGeometry(
          sw.bottomGeometry,
          sw.data,
          sw.radius,
          color,
          sw.data.is2D,
        );
      }

      // For is2D mode: billboard the ring to face the camera.
      if (sw.data.is2D) {
        sw.mesh.lookAt(state.camera.position);
      }

      // Remove when lifetime expires.
      if (t >= 1) {
        group.remove(sw.mesh);
        if (sw.bottomMesh) group.remove(sw.bottomMesh);
        sw.geometry.dispose();
        sw.bottomGeometry?.dispose();
        sw.material.dispose();
        shockwaves.splice(i, 1);
      }
    }

    // ── Audio: explosion impact + projectile in-flight sounds ──
    // Only process new audio events while playing to avoid triggering
    // sounds during pause (existing sounds are frozen via AudioContext.suspend).
    if (
      isPlaying &&
      audioEnabled &&
      audioLoader &&
      audioListener &&
      groupRef.current
    ) {
      const projSounds = projectileSoundsRef.current;
      audioListener.getWorldPosition(_listenerWorldPos);
      for (const entity of snapshot.entities) {
        // Explosion impact one-shots, once per explosion entity.
        if (
          entity.type === "Explosion" &&
          entity.explosionDataBlockId &&
          entity.position &&
          !processedExplosionSoundsRef.current.has(entity.id)
        ) {
          processedExplosionSoundsRef.current.add(entity.id);

          const expBlock = getDataBlockData(entity.explosionDataBlockId);
          if (!expBlock) continue;
          const soundProfileId = expBlock.soundProfile as number | undefined;
          if (typeof soundProfileId !== "number") continue;

          const resolved = resolveAudioProfile(
            soundProfileId,
            getDataBlockData,
          );
          if (!resolved) continue;

          const pos = new Vector3(
            entity.position[1],
            entity.position[2],
            entity.position[0],
          );
          playOneShotSound(
            resolved,
            audioListener,
            audioLoader,
            pos,
            groupRef.current,
          );
          continue;
        }
        if (entity.type !== "Projectile" || !entity.dataBlockId) continue;
        // A projectile that exploded or fizzled client-side lingers in the
        // snapshot until the server's ghost delete arrives — its flight
        // loop must stop at death, not at the delete (Torque stops the
        // sound with the projectile object).
        const dead = entity.hasExploded === true || !entity.position;
        let existing = projSounds.get(entity.id);
        // A looping sound that isn't playing was stopped externally (the
        // global stop on seek) — clear the entry so it can restart below.
        if (existing && !existing.sound.isPlaying) {
          stopProjectileSound(projSounds, entity.id);
          existing = undefined;
        }
        if (existing) {
          if (dead) {
            stopProjectileSound(projSounds, entity.id);
            continue;
          }
          const { sound } = existing;
          sound.position.set(
            entity.position![1],
            entity.position![2],
            entity.position![0],
          );
          // Hard cutoff at maxDistance, like Torque: the inverse model
          // alone never reaches zero gain, so a disc sailing into the
          // distance would otherwise stay in the mix until it dies. Only
          // touch volume on boundary crossings — each setVolume schedules
          // an automation event.
          const outOfRange =
            sound.position.distanceTo(_listenerWorldPos) > existing.maxDist;
          if (outOfRange !== existing.muted) {
            existing.muted = outOfRange;
            sound.setVolume(outOfRange ? 0 : existing.volume);
          }
          continue;
        }
        if (dead) continue;
        // Cap active projectile sounds.
        if (projSounds.size >= MAX_PROJECTILE_SOUNDS) continue;

        const projBlock = getDataBlockData(entity.dataBlockId);
        if (!projBlock) continue;
        const soundId = projBlock.sound as number | undefined;
        if (typeof soundId !== "number") continue;

        const resolved = resolveAudioProfile(soundId, getDataBlockData);
        if (!resolved || !resolved.isLooping || !resolved.is3D) continue;

        try {
          const url = audioToUrl(resolved.filename);
          const gen = getSoundGeneration();
          getCachedAudioBuffer(url, audioLoader, (buffer) => {
            // Recording may have been unloaded by the time the buffer loads.
            if (gen !== getSoundGeneration()) return;
            if (!currentEntityIds.has(entity.id)) return;
            if (projSounds.has(entity.id)) return;
            const group = groupRef.current;
            if (!group) return;

            const sound = createPositionalAudio(audioListener, resolved);
            sound.setBuffer(buffer);
            sound.setPlaybackRate(getEffectiveSoundRate());
            sound.setLoop(true);
            sound.position.set(
              entity.position![1],
              entity.position![2],
              entity.position![0],
            );
            group.add(sound);
            trackSound(sound);
            sound.play();
            projSounds.set(entity.id, {
              sound,
              volume: resolved.volume,
              maxDist: resolved.maxDist,
              muted: false,
            });
          });
        } catch {
          // File not in manifest.
        }
      }

      // Despawn: stop sounds for entities no longer present.
      for (const entityId of projSounds.keys()) {
        if (!currentEntityIds.has(entityId)) {
          stopProjectileSound(projSounds, entityId);
        }
      }

      // ── Audio: event-based sounds (Sim3DAudioEvent / Sim2DAudioEvent) ──
      for (const evt of snapshot.audioEvents) {
        const evtKey = `${evt.timeSec}:${evt.profileId}:${evt.position?.x ?? ""}`;
        if (processedAudioEventsRef.current.has(evtKey)) continue;
        processedAudioEventsRef.current.add(evtKey);

        const resolved = resolveAudioProfile(evt.profileId, getDataBlockData);
        if (!resolved) continue;

        const pos = evt.position
          ? new Vector3(evt.position.y, evt.position.z, evt.position.x)
          : undefined;
        playOneShotSound(
          resolved,
          audioListener,
          audioLoader,
          pos,
          groupRef.current,
        );
      }
    }

    // Prune processed sets when they get large: entries for entities no
    // longer in the snapshot can never match again.
    if (
      processedExplosionsRef.current.size > 500 ||
      processedExplosionSoundsRef.current.size > 500
    ) {
      const currentIds = new Set(snapshot.entities.map((e) => e.id));
      for (const id of processedExplosionsRef.current) {
        if (!currentIds.has(id)) {
          processedExplosionsRef.current.delete(id);
        }
      }
      for (const id of processedExplosionSoundsRef.current) {
        if (!currentIds.has(id)) {
          processedExplosionSoundsRef.current.delete(id);
        }
      }
    }
    // Event keys are time-based; anything past the engine's short replay
    // window can never fire again, so just reset the set.
    if (processedAudioEventsRef.current.size > 500) {
      processedAudioEventsRef.current.clear();
    }
  });

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const group = groupRef.current;
      for (const entry of activeEmittersRef.current) {
        if (group) {
          group.remove(entry.mesh);
          if (entry.debugOriginMesh) group.remove(entry.debugOriginMesh);
          if (entry.debugParticleMeshes) {
            for (const dm of entry.debugParticleMeshes) group.remove(dm);
          }
        }
        entry.geometry.dispose();
        entry.material.dispose();
      }
      activeEmittersRef.current = [];
      // Clean up explosion spheres.
      for (const sphere of activeExplosionSpheresRef.current) {
        if (group) {
          group.remove(sphere.mesh);
          group.remove(sphere.label);
        }
        sphere.material.dispose();
        sphere.labelMaterial.dispose();
      }
      activeExplosionSpheresRef.current = [];
      // Clean up shockwave rings.
      for (const sw of activeShockwavesRef.current) {
        if (group) {
          group.remove(sw.mesh);
          if (sw.bottomMesh) group.remove(sw.bottomMesh);
        }
        sw.geometry.dispose();
        sw.bottomGeometry?.dispose();
        sw.material.dispose();
      }
      activeShockwavesRef.current = [];
      processedExplosionsRef.current.clear();
      trailEntitiesRef.current.clear();
      processedExplosionSoundsRef.current.clear();
      // Clean up projectile sounds.
      for (const entityId of [...projectileSoundsRef.current.keys()]) {
        stopProjectileSound(projectileSoundsRef.current, entityId);
      }
      processedAudioEventsRef.current.clear();
    };
  }, []);

  return <group ref={groupRef} />;
}

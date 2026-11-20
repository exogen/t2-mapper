import {
  MAX_PARTICLES_PER_EMITTER,
  particleTexturesReady,
  getParticleTexture,
  createParticleGeometry,
  createParticleMaterial,
  syncBuffers,
  type ParticleBuffers,
} from "../particles/particleRenderer";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Group,
  Object3D,
  Mesh,
  MeshBasicMaterial,
  PositionalAudio,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  Quaternion,
  Vector3,
  SRGBColorSpace,
} from "three";
import { audioToUrl } from "../loaders";
import {
  orientationAlongDirection,
  streamTimeToTick,
  TICK_DURATION_MS,
} from "../stream/streamHelpers";
import { timelineRandom } from "../stream/timelineRandom";
import {
  interpolateStreamPosition,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { createEffectRingMaterial } from "../projectiles/geometry";
import { createSplashRings, type SplashRings } from "../projectiles/splash";
import type { SplashDataBlock } from "t2-demo-parser";
import { takeShockwaveRequests } from "./shockwaveRequests";
import {
  nodeEmitters,
  readNodeEmitterAxis,
  readNodeEmitterTransform,
  type NodeEmitter,
} from "./nodeEmitters";
import {
  EmitterInstance,
  resolveEmitterData,
} from "../particles/ParticleSystem";
import type { EmitterDataResolved } from "../particles/types";
import type { FrameContext } from "./frameScheduler";
import type {
  PendingAudioEvent,
  StreamEntity,
  StreamSnapshot,
  StreamingPlayback,
} from "../stream/types";
import { createLogger } from "../logger";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import { getAudioGraph } from "./audioGraph";
import {
  resolveAudioProfile,
  playOneShotSound,
  createPositionalAudio,
  getCachedAudioBuffer,
  getSoundGeneration,
  trackSound,
  stopAndDetachSound,
} from "./soundEffects";
import { getEffectiveSoundRate } from "./audioPlaybackRate";
import { effectNow, engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { ParticleSnapshotIndex } from "./particleSnapshot";
import { findAudioProfileId, ScriptSoundTracker } from "../stream/scriptSounds";
import { reaction, combineCleanups } from "./storeReaction";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";
import { torqueVecToThree } from "../scene/coordinates";
import { readMountedImageNodePosition } from "./weaponMuzzle";

const log = createLogger("ParticleEffects");

// ── Constants ──

// ── Debug geometry (reusable) ──

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

function disposeExplosionSphere(sphere: ActiveExplosionSphere): void {
  sphere.mesh.removeFromParent();
  sphere.label.removeFromParent();
  sphere.material.dispose();
  sphere.labelMaterial.map?.dispose();
  sphere.labelMaterial.dispose();
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
  /** Ring rotated so its axis follows the spawn normal (Shockwave render
   *  FUN_0068d5c0: orient(normal) x rotX(pi/2)). */
  orientToNormal: boolean;
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
  geometryTime?: number;
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
    orientToNormal: !!raw.orientToNormal,
    renderSquare: !!raw.renderSquare,
    renderBottom: !!raw.renderBottom,
    mapToTerrain: !!raw.mapToTerrain,
    colors,
    times,
    textureName: (raw.textureName as string) ?? "",
    mapToTexture: (raw.mapToTexture as string) ?? "",
  };
}

/** Torque rotX(pi/2) is a rotation about Three's Z axis. */
const _shockwaveNormalRoll = new Quaternion().setFromAxisAngle(
  new Vector3(0, 0, 1),
  Math.PI / 2,
);

/**
 * Spawn a shockwave ring at `origin` (Torque space). With
 * orientToNormal the engine multiplies the ring's world matrix by
 * orient(normal) x rotX(pi/2), tilting the ring's axis along the normal.
 */
function createShockwave(
  shockwaveId: number,
  origin: [number, number, number],
  entityId: string,
  getDataBlockData: (id: number) => Record<string, unknown> | undefined,
  group: Group,
  normal?: [number, number, number],
): ActiveShockwave | null {
  const swData = resolveShockwaveData(shockwaveId, getDataBlockData);
  if (!swData) return null;
  const texture = getParticleTexture(swData.textureName);
  const geo = createShockwaveGeometry(swData.numSegments, swData.texWrap);
  const mat = createEffectRingMaterial(texture);
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  torqueVecToThree(origin, mesh.position);
  const orientation =
    swData.orientToNormal && normal ? orientationAlongDirection(normal) : null;
  if (orientation) {
    mesh.quaternion
      .set(orientation[0], orientation[1], orientation[2], orientation[3])
      .multiply(_shockwaveNormalRoll);
  }
  group.add(mesh);

  // Optional bottom face (renders the underside of the ring).
  let bottomMesh: Mesh | null = null;
  let bottomGeo: BufferGeometry | null = null;
  if (swData.renderBottom) {
    bottomGeo = createShockwaveGeometry(swData.numSegments, swData.texWrap);
    bottomMesh = new Mesh(bottomGeo, mat);
    bottomMesh.frustumCulled = false;
    bottomMesh.position.copy(mesh.position);
    bottomMesh.quaternion.copy(mesh.quaternion);
    // Flip Y to render the underside.
    bottomMesh.scale.y = -1;
    group.add(bottomMesh);
  }

  return {
    entityId,
    mesh,
    bottomMesh,
    geometry: geo,
    bottomGeometry: bottomGeo,
    material: mat,
    creationTime: effectNow(),
    lifetimeMS: swData.lifetimeMS,
    data: swData,
    radius: 0,
    velocity: swData.velocity,
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

/**
 * Create ring geometry buffers for a shockwave with the given segment count.
 * Each segment is a quad (2 triangles) between inner and outer ring vertices.
 * Returns the geometry with position, texCoord, vertexColor attributes and
 * index buffer pre-allocated for numSegments quads.
 */
function createShockwaveGeometry(
  numSegments: number,
  texWrap: number,
): BufferGeometry {
  // 2 vertices per segment (inner + outer) + 2 to close the loop.
  const numVerts = (numSegments + 1) * 2;
  const positions = new Float32Array(numVerts * 3);
  const texCoords = new Float32Array(numVerts * 2);
  const vertexColors = new Float32Array(numVerts * 4);
  for (let i = 0; i <= numSegments; i++) {
    const u = (i / numSegments) * texWrap;
    texCoords.set([u, 0.05, u, 0.95], i * 4);
  }

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
  posAttr.setUsage(DynamicDrawUsage);
  geo.setAttribute("position", posAttr);

  const texAttr = new BufferAttribute(texCoords, 2);
  geo.setAttribute("texCoord", texAttr);

  const colorAttr = new BufferAttribute(vertexColors, 4);
  colorAttr.setUsage(DynamicDrawUsage);
  geo.setAttribute("vertexColor", colorAttr);

  geo.setIndex(new BufferAttribute(indices, 1));

  return geo;
}

/**
 * Update shockwave ring vertex positions and colors for the current
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
  geo.getAttribute("vertexColor").needsUpdate = true;
  geo.computeBoundingSphere();
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

// ── Per-emitter rendering state ──

interface ActiveEmitter extends ParticleBuffers {
  mesh: Mesh;
  material: ShaderMaterial;
  /** The intended texture (may still be loading). */
  targetTexture: Texture;
  /** Current emission point (Torque space). */
  origin: [number, number, number];
  /** Emission point or rendered projectile position from the prior frame. */
  prevOrigin?: [number, number, number];
  /** Driver velocity (Torque space) for inheritedVelFactor. */
  emitVelocity?: [number, number, number];
  isBurst: boolean;
  /** Whether shader compilation has been verified. */
  shaderChecked?: boolean;
  /** Entity whose lifetime bounds emission: a trail's projectile or a
   *  streaming emitter's explosion. Emission stops once it leaves the scene. */
  driverEntityId?: string;
  trail?: "air" | "water" | "delayed" | "tick";
  /** Splash emitters age from the recorded impact time, including after a seek. */
  splash?: { timeSec: number; elapsedMS: number };
  /** A missile's casing puff outlives its ghost and ages from the split. */
  seekerPuff?: { timeSec: number; elapsedMS: number };
  /** Backblast is attached to the source's launcher, never to the projectile. */
  launcherExhaust?: {
    sourceId: string;
    slot: number;
    node: string;
    startSec: number;
    endSec: number;
  };
  /** Emission axis in Torque space (defaults to [0,0,1] = up). */
  emitAxis?: [number, number, number];
  /** Node-anchored emitters: origin, axis and velocity track the node. */
  node?: NodeEmitter;
  /** Debug: origin marker mesh. */
  debugOriginMesh?: Mesh;
  /** Debug: particle marker meshes. */
  debugParticleMeshes?: Mesh[];
}

function removeEmitterDebugMeshes(entry: ActiveEmitter): void {
  if (entry.debugOriginMesh) {
    entry.debugOriginMesh.removeFromParent();
    entry.debugOriginMesh = undefined;
  }
  if (entry.debugParticleMeshes) {
    for (const mesh of entry.debugParticleMeshes) mesh.removeFromParent();
    entry.debugParticleMeshes = undefined;
  }
}

function disposeEmitter(entry: ActiveEmitter): void {
  entry.mesh.removeFromParent();
  removeEmitterDebugMeshes(entry);
  entry.geometry.dispose();
  entry.material.dispose();
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
  burstEmitters: Array<{
    data: EmitterDataResolved;
    density: number;
    radius: number;
  }>;
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
        const radius = (expBlock.particleRadius as number) ?? 1;
        burstEmitters.push({ data: resolved, density, radius });
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

const projectileSoundUrls = new Map<string, string | null>();

/**
 * A projectile sound's URL, or null when the file isn't shipped. Cached:
 * a missing file is otherwise looked up (and thrown over) every frame of
 * every projectile that uses it.
 */
function projectileSoundUrl(filename: string): string | null {
  let url = projectileSoundUrls.get(filename);
  if (url === undefined) {
    try {
      url = audioToUrl(filename);
    } catch {
      url = null;
    }
    projectileSoundUrls.set(filename, url);
  }
  return url;
}

const _listenerWorldPos = new Vector3();

/** An emitter parked at `origin`, ready to emit along each frame. Callers
 *  that emit only once flip `isBurst` and kill the emitter themselves. */
function createStreamEmitter(
  emitterData: EmitterDataResolved,
  origin: [number, number, number],
  group: Object3D,
  random?: () => number,
): ActiveEmitter {
  const emitter = new EmitterInstance(
    emitterData,
    MAX_PARTICLES_PER_EMITTER,
    random,
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
  return {
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
  };
}

/** Advance fixed-position emitters directly to their age in the stream. */
function advanceSplashEmitter(
  entry: ActiveEmitter,
  splash: NonNullable<ActiveEmitter["splash"]>,
  worldTime: number,
): void {
  const ageMS = Math.round((worldTime - splash.timeSec) * 1000);
  const emitter = entry.emitter;
  if (splash.elapsedMS === 0) {
    const particle = emitter.data.particles;
    const omitted = ageMS - particle.lifetimeMS - particle.lifetimeVarianceMS;
    if (omitted > 0) {
      emitter.advanceEmpty(omitted, omitted);
      splash.elapsedMS = omitted;
    }
  }
  while (splash.elapsedMS < ageMS) {
    const step = Math.min(TICK_DURATION_MS, ageMS - splash.elapsedMS);
    emitter.emitPeriodic(entry.origin, entry.origin, step);
    emitter.update(step);
    splash.elapsedMS += step;
    if (emitter.isDead()) break;
  }
}

/**
 * Move a node-anchored emitter to its node: this frame's segment runs
 * from last frame's node position to the current one, and the owner's
 * velocity feeds inheritedVelFactor.
 */
function readNodeFrame(entry: ActiveEmitter, node: NodeEmitter): void {
  const prev = entry.prevOrigin!;
  if (!node.emitAtPoint) {
    prev[0] = entry.origin[0];
    prev[1] = entry.origin[1];
    prev[2] = entry.origin[2];
  }
  readNodeEmitterTransform(node.anchor, entry.origin, entry.emitAxis!);
  const vel = entry.emitVelocity!;
  vel[0] = node.frame.velocity[0];
  vel[1] = node.frame.velocity[1];
  vel[2] = node.frame.velocity[2];
}

const exhaustPosition = new Vector3();

function emitLauncherExhaust(
  entry: ActiveEmitter,
  launch: NonNullable<ActiveEmitter["launcherExhaust"]>,
  engine: GameEngine,
  projectile: StreamEntity | undefined,
  source: StreamEntity | undefined,
  worldTime: number,
  effectDelta: number,
): void {
  const duration =
    Math.min(worldTime, launch.endSec) -
    Math.max(worldTime - effectDelta, launch.startSec);
  if (duration > 0 && projectile && !projectile.hasExploded && source) {
    const owner = engine.entities.get(source.id)?.root;
    const node =
      owner &&
      readMountedImageNodePosition(
        source.id,
        owner,
        launch.slot,
        launch.node,
        exhaustPosition,
      );
    if (node) {
      readNodeEmitterAxis(node.matrixWorld, entry.emitAxis!);
      entry.origin[0] = exhaustPosition.z;
      entry.origin[1] = exhaustPosition.x;
      entry.origin[2] = exhaustPosition.y;
      // SeekerProjectile::processTick sends velocity opposite to that of
      // the owner, and an emission segment whose two ends are the same node.
      const velocity =
        source.velocity ?? projectile.seekerLaunch?.sourceVelocity;
      const inherited = entry.emitVelocity!;
      inherited[0] = -(velocity?.[0] ?? 0);
      inherited[1] = -(velocity?.[1] ?? 0);
      inherited[2] = -(velocity?.[2] ?? 0);
      entry.emitter.emitPeriodic(
        entry.origin,
        entry.origin,
        duration * 1000,
        entry.emitAxis,
        inherited,
      );
    }
  }
  if (worldTime >= launch.endSec || !source || projectile?.hasExploded)
    entry.emitter.kill();
}

const projectileTrailPosition = new Vector3();

/** Use the same position as the projectile view, including before it loads. */
function readTrailPosition(
  entity: StreamEntity,
  out: [number, number, number],
): void {
  if (!entity.position) return;
  const { current, previous, interpT } = streamRenderFrame;
  if (current?.get(entity.id) === entity) {
    interpolateStreamPosition(
      projectileTrailPosition,
      entity,
      previous?.get(entity.id),
      interpT,
    );
    out[0] = projectileTrailPosition.z;
    out[1] = projectileTrailPosition.x;
    out[2] = projectileTrailPosition.y;
  } else {
    [out[0], out[1], out[2]] = entity.position;
  }
}

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

/**
 * The stream's particle effects: explosion and projectile emitters, node
 * emitters (jet nozzles, contrails), shockwave rings, projectile and
 * explosion sounds, and the debug explosion spheres. Its group is added
 * to the scene; dispose removes everything.
 */
export function createParticleEffects(
  engine: GameEngine,
  playback: StreamingPlayback,
  snapshotRef: { readonly current: StreamSnapshot | null },
): { group: Group; dispose(): void } {
  const { audioLoader, audioListener } = getAudioGraph();
  const group = new Group();
  const snapshotIndex = new ParticleSnapshotIndex();
  let activeEmitters: ActiveEmitter[] = [];
  /** Track which explosion entity IDs we've already processed. */
  const processedExplosions = new Set<string>();
  /** Shocklance bolts whose hit effects (shockwave, burst) have spawned. */
  const processedShockLances = new Set<string>();
  const nodeEmitterEntries = new Map<NodeEmitter, ActiveEmitter | null>();
  const trailEntities = {
    air: new Set<string>(),
    water: new Set<string>(),
    delayed: new Set<string>(),
  };
  const tickTrailEntries = {
    base: new Map<string, ActiveEmitter>(),
    delayed: new Map<string, ActiveEmitter>(),
  };
  const previousBubblePositions = new Map<string, [number, number, number]>();
  let lastTrailTick: number | undefined;
  const playedSeekerPuffs = new Set<string>();
  const launchedExhausts = new Set<string>();
  const projectileEffectsById = [
    ...Object.values(trailEntities),
    ...Object.values(tickTrailEntries),
    previousBubblePositions,
    playedSeekerPuffs,
    launchedExhausts,
  ];
  const splashRings = new Map<string, SplashRings | null>();
  let lastSeekNonce = engineStore.getState().playback.seekNonce;
  let lastWorldGeneration = playback.worldGeneration;
  let lastEffectTimeMS = Math.round(effectNow());
  /** Active looping projectile sounds keyed by entity ID. */
  const projectileSounds = new Map<string, ProjectileSound>();
  /** Explosion entity IDs whose impact sound already played. */
  const processedExplosionSounds = new Set<string>();
  /**
   * Audio events already played: the snapshot's window repeats them. Each
   * is its own object, so two identical sounds in one tick both play.
   */
  const processedAudioEvents = new WeakSet<PendingAudioEvent>();
  /**
   * The server scripts' sounds a recording holds only near its recorder.
   */
  const scriptSounds = new ScriptSoundTracker();
  /**
   * AudioProfile ids by file; null when the recording has none.
   */
  const scriptSoundProfiles = new Map<string, number | null>();
  /** Active wireframe explosion spheres. */
  let activeExplosionSpheres: ActiveExplosionSphere[] = [];
  /** Active shockwave ring effects. */
  let activeShockwaves: ActiveShockwave[] = [];
  const getDataBlockData = playback.getDataBlockData.bind(playback);

  const resolveStreamEmitter = (id: number) => {
    const raw = getDataBlockData(id);
    return raw && resolveEmitterData(raw, getDataBlockData);
  };

  const clearSplashRings = () => {
    for (const rings of splashRings.values()) rings?.dispose();
    splashRings.clear();
  };

  const update = (state: FrameContext) => {
    const debugMode = selectDebugMode(settingsStore.getState());
    const { audioEnabled } = settingsStore.getState();
    const transport = engineStore.getState().playback;
    if (
      transport.status === "seeking" ||
      transport.recording?.streamingPlayback !== playback
    )
      return;
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    const tickTrails = playback.projectileTrailHistory;
    const seekChanged = lastSeekNonce !== transport.seekNonce;
    const resetTrails =
      seekChanged || lastWorldGeneration !== playback.worldGeneration;
    if (resetTrails) {
      lastSeekNonce = transport.seekNonce;
      lastWorldGeneration = playback.worldGeneration;
      lastTrailTick = undefined;
      clearSplashRings();
      for (const effects of projectileEffectsById) effects.clear();
      activeEmitters = activeEmitters.filter((entry) => {
        if (
          !entry.splash &&
          !entry.trail &&
          !entry.seekerPuff &&
          !entry.launcherExhaust &&
          !entry.node?.emitAtPoint
        )
          return true;
        if (entry.node) nodeEmitterEntries.delete(entry.node);
        disposeEmitter(entry);
        return false;
      });
    }
    const snapshotChanged = snapshotIndex.update(snapshot) || resetTrails;
    const currentEntityIds = snapshotIndex.entities;

    const isPlaying = engineStore.getState().playback.status === "playing";
    // The published clock stays put while playback is held. Round its
    // endpoints, so a fractional frame cannot create or lose time every frame.
    const effectTimeMS = Math.round(effectNow());
    const dtMS = seekChanged ? 0 : Math.max(0, effectTimeMS - lastEffectTimeMS);
    const effectDelta = dtMS / 1000;
    lastEffectTimeMS = effectTimeMS;
    const worldTime = streamClock.worldTime;

    // A snapshot can include a splash from the next simulation tick. Wait
    // for the render clock to reach its impact before starting the effect.
    for (const entity of snapshotIndex.splashes) {
      const { position, dataBlockId, spawnTimeSec } = entity;
      if (!position || dataBlockId == null || spawnTimeSec == null) continue;
      const age = worldTime - spawnTimeSec;
      if (age < 0) continue;
      const data = getDataBlockData(dataBlockId) as SplashDataBlock | undefined;
      if (!data) continue;
      if (!splashRings.has(entity.id)) {
        const rings = data.textureName
          ? createSplashRings(data, getParticleTexture(data.textureName))
          : null;
        splashRings.set(entity.id, rings);
        if (rings) {
          torqueVecToThree(position, rings.root.position);
          group.add(rings.root);
        }
        for (const [slot, ref] of (data.emitters ?? []).entries()) {
          if (ref == null) continue;
          const emitter = resolveStreamEmitter(ref);
          if (!emitter) continue;
          const entry = createStreamEmitter(
            emitter,
            [...position],
            group,
            timelineRandom(dataBlockId, spawnTimeSec, ...position, slot),
          );
          entry.splash = { timeSec: spawnTimeSec, elapsedMS: 0 };
          entry.driverEntityId = entity.id;
          activeEmitters.push(entry);
        }
      }
      splashRings
        .get(entity.id)
        ?.update(
          age,
          (entity.splashEmitterLifetimeMS ?? data.lifetimeMS ?? 0) / 1000,
        );
    }
    if (snapshotChanged) {
      for (const [id, rings] of splashRings) {
        if (currentEntityIds.has(id)) continue;
        rings?.dispose();
        splashRings.delete(id);
      }
    }

    // Rings other systems asked for this frame (mounted-image muzzle flashes).
    for (const req of takeShockwaveRequests()) {
      const sw = createShockwave(
        req.dataBlockId,
        req.origin,
        req.ownerId,
        getDataBlockData,
        group,
        req.normal,
      );
      if (sw) activeShockwaves.push(sw);
    }

    // Detect new explosion entities and create emitters.
    if (snapshotChanged)
      for (const entity of snapshotIndex.explosions) {
        if (
          entity.type !== "Explosion" ||
          !entity.explosionDataBlockId ||
          !entity.position
        ) {
          continue;
        }
        if (processedExplosions.has(entity.id)) continue;
        processedExplosions.add(entity.id);

        const resolved = resolveExplosion(
          entity.explosionDataBlockId,
          getDataBlockData,
        );
        if (!resolved) continue;

        const origin: [number, number, number] = [...entity.position];

        // Create burst emitters.
        for (const burst of resolved.burstEmitters) {
          const entry = createStreamEmitter(burst.data, origin, group);
          entry.isBurst = true;
          // Explosion::explode (0x00621570) uses the radius/count overload.
          entry.emitter.emitRadial(origin, burst.radius, burst.density);
          // Explosion::explode → deleteWhenEmpty on the burst emitter.
          entry.emitter.kill();
          activeEmitters.push(entry);
        }

        // Streaming emitters (emitter[0..3]) are fed every frame while the
        // explosion lives and stop at their own datablock lifetime, whichever
        // comes first; already-emitted particles then live out their lifetime.
        for (const emitterData of resolved.streamingEmitters) {
          const entry = createStreamEmitter(emitterData, origin, group);
          entry.driverEntityId = entity.id;
          activeEmitters.push(entry);
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
          torqueVecToThree(origin, sphereMesh.position);
          group.add(sphereMesh);

          const labelText = `${entity.id}: ${entity.dataBlock ?? `expId:${entity.explosionDataBlockId}`}`;
          const { sprite: labelSprite, material: labelMat } =
            createExplosionLabel(labelText, color);
          labelSprite.position.set(
            origin[1],
            origin[2] + radius + 2,
            origin[0],
          );
          labelSprite.frustumCulled = false;
          group.add(labelSprite);

          activeExplosionSpheres.push({
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
          const sw = createShockwave(
            shockwaveId,
            origin,
            entity.id,
            getDataBlockData,
            group,
          );
          if (sw) activeShockwaves.push(sw);
        }
      }

    // Shocklance hits: the ShocklanceHit shockwave at the bolt's end,
    // its axis pointing back at the shooter (onAdd FUN_0064ec20 passes
    // normalize(start - end)), plus one ShockParticleEmitter burst along
    // the bolt over numParts milliseconds (emitParticles(start, end,
    // dir, 0, numParts)). Misses spawn neither.
    if (snapshotChanged)
      for (const entity of snapshotIndex.shockLances) {
        const visual = entity.visual;
        if (
          visual?.kind !== "shockLance" ||
          !entity.beamHit ||
          !entity.beamStart ||
          !entity.beamEnd
        ) {
          continue;
        }
        if (processedShockLances.has(entity.id)) continue;
        processedShockLances.add(entity.id);
        const start = entity.beamStart;
        const end = entity.beamEnd;
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const dz = end[2] - start[2];
        const len = Math.hypot(dx, dy, dz);
        if (!(len > 0)) continue;
        const axis: [number, number, number] = [dx / len, dy / len, dz / len];
        if (visual.shockwaveId != null) {
          const sw = createShockwave(
            visual.shockwaveId,
            end,
            entity.id,
            getDataBlockData,
            group,
            [-axis[0], -axis[1], -axis[2]],
          );
          if (sw) activeShockwaves.push(sw);
        }
        if (visual.emitterId != null) {
          const emitterRaw = getDataBlockData(visual.emitterId);
          const emitterData =
            emitterRaw && resolveEmitterData(emitterRaw, getDataBlockData);
          if (emitterData) {
            const entry = createStreamEmitter(
              emitterData,
              [end[0], end[1], end[2]],
              group,
            );
            entry.isBurst = true;
            entry.emitter.worldGravity = snapshot.gravity;
            entry.emitter.emitPeriodic(start, end, visual.numParts, axis);
            entry.emitter.kill();
            activeEmitters.push(entry);
          }
        }
      }

    for (const entity of snapshotIndex.seekerLaunches) {
      const launch = entity.seekerLaunch!;
      const { casingSplitAtSec, puffEmitterId, puffPosition } = launch;
      if (
        casingSplitAtSec != null &&
        casingSplitAtSec <= worldTime &&
        puffEmitterId &&
        puffPosition &&
        !playedSeekerPuffs.has(entity.id)
      ) {
        const data = resolveStreamEmitter(puffEmitterId);
        if (data) {
          playedSeekerPuffs.add(entity.id);
          const ageMS = (worldTime - casingSplitAtSec) * 1000;
          const { lifetimeMS, lifetimeVarianceMS } = data.particles;
          if (ageMS < lifetimeMS + lifetimeVarianceMS) {
            const entry = createStreamEmitter(
              data,
              [...puffPosition],
              group,
              timelineRandom(puffEmitterId, casingSplitAtSec, ...puffPosition),
            );
            entry.isBurst = true;
            entry.seekerPuff = { timeSec: casingSplitAtSec, elapsedMS: 0 };
            entry.emitter.worldGravity = snapshot.gravity;
            entry.emitter.emitPeriodic(entry.origin, entry.origin, 1000);
            entry.emitter.kill();
            activeEmitters.push(entry);
          }
        }
      }

      const { sourceId, exhaustUntilSec, exhaustNodeName, exhaustEmitterId } =
        launch;
      const { sourceSlot, spawnTimeSec } = entity;
      if (
        sourceId &&
        exhaustUntilSec != null &&
        exhaustUntilSec > worldTime - effectDelta &&
        exhaustNodeName &&
        exhaustEmitterId &&
        sourceSlot != null &&
        sourceSlot >= 0 &&
        spawnTimeSec != null &&
        !entity.hasExploded &&
        !launchedExhausts.has(entity.id)
      ) {
        const data = resolveStreamEmitter(exhaustEmitterId);
        if (data) {
          launchedExhausts.add(entity.id);
          const entry = createStreamEmitter(data, [0, 0, 0], group);
          entry.driverEntityId = entity.id;
          entry.launcherExhaust = {
            sourceId,
            slot: sourceSlot,
            node: exhaustNodeName,
            startSec: spawnTimeSec,
            endSec: exhaustUntilSec,
          };
          activeEmitters.push(entry);
        }
      }
    }

    // Linear and grenade-family air trails emit during processTick, before
    // the mesh interpolates within that tick. Consume only published steps.
    const warmingTickTrails =
      tickTrails && lastTrailTick === undefined
        ? new Map<ActiveEmitter, number>()
        : undefined;
    if (tickTrails) {
      const tick = streamTimeToTick(snapshot.timeSec);
      const previousTick = lastTrailTick ?? -Infinity;
      if (tick > previousTick) {
        for (const event of tickTrails.events) {
          if (event.tick <= previousTick) continue;
          if (event.tick > tick) break;
          const entries = tickTrailEntries[event.slot];
          let entry = entries.get(event.projectileId);
          if (!entry) {
            const data = resolveStreamEmitter(event.emitterId);
            if (!data) continue;
            entry = createStreamEmitter(data, [...event.to], group);
            entry.driverEntityId = event.projectileId;
            entry.trail = "tick";
            entries.set(event.projectileId, entry);
            activeEmitters.push(entry);
          }
          [entry.origin[0], entry.origin[1], entry.origin[2]] = event.to;
          entry.emitter.worldGravity = snapshot.gravity;
          if (warmingTickTrails) {
            const atMS = (event.tick - 1) * TICK_DURATION_MS;
            const previousMS = warmingTickTrails.get(entry) ?? atMS;
            entry.emitter.update(atMS - previousMS);
            warmingTickTrails.set(entry, atMS);
          }
          reversedDirection(event.velocity, entry.emitAxis!);
          entry.emitter.emitPeriodic(
            event.from,
            event.to,
            TICK_DURATION_MS,
            entry.emitAxis,
            event.velocity,
          );
        }
        lastTrailTick = tick;
      }
    }
    if (warmingTickTrails) {
      const worldTimeMS = Math.round(worldTime * 1000);
      for (const [entry, atMS] of warmingTickTrails)
        entry.emitter.update(worldTimeMS - atMS);
    }

    if (snapshotChanged)
      for (const entity of snapshotIndex.trails) {
        if (!entity.position || entity.hasExploded) continue;
        for (const [trail, ref] of entity.projectileInWater
          ? ([["water", entity.bubbleEmitterId]] as const)
          : entity.projectileTrailMode === "tick"
            ? []
            : ([
                ["air", entity.maintainEmitterId],
                ["delayed", entity.seekerLaunch?.delayEmitterId],
              ] as const)) {
          if (!ref || trailEntities[trail].has(entity.id)) continue;
          const data = resolveStreamEmitter(ref);
          if (!data) continue;
          trailEntities[trail].add(entity.id);
          const origin: [number, number, number] = [0, 0, 0];
          const previous =
            trail === "water" && previousBubblePositions.get(entity.id);
          if (previous) [origin[0], origin[1], origin[2]] = previous;
          else readTrailPosition(entity, origin);
          if (trail === "water") previousBubblePositions.delete(entity.id);
          const entry = createStreamEmitter(data, origin, group);
          entry.driverEntityId = entity.id;
          entry.trail = trail;
          activeEmitters.push(entry);
        }
      }

    // The first submerged frame starts at the last rendered position, even
    // though no bubble emitter was active during the preceding dry frame.
    for (const entity of snapshotIndex.trails) {
      if (
        !entity.bubbleEmitterId ||
        !entity.position ||
        entity.hasExploded ||
        trailEntities.water.has(entity.id)
      )
        continue;
      let previous = previousBubblePositions.get(entity.id);
      if (!previous) {
        previous = [0, 0, 0];
        previousBubblePositions.set(entity.id, previous);
      }
      readTrailPosition(entity, previous);
    }

    // Node-anchored emitters (jet nozzles, contrails) live as long as their
    // registration; a dropped one stops emitting and dies when empty.
    const nodeEntries = nodeEmitterEntries;
    const registered = nodeEmitters();
    for (const node of registered) {
      if (nodeEntries.has(node)) continue;
      const raw = getDataBlockData(node.dataBlockId);
      const data = raw ? resolveEmitterData(raw, getDataBlockData) : null;
      if (!data) {
        nodeEntries.set(node, null);
        continue;
      }
      const entry = createStreamEmitter(data, [0, 0, 0], group);
      entry.node = node;
      readNodeFrame(entry, node);
      entry.prevOrigin![0] = entry.origin[0];
      entry.prevOrigin![1] = entry.origin[1];
      entry.prevOrigin![2] = entry.origin[2];
      nodeEntries.set(node, entry);
      activeEmitters.push(entry);
    }
    for (const [node, entry] of nodeEntries) {
      if (registered.has(node)) continue;
      entry?.emitter.kill();
      nodeEntries.delete(node);
    }

    // Stop emitting once the driving entity is gone: a trail's projectile, or
    // a streaming emitter's explosion (Explosion::onRemove → deleteWhenEmpty).
    for (const entry of activeEmitters) {
      if (entry.driverEntityId && !currentEntityIds.has(entry.driverEntityId)) {
        entry.emitter.kill();
      }
    }

    // Stop tracking effects once their projectile is gone.
    if (snapshotChanged) {
      for (const effects of projectileEffectsById) {
        for (const id of effects.keys())
          if (!currentEntityIds.has(id)) effects.delete(id);
      }
    }

    // Update all active emitters.
    const active = activeEmitters;
    for (let i = active.length - 1; i >= 0; i--) {
      const entry = active[i];

      // One-time shader compilation check (debug only).
      if (debugMode && !entry.shaderChecked) {
        checkShaderCompilation(
          state.renderer,
          entry.material,
          entry.isBurst ? "burst" : "stream",
        );
        entry.shaderChecked = true;
      }

      let emitMS = entry.trail === "tick" ? 0 : dtMS;
      let emitFrom = entry.prevOrigin ?? entry.origin;
      let emitTo = entry.origin;
      if (entry.trail && entry.trail !== "tick" && entry.driverEntityId) {
        const tracked = snapshotIndex.entities.get(entry.driverEntityId);
        emitMS = 0;
        const prev = entry.prevOrigin!;
        const vel = entry.emitVelocity!;
        if (tracked?.position) {
          prev[0] = entry.origin[0];
          prev[1] = entry.origin[1];
          prev[2] = entry.origin[2];
          readTrailPosition(tracked, entry.origin);
          if (tracked.velocity) {
            vel[0] = tracked.velocity[0];
            vel[1] = tracked.velocity[1];
            vel[2] = tracked.velocity[2];
          } else if (effectDelta > 0) {
            vel[0] = (entry.origin[0] - prev[0]) / effectDelta;
            vel[1] = (entry.origin[1] - prev[1]) / effectDelta;
            vel[2] = (entry.origin[2] - prev[2]) / effectDelta;
          }
          if (entry.trail !== "water") reversedDirection(vel, entry.emitAxis!);
          if (
            !tracked.hasExploded &&
            !!tracked.projectileInWater === (entry.trail === "water")
          ) {
            const starts =
              entry.trail === "delayed"
                ? tracked.seekerLaunch?.delayEmitterStartsAtSec
                : tracked.seekerLaunch?.trailStartsAtSec;
            emitMS =
              starts == null
                ? dtMS
                : Math.max(0, Math.min(dtMS, (worldTime - starts) * 1000));
            if (entry.trail === "water") {
              // Native updateBubbles ends the segment at the simulation pose.
              emitTo = tracked.position;
            } else if (tracked.projectileTrailMode === "seeker") {
              // SeekerProjectile::advanceTime passes current render pose first.
              emitFrom = entry.origin;
              emitTo = prev;
            }
            if (emitMS < dtMS && starts != null) {
              const fraction = emitMS / dtMS;
              for (let axis = 0; axis < 3; axis++)
                prev[axis] =
                  entry.origin[axis] +
                  (prev[axis] - entry.origin[axis]) * fraction;
            }
          }
        }
      }

      if (entry.node) readNodeFrame(entry, entry.node);

      entry.emitter.worldGravity = snapshot.gravity;
      if (entry.splash) advanceSplashEmitter(entry, entry.splash, worldTime);
      else {
        // Streaming emitters emit periodically along the frame's segment.
        if (entry.launcherExhaust) {
          emitLauncherExhaust(
            entry,
            entry.launcherExhaust,
            engine,
            entry.driverEntityId
              ? snapshotIndex.entities.get(entry.driverEntityId)
              : undefined,
            snapshotIndex.entities.get(entry.launcherExhaust.sourceId),
            worldTime,
            effectDelta,
          );
        } else if (!entry.isBurst && emitMS > 0) {
          entry.emitter.emitPeriodic(
            entry.node?.emitAtPoint ? entry.origin : emitFrom,
            emitTo,
            entry.node ? emitMS * entry.node.frame.dtScale : emitMS,
            entry.emitAxis,
            entry.emitVelocity,
          );
        }
        if (entry.seekerPuff) {
          const puff = entry.seekerPuff;
          const age = Math.round((worldTime - puff.timeSec) * 1000);
          entry.emitter.update(age - puff.elapsedMS);
          puff.elapsedMS = age;
        } else if (!warmingTickTrails?.has(entry)) {
          entry.emitter.update(dtMS);
        }
      }

      // Swap in the real texture once it finishes loading.
      if (
        particleTexturesReady.has(entry.targetTexture) &&
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
        torqueVecToThree(entry.origin, entry.debugOriginMesh.position);

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
            torqueVecToThree(p.pos, dm.position);
            dm.visible = true;
          } else {
            dm.visible = false;
          }
        }
      } else {
        // Clean up debug meshes when debug mode is off.
        removeEmitterDebugMeshes(entry);
      }

      // Remove dead emitters.
      if (entry.emitter.isDead()) {
        disposeEmitter(entry);
        active.splice(i, 1);
      }
    }

    // ── Update explosion wireframe spheres ──
    const spheres = activeExplosionSpheres;
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
        disposeExplosionSphere(sphere);
        spheres.splice(i, 1);
      }
    }

    // ── Update shockwave rings ──
    const shockwaves = activeShockwaves;
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      const elapsed = now - sw.creationTime;
      const t = Math.min(elapsed / sw.lifetimeMS, 1);
      const dtSec = effectDelta;

      if (sw.geometryTime !== now || dtSec > 0) {
        sw.geometryTime = now;
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
    // Frozen projectiles stay visible during debrief, but must not keep
    // playing their flight loops. Voice and other one-shot events continue.
    if (streamClock.worldPaused) {
      for (const entityId of projectileSounds.keys()) {
        stopProjectileSound(projectileSounds, entityId);
      }
    }
    // Only process new audio events while playing to avoid triggering
    // sounds during pause (existing sounds are frozen via AudioContext.suspend).
    if (isPlaying && audioEnabled && audioLoader && audioListener && group) {
      const projSounds = projectileSounds;
      audioListener.getWorldPosition(_listenerWorldPos);
      for (const entity of snapshotIndex.audio) {
        // Explosion impact one-shots, once per explosion entity.
        if (
          entity.type === "Explosion" &&
          entity.explosionDataBlockId &&
          entity.position &&
          !processedExplosionSounds.has(entity.id)
        ) {
          processedExplosionSounds.add(entity.id);

          const expBlock = getDataBlockData(entity.explosionDataBlockId);
          if (!expBlock) continue;
          const soundProfileId = expBlock.soundProfile as number | undefined;
          if (typeof soundProfileId !== "number") continue;

          const resolved = resolveAudioProfile(
            soundProfileId,
            getDataBlockData,
          );
          if (!resolved) continue;

          const pos = torqueVecToThree(entity.position, new Vector3());
          playOneShotSound(resolved, audioListener, audioLoader, pos, group);
          continue;
        }
        if (
          streamClock.worldPaused ||
          entity.type !== "Projectile" ||
          !entity.dataBlockId
        )
          continue;
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

        const url = projectileSoundUrl(resolved.filename);
        if (url) {
          const gen = getSoundGeneration();
          getCachedAudioBuffer(url, audioLoader, (buffer) => {
            // Recording may have been unloaded by the time the buffer loads.
            if (gen !== getSoundGeneration() || streamClock.worldPaused) return;
            if (!currentEntityIds.has(entity.id)) return;
            if (projSounds.has(entity.id)) return;
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
        if (processedAudioEvents.has(evt)) continue;
        processedAudioEvents.add(evt);

        const resolved = resolveAudioProfile(evt.profileId, getDataBlockData);
        if (!resolved) continue;
        if (
          evt.position &&
          !scriptSounds.playRecorded(resolved.filename, {
            timeSec: evt.timeSec,
            position: [evt.position.x, evt.position.y, evt.position.z],
          })
        )
          continue;

        const pos = evt.position
          ? torqueVecToThree(evt.position, new Vector3())
          : undefined;
        playOneShotSound(resolved, audioListener, audioLoader, pos, group);
      }

      // ── Audio: the server scripts' sounds sent only near the recorder ──
      if (snapshotChanged) {
        const profiles = scriptSoundProfiles;
        for (const sound of scriptSounds.update(snapshot, getDataBlockData)) {
          let profileId = profiles.get(sound.file);
          if (profileId === undefined) {
            profileId =
              findAudioProfileId(getDataBlockData, sound.file) ?? null;
            profiles.set(sound.file, profileId);
          }
          const resolved =
            profileId != null
              ? resolveAudioProfile(profileId, getDataBlockData)
              : null;
          if (!resolved) continue;
          playOneShotSound(
            resolved,
            audioListener,
            audioLoader,
            torqueVecToThree(sound.position, new Vector3()),
            group,
          );
        }
      }
    }

    // Prune processed sets when they get large: entries for entities no
    // longer in the snapshot can never match again.
    if (
      processedExplosions.size > 500 ||
      processedExplosionSounds.size > 500 ||
      processedShockLances.size > 500
    ) {
      const currentIds = snapshotIndex.entities;
      for (const id of processedExplosions) {
        if (!currentIds.has(id)) {
          processedExplosions.delete(id);
        }
      }
      for (const id of processedExplosionSounds) {
        if (!currentIds.has(id)) {
          processedExplosionSounds.delete(id);
        }
      }
      for (const id of processedShockLances) {
        if (!currentIds.has(id)) {
          processedShockLances.delete(id);
        }
      }
    }
  };

  const stop = combineCleanups(
    engine.scheduler.add(FramePriority.PostCamera, update),
    // Clear debug visuals even while seeking or waiting for a frame.
    reaction(settingsStore, selectDebugMode, (debugMode) => {
      if (debugMode) return;
      for (const entry of activeEmitters) {
        removeEmitterDebugMeshes(entry);
        entry.material.uniforms.debugOpacity.value = 1;
      }
      for (const sphere of activeExplosionSpheres) {
        disposeExplosionSphere(sphere);
      }
      activeExplosionSpheres.length = 0;
      engine.invalidate();
    }),
    // Turning audio off must silence projectile loops that are already
    // playing — the per-frame audio block (including its despawn/stop pass)
    // is gated on audioEnabled, so it can't.
    reaction(
      settingsStore,
      (state) => state.audioEnabled,
      (audioEnabled) => {
        if (audioEnabled) return;
        for (const entityId of [...projectileSounds.keys()]) {
          stopProjectileSound(projectileSounds, entityId);
        }
      },
    ),
  );

  return {
    group,
    dispose() {
      stop();
      for (const entry of activeEmitters) disposeEmitter(entry);
      activeEmitters = [];
      clearSplashRings();
      for (const sphere of activeExplosionSpheres) {
        disposeExplosionSphere(sphere);
      }
      activeExplosionSpheres = [];
      for (const sw of activeShockwaves) {
        group.remove(sw.mesh);
        if (sw.bottomMesh) group.remove(sw.bottomMesh);
        sw.geometry.dispose();
        sw.bottomGeometry?.dispose();
        sw.material.dispose();
      }
      activeShockwaves = [];
      processedExplosions.clear();
      processedShockLances.clear();
      for (const effects of projectileEffectsById) effects.clear();
      processedExplosionSounds.clear();
      for (const entityId of [...projectileSounds.keys()]) {
        stopProjectileSound(projectileSounds, entityId);
      }
      scriptSounds.reset();
    },
  };
}

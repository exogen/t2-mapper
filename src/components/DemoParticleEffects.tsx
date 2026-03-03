import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  TextureLoader,
  Uint16BufferAttribute,
  UnsignedByteType,
} from "three";
import { textureToUrl } from "../loaders";
import { setupEffectTexture } from "../demo/demoPlaybackUtils";
import {
  EmitterInstance,
  resolveEmitterData,
} from "../particles/ParticleSystem";
import {
  particleVertexShader,
  particleFragmentShader,
} from "../particles/shaders";
import type { EmitterDataResolved } from "../particles/types";
import type {
  DemoStreamSnapshot,
  DemoStreamingPlayback,
} from "../demo/types";
import { useDebug } from "./SettingsProvider";

// ── Constants ──

const MAX_PARTICLES_PER_EMITTER = 256;
const QUAD_CORNERS = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
]);

// ── Texture cache ──

const _textureLoader = new TextureLoader();
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
    const tex = _textureLoader.load(url, (t) => {
      setupEffectTexture(t);
      _texturesReady.add(t);
    });
    setupEffectTexture(tex);
    _textureCache.set(textureName, tex);
    return tex;
  } catch {
    return _placeholderTexture;
  }
}

// ── Debug geometry (reusable) ──

const _debugOriginGeo = new SphereGeometry(1, 6, 6);
const _debugOriginMat = new MeshBasicMaterial({ color: 0xff0000, wireframe: true });
const _debugParticleGeo = new BoxGeometry(0.3, 0.3, 0.3);
const _debugParticleMat = new MeshBasicMaterial({ color: 0x00ff00, wireframe: true });

// ── sRGB → linear conversion for shader attributes ──

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
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

  geo.setIndex(new Uint16BufferAttribute(indices, 1));
  geo.setAttribute("quadCorner", new Float32BufferAttribute(corners, 2));
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("particleColor", new Float32BufferAttribute(colors, 4));
  geo.setAttribute("particleSize", new Float32BufferAttribute(sizes, 1));
  geo.setAttribute("particleSpin", new Float32BufferAttribute(spins, 1));

  geo.setDrawRange(0, 0);
  return geo;
}

function createParticleMaterial(
  texture: Texture,
  useInvAlpha: boolean,
): ShaderMaterial {
  // Use the placeholder until the real texture's image data is ready.
  const ready = _texturesReady.has(texture);
  return new ShaderMaterial({
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    uniforms: {
      particleTexture: { value: ready ? texture : _placeholderTexture },
      hasTexture: { value: true },
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
  origin: [number, number, number];
  isBurst: boolean;
  hasBurst: boolean;
  /** Entity ID this emitter follows (for projectile trails). */
  followEntityId?: string;
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
  const props = renderer.properties.get(material) as { currentProgram?: { program: WebGLProgram } };
  const program = props.currentProgram;
  if (!program) return; // Not yet compiled.
  const glProgram = program!.program;
  const glContext = renderer.getContext();
  if (!glContext.getProgramParameter(glProgram, glContext.LINK_STATUS)) {
    console.error(
      `[ParticleFX] Shader LINK ERROR (${label}):`,
      glContext.getProgramInfoLog(glProgram),
    );
  }
}

// ── Explosion resolution ──

interface ResolvedExplosion {
  burstEmitters: Array<{ data: EmitterDataResolved; density: number }>;
  streamingEmitters: EmitterDataResolved[];
  lifetimeMS: number;
}

function resolveExplosion(
  explosionDataBlockId: number,
  getDataBlockData: (id: number) => Record<string, unknown> | undefined,
): ResolvedExplosion | null {
  const expBlock = getDataBlockData(explosionDataBlockId);
  if (!expBlock) {
    console.log("[resolveExplosion] getDataBlockData returned undefined for id:", explosionDataBlockId);
    return null;
  }

  // DEBUG: log the raw explosion datablock fields
  console.log("[resolveExplosion] expBlock keys:", Object.keys(expBlock), "particleEmitter:", expBlock.particleEmitter, "emitters:", expBlock.emitters, "particleDensity:", expBlock.particleDensity);

  const burstEmitters: ResolvedExplosion["burstEmitters"] = [];
  const streamingEmitters: EmitterDataResolved[] = [];

  // Burst emitter: particleEmitter + particleDensity.
  const particleEmitterId = expBlock.particleEmitter as number | null;
  if (typeof particleEmitterId === "number") {
    const emitterRaw = getDataBlockData(particleEmitterId);
    console.log("[resolveExplosion] burst emitter lookup — particleEmitterId:", particleEmitterId, "found:", !!emitterRaw);
    if (emitterRaw) {
      console.log("[resolveExplosion] burst emitter raw keys:", Object.keys(emitterRaw), "particles:", emitterRaw.particles);
      const resolved = resolveEmitterData(emitterRaw, getDataBlockData);
      if (resolved) {
        const density = (expBlock.particleDensity as number) ?? 10;
        console.log("[resolveExplosion] burst emitter RESOLVED — density:", density, "textureName:", resolved.particles.textureName, "particleLifetimeMS:", resolved.particles.lifetimeMS, "emitterLifetimeMS:", resolved.lifetimeMS);
        burstEmitters.push({ data: resolved, density });
      } else {
        console.log("[resolveExplosion] resolveEmitterData returned null for burst emitter");
      }
    }
  } else {
    console.log("[resolveExplosion] no particleEmitter field (value:", expBlock.particleEmitter, ")");
  }

  // Streaming emitters: emitters[0..3].
  const emitterRefs = expBlock.emitters as (number | null)[] | undefined;
  if (Array.isArray(emitterRefs)) {
    console.log("[resolveExplosion] emitters array:", emitterRefs);
    for (const ref of emitterRefs) {
      if (typeof ref !== "number") continue;
      const emitterRaw = getDataBlockData(ref);
      if (!emitterRaw) {
        console.log("[resolveExplosion] streaming emitter ref", ref, "not found");
        continue;
      }
      console.log("[resolveExplosion] streaming emitter raw keys:", Object.keys(emitterRaw), "particles:", emitterRaw.particles);
      const resolved = resolveEmitterData(emitterRaw, getDataBlockData);
      if (resolved) {
        console.log("[resolveExplosion] streaming emitter RESOLVED — textureName:", resolved.particles.textureName, "particleLifetimeMS:", resolved.particles.lifetimeMS, "emitterLifetimeMS:", resolved.lifetimeMS, "ejectionPeriodMS:", resolved.ejectionPeriodMS);
        streamingEmitters.push(resolved);
      } else {
        console.log("[resolveExplosion] resolveEmitterData returned null for streaming emitter ref:", ref);
      }
    }
  } else {
    console.log("[resolveExplosion] no emitters array on expBlock");
  }

  if (burstEmitters.length === 0 && streamingEmitters.length === 0) {
    console.log("[resolveExplosion] no emitters resolved at all, returning null");
    return null;
  }

  // lifetimeMS is in ticks (32ms each) in the demo parser.
  const lifetimeTicks = (expBlock.lifetimeMS as number) ?? 31;
  const lifetimeMS = lifetimeTicks * 32;

  return { burstEmitters, streamingEmitters, lifetimeMS };
}

// ── Update GPU buffers from particle state ──

function syncBuffers(active: ActiveEmitter): void {
  const particles = active.emitter.particles;
  const geo = active.geometry;
  const posAttr = geo.getAttribute("position") as Float32BufferAttribute;
  const colorAttr = geo.getAttribute("particleColor") as Float32BufferAttribute;
  const sizeAttr = geo.getAttribute("particleSize") as Float32BufferAttribute;
  const spinAttr = geo.getAttribute("particleSpin") as Float32BufferAttribute;

  const posArr = posAttr.array as Float32Array;
  const colArr = colorAttr.array as Float32Array;
  const sizeArr = sizeAttr.array as Float32Array;
  const spinArr = spinAttr.array as Float32Array;

  const count = Math.min(particles.length, MAX_PARTICLES_PER_EMITTER);

  for (let i = 0; i < count; i++) {
    const p = particles[i];

    // Swizzle Torque [x,y,z] → Three.js [y,z,x].
    const tx = p.pos[1];
    const ty = p.pos[2];
    const tz = p.pos[0];

    // Convert sRGB particle colors to linear for the shader.
    const lr = srgbToLinear(p.r);
    const lg = srgbToLinear(p.g);
    const lb = srgbToLinear(p.b);
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

      sizeArr[vi] = p.size;
      spinArr[vi] = p.currentSpin;
    }
  }

  // Zero out unused vertices so they collapse to zero-area quads.
  for (let i = count; i < MAX_PARTICLES_PER_EMITTER; i++) {
    for (let v = 0; v < 4; v++) {
      sizeArr[i * 4 + v] = 0;
    }
  }

  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;
  spinAttr.needsUpdate = true;

  geo.setDrawRange(0, count * 6);
}

// ── Main component ──

export function DemoParticleEffects({
  playback,
  snapshotRef,
}: {
  playback: DemoStreamingPlayback;
  snapshotRef: React.RefObject<DemoStreamSnapshot | null>;
}) {
  const { debugMode } = useDebug();
  const gl = useThree((s) => s.gl);
  const groupRef = useRef<Group>(null);
  const activeEmittersRef = useRef<ActiveEmitter[]>([]);
  /** Track which explosion entity IDs we've already processed. */
  const processedExplosionsRef = useRef<Set<string>>(new Set());
  /** Track which projectile entity IDs have trail emitters attached. */
  const trailEntitiesRef = useRef<Set<string>>(new Set());
  /** Throttle for periodic debug logs. */
  const lastDebugLogRef = useRef(0);

  useEffect(() => {
    console.log("[ParticleFX] MOUNTED — playback:", !!playback, "snapshotRef:", !!snapshotRef);
  }, [playback, snapshotRef]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const snapshot = snapshotRef.current;
    if (!group || !snapshot) {
      // DEBUG: log when snapshot or group is missing
      console.log("[ParticleFX] early return — group:", !!group, "snapshot:", !!snapshot);
      return;
    }

    const dtMS = delta * 1000;
    const getDataBlockData = playback.getDataBlockData.bind(playback);

    // DEBUG: periodically log entity type counts (every 2 seconds).
    const now = performance.now();
    if (now - lastDebugLogRef.current > 2000) {
      lastDebugLogRef.current = now;
      const typeCounts: Record<string, number> = {};
      let withMaintainEmitter = 0;
      let withExplosionDataBlockId = 0;
      for (const e of snapshot.entities) {
        typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
        if (e.maintainEmitterId) withMaintainEmitter++;
        if (e.explosionDataBlockId) withExplosionDataBlockId++;
      }
      console.log(
        "[ParticleFX] types:", typeCounts,
        "| active emitters:", activeEmittersRef.current.length,
        "| processedExplosions:", processedExplosionsRef.current.size,
        "| trailEntities:", trailEntitiesRef.current.size,
        "| withExplosionDataBlockId:", withExplosionDataBlockId,
        "| withMaintainEmitter:", withMaintainEmitter,
      );
    }

    // Detect new explosion entities and create emitters.
    for (const entity of snapshot.entities) {
      if (
        entity.type !== "Explosion" ||
        !entity.explosionDataBlockId ||
        !entity.position
      ) {
        // DEBUG: log entities that are type "Explosion" but fail the other checks
        if (entity.type === "Explosion") {
          console.log("[ParticleFX] Explosion entity SKIPPED — id:", entity.id, "explosionDataBlockId:", entity.explosionDataBlockId, "position:", entity.position);
        }
        continue;
      }
      if (processedExplosionsRef.current.has(entity.id)) continue;
      processedExplosionsRef.current.add(entity.id);

      // DEBUG: log new explosion entity being processed
      console.log("[ParticleFX] NEW explosion entity:", entity.id, "dataBlockId:", entity.explosionDataBlockId, "pos:", entity.position);

      const resolved = resolveExplosion(
        entity.explosionDataBlockId,
        getDataBlockData,
      );
      if (!resolved) {
        console.log("[ParticleFX] resolveExplosion returned null for dataBlockId:", entity.explosionDataBlockId);
        continue;
      }

      // DEBUG: log resolved explosion details
      console.log("[ParticleFX] resolveExplosion OK — burstEmitters:", resolved.burstEmitters.length, "streamingEmitters:", resolved.streamingEmitters.length, "lifetimeMS:", resolved.lifetimeMS);

      const origin: [number, number, number] = [...entity.position];

      // Create burst emitters.
      for (const burst of resolved.burstEmitters) {
        const emitter = new EmitterInstance(
          burst.data,
          MAX_PARTICLES_PER_EMITTER,
        );
        emitter.emitBurst(origin, burst.density);

        // DEBUG: log burst emitter creation
        console.log("[ParticleFX] Created BURST emitter — particles after burst:", emitter.particles.length, "origin:", origin, "texture:", burst.data.particles.textureName, "particleLifetimeMS:", burst.data.particles.lifetimeMS, "keyframes:", burst.data.particles.keys.length, "key0:", burst.data.particles.keys[0]);

        const texture = getParticleTexture(burst.data.particles.textureName);
        console.log("[ParticleFX] burst texture loaded:", !!texture, "textureName:", burst.data.particles.textureName);
        const geometry = createParticleGeometry(MAX_PARTICLES_PER_EMITTER);
        const material = createParticleMaterial(
          texture,
          burst.data.particles.useInvAlpha,
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
          hasBurst: true,
        });
      }

      // Create streaming emitters (lifetime capped by explosion duration).
      for (const emitterData of resolved.streamingEmitters) {
        const emitter = new EmitterInstance(
          emitterData,
          MAX_PARTICLES_PER_EMITTER,
          resolved.lifetimeMS,
        );

        // DEBUG: log streaming emitter creation
        console.log("[ParticleFX] Created STREAMING emitter — emitterLifetimeMS:", emitterData.lifetimeMS, "ejectionPeriodMS:", emitterData.ejectionPeriodMS, "origin:", origin, "texture:", emitterData.particles.textureName, "particleLifetimeMS:", emitterData.particles.lifetimeMS);

        const texture = getParticleTexture(emitterData.particles.textureName);
        console.log("[ParticleFX] streaming texture loaded:", !!texture, "textureName:", emitterData.particles.textureName);
        const geometry = createParticleGeometry(MAX_PARTICLES_PER_EMITTER);
        const material = createParticleMaterial(
          texture,
          emitterData.particles.useInvAlpha,
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
          hasBurst: false,
        });
      }
    }

    // Detect projectile entities with trail emitters (maintainEmitterId).
    const currentEntityIds = new Set<string>();
    for (const entity of snapshot.entities) {
      currentEntityIds.add(entity.id);

      if (!entity.maintainEmitterId || trailEntitiesRef.current.has(entity.id)) {
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

      const emitter = new EmitterInstance(emitterData, MAX_PARTICLES_PER_EMITTER);

      console.log(
        "[ParticleFX] Created TRAIL emitter for",
        entity.type,
        entity.id,
        "— maintainEmitterId:",
        entity.maintainEmitterId,
        "texture:",
        emitterData.particles.textureName,
      );

      const texture = getParticleTexture(emitterData.particles.textureName);
      const geometry = createParticleGeometry(MAX_PARTICLES_PER_EMITTER);
      const material = createParticleMaterial(
        texture,
        emitterData.particles.useInvAlpha,
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
        hasBurst: false,
        followEntityId: entity.id,
      });
    }

    // Mark trail emitters as dead when their projectile disappears.
    for (const entry of activeEmittersRef.current) {
      if (entry.followEntityId && !currentEntityIds.has(entry.followEntityId)) {
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

      // One-time shader compilation check on first frame.
      checkShaderCompilation(gl, entry.material, entry.isBurst ? "burst" : "stream");

      // Update trail emitter origin to follow the projectile's position.
      if (entry.followEntityId) {
        const tracked = snapshot.entities.find(
          (e) => e.id === entry.followEntityId,
        );
        if (tracked?.position) {
          entry.origin[0] = tracked.position[0];
          entry.origin[1] = tracked.position[1];
          entry.origin[2] = tracked.position[2];
        }
      }

      // Streaming emitters emit periodically.
      if (!entry.isBurst) {
        entry.emitter.emitPeriodic(entry.origin, dtMS);
      }

      // Advance physics and interpolation.
      entry.emitter.update(dtMS);

      // DEBUG: log particle state on first few frames of each emitter
      if (entry.emitter.particles.length > 0 && Math.random() < 0.02) {
        const p0 = entry.emitter.particles[0];
        console.log("[ParticleFX] update — isBurst:", entry.isBurst, "particleCount:", entry.emitter.particles.length, "p0.pos:", p0.pos, "p0.size:", p0.size, "p0.a:", p0.a, "p0.age/lifetime:", p0.currentAge, "/", p0.totalLifetime, "drawRange:", entry.geometry.drawRange);
      }

      // Swap in the real texture once it finishes loading.
      if (
        _texturesReady.has(entry.targetTexture) &&
        entry.material.uniforms.particleTexture.value !== entry.targetTexture
      ) {
        entry.material.uniforms.particleTexture.value = entry.targetTexture;
      }

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
        console.log("[ParticleFX] removing DEAD emitter — isBurst:", entry.isBurst, "origin:", entry.origin);
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

    // Prune processed set when it gets large.
    if (processedExplosionsRef.current.size > 500) {
      const currentIds = new Set(snapshot.entities.map((e) => e.id));
      for (const id of processedExplosionsRef.current) {
        if (!currentIds.has(id)) {
          processedExplosionsRef.current.delete(id);
        }
      }
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
      processedExplosionsRef.current.clear();
      trailEntitiesRef.current.clear();
    };
  }, []);

  return <group ref={groupRef} />;
}

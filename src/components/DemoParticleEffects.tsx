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
  PositionalAudio,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Uint16BufferAttribute,
  UnsignedByteType,
  Vector3,
} from "three";
import { audioToUrl, textureToUrl } from "../loaders";
import { loadTexture } from "../textureUtils";
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
import { useDebug, useSettings } from "./SettingsProvider";
import { useAudio } from "./AudioContext";
import {
  resolveAudioProfile,
  playOneShotSound,
  getCachedAudioBuffer,
} from "./AudioEmitter";

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
  /** Whether shader compilation has been verified. */
  shaderChecked?: boolean;
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

const MAX_PROJECTILE_SOUNDS = 20;

export function DemoParticleEffects({
  playback,
  snapshotRef,
}: {
  playback: DemoStreamingPlayback;
  snapshotRef: React.RefObject<DemoStreamSnapshot | null>;
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
  const projectileSoundsRef = useRef<Map<string, PositionalAudio>>(new Map());
  /** Track processed audio event keys to prevent replays on seek. */
  const processedAudioEventsRef = useRef<Set<string>>(new Set());
  useFrame((_, delta) => {
    const group = groupRef.current;
    const snapshot = snapshotRef.current;
    if (!group || !snapshot) return;

    const dtMS = delta * 1000;
    const getDataBlockData = playback.getDataBlockData.bind(playback);

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

        const texture = getParticleTexture(burst.data.particles.textureName);
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

      // One-time shader compilation check.
      if (!entry.shaderChecked) {
        checkShaderCompilation(gl, entry.material, entry.isBurst ? "burst" : "stream");
        entry.shaderChecked = true;
      }

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

    // ── Audio: explosion impact sounds ──
    if (audioEnabled && audioLoader && audioListener && groupRef.current) {
      for (const entity of snapshot.entities) {
        if (
          entity.type !== "Explosion" ||
          !entity.explosionDataBlockId ||
          !entity.position
        ) {
          continue;
        }
        const soundKey = `snd:${entity.id}`;
        if (processedAudioEventsRef.current.has(soundKey)) continue;
        processedAudioEventsRef.current.add(soundKey);

        const expBlock = getDataBlockData(entity.explosionDataBlockId);
        if (!expBlock) continue;
        const soundProfileId = expBlock.soundProfile as number | undefined;
        if (typeof soundProfileId !== "number") continue;

        const resolved = resolveAudioProfile(soundProfileId, getDataBlockData);
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
      }

      // ── Audio: projectile in-flight sounds ──
      const projSounds = projectileSoundsRef.current;

      for (const entity of snapshot.entities) {
        if (entity.type !== "Projectile" || !entity.dataBlockId || !entity.position) {
          continue;
        }
        if (projSounds.has(entity.id)) {
          // Update position of existing sound.
          const sound = projSounds.get(entity.id)!;
          sound.position.set(
            entity.position[1],
            entity.position[2],
            entity.position[0],
          );
          continue;
        }
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
          getCachedAudioBuffer(url, audioLoader, (buffer) => {
            // Entity may have despawned by the time the buffer loads.
            if (!currentEntityIds.has(entity.id)) return;
            if (projSounds.has(entity.id)) return;
            const group = groupRef.current;
            if (!group) return;

            const sound = new PositionalAudio(audioListener);
            sound.setBuffer(buffer);
            sound.setDistanceModel("inverse");
            sound.setRefDistance(resolved.refDist);
            sound.setMaxDistance(resolved.maxDist);
            sound.setRolloffFactor(1);
            sound.setVolume(resolved.volume);
            sound.setLoop(true);
            sound.position.set(
              entity.position![1],
              entity.position![2],
              entity.position![0],
            );
            group.add(sound);
            sound.play();
            projSounds.set(entity.id, sound);
          });
        } catch {
          // File not in manifest.
        }
      }

      // Despawn: stop sounds for entities no longer present.
      for (const [entityId, sound] of projSounds) {
        if (!currentEntityIds.has(entityId)) {
          try { sound.stop(); } catch {}
          sound.disconnect();
          groupRef.current?.remove(sound);
          projSounds.delete(entityId);
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

    // Prune processed set when it gets large.
    if (processedExplosionsRef.current.size > 500) {
      const currentIds = new Set(snapshot.entities.map((e) => e.id));
      for (const id of processedExplosionsRef.current) {
        if (!currentIds.has(id)) {
          processedExplosionsRef.current.delete(id);
        }
      }
    }
    // Prune processed audio events set: keep only entries for current entities
    // and recent event keys.
    if (processedAudioEventsRef.current.size > 500) {
      const currentIds = new Set(snapshot.entities.map((e) => e.id));
      for (const key of processedAudioEventsRef.current) {
        // Keep explosion sound keys (prefixed "snd:") if entity is still present.
        if (key.startsWith("snd:") && currentIds.has(key.slice(4))) continue;
        processedAudioEventsRef.current.delete(key);
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
      // Clean up projectile sounds.
      for (const [, sound] of projectileSoundsRef.current) {
        try { sound.stop(); } catch {}
        sound.disconnect();
        if (group) group.remove(sound);
      }
      projectileSoundsRef.current.clear();
      processedAudioEventsRef.current.clear();
    };
  }, []);

  return <group ref={groupRef} />;
}

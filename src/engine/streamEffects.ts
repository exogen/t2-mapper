import { Group, Mesh, Vector3 } from "three";
import type { StreamingPlayback } from "../stream/types";
import { streamClock } from "../state/streamPlaybackStore";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { collisionState } from "../collision/collisionContext";
import { interiorColliderVersion } from "../collision/worldCollision";
import type { DebrisHistory } from "../stream/debrisHistory";
import { DebrisSimulation } from "../particles/DebrisSimulation";
import { GroundEffectSimulation } from "../particles/GroundEffectSimulation";
import { GroundEffectPlayback } from "../particles/groundEffectPlayback";
import {
  createParticleGeometry,
  createParticleMaterial,
  getParticleTexture,
  syncBuffers,
  particleTexturesReady,
  type ParticleBuffers,
} from "../particles/particleRenderer";
import { WorldDecalRenderer } from "../particles/WorldDecalRenderer";
import type { EmitterInstance } from "../particles/ParticleSystem";
import { DebrisRenderer } from "./debrisRenderer";
import { getAudioGraph } from "./audioGraph";
import { playOneShotSound, resolveAudioProfile } from "./soundEffects";
import { requestShockwave } from "./shockwaveRequests";
import { createParticleEffects } from "./particleEffects";
import { combineCleanups, reaction } from "./storeReaction";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";
import { torqueVecToThree } from "../scene/coordinates";

interface StreamEffect {
  group: Group;
  dispose(): void;
}

class DebrisRuntime {
  renderer: DebrisRenderer;
  simulation: DebrisSimulation;
  generation: number;
  seek = -1;
  terrain: unknown;
  interiors = -1;
  time = -Infinity;
  warming = true;
  constructor(
    renderer: DebrisRenderer,
    simulation: DebrisSimulation,
    generation: number,
  ) {
    this.renderer = renderer;
    this.simulation = simulation;
    this.generation = generation;
  }
  update(
    now: number,
    history: DebrisHistory,
    seek: number,
    delta: number,
  ): "pending" | "replay" | "fresh" {
    const { simulation, renderer } = this;
    const terrain = collisionState().terrain,
      interiors = interiorColliderVersion();
    const assetsReady = [...simulation.missingShapes].some(
      (name) => !!renderer.model(name),
    );
    if (
      this.seek !== seek ||
      this.terrain !== terrain ||
      this.interiors !== interiors ||
      now < this.time ||
      assetsReady
    ) {
      simulation.clear();
      renderer.reset();
      this.warming = true;
      this.seek = seek;
      this.terrain = terrain;
      this.interiors = interiors;
    }
    this.time = now;
    const complete = simulation.update(
      now,
      history.events,
      256,
      history.gravityChanges,
    );
    renderer.root.visible = complete;
    if (!complete) {
      this.warming = true;
      return "pending";
    }
    renderer.update(simulation, now, delta);
    const result = this.warming ? "replay" : "fresh";
    this.warming = false;
    return result;
  }
}

/** One stable owner for cosmetic debris, including bodies whose ghost is gone. */
function createDebrisEffects(
  engine: GameEngine,
  playback: StreamingPlayback,
): StreamEffect {
  const group = new Group();
  const { audioListener, audioLoader } = getAudioGraph();
  const soundLifetime = new AbortController();
  const soundOwner = { signal: soundLifetime.signal };
  let runtime: DebrisRuntime | null = null;
  const stop = combineCleanups(
    engine.scheduler.add(FramePriority.Debris, ({ renderer, delta }) => {
      const transport = engineStore.getState().playback;
      if (
        transport.status === "seeking" ||
        transport.recording?.streamingPlayback !== playback
      )
        return;
      const history = playback.debrisHistory;
      if (!history) return;
      let state = runtime;
      // Datablock IDs may be reused on a mission change; discard cached
      // factories.
      if (!state || state.generation !== history.generation) {
        state?.renderer.dispose();
        const debrisRenderer = new DebrisRenderer(
          renderer.capabilities.getMaxAnisotropy(),
          () => settingsStore.getState().animationEnabled,
          () => engine.invalidate(),
        );
        const simulation = new DebrisSimulation(
          (id) => playback.getDataBlockData(id),
          debrisRenderer.parts,
        );
        state = new DebrisRuntime(
          debrisRenderer,
          simulation,
          history.generation,
        );
        runtime = state;
        group.add(debrisRenderer.root);
      }
      const result = state.update(
        streamClock.worldTime,
        history,
        transport.seekNonce,
        delta,
      );
      if (result === "pending") {
        engine.invalidate();
        return;
      }
      if (result === "fresh" && transport.status === "playing")
        for (const entity of state.simulation.newImpacts) {
          const data = playback.getDataBlockData(entity.explosionDataBlockId!);
          if (typeof data?.shockwave === "number")
            requestShockwave({
              dataBlockId: data.shockwave,
              origin: entity.position!,
              normal: [0, 0, 1],
              ownerId: entity.id,
            });
          if (
            settingsStore.getState().audioEnabled &&
            audioListener &&
            audioLoader &&
            typeof data?.soundProfile === "number"
          ) {
            const profile = resolveAudioProfile(data.soundProfile, (id) =>
              playback.getDataBlockData(id),
            );
            const pos = entity.position!;
            if (profile)
              playOneShotSound(
                profile,
                audioListener,
                audioLoader,
                torqueVecToThree(pos, new Vector3()),
                group,
                soundOwner,
              );
          }
        }
    }),
    engine.scheduler.add(FramePriority.PostCamera, ({ camera, delta }) => {
      if (engineStore.getState().playback.status !== "seeking")
        runtime?.renderer.updateCamera(camera, delta);
    }),
  );
  return {
    group,
    dispose() {
      soundLifetime.abort();
      stop();
      runtime?.renderer.dispose();
      runtime = null;
    },
  };
}

interface GroundVisual extends ParticleBuffers {
  mesh: Mesh;
  texture: import("three").Texture;
  material: import("three").ShaderMaterial;
}

/** Forward-only ground contact visuals: dust, footprints and vehicle wakes.
 * Seeks, hidden pages and stream replacement discard these effects. Unlike
 * debris and projectile effects, they never warm up from saved history. */
function createGroundEffects(
  engine: GameEngine,
  playback: StreamingPlayback,
): StreamEffect {
  const group = new Group();
  const simulation = new GroundEffectSimulation(playback);
  const decals = new WorldDecalRenderer(group, playback);
  const visuals = new Map<EmitterInstance, GroundVisual>();
  let lastTime = -Infinity;
  const clearVisuals = () => {
    for (const v of visuals.values()) {
      v.mesh.removeFromParent();
      v.geometry.dispose();
      v.material.dispose();
    }
    visuals.clear();
  };
  const queue = playback.groundEffectQueue;
  if (!queue) return { group, dispose() {} };
  const timing = new GroundEffectPlayback(queue, simulation, () => {
    clearVisuals();
    decals.dispose();
    lastTime = -Infinity;
  });
  const syncTransport = () => {
    const transport = engineStore.getState().playback;
    timing.setCaptureSuspended(
      transport.status === "seeking" ||
        document.visibilityState === "hidden" ||
        transport.recording?.streamingPlayback !== playback,
    );
  };
  const unsubscribe = engineStore.subscribe(syncTransport);
  document.addEventListener("visibilitychange", syncTransport);
  syncTransport();
  const stop = engine.scheduler.add(FramePriority.PostCamera, () => {
    const transport = engineStore.getState().playback;
    if (transport.recording?.streamingPlayback !== playback) return;
    const now = streamClock.worldTime;
    const terrain = collisionState().terrain;
    timing.update(now, transport.seekNonce, terrain);
    if (!terrain || transport.status === "seeking") return;
    const live = new Set<EmitterInstance>();
    for (const entry of simulation.emitters.values()) {
      const emitter = entry.emitter;
      live.add(emitter);
      let visual = visuals.get(emitter);
      if (!visual) {
        if (!emitter.particles.length) continue;
        const texture = getParticleTexture(emitter.data.particles.textureName);
        const geometry = createParticleGeometry(emitter.maxParticles, true);
        const material = createParticleMaterial(
          texture,
          emitter.data.particles.useInvAlpha,
          emitter.data.orientParticles,
          true,
        );
        const mesh = new Mesh(geometry, material);
        mesh.frustumCulled = false;
        group.add(mesh);
        visual = { emitter, geometry, material, mesh, texture };
        visuals.set(emitter, visual);
      }
      if (particleTexturesReady.has(visual.texture))
        visual.material.uniforms.particleTexture.value = visual.texture;
      syncBuffers(visual);
      visual.material.uniforms.renderDelta.value = Math.max(
        0,
        now - simulation.timeSec,
      );
    }
    for (const [emitter, v] of visuals)
      if (!live.has(emitter)) {
        v.mesh.removeFromParent();
        v.geometry.dispose();
        v.material.dispose();
        visuals.delete(emitter);
      }
    if (now !== lastTime)
      decals.update(simulation.decals, now, simulation.decalTimeoutSec);
    decals.updateTextureVisibility();
    lastTime = now;
  });
  return {
    group,
    dispose() {
      unsubscribe();
      document.removeEventListener("visibilitychange", syncTransport);
      stop();
      timing.dispose();
      simulation.clear();
      clearVisuals();
      decals.dispose();
    },
  };
}

/**
 * The playing stream's transient effects — ground effects, debris and
 * particles — for as long as its recording plays.
 */
export function installStreamEffects(engine: GameEngine): () => void {
  return engine.withHost(({ scene }) =>
    reaction(
      engineStore,
      (state) => state.playback.recording?.streamingPlayback,
      (playback) => {
        if (!playback) return;
        const effects = [
          createGroundEffects(engine, playback),
          createDebrisEffects(engine, playback),
          createParticleEffects(engine, playback, engine.streamSnapshot),
        ];
        for (const effect of effects) scene.add(effect.group);
        return () => {
          for (const effect of effects) {
            scene.remove(effect.group);
            effect.dispose();
          }
        };
      },
    ),
  );
}

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
import { groundAssetsVersion } from "../particles/groundEffectAssets";
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

/** Ground effects (dust, footprints, vehicle wakes) and world decals. */
function createGroundEffects(
  engine: GameEngine,
  playback: StreamingPlayback,
): StreamEffect {
  const group = new Group();
  const simulation = new GroundEffectSimulation(playback);
  const decals = new WorldDecalRenderer(group, playback);
  const visuals = new Map<EmitterInstance, GroundVisual>();
  const last = {
    playback: undefined as StreamingPlayback | undefined,
    generation: -1,
    seek: -1,
    assets: -1,
    terrain: collisionState().terrain,
    time: -Infinity,
  };
  const clearVisuals = () => {
    for (const v of visuals.values()) {
      v.mesh.removeFromParent();
      v.geometry.dispose();
      v.material.dispose();
    }
    visuals.clear();
  };
  const stop = engine.scheduler.add(FramePriority.PostCamera, () => {
    const transport = engineStore.getState().playback;
    if (
      transport.status === "seeking" ||
      transport.recording?.streamingPlayback !== playback
    )
      return;
    const history = playback.groundEffectHistory;
    if (!history) return;
    const now = streamClock.worldTime,
      state = last;
    const seek = transport.seekNonce,
      terrain = collisionState().terrain;
    if (
      state.playback !== playback ||
      state.generation !== history.generation ||
      (Number.isFinite(simulation.timeSec) &&
        simulation.timeSec < history.oldestTimeSec - 0.033) ||
      state.seek !== seek ||
      (state.assets !== groundAssetsVersion &&
        simulation.hasNewShapeAssets()) ||
      state.terrain !== terrain ||
      now < state.time
    ) {
      state.playback = playback;
      simulation.clear();
      clearVisuals();
      // A new live world can assign different DecalData to the same IDs.
      if (state.generation !== history.generation) decals.dispose();
      decals.update([], now, simulation.decalTimeoutSec);
      state.generation = history.generation;
      state.seek = seek;
      state.assets = groundAssetsVersion;
      state.terrain = terrain;
      state.time = -Infinity;
    }
    state.assets = groundAssetsVersion;
    if (!terrain) return;
    history.visit(simulation.timeSec, now, (frame) => simulation.step(frame));
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
    if (now !== state.time)
      decals.update(simulation.decals, now, simulation.decalTimeoutSec);
    decals.updateTextureVisibility();
    state.time = now;
  });
  return {
    group,
    dispose() {
      stop();
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

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh } from "three";
import type { StreamingPlayback } from "../stream/types";
import { streamClock } from "../state/streamPlaybackStore";
import { engineStore } from "../state/engineStore";
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
import { collisionState } from "../collision/collisionContext";
import type { EmitterInstance } from "../particles/ParticleSystem";

interface Visual extends ParticleBuffers {
  mesh: Mesh;
  texture: import("three").Texture;
  material: import("three").ShaderMaterial;
}

export function GroundEffects({ playback }: { playback: StreamingPlayback }) {
  const group = useMemo(() => new Group(), []);
  const simulation = useMemo(
    () => new GroundEffectSimulation(playback),
    [playback],
  );
  const decals = useMemo(
    () => new WorldDecalRenderer(group, playback),
    [group, playback],
  );
  const visuals = useRef(new Map<EmitterInstance, Visual>());
  const last = useRef({
    playback: undefined as StreamingPlayback | undefined,
    generation: -1,
    seek: -1,
    assets: -1,
    terrain: collisionState().terrain,
    time: -Infinity,
  });
  const clearVisuals = () => {
    for (const v of visuals.current.values()) {
      v.mesh.removeFromParent();
      v.geometry.dispose();
      v.material.dispose();
    }
    visuals.current.clear();
  };
  useEffect(
    () => () => {
      clearVisuals();
      decals.dispose();
    },
    [decals],
  );
  useFrame(() => {
    const history = playback.groundEffectHistory;
    if (!history) return;
    const now = streamClock.time,
      state = last.current;
    const seek = engineStore.getState().playback.seekNonce,
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
      let visual = visuals.current.get(emitter);
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
        visuals.current.set(emitter, visual);
      }
      if (particleTexturesReady.has(visual.texture))
        visual.material.uniforms.particleTexture.value = visual.texture;
      syncBuffers(visual);
      visual.material.uniforms.renderDelta.value = Math.max(
        0,
        now - simulation.timeSec,
      );
    }
    for (const [emitter, v] of visuals.current)
      if (!live.has(emitter)) {
        v.mesh.removeFromParent();
        v.geometry.dispose();
        v.material.dispose();
        visuals.current.delete(emitter);
      }
    if (now !== state.time)
      decals.update(simulation.decals, now, simulation.decalTimeoutSec);
    decals.updateTextureVisibility();
    state.time = now;
  });
  return <primitive object={group} />;
}

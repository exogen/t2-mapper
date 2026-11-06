import { Group, Mesh, Vector3, type Object3D, type Texture } from "three";
import { EmitterInstance } from "../particles/ParticleSystem";
import { warmAmbientEmitter } from "../particles/ambientWarmup";
import type { EmitterDataResolved } from "../particles/types";
import {
  createParticleGeometry,
  createParticleMaterial,
  getParticleTexture,
  particleTexturesReady,
  syncBuffers,
} from "../particles/particleRenderer";
import { engineStore, worldDeltaSec } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { gameEntityStore } from "../state/gameEntityStore";
import type { ParticleEmissionDummyEntity } from "../state/gameEntityTypes";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";

interface Driver {
  anchor: Object3D;
  entity: ParticleEmissionDummyEntity;
  data?: EmitterDataResolved;
  finished: boolean;
  needsWarmup: boolean;
  active?: Emission;
}

interface Emission {
  driver: Driver;
  emitter: EmitterInstance;
  geometry: ReturnType<typeof createParticleGeometry>;
  material: ReturnType<typeof createParticleMaterial>;
  mesh: Mesh;
  texture: Texture;
  uploadedRevision?: number;
}

/** Four vertices per quad; WebGL2 reserves Uint16 index 65535 for restart. */
const MAX_PARTICLES = 16383;
const emissionAxis = new Vector3();

export function emissionTimeMultiple(value = 1): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0.01, value)) : 1;
}

/**
 * Continuous scenery can keep thousands of particles alive. Include a frame
 * of births before expired particles are reclaimed; 256 clips WOE's haze,
 * rain and snow long before their authored lifetimes.
 */
export function ambientParticleCapacity(
  data: EmitterDataResolved,
  timeMultiple: number,
): number {
  const lifetime =
    data.particles.lifetimeMS + data.particles.lifetimeVarianceMS;
  const period = Math.max(1, data.ejectionPeriodMS - data.periodVarianceMS);
  return Math.min(
    MAX_PARTICLES,
    Math.max(256, Math.ceil(((lifetime + 1000) * timeMultiple) / period)),
  );
}

/** Read the dummy's world translation and rotated local +Z, ignoring scale. */
export function readEmissionTransform(
  anchor: Object3D,
  origin: [number, number, number],
  axis: [number, number, number],
): void {
  anchor.updateWorldMatrix(true, false);
  const m = anchor.matrixWorld.elements;
  // Torque +Z is Three +Y; particle simulation uses Torque coordinates.
  origin[0] = m[14];
  origin[1] = m[12];
  origin[2] = m[13];
  // Native scale is stored separately from the transform. Compose rotations
  // explicitly so negative/zero scale cannot reverse or erase the axis.
  emissionAxis.set(0, 1, 0);
  for (let object: Object3D | null = anchor; object; object = object.parent)
    emissionAxis.applyQuaternion(object.quaternion);
  axis[0] = emissionAxis.z;
  axis[1] = emissionAxis.x;
  axis[2] = emissionAxis.y;
}

/**
 * Engine-owned world particles, driven by entity views. Keeping their meshes
 * outside positioned roots avoids applying a dummy's transform twice and
 * lets a deleted dummy's particles finish their lifetimes. Host disconnects,
 * mission changes and seeks discard the old world's particles together.
 */
export class AmbientParticles {
  readonly group = new Group();
  private readonly engine: GameEngine;
  private readonly drivers = new Set<Driver>();
  private readonly emissions = new Set<Emission>();
  private scope: unknown[] = [];
  private readonly origin: [number, number, number] = [0, 0, 0];
  private readonly axis: [number, number, number] = [0, 0, 1];
  private readonly velocity: [number, number, number] = [0, 0, 0];

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  install(): () => void {
    return this.engine.withHost(({ scene }) => {
      scene.add(this.group);
      const stop = this.engine.scheduler.add(
        FramePriority.PostCamera,
        ({ delta }) => this.update(delta),
      );
      return () => {
        stop();
        this.clear();
        this.group.removeFromParent();
      };
    });
  }

  add(
    anchor: Object3D,
    entity: ParticleEmissionDummyEntity,
  ): {
    update(entity: ParticleEmissionDummyEntity): void;
    dispose(finishParticles?: boolean): void;
  } {
    const driver: Driver = {
      anchor,
      entity,
      finished: false,
      needsWarmup: true,
    };
    this.drivers.add(driver);
    this.engine.invalidate();
    return {
      update: (next) => {
        driver.entity = next;
        this.engine.invalidate();
      },
      dispose: (finishParticles = false) => {
        this.drivers.delete(driver);
        for (const emission of this.emissions) {
          if (emission.driver !== driver) continue;
          if (finishParticles) emission.emitter.kill();
          else this.remove(emission);
        }
        driver.active = undefined;
        this.engine.invalidate();
      },
    };
  }

  private remove(emission: Emission): void {
    emission.mesh.removeFromParent();
    emission.geometry.dispose();
    emission.material.dispose();
    this.emissions.delete(emission);
    if (emission.driver.active === emission) {
      emission.driver.active = undefined;
      emission.driver.finished = true;
    }
  }

  private clear(): void {
    for (const emission of this.emissions) this.remove(emission);
    for (const driver of this.drivers) {
      driver.active = undefined;
      driver.data = undefined;
      driver.finished = false;
      driver.needsWarmup = true;
    }
    this.scope = [];
  }

  private create(
    driver: Driver,
    data: EmitterDataResolved,
    timeMultiple: number,
  ): Emission {
    const capacity = ambientParticleCapacity(data, timeMultiple);
    // Particle storage grows on demand; keep its limit at the geometry's
    // representable maximum so frame hitches and timeMultiple changes cannot
    // discard particles merely because the initial estimate was smaller.
    const emitter = new EmitterInstance(data, MAX_PARTICLES);
    const texture = getParticleTexture(data.particles.textureName);
    const geometry = createParticleGeometry(capacity);
    const material = createParticleMaterial(
      texture,
      data.particles.useInvAlpha,
      data.orientParticles,
    );
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const emission = {
      driver,
      emitter,
      texture,
      geometry,
      material,
      mesh,
    };
    this.emissions.add(emission);
    return emission;
  }

  private update(delta: number): void {
    if (!this.drivers.size && !this.emissions.size) return;
    const state = engineStore.getState();
    const { playback } = state;
    const mission = gameEntityStore.getState();
    const scope = [
      state.runtime.runtime,
      playback.recording,
      playback.recording?.streamingPlayback.worldGeneration,
      playback.seekNonce,
      mission.dataSource,
      mission.missionName,
    ];
    if (scope.some((value, i) => value !== this.scope[i])) {
      this.clear();
      this.scope = scope;
    }
    if (playback.status === "seeking") return;

    const dtMS = worldDeltaSec(delta) * 1000;
    const gravity = this.engine.streamSnapshot.current?.gravity ?? -9.81;
    for (const driver of this.drivers) {
      const { entity } = driver;
      const data = entity.particleEmitter;
      const multiple = emissionTimeMultiple(entity.timeMultiple);
      let emission = driver.active;
      if (driver.data !== data) {
        emission?.emitter.kill();
        driver.active = emission = undefined;
        if (driver.data) driver.needsWarmup = false;
        driver.data = data;
        driver.finished = false;
      }
      if (!data || driver.finished) continue;
      readEmissionTransform(driver.anchor, this.origin, this.axis);
      const speed = entity.emissionVelocity ?? 1;
      for (let i = 0; i < 3; i++) this.velocity[i] = this.axis[i] * speed;
      if (!emission) {
        driver.active = emission = this.create(driver, data, multiple);
        emission.emitter.worldGravity = gravity;
        if (
          driver.needsWarmup &&
          playback.recording &&
          entity.spawnTime != null
        )
          warmAmbientEmitter(
            emission.emitter,
            (streamClock.worldTime - entity.spawnTime) * 1000 - dtMS,
            this.origin,
            this.axis,
            this.velocity,
            multiple,
          );
        driver.needsWarmup = false;
      }
      emission.emitter.worldGravity = gravity;
      emission.emitter.emitPeriodic(
        this.origin,
        this.origin,
        dtMS * multiple,
        this.axis,
        this.velocity,
      );
    }

    const opacity = selectDebugMode(settingsStore.getState()) ? 0.2 : 1;
    for (const emission of this.emissions) {
      emission.emitter.worldGravity = gravity;
      // timeMultiple changes birth frequency, not particle age or physics.
      emission.emitter.update(dtMS);
      if (emission.emitter.isDead()) {
        this.remove(emission);
        continue;
      }
      if (particleTexturesReady.has(emission.texture))
        emission.material.uniforms.particleTexture.value = emission.texture;
      emission.material.uniforms.debugOpacity.value = opacity;
      const capacity = emission.geometry.getAttribute("position").count / 4;
      if (emission.emitter.particles.length > capacity) {
        emission.geometry.dispose();
        emission.geometry = createParticleGeometry(
          Math.min(
            MAX_PARTICLES,
            Math.max(capacity * 2, emission.emitter.particles.length),
          ),
        );
        emission.mesh.geometry = emission.geometry;
        emission.uploadedRevision = undefined;
      }
      syncBuffers(emission);
    }
    if (!this.drivers.size && !this.emissions.size) this.scope = [];
    else if (dtMS > 0 && this.emissions.size) this.engine.invalidate();
  }
}

import {
  Group,
  Mesh,
  type Camera,
  type Texture,
  type ShaderMaterial,
} from "three";
import { ShapeLoader } from "../shapeLoader";
import { shapeToUrl } from "../loaders";
import type { DTSModel, DTSShape } from "../dts/dtsModel";
import { debrisParts } from "../particles/debrisAssets";
import { disposeClonedScene, processShapeScene } from "../stream/playbackUtils";
import { createShapeLightState, updateShapeLighting } from "../shapeLighting";
import { applyFadeAndCloak } from "./shapeFadeCloak";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { ProjectileAssets } from "./projectiles/assets";
import { ProjectilePool } from "./projectiles/ProjectilePool";
import { streamEntityToGameEntity } from "../stream/entityBridge";
import type { GameEntity } from "../state/gameEntityTypes";
import type { EmitterInstance } from "../particles/ParticleSystem";
import type {
  DebrisBody,
  DebrisSimulation,
} from "../particles/DebrisSimulation";
import {
  createParticleGeometry,
  createParticleMaterial,
  getParticleTexture,
  particleTexturesReady,
  syncBuffers,
  type ParticleBuffers,
} from "../particles/particleRenderer";

interface Fragment {
  key: string;
  root: Group;
  scene: DTSShape;
  lighting: ReturnType<typeof createShapeLightState>;
  fade: number;
}
interface Trail extends ParticleBuffers {
  key: string;
  mesh: Mesh;
  texture: Texture;
  material: ShaderMaterial;
}

/** Shared source geometry; bounded pools own only per-fragment materials and
 * particle buffers. Nothing here participates in stream scene membership. */
export class DebrisRenderer {
  readonly root = new Group();
  readonly fragments = new Map<string, Fragment>();
  readonly trails = new Map<EmitterInstance, Trail>();
  readonly models = new Map<string, DTSModel>();
  private requested = new Set<string>();
  private loader = new ShapeLoader();
  private idleFragments: Fragment[] = [];
  private idleTrails: Trail[] = [];
  private assets: ProjectileAssets;
  private explosions: ProjectilePool;
  private impactEntities = new Map<string, GameEntity>();
  private disposed = false;
  private anisotropy: number;
  private invalidate: () => void;
  private animationEnabled: () => boolean;
  constructor(
    anisotropy: number,
    animationEnabled: () => boolean,
    invalidate: () => void,
  ) {
    this.anisotropy = anisotropy;
    this.animationEnabled = animationEnabled;
    this.invalidate = invalidate;
    this.root.name = "debris";
    this.assets = new ProjectileAssets(anisotropy, animationEnabled);
    this.explosions = new ProjectilePool(this.root, async (entity) => {
      const factory = await this.assets.factory(entity);
      invalidate();
      return factory;
    });
  }
  model(name: string): DTSModel | undefined {
    const model = this.models.get(name);
    if (!model && !this.requested.has(name)) {
      this.requested.add(name);
      void Promise.resolve()
        .then(() => this.loader.loadAsync(shapeToUrl(name)))
        .then(
          (model) => {
            if (this.disposed) return;
            this.models.set(name, model);
            this.invalidate();
          },
          (error) => {
            if (!this.disposed)
              console.warn(`Failed to load debris ${name}`, error);
          },
        );
    }
    return model;
  }
  parts = (name: string) => {
    const model = this.model(name);
    return model && debrisParts(model);
  };
  private fragment(body: DebrisBody): Fragment | undefined {
    if (!body.shape) return;
    const key = `${body.shape}:${body.part?.index ?? "whole"}`;
    const index = this.idleFragments.findIndex((v) => v.key === key);
    if (index >= 0) {
      const view = this.idleFragments.splice(index, 1)[0];
      view.lighting.lastProbe = null;
      view.lighting.slewing = false;
      return view;
    }
    const template = body.part?.template ?? this.model(body.shape)?.scene;
    if (!template) return;
    const root = new Group(),
      rotation = new Group();
    const scene = template.clone();
    scene.detailLevel = null;
    scene.ensureDetail(0);
    processShapeScene(scene, body.shape, { anisotropy: this.anisotropy });
    const lighting = createShapeLightState(
      scene,
      body.part ? undefined : body.shape,
    );
    rotation.rotation.y = SHAPE_MODEL_ROTATION_Y;
    root.add(rotation);
    rotation.add(scene);
    return { key, root, scene, lighting, fade: NaN };
  }
  private releaseFragment(view: Fragment): void {
    view.root.removeFromParent();
    if (this.idleFragments.length < 128) this.idleFragments.push(view);
    else disposeClonedScene(view.scene);
  }
  private releaseTrail(view: Trail): void {
    view.mesh.removeFromParent();
    if (this.idleTrails.length < 32) this.idleTrails.push(view);
    else {
      view.geometry.dispose();
      view.material.dispose();
    }
  }
  reset(): void {
    for (const view of this.fragments.values()) this.releaseFragment(view);
    for (const view of this.trails.values()) this.releaseTrail(view);
    this.fragments.clear();
    this.trails.clear();
    this.explosions.reset();
    this.impactEntities.clear();
  }
  update(sim: DebrisSimulation, now: number, delta: number): void {
    for (const [id, view] of this.fragments)
      if (!sim.bodies.has(id)) {
        this.releaseFragment(view);
        this.fragments.delete(id);
      }
    const extrapolate = Math.max(0, Math.min(0.032, now - sim.time));
    for (const body of sim.bodies.values()) {
      let view = this.fragments.get(body.id);
      if (!view) {
        view = this.fragment(body);
        if (!view) continue;
        this.fragments.set(body.id, view);
        view.root.name = body.id;
        this.root.add(view.root);
      }
      const p = body.position,
        v = body.velocity,
        t = body.stationary ? 0 : extrapolate;
      view.root.position.set(p[1] + v[1] * t, p[2] + v[2] * t, p[0] + v[0] * t);
      view.root.quaternion
        .copy(body.previousRotation)
        .slerp(body.rotation, 1 + t / 0.032);
      view.root.visible = now < body.end;
      view.scene.setImageAnimationTime(now, this.animationEnabled());
      const fade =
        body.data.fade === false ? 1 : Math.max(0, Math.min(1, body.end - now));
      if (fade !== view.fade || fade < 1) {
        applyFadeAndCloak(view.scene, fade, 0);
        view.fade = fade;
      }
      view.root.updateMatrixWorld(true);
      updateShapeLighting(view.lighting, delta * 1000);
    }
    for (const [emitter, view] of this.trails)
      if (!sim.emitters.has(emitter)) {
        this.releaseTrail(view);
        this.trails.delete(emitter);
      }
    for (const emitter of sim.emitters) {
      let view = this.trails.get(emitter);
      if (!view) {
        if (!emitter.particles.length) continue;
        const { particles, orientParticles } = emitter.data;
        const key = JSON.stringify([
          particles.textureName,
          particles.useInvAlpha,
          orientParticles,
          emitter.maxParticles,
        ]);
        const index = this.idleTrails.findIndex((v) => v.key === key);
        if (index >= 0) {
          view = this.idleTrails.splice(index, 1)[0];
          view.emitter = emitter;
          view.uploadedRevision = undefined;
        } else {
          const texture = getParticleTexture(particles.textureName);
          const geometry = createParticleGeometry(emitter.maxParticles, true);
          const material = createParticleMaterial(
            texture,
            particles.useInvAlpha,
            orientParticles,
            true,
          );
          const mesh = new Mesh(geometry, material);
          mesh.frustumCulled = false;
          view = { key, emitter, texture, geometry, material, mesh };
        }
        this.trails.set(emitter, view);
        this.root.add(view.mesh);
      }
      if (particleTexturesReady.has(view.texture))
        view.material.uniforms.particleTexture.value = view.texture;
      syncBuffers(view);
      view.material.uniforms.renderDelta.value = extrapolate;
    }
    for (const id of this.impactEntities.keys())
      if (!sim.impacts.has(id)) this.impactEntities.delete(id);
    for (const [id, impact] of sim.impacts)
      if (!this.impactEntities.has(id))
        this.impactEntities.set(
          id,
          streamEntityToGameEntity(impact.entity, impact.entity.spawnTimeSec),
        );
    this.explosions.sync(this.impactEntities);
    this.explosions.prepare(delta, (root, entity) => {
      const pos = sim.impacts.get(entity.id)!.entity.position!;
      root.position.set(pos[1], pos[2], pos[0]);
    });
  }
  updateCamera(camera: Camera, delta: number): void {
    this.explosions.update(camera, delta);
  }
  dispose(): void {
    this.reset();
    this.disposed = true;
    for (const view of this.idleFragments) disposeClonedScene(view.scene);
    for (const view of this.idleTrails) {
      view.geometry.dispose();
      view.material.dispose();
    }
    this.idleFragments.length = 0;
    this.idleTrails.length = 0;
    this.explosions.dispose();
    this.assets.dispose();
    this.models.clear();
    this.root.removeFromParent();
  }
}

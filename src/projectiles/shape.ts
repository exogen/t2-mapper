import { streamClock } from "../state/streamPlaybackStore";
import { holdDtsAction } from "../dts/dtsThread";
import {
  Group,
  LoopOnce,
  LoopRepeat,
  Vector3,
  type AnimationAction,
} from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { DTSModel, DTSShape } from "../dts/dtsModel";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { DTSSequenceFlags } from "../dts/dtsTypes";
import type { ShapeEntity } from "../state/gameEntityTypes";
import { effectNow, worldDeltaSec } from "../state/engineStore";
import { disposeClonedScene, processShapeScene } from "../stream/playbackUtils";
import {
  createShapeLightState,
  updateShapeLighting,
  shapeBoxCenter,
  type ShapeLightState,
} from "../shapeLighting";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { applyFadeAndCloak, advanceCloakUV } from "../engine/shapeFadeCloak";
import { projectileLight } from "./light";
import type { ProjectileView } from "./types";

function resetLighting(state: ShapeLightState): void {
  state.lastProbe = null;
  state.lastInteriors = -1;
  state.lastTerrain = -1;
  state.slewing = false;
  state.uniforms.shapeLightMode.value = 0;
  state.uniforms.shapeLightColor.value.setRGB(1, 1, 1);
}

export function createShapeProjectileView(
  model: DTSModel,
  config: ShapeEntity,
  anisotropy: number,
  emap: boolean,
  animationEnabled: () => boolean,
  casing?: { model: DTSModel; shapeName: string },
): ProjectileView<ShapeEntity> {
  const root = new Group(),
    rotation = new Group();
  rotation.rotation.y = SHAPE_MODEL_ROTATION_Y;
  root.add(rotation);
  const scene = SkeletonUtils.clone(model.scene) as DTSShape;
  rotation.add(scene);
  processShapeScene(scene, config.shapeName, {
    anisotropy,
    emap,
    skinName: config.skinName,
  });
  const casingScene = casing
    ? (SkeletonUtils.clone(casing.model.scene) as DTSShape)
    : undefined;
  if (casingScene && casing) {
    processShapeScene(casingScene, casing.shapeName, {
      anisotropy,
      emap,
      skinName: config.skinName,
    });
    rotation.add(casingScene);
  }
  const mixer = new DTSAnimationMixer(scene),
    clips = new Map(model.animations.map((c) => [c.name.toLowerCase(), c]));
  const lighting = createShapeLightState(scene, config.shapeName);
  const casingLighting = casingScene
    ? createShapeLightState(casingScene, casing?.shapeName)
    : undefined;
  const updateCasing = (entity: ShapeEntity) => {
    if (!casingScene) return;
    casingScene.visible =
      entity.seekerCasing === true ||
      (entity.seekerCasingSplitAtSec != null &&
        streamClock.worldTime < entity.seekerCasingSplitAtSec);
    scene.visible = !casingScene.visible;
  };
  let ambient: AnimationAction | undefined,
    active: AnimationAction | undefined,
    phase = "",
    fade = NaN,
    cloak = NaN;
  const play = (name: string) => {
    const clip = clips.get(name);
    if (!clip) return undefined;
    const action = mixer.clipAction(clip).reset();
    const cyclic = !!((clip.sequence?.flags ?? 0) & DTSSequenceFlags.Cyclic);
    action.setLoop(cyclic ? LoopRepeat : LoopOnce, cyclic ? Infinity : 1);
    action.clampWhenFinished = !cyclic;
    action.play();
    return action;
  };
  const color = config.lightColor ?? [1, 1, 1, 1];
  const light = projectileLight(
    scene,
    config.lightType && !(config.lightOnlyStatic && !config.isStaticItem)
      ? {
          color: { r: color[0], g: color[1], b: color[2] },
          radius: config.lightRadius ?? 10,
          offset:
            config.lightAnchor === "origin"
              ? new Vector3()
              : shapeBoxCenter(config.shapeName, model.scene),
        }
      : undefined,
  );
  return {
    root,
    reset(entity) {
      mixer.stopAllAction();
      mixer.time = 0;
      active = undefined;
      phase = "";
      fade = NaN;
      cloak = NaN;
      updateCasing(entity);
      // Projectile::onAdd creates the client-side ambient thread (FUN_00631bb0).
      ambient = entity.projectileAgeMS != null ? play("ambient") : undefined;
      scene.setImageAnimationTime(0, animationEnabled());
      light.acquire();
      resetLighting(lighting);
      if (casingLighting) resetLighting(casingLighting);
    },
    release() {
      light.release();
      mixer.stopAllAction();
    },
    dispose() {
      light.release();
      mixer.uncacheRoot(scene);
      disposeClonedScene(scene);
      if (casingScene) disposeClonedScene(casingScene);
    },
    animate(entity) {
      updateCasing(entity);
      const elapsed = Math.max(
        0,
        streamClock.worldTime - (entity.spawnTime ?? streamClock.worldTime),
      );
      const sample = (
        action: AnimationAction | undefined,
        name: string,
        time: number,
      ) => {
        if (!action) return;
        const clip = clips.get(name)!;
        const cyclic = !!(
          (clip.sequence?.flags ?? 0) & DTSSequenceFlags.Cyclic
        );
        const pos =
          animationEnabled() && clip.duration > 0 ? time / clip.duration : 0;
        holdDtsAction(action, cyclic ? ((pos % 1) + 1) % 1 : Math.min(1, pos));
      };
      sample(ambient, "ambient", elapsed);
      // Ambient begins on the client's onAdd; activation is delayed by the
      // projectile's simulation age, then maintain replaces it at its endpoint.
      const ageMS =
        (entity.projectileAgeMS ?? 0) +
        (streamClock.worldTime -
          (entity.keyframes?.[0]?.time ?? streamClock.worldTime)) *
          1000;
      const activate = clips.get("activate");
      let desired = "",
        activeTime = 0;
      if (
        activate &&
        entity.projectileActivateDelayMS != null &&
        ageMS >= entity.projectileActivateDelayMS
      ) {
        activeTime = Math.min(
          elapsed,
          (ageMS - entity.projectileActivateDelayMS) / 1000,
        );
        desired = "activate";
        if (activeTime >= activate.duration && clips.has("maintain")) {
          desired = "maintain";
          activeTime -= activate.duration;
        }
      }
      if (desired !== phase) {
        active?.stop();
        phase = desired;
        active = desired ? play(desired) : undefined;
      }
      sample(active, phase, activeTime);
      mixer.update(0);
      scene.setImageAnimationTime(elapsed, animationEnabled());
      if (light.light) {
        if (entity.underwaterLightColor) {
          const [r, g, b] = entity.projectileInWater
            ? entity.underwaterLightColor
            : color;
          light.light.color.setRGB(r, g, b);
        }
        const t = streamClock.worldTime * 1000,
          f = entity.fadeVal ?? 1;
        light.light.intensity =
          config.lightType === 2
            ? (0.15 +
                (0.5 +
                  0.5 * Math.sin((Math.PI * t) / (config.lightTime ?? 1000))) *
                  0.85) *
              f
            : f;
        if (config.lightDelayMS != null && ageMS < config.lightDelayMS)
          light.light.intensity = 0;
      }
    },
    update(entity, camera, delta) {
      const f = entity.fadeVal ?? 1,
        c = entity.cloakLevel ?? 0;
      if (c > 0) advanceCloakUV(Math.floor(effectNow() * 0.06));
      if (f !== fade || c !== cloak || f < 1 || c > 0) {
        applyFadeAndCloak(scene, f, c);
        if (casingScene) applyFadeAndCloak(casingScene, f, c);
        fade = f;
        cloak = c;
      }
      updateShapeLighting(
        casingScene?.visible && casingLighting ? casingLighting : lighting,
        worldDeltaSec(delta) * 1000,
      );
    },
  };
}

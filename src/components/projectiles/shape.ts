import {
  Group,
  LoopOnce,
  LoopRepeat,
  Vector3,
  type AnimationAction,
} from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { DTSModel, DTSShape } from "../../dts/dtsModel";
import { DTSAnimationMixer } from "../../dts/dtsAnimationMixer";
import { DTSSequenceFlags } from "../../dts/dtsTypes";
import type { ShapeEntity } from "../../state/gameEntityTypes";
import { effectDeltaSec, effectNow } from "../../state/engineStore";
import {
  disposeClonedScene,
  processShapeScene,
} from "../../stream/playbackUtils";
import {
  createShapeLightState,
  updateShapeLighting,
  shapeBoxCenter,
} from "../../shapeLighting";
import { SHAPE_MODEL_ROTATION_Y } from "../../world/placement";
import { applyFadeAndCloak, advanceCloakUV } from "../shapeFadeCloak";
import { projectileLight } from "./light";
import type { ProjectileView } from "./types";

export function createShapeProjectileView(
  model: DTSModel,
  config: ShapeEntity,
  anisotropy: number,
  emap: boolean,
  animationEnabled: () => boolean,
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
  const mixer = new DTSAnimationMixer(scene),
    clips = new Map(model.animations.map((c) => [c.name.toLowerCase(), c]));
  const lighting = createShapeLightState(scene, config.shapeName);
  let active: AnimationAction | undefined,
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
      // Projectile::onAdd creates the client-side ambient thread (FUN_00631bb0).
      if (entity.projectileAgeMS != null) play("ambient");
      scene.setImageAnimationTime(0, animationEnabled());
      light.acquire();
      lighting.lastProbe = null;
      lighting.lastInteriors = -1;
      lighting.lastTerrain = -1;
      lighting.slewing = false;
      lighting.uniforms.shapeLightMode.value = 0;
      lighting.uniforms.shapeLightColor.value.setRGB(1, 1, 1);
    },
    release() {
      light.release();
      mixer.stopAllAction();
    },
    dispose() {
      light.release();
      mixer.uncacheRoot(scene);
      disposeClonedScene(scene);
    },
    animate(entity, delta) {
      const dt = effectDeltaSec(delta);
      // LinearProjectile starts activate at activateDelayMS (FUN_0062e010),
      // then replaces it with maintain at the next end crossing (FUN_0062ee40).
      if (
        entity.projectileAgeMS != null &&
        entity.projectileActivateDelayMS != null
      ) {
        if (
          !phase &&
          entity.projectileAgeMS >= entity.projectileActivateDelayMS &&
          clips.has("activate")
        ) {
          phase = "activate";
          active = play(phase);
        } else if (
          phase === "activate" &&
          active &&
          active.time + dt >= active.getClip().duration &&
          clips.has("maintain")
        ) {
          active.stop();
          phase = "maintain";
          active = play(phase);
        }
      }
      mixer.update(animationEnabled() ? dt : 0);
      scene.setImageAnimationTime((scene.time ?? 0) + dt, animationEnabled());
      if (light.light) {
        const t = effectNow(),
          f = entity.fadeVal ?? 1;
        light.light.intensity =
          config.lightType === 2
            ? (0.15 +
                (0.5 +
                  0.5 * Math.sin((Math.PI * t) / (config.lightTime ?? 1000))) *
                  0.85) *
              f
            : f;
        if (
          config.lightDelayMS != null &&
          (entity.projectileAgeMS ?? 0) < config.lightDelayMS
        )
          light.light.intensity = 0;
      }
    },
    update(entity, camera, delta) {
      const f = entity.fadeVal ?? 1,
        c = entity.cloakLevel ?? 0;
      if (c > 0) advanceCloakUV(Math.floor(effectNow() * 0.06));
      if (f !== fade || c !== cloak || f < 1 || c > 0) {
        applyFadeAndCloak(scene, f, c);
        fade = f;
        cloak = c;
      }
      updateShapeLighting(lighting, delta * 1000);
    },
  };
}

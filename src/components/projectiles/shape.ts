import { streamClock } from "../../state/streamPlaybackStore";
import { holdDtsAction } from "../../dts/dtsThread";
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
import { effectNow } from "../../state/engineStore";
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
      // Projectile::onAdd creates the client-side ambient thread (FUN_00631bb0).
      ambient = entity.projectileAgeMS != null ? play("ambient") : undefined;
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
    animate(entity) {
      const elapsed = Math.max(
        0,
        streamClock.time - (entity.spawnTime ?? streamClock.time),
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
      const age =
        (entity.projectileAgeMS ?? 0) / 1000 +
        streamClock.time -
        (entity.keyframes?.[0]?.time ?? streamClock.time);
      const activate = clips.get("activate");
      let desired = "",
        activeTime = 0;
      if (
        activate &&
        entity.projectileActivateDelayMS != null &&
        age * 1000 >= entity.projectileActivateDelayMS
      ) {
        activeTime = Math.min(
          elapsed,
          Math.max(0, age - entity.projectileActivateDelayMS / 1000),
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
        const t = streamClock.time * 1000,
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

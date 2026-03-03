import { Suspense, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  Object3D,
  Vector3,
} from "three";
import type { AnimationAction } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  ANIM_TRANSITION_TIME,
  DEFAULT_EYE_HEIGHT,
  getKeyframeAtTime,
  getPosedNodeTransform,
  processShapeScene,
} from "../demo/demoPlaybackUtils";
import { pickMoveAnimation } from "../demo/playerAnimation";
import { getAliasedActions } from "../torqueScript/shapeConstructor";
import { useStaticShape } from "./GenericShape";
import { ShapeErrorBoundary } from "./DemoEntities";
import { useEngineStoreApi, useEngineSelector } from "../state";
import type { DemoEntity } from "../demo/types";

/**
 * Renders a player model with skeleton-preserving animation.
 *
 * Uses SkeletonUtils.clone to deep-clone the GLTF scene with skeleton bindings
 * intact, then drives a per-entity AnimationMixer to play movement animations
 * (Root, Forward, Back, Side, Fall) selected from the keyframe velocity data.
 * Weapon is attached to the animated Mount0 bone.
 */
export function DemoPlayerModel({
  entity,
  timeRef,
}: {
  entity: DemoEntity;
  timeRef: MutableRefObject<number>;
}) {
  const engineStore = useEngineStoreApi();
  const gltf = useStaticShape(entity.dataBlock!);
  const shapeAliases = useEngineSelector((state) => {
    const shapeName = entity.dataBlock?.toLowerCase();
    return shapeName
      ? state.runtime.sequenceAliases.get(shapeName)
      : undefined;
  });

  // Clone scene preserving skeleton bindings, create mixer, find Mount0 bone.
  const { clonedScene, mixer, mount0 } = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as Group;
    processShapeScene(scene);
    const mix = new AnimationMixer(scene);

    let m0: Object3D | null = null;
    scene.traverse((n) => {
      if (!m0 && n.name === "Mount0") m0 = n;
    });

    return { clonedScene: scene, mixer: mix, mount0: m0 };
  }, [gltf]);

  // Build case-insensitive clip lookup with alias support.
  const animActionsRef = useRef(new Map<string, AnimationAction>());
  const currentAnimRef = useRef({ name: "root", timeScale: 1 });
  const isDeadRef = useRef(false);

  useEffect(() => {
    const actions = getAliasedActions(gltf.animations, mixer, shapeAliases);
    animActionsRef.current = actions;

    // Start with root (idle) animation.
    const rootAction = actions.get("root");
    if (rootAction) {
      rootAction.play();
    }
    currentAnimRef.current = { name: "root", timeScale: 1 };

    // Force initial pose evaluation.
    mixer.update(0);

    return () => {
      mixer.stopAllAction();
      animActionsRef.current = new Map();
    };
  }, [mixer, gltf.animations, shapeAliases]);

  // Per-frame animation selection and mixer update.
  useFrame((_, delta) => {
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const time = timeRef.current;

    // Resolve velocity at current playback time.
    const kf = getKeyframeAtTime(entity.keyframes, time);
    const isDead = kf?.damageState != null && kf.damageState >= 1;
    const actions = animActionsRef.current;

    // Alive→Dead transition: play a random death animation.
    if (isDead && !isDeadRef.current) {
      isDeadRef.current = true;

      const deathClips = [...actions.keys()].filter((k) =>
        k.startsWith("death"),
      );
      if (deathClips.length > 0) {
        const pick = deathClips[Math.floor(Math.random() * deathClips.length)];
        const prevAction = actions.get(
          currentAnimRef.current.name.toLowerCase(),
        );
        if (prevAction) prevAction.fadeOut(ANIM_TRANSITION_TIME);

        const deathAction = actions.get(pick)!;
        deathAction.setLoop(LoopOnce, 1);
        deathAction.clampWhenFinished = true;
        deathAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
        currentAnimRef.current = { name: pick, timeScale: 1 };
      }
    }

    // Dead→Alive transition: stop death animation, let movement resume.
    if (!isDead && isDeadRef.current) {
      isDeadRef.current = false;

      const deathAction = actions.get(currentAnimRef.current.name.toLowerCase());
      if (deathAction) {
        deathAction.stop();
        deathAction.setLoop(LoopRepeat, Infinity);
        deathAction.clampWhenFinished = false;
      }
      // Reset to root so movement selection picks up on next iteration.
      currentAnimRef.current = { name: "root", timeScale: 1 };
      const rootAction = actions.get("root");
      if (rootAction) rootAction.reset().play();
    }

    // Movement animation selection (skip while dead).
    if (!isDeadRef.current) {
      const anim = pickMoveAnimation(
        kf?.velocity,
        kf?.rotation ?? [0, 0, 0, 1],
      );

      const prev = currentAnimRef.current;
      if (anim.animation !== prev.name || anim.timeScale !== prev.timeScale) {
        const prevAction = actions.get(prev.name.toLowerCase());
        const nextAction = actions.get(anim.animation.toLowerCase());

        if (nextAction) {
          if (isPlaying && prevAction && prevAction !== nextAction) {
            prevAction.fadeOut(ANIM_TRANSITION_TIME);
            nextAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
          } else {
            if (prevAction && prevAction !== nextAction) prevAction.stop();
            nextAction.reset().play();
          }
          nextAction.timeScale = anim.timeScale;
          currentAnimRef.current = {
            name: anim.animation,
            timeScale: anim.timeScale,
          };
        }
      }
    }

    // Advance or evaluate the body animation mixer.
    if (isPlaying) {
      mixer.update(delta * playback.rate);
    } else {
      mixer.update(0);
    }
  });

  return (
    <>
      <group rotation={[0, Math.PI / 2, 0]}>
        <primitive object={clonedScene} />
      </group>
      {entity.weaponShape && mount0 && (
        <ShapeErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <AnimatedWeaponMount
              weaponShape={entity.weaponShape}
              mount0={mount0}
            />
          </Suspense>
        </ShapeErrorBoundary>
      )}
    </>
  );
}

/**
 * Imperatively attaches a weapon model to the animated Mount0 bone.
 * Computes the Mountpoint inverse offset so the weapon's grip aligns with
 * the player's hand. The weapon follows the animated skeleton automatically.
 */
export function AnimatedWeaponMount({
  weaponShape,
  mount0,
}: {
  weaponShape: string;
  mount0: Object3D;
}) {
  const weaponGltf = useStaticShape(weaponShape);

  useEffect(() => {
    const weaponClone = weaponGltf.scene.clone(true);
    processShapeScene(weaponClone);

    // Compute Mountpoint inverse offset so the weapon's grip aligns to Mount0.
    const mp = getPosedNodeTransform(
      weaponGltf.scene,
      weaponGltf.animations,
      "Mountpoint",
    );
    if (mp) {
      const invQuat = mp.quaternion.clone().invert();
      const invPos = mp.position.clone().negate().applyQuaternion(invQuat);
      weaponClone.position.copy(invPos);
      weaponClone.quaternion.copy(invQuat);
    }

    mount0.add(weaponClone);

    return () => {
      mount0.remove(weaponClone);
    };
  }, [weaponGltf, mount0]);

  return null;
}

/**
 * Extracts the eye offset from a player model's Eye bone in the idle ("Root"
 * animation) pose. The Eye node is a child of "Bip01 Head" in the skeleton
 * hierarchy. Its world Y in GLB Y-up space gives the height above the player's
 * feet, which we use as the first-person camera offset.
 */
export function PlayerEyeOffset({
  shapeName,
  eyeOffsetRef,
}: {
  shapeName: string;
  eyeOffsetRef: MutableRefObject<Vector3>;
}) {
  const gltf = useStaticShape(shapeName);

  useEffect(() => {
    // Get Eye node position from the posed (Root animation) skeleton.
    const eye = getPosedNodeTransform(gltf.scene, gltf.animations, "Eye");
    if (eye) {
      // Convert from GLB space to entity space via ShapeRenderer's R90:
      // R90 maps GLB (x,y,z) → entity (z, y, -x).
      // This gives ~(0.169, 2.122, 0.0) — 17cm forward and 2.12m up.
      eyeOffsetRef.current.set(eye.position.z, eye.position.y, -eye.position.x);
    } else {
      eyeOffsetRef.current.set(0, DEFAULT_EYE_HEIGHT, 0);
    }
  }, [gltf, eyeOffsetRef]);

  return null;
}

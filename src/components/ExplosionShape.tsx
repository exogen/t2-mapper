import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, LoopOnce } from "three";
import type { Group } from "three";
import { iflSequenceTime, showIflFrame } from "../iflAtlas";
import { useEffectShapeScene } from "./useEffectShapeScene";
import { useStaticShape } from "./GenericShape";
import {
  collectVisNodes,
  visKeyframeValue,
  visThreadPosition,
  type VisNode,
} from "./visSequences";
import type { ExplosionEntity } from "../state/gameEntityTypes";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  explosionPlaySpeed,
  resolveExplosionTiming,
} from "../stream/explosionLifetime";
import { getShapeSequenceDurationSec } from "../stream/shapeSequences";

// ── Explosion shape rendering ──
//
// Explosion DTS shapes are flat billboard planes with IFL-animated textures,
// vis-keyframed opacity, and size keyframe interpolation. They use
// useStaticShape (shared GLTF cache via drei's useGLTF) but render directly
// rather than through ShapeRenderer, because:
// - faceViewer billboarding needs to control the shape orientation
// - ShapeModel's fixed 90° Y rotation conflicts with billboard orientation
// - Explosion shapes need LoopOnce animation, not the deploy/ambient lifecycle

function extractSizeKeyframes(expBlock: Record<string, unknown>): {
  times: number[];
  sizes: [number, number, number][];
} {
  const rawSizes = expBlock.sizes as
    Array<{ x: number; y: number; z: number }> | undefined;
  const rawTimes = expBlock.times as number[] | undefined;

  if (!Array.isArray(rawSizes) || rawSizes.length === 0) {
    return {
      times: [0, 1],
      sizes: [
        [1, 1, 1],
        [1, 1, 1],
      ],
    };
  }

  // sizes are packed as value*100 integers on the wire; divide by 100.
  const sizes: [number, number, number][] = rawSizes.map((s) => [
    s.x / 100,
    s.y / 100,
    s.z / 100,
  ]);
  // times are written via writeFloat(8) and are already [0,1] floats.
  const times = Array.isArray(rawTimes)
    ? rawTimes
    : sizes.map((_, i) => i / Math.max(sizes.length - 1, 1));

  return { times, sizes };
}

function interpolateSize(
  keyframes: { times: number[]; sizes: [number, number, number][] },
  t: number,
): [number, number, number] {
  const { times, sizes } = keyframes;
  if (times.length === 0) return [1, 1, 1];
  if (t <= times[0]) return sizes[0];
  if (t >= times[times.length - 1]) return sizes[sizes.length - 1];

  for (let i = 0; i < times.length - 1; i++) {
    if (t >= times[i] && t <= times[i + 1]) {
      const frac = (t - times[i]) / (times[i + 1] - times[i]);
      return [
        sizes[i][0] + (sizes[i + 1][0] - sizes[i][0]) * frac,
        sizes[i][1] + (sizes[i + 1][1] - sizes[i][1]) * frac,
        sizes[i][2] + (sizes[i + 1][2] - sizes[i][2]) * frac,
      ];
    }
  }
  return sizes[sizes.length - 1];
}

/**
 * Renders an explosion DTS shape using useStaticShape (shared GLTF cache)
 * with custom rendering for faceViewer, vis/IFL animation, and size keyframes.
 */
export function ExplosionShape({ entity }: { entity: ExplosionEntity }) {
  const playback = streamPlaybackStore.getState().playback!;
  const gltf = useStaticShape(entity.shapeName!);
  const groupRef = useRef<Group>(null);
  // Stream time the engine exploded at; the thread has run since then.
  const spawnSecRef = useRef(entity.spawnTime ?? streamClock.time);
  // eslint-disable-next-line react-hooks/purity
  const randAngleRef = useRef(Math.random() * Math.PI * 2);

  const expBlock = useMemo(() => {
    if (!entity.explosionDataBlockId) return undefined;
    return playback.getDataBlockData(entity.explosionDataBlockId);
  }, [entity.explosionDataBlockId, playback]);

  const sizeKeyframes = useMemo(
    () => (expBlock ? extractSizeKeyframes(expBlock) : undefined),
    [expBlock],
  );

  // The stream engine fixes the engine lifetime at spawn; an entity without
  // one gets the same rule here (useStaticShape has registered the clips).
  const lifetimeMS = useMemo(
    () =>
      entity.lifetimeMS ??
      resolveExplosionTiming(
        expBlock,
        getShapeSequenceDurationSec(entity.shapeName, "ambient"),
      ).lifetimeMS,
    [entity.lifetimeMS, entity.shapeName, expBlock],
  );
  const faceViewer = entity.faceViewer !== false;

  const { scene, iflInstances: iflAtlasesRef } = useEffectShapeScene(
    gltf,
    entity.shapeName,
    // Explosion shapes keep their meshes in a negative-size detail
    // ("Detail-1" in effect_plasma_explosion) — the engine renders
    // detail 0 unconditionally for explosions.
    { ignoreDetailSize: true },
  );

  const { mixer, clips, visNodes, playSpeed } = useMemo(() => {
    // The engine plays one thread, "ambient": only its vis nodes matter.
    const visNodes: VisNode[] = collectVisNodes(scene).get("ambient") ?? [];

    // Activate vis nodes: make visible, ensure transparent material.
    for (const v of visNodes) {
      v.mesh.visible = true;
      if (v.mesh.material && !Array.isArray(v.mesh.material)) {
        v.mesh.material.transparent = true;
        v.mesh.material.depthWrite = false;
      }
    }

    // The engine plays ONE thread at playSpeed — it drives node transforms,
    // morph frames, vis, and IFL matFrames together.
    const playSpeed = explosionPlaySpeed(expBlock);

    // The ambient clip plus the morph-frame clips ("Ambient_{Mesh}_frame")
    // that carry DTS mesh frame animation (e.g. the plasma fireball's 35
    // billow frames). The actions themselves are created in an effect below.
    const clips = gltf.animations.filter((clip) => {
      const lower = clip.name.toLowerCase();
      return (
        lower === "ambient" ||
        (lower.startsWith("ambient_") && lower.endsWith("_frame"))
      );
    });
    const mixer = clips.length > 0 ? new AnimationMixer(scene) : null;
    return { mixer, clips, visNodes, playSpeed };
  }, [gltf, scene, expBlock]);

  // Play every clip once at playSpeed and hold the last frame. Building the
  // actions here, with the uncache as the cleanup, keeps them alive across
  // React's development double-invoke of effects: uncaching a memoized
  // mixer's actions in a cleanup that re-ran left explosions frozen on
  // their first frame.
  useEffect(() => {
    if (!mixer) return;
    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = playSpeed;
      action.play();
    }
    return () => mixer.uncacheRoot(scene);
  }, [mixer, clips, playSpeed, scene]);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    // Everything below is a function of stream time since explode(), so
    // the morph clips, vis, IFL and size keyframes can never disagree.
    const elapsedSec = Math.max(0, streamClock.time - spawnSecRef.current);
    const elapsed = elapsedSec * 1000;
    // Size keyframes run on the lifetime clock, which has been counting
    // since onAdd — a delayed explosion starts partway through them.
    const t = Math.min(((entity.startAgeMS ?? 0) + elapsed) / lifetimeMS, 1);
    // Vis and IFL follow the sequence thread, which runs at playSpeed.
    const threadSec = (elapsed / 1000) * playSpeed;

    // Morph/node clips at their absolute position (actions run at playSpeed).
    if (mixer) {
      mixer.setTime(elapsedSec);
    }

    // Drive vis opacity on the thread. Only the opacity is written: the
    // billboard's material stays in its transparent, no-depth-write state
    // for its whole life, so the opaque-restore of applyVisOpacity is not
    // wanted here.
    for (const node of visNodes) {
      const mat = node.mesh.material;
      if (!mat || Array.isArray(mat)) continue;
      mat.opacity = visKeyframeValue(
        node.keyframes,
        visThreadPosition(threadSec, node.duration, node.cyclic),
      );
    }

    // Advance IFL texture atlases on the sequence thread.
    for (const inst of iflAtlasesRef.current) {
      showIflFrame(inst, iflSequenceTime(inst.info, inst.atlas, threadSec));
    }

    // Size keyframe interpolation. Explosion::prepRender (0x620ca0 →
    // 0x620b80) writes the interpolated sizes straight into the object
    // scale before every draw, so the datablock's explosionScale — applied
    // once in explode() — never reaches the shape and is not used here.
    if (sizeKeyframes) {
      const size = interpolateSize(sizeKeyframes, t);
      group.scale.set(size[0], size[1], size[2]);
    }

    // faceViewer: billboard toward camera with random Z rotation.
    if (faceViewer) {
      group.lookAt(state.camera.position);
      group.rotateZ(randAngleRef.current);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Flip 180° around Y so the face (GLB +Z normal) points toward the
          camera after the parent group's lookAt (which aims -Z at camera). */}
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

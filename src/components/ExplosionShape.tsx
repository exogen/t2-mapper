import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, LoopOnce } from "three";
import type { Group, Material } from "three";
import { effectNow, engineStore } from "../state/engineStore";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeClonedScene, processShapeScene } from "../stream/playbackUtils";
import {
  loadIflAtlas,
  getFrameIndexForTime,
  updateAtlasFrame,
} from "./iflAtlas";
import type { IflAtlas } from "./iflAtlas";
import { useStaticShape } from "./GenericShape";
import { useAnisotropy } from "./useAnisotropy";
import type { ExplosionEntity } from "../state/gameEntityTypes";
import { streamPlaybackStore } from "../state/streamPlaybackStore";

// ── Explosion shape rendering ──
//
// Explosion DTS shapes are flat billboard planes with IFL-animated textures,
// vis-keyframed opacity, and size keyframe interpolation. They use
// useStaticShape (shared GLTF cache via drei's useGLTF) but render directly
// rather than through ShapeRenderer, because:
// - faceViewer billboarding needs to control the shape orientation
// - ShapeModel's fixed 90° Y rotation conflicts with billboard orientation
// - Explosion shapes need LoopOnce animation, not the deploy/ambient lifecycle

interface VisNode {
  mesh: any;
  keyframes: number[];
  duration: number;
  cyclic: boolean;
}

interface IflInfo {
  mesh: any;
  iflPath: string;
  sequenceName?: string;
  duration?: number;
  cyclic?: boolean;
  toolBegin?: number;
}

function extractSizeKeyframes(expBlock: Record<string, unknown>): {
  times: number[];
  sizes: [number, number, number][];
} {
  const rawSizes = expBlock.sizes as
    | Array<{ x: number; y: number; z: number }>
    | undefined;
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
  const anisotropy = useAnisotropy();
  const groupRef = useRef<Group>(null);
  const startTimeRef = useRef(effectNow());
  // eslint-disable-next-line react-hooks/purity
  const randAngleRef = useRef(Math.random() * Math.PI * 2);
  const iflAtlasesRef = useRef<Array<{ atlas: IflAtlas; info: IflInfo }>>([]);

  const expBlock = useMemo(() => {
    if (!entity.explosionDataBlockId) return undefined;
    return playback.getDataBlockData(entity.explosionDataBlockId);
  }, [entity.explosionDataBlockId, playback]);

  const sizeKeyframes = useMemo(
    () => (expBlock ? extractSizeKeyframes(expBlock) : undefined),
    [expBlock],
  );

  const baseScale = useMemo<[number, number, number]>(() => {
    const explosionScale = expBlock?.explosionScale as
      | { x: number; y: number; z: number }
      | undefined;
    return explosionScale
      ? [explosionScale.x / 100, explosionScale.y / 100, explosionScale.z / 100]
      : [1, 1, 1];
  }, [expBlock]);

  // lifetimeMS is packed as value >> 5 (ticks); recover with << 5 (× 32).
  const lifetimeTicks = (expBlock?.lifetimeMS as number) ?? 31;
  const lifetimeMS = lifetimeTicks * 32;
  const faceViewer = entity.faceViewer !== false;

  // Clone scene, process materials, collect vis nodes and IFL info.
  const { scene, mixer, visNodes, iflInfos, materials } = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as Group;

    // Collect IFL info BEFORE processShapeScene replaces materials.
    const iflInfos: IflInfo[] = [];
    scene.traverse((node: any) => {
      if (!node.isMesh || !node.material) return;
      const mat = Array.isArray(node.material)
        ? node.material[0]
        : node.material;
      if (!mat?.userData) return;
      const flags = new Set<string>(mat.userData.flag_names ?? []);
      const rp: string | undefined = mat.userData.resource_path;
      if (flags.has("IflMaterial") && rp) {
        const ud = node.userData;
        iflInfos.push({
          mesh: node,
          iflPath: `textures/${rp}.ifl`,
          sequenceName: ud?.ifl_sequence
            ? String(ud.ifl_sequence).toLowerCase()
            : undefined,
          duration: ud?.ifl_duration ? Number(ud.ifl_duration) : undefined,
          cyclic: ud?.ifl_sequence ? !!ud.ifl_cyclic : undefined,
          toolBegin:
            ud?.ifl_tool_begin != null ? Number(ud.ifl_tool_begin) : undefined,
        });
      }
    });

    processShapeScene(scene, entity.shapeName, {
      anisotropy,
    });

    // Collect vis-animated nodes keyed by sequence name.
    const visNodes: VisNode[] = [];
    scene.traverse((node: any) => {
      if (!node.isMesh) return;
      const ud = node.userData;
      if (!ud) return;
      const kf = ud.vis_keyframes;
      const dur = ud.vis_duration;
      const seqName = (ud.vis_sequence ?? "").toLowerCase();
      if (!seqName || !Array.isArray(kf) || kf.length <= 1 || !dur || dur <= 0)
        return;
      // Only include vis nodes tied to the "ambient" sequence.
      if (seqName === "ambient") {
        visNodes.push({
          mesh: node,
          keyframes: kf,
          duration: dur,
          cyclic: !!ud.vis_cyclic,
        });
      }
    });

    // Activate vis nodes: make visible, ensure transparent material.
    for (const v of visNodes) {
      v.mesh.visible = true;
      if (v.mesh.material && !Array.isArray(v.mesh.material)) {
        v.mesh.material.transparent = true;
        v.mesh.material.depthWrite = false;
      }
    }

    // Also un-hide IFL meshes that don't have vis_sequence (always visible).
    for (const info of iflInfos) {
      if (!info.mesh.userData?.vis_sequence) {
        info.mesh.visible = true;
      }
    }

    // Set up animation mixer with the ambient clip (LoopOnce).
    const clips = new Map<string, any>();
    for (const clip of gltf.animations) {
      clips.set(clip.name.toLowerCase(), clip);
    }
    const ambientClip = clips.get("ambient");
    let mixer: AnimationMixer | null = null;
    if (ambientClip) {
      mixer = new AnimationMixer(scene);
      const action = mixer.clipAction(ambientClip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      // playSpeed is packed as value*20 on the wire; divide by 20.
      const playSpeed = ((expBlock?.playSpeed as number) ?? 20) / 20;
      action.timeScale = playSpeed;
      action.play();
    }

    // Collect all materials for fade-out.
    const materials: Material[] = [];
    scene.traverse((child: any) => {
      if (!child.isMesh) return;
      if (Array.isArray(child.material)) {
        materials.push(...child.material);
      } else if (child.material) {
        materials.push(child.material);
      }
    });

    // Disable frustum culling (explosion may scale beyond bounds).
    scene.traverse((child) => {
      child.frustumCulled = false;
    });

    return { scene, mixer, visNodes, iflInfos, materials };
  }, [gltf, expBlock, anisotropy]);

  useEffect(() => {
    return () => {
      disposeClonedScene(scene);
      mixer?.uncacheRoot(scene);
    };
  }, [scene, mixer]);

  // Load IFL texture atlases.
  useEffect(() => {
    iflAtlasesRef.current = [];
    for (const info of iflInfos) {
      loadIflAtlas(info.iflPath)
        .then((atlas) => {
          const mat = Array.isArray(info.mesh.material)
            ? info.mesh.material[0]
            : info.mesh.material;
          if (mat) {
            mat.map = atlas.texture;
            mat.needsUpdate = true;
          }
          iflAtlasesRef.current.push({ atlas, info });
        })
        .catch(() => {});
    }
  }, [iflInfos]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const playbackState = engineStore.getState().playback;
    const effectDelta =
      playbackState.status === "playing" ? delta * playbackState.rate : 0;

    const elapsed = effectNow() - startTimeRef.current;
    const t = Math.min(elapsed / lifetimeMS, 1);
    const elapsedSec = elapsed / 1000;

    // Advance skeleton animation.
    if (mixer) {
      mixer.update(effectDelta);
    }

    // Fade multiplier for the last 20% of lifetime.
    const fadeAlpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;

    // Drive vis opacity animation.
    for (const { mesh, keyframes, duration, cyclic } of visNodes) {
      const mat = mesh.material;
      if (!mat || Array.isArray(mat)) continue;
      const rawT = elapsedSec / duration;
      const vt = cyclic ? rawT % 1 : Math.min(rawT, 1);
      const n = keyframes.length;
      const pos = vt * n;
      const lo = Math.floor(pos) % n;
      const hi = (lo + 1) % n;
      const frac = pos - Math.floor(pos);
      const visOpacity = keyframes[lo] + (keyframes[hi] - keyframes[lo]) * frac;
      mat.opacity = visOpacity * fadeAlpha;
    }

    // Also fade non-vis materials.
    if (fadeAlpha < 1) {
      for (const mat of materials) {
        if ("opacity" in mat) {
          mat.transparent = true;
          (mat as any).opacity *= fadeAlpha;
        }
      }
    }

    // Advance IFL texture atlases.
    for (const { atlas, info } of iflAtlasesRef.current) {
      let iflTime: number;
      if (info.sequenceName && info.duration) {
        const pos = info.cyclic
          ? (elapsedSec / info.duration) % 1
          : Math.min(elapsedSec / info.duration, 1);
        iflTime = pos * info.duration + (info.toolBegin ?? 0);
      } else {
        iflTime = elapsedSec;
      }
      updateAtlasFrame(atlas, getFrameIndexForTime(atlas, iflTime));
    }

    // Size keyframe interpolation.
    if (sizeKeyframes) {
      const size = interpolateSize(sizeKeyframes, t);
      group.scale.set(
        size[0] * baseScale[0],
        size[1] * baseScale[1],
        size[2] * baseScale[2],
      );
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

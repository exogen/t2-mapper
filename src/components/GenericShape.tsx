import { Fragment, memo, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { AnimationAction, Object3D } from "three";
import { useGLTF } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber";
import { createLogger } from "../logger";
import { shapeToUrl, textureToUrl } from "../loaders";
import {
  MeshStandardMaterial,
  AdditiveAnimationBlendMode,
  AnimationMixer,
  AnimationClip,
  AnimationUtils,
  LoopOnce,
  LoopRepeat,
  NormalBlending,
  Color,
  Group,
  Box3,
  Vector3,
  RepeatWrapping,
  NoColorSpace,
} from "three";
import type { PointLight } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { useAnisotropy } from "./useAnisotropy";
import { useDebug, useSettings } from "./SettingsProvider";
import { useShapeInfo, ShapeInfoProvider } from "./ShapeInfoProvider";
import type { StaticShapeType } from "./ShapeInfoProvider";
import {
  useEngineSelector,
  effectNow,
  engineStore,
} from "../state/engineStore";
import { FloatingLabel } from "./FloatingLabel";
import {
  loadIflAtlas,
  getFrameIndexForTime,
  updateAtlasFrame,
} from "./iflAtlas";
import type { IflAtlas } from "./iflAtlas";
import { useIsDebugTourTarget } from "../state/cameraTourStore";
import { DebugBounds } from "./DebugBounds";
import { useEntitySoundSlots } from "./useEntitySoundSlots";
import {
  processShapeScene,
  replaceWithShapeMaterial,
  disposeClonedScene,
  buildRestPoseClip,
  getPosedNodeTransform,
} from "../stream/playbackUtils";
import { resolveEmapFromImageSlot } from "./resolveEmap";
import { playerEyePositions } from "./PlayerModel";
import type { ThreadState as StreamThreadState } from "../stream/types";
import { loadTexture } from "../textureUtils";

// ── Cloak texture (binary-verified: special/cloakTexture with UV scrolling) ──
// Lazy-loaded on first use since cloaking is rare.

import type { Texture } from "three";

let _cloakTexture: Texture | null = null;
function getCloakTexture(): Texture {
  if (!_cloakTexture) {
    _cloakTexture = loadTexture(textureToUrl("special/cloakTexture"));
    _cloakTexture.wrapS = RepeatWrapping;
    _cloakTexture.wrapT = RepeatWrapping;
    _cloakTexture.colorSpace = NoColorSpace;
  }
  return _cloakTexture;
}

// Global UV offset matching engine's static shiftX/shiftY with different moduli
// to create a non-repeating shimmer pattern.
let _cloakShiftX = 0;
let _cloakShiftY = 0;
let _cloakLastFrame = -1;
function advanceCloakUV(frameId: number): void {
  if (frameId === _cloakLastFrame) return;
  _cloakLastFrame = frameId;
  _cloakShiftX = (_cloakShiftX + 1) % 128;
  _cloakShiftY = (_cloakShiftY + 1) % 127;
  getCloakTexture().offset.set(_cloakShiftX / 127, _cloakShiftY / 126);
}

/** Item/ShapeBase built-in light config from datablock. */
export interface ShapeLightConfig {
  type: number;
  color: [number, number, number, number];
  time: number;
  radius: number;
  onlyStatic: boolean;
  isStatic: boolean;
}

const STANDARD_90_ROTATION: [x: number, y: number, z: number] = [
  0,
  Math.PI / 2,
  0,
];

/** Shape entity data readable in useFrame for streaming mode. */
interface StreamShapeEntity {
  id: string;
  threads?: StreamThreadState[];
  damageState?: number;
  wheels?: Array<{
    speed: number;
    lateralSlip: number;
    longitudinalSlip: number;
  }>;
  steeringYaw?: number;
  frozen?: boolean;
  maxSteeringAngle?: number;
  soundSlots?: Array<{ index: number; playing: boolean; profileId?: number }>;
  fadeVal?: number;
  cloakLevel?: number;
  dataBlockId?: number;
  lightType?: number;
  lightColor?: [number, number, number, number];
  lightTime?: number;
  lightRadius?: number;
  lightOnlyStatic?: boolean;
  isStaticItem?: boolean;
}

const log = createLogger("GenericShape");

/**
 * Content for a mounted shape. Computes the Mountpoint inverse offset from the
 * child shape's GLB so the child's grip point aligns to the parent's mount bone.
 * Rendered via createPortal into the parent's mount bone.
 */
export function MountedShapeContent({
  shapeName,
  imageDataBlockId,
  entityId,
  shapeType = "StaticShape",
  skinName,
}: {
  shapeName: string;
  imageDataBlockId?: number;
  entityId?: string;
  shapeType?: StaticShapeType;
  skinName?: string;
}) {
  const childGltf = useStaticShape(shapeName);
  const emap = useMemo(
    () => resolveEmapFromImageSlot(imageDataBlockId),
    [imageDataBlockId],
  );

  // Compute Mountpoint inverse so the child's grip aligns to the bone origin.
  const offset = useMemo(() => {
    const mp = getPosedNodeTransform(
      childGltf.scene as Group,
      childGltf.animations,
      "Mountpoint",
    );
    if (!mp) return null;
    const invQuat = mp.quaternion.clone().invert();
    const invPos = mp.position.clone().negate().applyQuaternion(invQuat);
    return { position: invPos, quaternion: invQuat };
  }, [childGltf.scene, childGltf.animations]);

  return (
    <ShapeInfoProvider shapeName={shapeName} type={shapeType}>
      <group position={offset?.position} quaternion={offset?.quaternion}>
        <ShapeRenderer
          emap={emap}
          entityId={entityId}
          skinName={skinName}
          noRotation
        />
      </group>
    </ShapeInfoProvider>
  );
}

/** WheeledVehicle per-wheel animation state (position-controlled, not threaded). */
interface WheelAnimState {
  wheelAction?: AnimationAction;
  springAction?: AnimationAction;
  turnAction?: AnimationAction;
  rotation: number;
}

/** Returns pausable time in seconds for demo mode, real time otherwise. */
function shapeNowSec(): number {
  const { recording } = engineStore.getState().playback;
  return recording != null ? effectNow() / 1000 : performance.now() / 1000;
}

/**
 * Load a .glb file that was converted from a .dts, used for static shapes.
 */
export function useStaticShape(shapeName: string) {
  const url = shapeToUrl(shapeName);
  return useGLTF(url);
}

// Dead code removed: IflTexture, StaticTexture, ShapeTexture, useDisposeMaterial
// were part of an unused React-based IFL rendering path. All IFL materials
// are now handled imperatively via loadIflAtlas + processShapeScene.

export function ShapePlaceholder({
  color,
  label,
}: {
  color: string;
  label?: string;
}) {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color={color} wireframe />
      {label ? <FloatingLabel color={color}>{label}</FloatingLabel> : null}
    </mesh>
  );
}

export function DebugPlaceholder({
  color,
  label,
}: {
  color: string;
  label?: string;
}) {
  const { debugMode } = useDebug();
  return debugMode ? <ShapePlaceholder color={color} label={label} /> : null;
}

/**
 * Wrapper component that handles the common ErrorBoundary + Suspense + ShapeModel
 * pattern used across shape-rendering components.
 */
export const ShapeRenderer = memo(function ShapeRenderer({
  loadingColor = "yellow",
  streamEntity,
  emap,
  entityId,
  children,
  mounted,
  noRotation,
  skinName,
  lightConfig,
}: {
  loadingColor?: string;
  /** Stable entity reference whose fields are mutated in-place. */
  streamEntity?: StreamShapeEntity;
  /** Datablock enables environment map reflections. */
  emap?: boolean;
  entityId?: string;
  children?: React.ReactNode;
  /** Content to render at each mount point bone (Mount0, Mount1, etc.). */
  mounted?: Record<number, ReactNode>;
  /** Skip the 90° Y rotation (for shapes mounted inside a parent that already rotates). */
  noRotation?: boolean;
  /** Skin texture URL (Torque reSkin: replaces "base." textures with this URL). */
  skinName?: string;
  /** Item/ShapeBase built-in light config (from datablock). */
  lightConfig?: ShapeLightConfig;
}) {
  const { shapeName } = useShapeInfo();

  if (!shapeName) {
    return <DebugPlaceholder color="orange" label={`${entityId}: <missing>`} />;
  }

  return (
    <ErrorBoundary
      fallback={
        <DebugPlaceholder color="red" label={`${entityId}: ${shapeName}`} />
      }
      onError={(error) => {
        log.error("Shape error: %s: %o", shapeName, error);
      }}
    >
      <Suspense fallback={<ShapePlaceholder color={loadingColor} />}>
        <ShapeModelLoader
          streamEntity={streamEntity}
          emap={emap}
          entityId={entityId}
          mounted={mounted}
          noRotation={noRotation}
          skinName={skinName}
          lightConfig={lightConfig}
        >
          {children}
        </ShapeModelLoader>
      </Suspense>
    </ErrorBoundary>
  );
});

/** Vis node info collected from the scene for vis opacity animation. */
interface VisNode {
  mesh: any;
  keyframes: number[];
  duration: number;
  cyclic: boolean;
}

/** Active animation thread state, keyed by thread slot number. */
interface ThreadState {
  sequence: string;
  action?: AnimationAction;
  /** Morph target frame animation actions played alongside the main clip. */
  morphActions?: AnimationAction[];
  visNodes?: VisNode[];
  startTime: number;
  forward: boolean;
}

/**
 * Unified shape renderer. Clones the full scene graph (preserving skeleton
 * bindings), applies Tribes 2 materials via processShapeScene, and drives
 * animation threads either through TorqueScript (for deployable shapes with
 * a runtime) or directly (ambient/power vis sequences).
 */
export const ShapeModel = memo(function ShapeModel({
  gltf,
  streamEntity,
  emap,
  entityId,
  children,
  mounted,
  noRotation,
  skinName,
  lightConfig: lightConfigProp,
}: {
  gltf: ReturnType<typeof useStaticShape>;
  /** Stable entity reference whose fields are mutated in-place. */
  streamEntity?: StreamShapeEntity;
  /** Datablock enables environment map reflections. */
  emap?: boolean;
  entityId?: string;
  children?: ReactNode;
  /** Content to render at each mount point bone (Mount0, Mount1, etc.). */
  mounted?: Record<number, ReactNode>;
  /** Skip the 90° Y rotation (for mounted shapes). */
  noRotation?: boolean;
  /** Skin texture URL (Torque reSkin: replaces "base." textures). */
  skinName?: string;
  /** Item/ShapeBase built-in light config (from datablock). */
  lightConfig?: ShapeLightConfig;
}) {
  const { object, shapeName } = useShapeInfo();
  const { debugMode } = useDebug();
  const { animationEnabled } = useSettings();
  const runtime = useEngineSelector((state) => state.runtime.runtime);
  const anisotropy = useAnisotropy();

  const {
    clonedScene,
    mixer,
    clipsByName,
    morphClipsBySeq,
    visNodesBySequence,
    iflMeshes,
  } = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as Group;

    // Detect IFL materials BEFORE processShapeScene replaces them, since the
    // replacement materials lose the original userData (flag_names, resource_path).
    const iflInfos: Array<{
      mesh: any;
      iflPath: string;
      hasVisSequence: boolean;
      repeat: boolean;
      iflSequence?: string;
      iflDuration?: number;
      iflCyclic?: boolean;
      iflToolBegin?: number;
    }> = [];
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
        // ifl_sequence is set by the addon when ifl_matters links this IFL to
        // a controlling sequence. vis_sequence is a separate system (opacity
        // animation) and must NOT be used as a fallback — the two are independent.
        const iflSeq = ud?.ifl_sequence
          ? String(ud.ifl_sequence).toLowerCase()
          : undefined;
        const iflDur = ud?.ifl_duration ? Number(ud.ifl_duration) : undefined;
        const iflCyclic = ud?.ifl_sequence ? !!ud.ifl_cyclic : undefined;
        const iflToolBegin =
          ud?.ifl_tool_begin != null ? Number(ud.ifl_tool_begin) : undefined;
        iflInfos.push({
          mesh: node,
          iflPath: `textures/${rp}.ifl`,
          hasVisSequence: !!ud?.vis_sequence,
          repeat: flags.has("SWrap") || flags.has("TWrap"),
          iflSequence: iflSeq,
          iflDuration: iflDur,
          iflCyclic,
          iflToolBegin,
        });
      }
    });

    processShapeScene(scene, shapeName ?? undefined, {
      anisotropy,
      emap,
      skinName,
    });

    // Un-hide IFL meshes that don't have a vis sequence — they should always
    // be visible. IFL meshes WITH vis sequences stay hidden until their
    // sequence is activated by playThread.
    for (const { mesh, hasVisSequence } of iflInfos) {
      if (!hasVisSequence) {
        mesh.visible = true;
      }
    }

    // Collect ALL vis-animated nodes, grouped by sequence name.
    // Multiple sequences can animate the same mesh (e.g. station_inv_human
    // has Activate1 + Activate with vis data). The addon exports both the
    // primary vis_keyframes/vis_sequence AND per-sequence suffixed versions
    // like vis_keyframes_activate, vis_duration_activate.
    const visBySeq = new Map<string, VisNode[]>();
    scene.traverse((node: any) => {
      if (!node.isMesh) return;
      const ud = node.userData;
      if (!ud) return;

      // Helper: register one vis entry
      const addVis = (
        seqName: string,
        kf: number[],
        dur: number,
        cyclic: boolean,
      ) => {
        if (
          !seqName ||
          !Array.isArray(kf) ||
          kf.length <= 1 ||
          !dur ||
          dur <= 0
        )
          return;
        let list = visBySeq.get(seqName);
        if (!list) {
          list = [];
          visBySeq.set(seqName, list);
        }
        // Avoid duplicate mesh entries for the same sequence
        if (list.some((v) => v.mesh === node)) return;
        list.push({ mesh: node, keyframes: kf, duration: dur, cyclic });
      };

      // Primary vis entry (backwards compatible)
      addVis(
        (ud.vis_sequence ?? "").toLowerCase(),
        ud.vis_keyframes,
        ud.vis_duration,
        !!ud.vis_cyclic,
      );

      // Per-sequence suffixed entries (vis_keyframes_activate, etc.)
      for (const key of Object.keys(ud)) {
        const match = key.match(/^vis_keyframes_(.+)$/);
        if (match) {
          const suffix = match[1];
          addVis(
            suffix,
            ud[`vis_keyframes_${suffix}`],
            ud[`vis_duration_${suffix}`],
            !!ud[`vis_cyclic_${suffix}`],
          );
        }
      }
    });

    // Build clips by name (case-insensitive).
    // Blend sequences (DTS flag 0x8) store absolute transforms but must be
    // played in additive mode. Clone and convert them here so the original
    // cached clips from useGLTF are never mutated.
    const blendNames = new Set<string>();
    const rawNames = scene.userData?.dts_sequence_names;
    const rawBlend = scene.userData?.dts_sequence_blend;
    if (typeof rawNames === "string") {
      try {
        const names: string[] = JSON.parse(rawNames);
        const blend: boolean[] =
          typeof rawBlend === "string" ? JSON.parse(rawBlend) : [];
        for (let i = 0; i < names.length; i++) {
          if (blend[i]) blendNames.add(names[i].toLowerCase());
        }
      } catch {
        /* expected */
      }
    }
    // Build a set of known sequence names (lowercase) from the DTS metadata
    // so we can reliably identify morph target frame clips below.
    const knownSeqNames = new Set<string>();
    if (typeof rawNames === "string") {
      try {
        for (const n of JSON.parse(rawNames) as string[]) {
          knownSeqNames.add(n.toLowerCase());
        }
      } catch {
        /* expected */
      }
    }

    const clips = new Map<string, AnimationClip>();
    // Morph target frame animations are exported as separate clips named
    // "{SeqName}_{MeshName}_frame". Collect them so they can be played
    // alongside the main sequence clip.
    const morphClipsBySeq = new Map<string, AnimationClip[]>();
    for (const clip of gltf.animations) {
      const lower = clip.name.toLowerCase();
      // Check if this is a morph target frame clip by testing if it ends
      // with "_frame" and starts with a known sequence name prefix.
      if (lower.endsWith("_frame")) {
        let matched = false;
        for (const seqName of knownSeqNames) {
          if (
            lower.startsWith(seqName + "_") &&
            lower.length > seqName.length + 1 + 5
          ) {
            let list = morphClipsBySeq.get(seqName);
            if (!list) {
              list = [];
              morphClipsBySeq.set(seqName, list);
            }
            list.push(clip);
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }
      if (blendNames.has(lower)) {
        const cloned = clip.clone();
        const restClip = buildRestPoseClip(scene, cloned);
        AnimationUtils.makeClipAdditive(cloned, 0, restClip, 30);
        clips.set(lower, cloned);
      } else {
        clips.set(lower, clip);
      }
    }

    // Only create a mixer if there are skeleton animation clips.
    const mix = clips.size > 0 ? new AnimationMixer(scene) : null;

    return {
      clonedScene: scene,
      mixer: mix,
      clipsByName: clips,
      morphClipsBySeq,
      visNodesBySequence: visBySeq,
      iflMeshes: iflInfos,
    };
  }, [gltf.scene, gltf.animations, shapeName, anisotropy, emap, skinName]);

  // Dispose cloned geometries and materials when the scene is replaced or
  // the component unmounts, to prevent GPU memory from accumulating.
  useEffect(() => {
    return () => {
      disposeClonedScene(clonedScene);
      mixer?.uncacheRoot(clonedScene);
    };
  }, [clonedScene, mixer]);

  const threadsRef = useRef(new Map<number, ThreadState>());
  const iflMeshAtlasRef = useRef(new Map<any, IflAtlas>());

  interface IflAnimInfo {
    atlas: IflAtlas;
    /** Material reference for swap-mode texture updates. */
    mat: any;
    sequenceName?: string;
    /** Controlling sequence duration in seconds. */
    sequenceDuration?: number;
    cyclic?: boolean;
    /** Torque `toolBegin`: offset into IFL timeline (seconds). */
    toolBegin?: number;
  }
  const iflAnimInfosRef = useRef<IflAnimInfo[]>([]);
  const iflTimeRef = useRef(0);
  const animationEnabledRef = useRef(animationEnabled);
  animationEnabledRef.current = animationEnabled;

  const wheelAnimsRef = useRef<WheelAnimState[] | null>(null);

  // Stream entity reference for imperative thread reads in useFrame.
  // The entity is mutated in-place, so reading streamEntity?.threads
  // always returns the latest value without requiring React re-renders.
  const streamEntityRef = useRef(streamEntity);
  streamEntityRef.current = streamEntity;
  const handlePlayThreadRef = useRef<
    ((slot: number, seq: string, forward?: boolean) => void) | null
  >(null);
  const handleStopThreadRef = useRef<((slot: number) => void) | null>(null);
  const prevDemoThreadsRef = useRef<StreamThreadState[] | undefined>(undefined);

  // Load IFL texture atlases imperatively (processShapeScene can't resolve
  // .ifl paths since they require async loading of the frame list).
  useEffect(() => {
    iflAnimInfosRef.current = [];
    iflMeshAtlasRef.current.clear();
    for (const info of iflMeshes) {
      loadIflAtlas(info.iflPath, { repeat: info.repeat })
        .then((atlas) => {
          const mat = Array.isArray(info.mesh.material)
            ? info.mesh.material[0]
            : info.mesh.material;
          if (mat) {
            mat.map = atlas.texture;
            mat.needsUpdate = true;
          }
          const iflInfo = {
            atlas,
            mat,
            sequenceName: info.iflSequence,
            sequenceDuration: info.iflDuration,
            cyclic: info.iflCyclic,
            toolBegin: info.iflToolBegin,
          };
          iflAnimInfosRef.current.push(iflInfo);
          iflMeshAtlasRef.current.set(info.mesh, atlas);
        })
        .catch((err) => {
          log.warn("Failed to load IFL atlas for %s: %o", info.iflPath, err);
        });
    }
  }, [iflMeshes]);

  // DTS sequence flags by name, parsed from glTF extras.
  const { seqCyclicByName, seqBlendByName } = useMemo(() => {
    const cycMap = new Map<string, boolean>();
    const blendMap = new Map<string, boolean>();
    const rawNames = gltf.scene.userData?.dts_sequence_names;
    const rawCyclic = gltf.scene.userData?.dts_sequence_cyclic;
    const rawBlend = gltf.scene.userData?.dts_sequence_blend;
    if (typeof rawNames === "string") {
      try {
        const names: string[] = JSON.parse(rawNames);
        const cyclic: boolean[] =
          typeof rawCyclic === "string" ? JSON.parse(rawCyclic) : [];
        const blend: boolean[] =
          typeof rawBlend === "string" ? JSON.parse(rawBlend) : [];
        for (let i = 0; i < names.length; i++) {
          const lower = names[i].toLowerCase();
          cycMap.set(lower, cyclic[i] ?? true);
          if (blend[i]) blendMap.set(lower, true);
        }
      } catch {
        /* expected */
      }
    }
    return { seqCyclicByName: cycMap, seqBlendByName: blendMap };
  }, [gltf]);

  // Animation setup.
  //
  // Mission mode (streamEntity absent): seed threads from script state
  //   (object._threads), then fall back to default looping sequences
  //   (ambient always; power only when scripts didn't manage the object).
  //   Live TorqueScript playThread/stopThread/pauseThread calls override.
  //
  // Demo/live mode (streamEntity present): no auto-play. The useFrame
  //   handler reads ghost ThreadMask data and drives everything.
  useEffect(() => {
    const threads = threadsRef.current;
    const isMissionMode = streamEntityRef.current == null;

    function prepareVisNode(v: VisNode) {
      v.mesh.visible = true;
      if (v.mesh.material?.isMeshStandardMaterial) {
        const mat = v.mesh.material as MeshStandardMaterial;
        const result = replaceWithShapeMaterial(mat, v.mesh.userData?.vis ?? 0);
        v.mesh.material = result.material;
      }
      if (v.mesh.material && !Array.isArray(v.mesh.material)) {
        // Save original transparent/depthWrite so they can be restored
        // when the vis animation finishes or is stopped.
        const ud = (v.mesh.material.userData ??= {});
        if (ud._visOrigTransparent == null) {
          ud._visOrigTransparent = v.mesh.material.transparent;
          ud._visOrigDepthWrite = v.mesh.material.depthWrite;
          ud._visOrigAlphaTest = v.mesh.material.alphaTest;
        }
      }
      const atlas = iflMeshAtlasRef.current.get(v.mesh);
      if (atlas && v.mesh.material && !Array.isArray(v.mesh.material)) {
        v.mesh.material.map = atlas.texture;
        v.mesh.material.needsUpdate = true;
      }
    }

    // Match binary's updateThread (FUN_005ebf00): direction is implemented
    // via timeScale (+1 forward, -1 backward). State 0=Play, 1=Stop, 2=Pause.
    function handlePlayThread(
      slot: number,
      sequenceName: string,
      forward = true,
    ) {
      const seqLower = sequenceName.toLowerCase();
      handleStopThread(slot);

      const clip = clipsByName.get(seqLower);
      const vNodes = visNodesBySequence.get(seqLower);
      const thread: ThreadState = {
        sequence: seqLower,
        startTime: shapeNowSec(),
        forward,
      };

      if (clip && mixer) {
        const action = mixer.clipAction(clip);
        const cyclic = seqCyclicByName.get(seqLower) ?? true;
        if (cyclic) {
          action.setLoop(LoopRepeat, Infinity);
        } else {
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        // Blend sequences (DTS flag 0x8) are delta transforms multiplied
        // onto the existing pose. Use Three.js additive blending so they
        // composite on top of non-blend threads (e.g. Deploy on Ambient).
        if (seqBlendByName.has(seqLower)) {
          action.blendMode = AdditiveAnimationBlendMode;
        }
        action.timeScale = forward ? 1 : -1;
        action.reset();
        // For backward playback, start at the end of the clip.
        if (!forward) {
          action.time = clip.duration;
        }
        action.play();
        thread.action = action;

        // Play associated morph target frame clips alongside the main clip.
        const morphClips = morphClipsBySeq.get(seqLower);
        if (morphClips) {
          thread.morphActions = [];
          for (const mc of morphClips) {
            const ma = mixer.clipAction(mc);
            ma.setLoop(cyclic ? LoopRepeat : LoopOnce, cyclic ? Infinity : 1);
            if (!cyclic) ma.clampWhenFinished = true;
            ma.timeScale = forward ? 1 : -1;
            ma.reset();
            if (!forward) ma.time = mc.duration;
            ma.play();
            thread.morphActions.push(ma);
          }
        }
      }

      if (vNodes) {
        for (const v of vNodes) prepareVisNode(v);
        thread.visNodes = vNodes;
      }

      threads.set(slot, thread);
    }

    function handleStopThread(slot: number) {
      const thread = threads.get(slot);
      if (!thread) return;
      if (thread.action) thread.action.stop();
      if (thread.morphActions) {
        for (const ma of thread.morphActions) ma.stop();
      }
      // Binary Stop: reset position to 0.0, freeze. Vis nodes go to frame 0.
      // Restore original material properties saved by prepareVisNode.
      if (thread.visNodes) {
        for (const v of thread.visNodes) {
          if (v.mesh.material && !Array.isArray(v.mesh.material)) {
            const mat = v.mesh.material;
            mat.opacity = v.keyframes[0];
            v.mesh.visible = v.keyframes[0] > 0.01;
            const ud = mat.userData;
            if (ud?._visOrigTransparent != null) {
              mat.transparent = ud._visOrigTransparent;
              mat.depthWrite = ud._visOrigDepthWrite;
              mat.alphaTest = ud._visOrigAlphaTest;
            }
          }
        }
      }
      threads.delete(slot);
    }

    handlePlayThreadRef.current = handlePlayThread;
    handleStopThreadRef.current = handleStopThread;

    // Set up WheeledVehicle wheel/spring/turn animations.
    // These are position-controlled (setPos) not thread-controlled.
    // Runs in both mission and demo/live modes.
    if (mixer && clipsByName.has("wheel0")) {
      const wheelAnims: WheelAnimState[] = [];
      for (let i = 0; i < 6; i++) {
        const state: WheelAnimState = { rotation: 0 };
        const wheelClip = clipsByName.get(`wheel${i}`);
        if (wheelClip) {
          const action = mixer.clipAction(wheelClip);
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
          action.paused = true;
          action.play();
          state.wheelAction = action;
        }
        const springClip = clipsByName.get(`spring${i}`);
        if (springClip) {
          const action = mixer.clipAction(springClip);
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
          action.paused = true;
          action.play();
          // Rest position: springs at full extension (pos=0 in Torque).
          action.time = 0;
          state.springAction = action;
        }
        const turnClip = clipsByName.get(`turn${i}`);
        if (turnClip) {
          const action = mixer.clipAction(turnClip);
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
          action.paused = true;
          action.play();
          // Center (straight ahead).
          action.time = turnClip.duration * 0.5;
          state.turnAction = action;
        }
        wheelAnims.push(state);
      }
      wheelAnimsRef.current = wheelAnims;
    } else {
      wheelAnimsRef.current = null;
    }

    // ── Demo/live mode: ghost thread handler in useFrame drives everything ──
    if (!isMissionMode) {
      return () => {
        handlePlayThreadRef.current = null;
        handleStopThreadRef.current = null;
        prevDemoThreadsRef.current = undefined;
        wheelAnimsRef.current = null;
        for (const slot of [...threads.keys()]) handleStopThread(slot);
      };
    }

    // ── Mission mode ──
    const unsubs: (() => void)[] = [];

    // Subscribe to TorqueScript playThread/stopThread/pauseThread so
    // scripts can control animations at runtime.
    if (runtime) {
      unsubs.push(
        runtime.$.onMethodCalled(
          "ShapeBase",
          "playThread",
          (thisObj, slot, sequence) => {
            if (thisObj._id !== object?._id) return;
            handlePlayThread(Number(slot), String(sequence));
          },
        ),
      );
      unsubs.push(
        runtime.$.onMethodCalled("ShapeBase", "stopThread", (thisObj, slot) => {
          if (thisObj._id !== object?._id) return;
          handleStopThread(Number(slot));
        }),
      );
      unsubs.push(
        runtime.$.onMethodCalled(
          "ShapeBase",
          "pauseThread",
          (thisObj, slot) => {
            if (thisObj._id !== object?._id) return;
            const thread = threads.get(Number(slot));
            if (thread?.action) {
              thread.action.paused = true;
              if (thread.morphActions) {
                for (const ma of thread.morphActions) ma.paused = true;
              }
            }
          },
        ),
      );
    }

    // Seed threads that scripts started before this component mounted
    // (power.cs playThread during mission init, etc.).
    const scriptThreads = object?._threads as
      | Record<
          number,
          { sequence: string; playing: boolean; direction: boolean }
        >
      | undefined;
    const seededSlots = new Set<number>();
    if (scriptThreads) {
      for (const [slotStr, thread] of Object.entries(scriptThreads)) {
        if (!thread.playing) continue;
        const slot = Number(slotStr);
        seededSlots.add(slot);
        handlePlayThread(slot, thread.sequence, thread.direction);
      }
    }

    // Fallback default sequences. Thread slots match power.cs globals:
    // $PowerThread=0, $AmbientThread=1. The ambient thread is client-side
    // in the real engine (never script-driven), so it always autoplays;
    // the power thread is script truth when any script threads were
    // recorded, and only autoplays when scripts didn't manage this object.
    const defaults: Array<[number, string]> = scriptThreads
      ? [[1, "ambient"]]
      : [
          [0, "power"],
          [1, "ambient"],
        ];
    for (const [slot, seqName] of defaults) {
      if (seededSlots.has(slot)) continue;
      if (
        clipsByName.has(seqName) ||
        visNodesBySequence.has(seqName) ||
        morphClipsBySeq.has(seqName)
      ) {
        handlePlayThread(slot, seqName);
      }
    }

    return () => {
      unsubs.forEach((fn) => fn());
      handlePlayThreadRef.current = null;
      handleStopThreadRef.current = null;
      prevDemoThreadsRef.current = undefined;
      wheelAnimsRef.current = null;
      for (const slot of [...threads.keys()]) handleStopThread(slot);
    };
  }, [
    mixer,
    clipsByName,
    visNodesBySequence,
    seqCyclicByName,
    seqBlendByName,
    object,
    runtime,
  ]);

  // Build DTS sequence index → animation name lookup. If the glTF has the
  // dts_sequence_names extra (set by the addon), use it for an exact mapping
  // from ghost ThreadMask indices to animation names. Otherwise fall back to
  // positional indexing (which only works if no sequences were filtered).
  const seqIndexToName = useMemo(() => {
    const raw = gltf.scene.userData?.dts_sequence_names;
    if (typeof raw === "string") {
      try {
        const names: string[] = JSON.parse(raw);
        return names.map((n) => n.toLowerCase());
      } catch {
        /* expected */
      }
    }
    return gltf.animations.map((a) => a.name.toLowerCase());
  }, [gltf]);

  useFrame((_, delta) => {
    const threads = threadsRef.current;

    // In demo/live mode, scale animation by playback rate; freeze when paused.
    // Check streamEntity existence (not .threads) so shapes without thread
    // data (e.g. Items) also freeze correctly when paused.
    const inDemo = streamEntityRef.current != null;
    const playbackState = engineStore.getState().playback;
    const effectDelta = !inDemo
      ? delta
      : playbackState.status === "playing"
        ? delta * playbackState.rate
        : 0;

    // React to demo thread state changes. The ghost ThreadMask data tells us
    // exactly which DTS sequences are playing/stopped on each of 4 thread slots.
    const currentDemoThreads = streamEntityRef.current?.threads;
    const prevDemoThreads = prevDemoThreadsRef.current;
    if (currentDemoThreads !== prevDemoThreads) {
      const playThread = handlePlayThreadRef.current;
      const stopThread = handleStopThreadRef.current;
      // Don't consume thread data until handlers are ready — leave
      // prevDemoThreadsRef unchanged so the change is re-detected next frame.
      if (playThread && stopThread) {
        prevDemoThreadsRef.current = currentDemoThreads;
        // Use sparse arrays instead of Maps — thread indices are 0-3.
        const currentBySlot: Array<StreamThreadState | undefined> = [];
        if (currentDemoThreads) {
          for (const t of currentDemoThreads) currentBySlot[t.index] = t;
        }
        const prevBySlot: Array<StreamThreadState | undefined> = [];
        if (prevDemoThreads) {
          for (const t of prevDemoThreads) prevBySlot[t.index] = t;
        }
        const maxSlot = Math.max(currentBySlot.length, prevBySlot.length);
        for (let slot = 0; slot < maxSlot; slot++) {
          const t = currentBySlot[slot];
          const prev = prevBySlot[slot];
          if (t) {
            const changed =
              !prev ||
              prev.sequence !== t.sequence ||
              prev.state !== t.state ||
              prev.forward !== t.forward ||
              prev.atEnd !== t.atEnd;
            if (!changed) continue;

            const seqName = seqIndexToName[t.sequence];
            if (!seqName) continue;

            // Match binary updateThread (FUN_005ebf00):
            // State 0=Play, 1=Stop, 2=Pause
            if (t.state === 1) {
              // Stop: reset to start, freeze.
              stopThread(slot);
            } else if (t.state === 2) {
              // Pause: freeze at current position.
              const thread = threads.get(slot);
              if (thread?.action) {
                thread.action.paused = true;
                if (thread.morphActions) {
                  for (const ma of thread.morphActions) ma.paused = true;
                }
              }
            } else {
              // Play (state === 0)
              if (t.atEnd) {
                // Already finished: snap to end pose, freeze.
                // Check if we need to start the thread first.
                let thread = threads.get(slot);
                if (!thread || thread.sequence !== seqName) {
                  playThread(slot, seqName, t.forward);
                  thread = threads.get(slot);
                }
                if (thread?.action) {
                  const clip = thread.action.getClip();
                  thread.action.time = t.forward ? clip.duration : 0;
                  thread.action.timeScale = 1;
                  thread.action.setLoop(LoopOnce, 1);
                  thread.action.clampWhenFinished = true;
                  thread.action.paused = true;
                  if (thread.morphActions) {
                    for (const ma of thread.morphActions) {
                      const mc = ma.getClip();
                      ma.time = t.forward ? mc.duration : 0;
                      ma.timeScale = 1;
                      ma.setLoop(LoopOnce, 1);
                      ma.clampWhenFinished = true;
                      ma.paused = true;
                    }
                  }
                }
                // Snap vis nodes to end pose.
                if (thread?.visNodes) {
                  for (const v of thread.visNodes) {
                    const mat = v.mesh.material;
                    if (!mat || Array.isArray(mat)) continue;
                    const endIdx = t.forward ? v.keyframes.length - 1 : 0;
                    mat.opacity = v.keyframes[endIdx];
                    v.mesh.visible = mat.opacity > 0.01;
                  }
                }
              } else {
                // Actively playing: (re)start with correct direction.
                // Only restart if sequence or direction changed.
                const thread = threads.get(slot);
                const needRestart =
                  !thread ||
                  thread.sequence !== seqName ||
                  thread.forward !== t.forward;
                if (needRestart) {
                  playThread(slot, seqName, t.forward);
                } else if (thread?.action?.paused) {
                  // Resume from pause with correct direction.
                  thread.action.paused = false;
                  thread.action.timeScale = t.forward ? 1 : -1;
                  if (thread.morphActions) {
                    for (const ma of thread.morphActions) {
                      ma.paused = false;
                      ma.timeScale = t.forward ? 1 : -1;
                    }
                  }
                }
              }
            }
          } else if (prev) {
            // Thread disappeared — stop it.
            stopThread(slot);
          }
        }
      }
    }

    if (mixer && animationEnabled) {
      mixer.update(effectDelta);
    }

    // Drive vis opacity animations for active threads.
    // Direction is handled by computing position forward or backward.
    for (const [, thread] of threads) {
      if (!thread.visNodes) continue;

      for (const { mesh, keyframes, duration, cyclic } of thread.visNodes) {
        const mat = mesh.material;
        if (!mat || Array.isArray(mat)) continue;

        if (!animationEnabled) {
          mat.opacity = keyframes[0];
          mesh.visible = mat.opacity > 0.01;
          continue;
        }

        const elapsed = shapeNowSec() - thread.startTime;
        let t: number;
        if (cyclic) {
          // Cyclic: wrap position, ignoring direction (cyclic always advances).
          t = (((elapsed % duration) + duration) % duration) / duration;
        } else if (thread.forward) {
          t = Math.min(elapsed / duration, 1);
        } else {
          // Backward: start at 1.0 and move toward 0.0.
          t = Math.max(1 - elapsed / duration, 0);
        }

        const n = keyframes.length;
        const pos = t * (n - 1);
        const lo = Math.min(Math.floor(pos), n - 1);
        const hi = Math.min(lo + 1, n - 1);
        const frac = pos - lo;
        mat.opacity = keyframes[lo] + (keyframes[hi] - keyframes[lo]) * frac;
        mesh.visible = mat.opacity > 0.01;
        // Dynamically toggle transparent/depthWrite: only enable blending
        // when partially transparent, restore originals at full opacity.
        const ud = mat.userData;
        // Toggle transparent/depthWrite based on current opacity.
        // needsUpdate is required when changing transparent — Three.js
        // uses different render lists for opaque vs transparent objects.
        if (mat.opacity >= 0.99) {
          if (ud?._visOrigTransparent != null) {
            if (mat.transparent !== ud._visOrigTransparent) {
              mat.transparent = ud._visOrigTransparent;
              mat.needsUpdate = true;
            }
            mat.depthWrite = ud._visOrigDepthWrite;
            mat.alphaTest = ud._visOrigAlphaTest;
          }
        } else if (!mat.transparent) {
          mat.transparent = true;
          mat.depthWrite = false;
          mat.alphaTest = 0;
          mat.needsUpdate = true;
        }
      }
    }

    // Drive damage state Visibility — swap normal/HULK meshes.
    // In Torque, mHulkThread plays the "Visibility" sequence at pos 0.0
    // (Enabled) or 1.0 (Destroyed). The vis_keyframes on each mesh encode:
    // normal meshes [1,0] (visible→hidden), HULK meshes [0,1] (hidden→visible).
    const entity = streamEntityRef.current;
    const damageState = entity?.damageState ?? 0;
    const visibilityNodes = visNodesBySequence.get("visibility");
    if (visibilityNodes) {
      // Position 0.0 = Enabled (normal visible), 1.0 = Destroyed (HULK visible)
      const pos = damageState >= 2 ? 1.0 : 0.0;
      for (const { mesh, keyframes } of visibilityNodes) {
        const mat = mesh.material;
        if (!mat || Array.isArray(mat)) continue;
        const n = keyframes.length;
        const idx = Math.min(Math.floor(pos * n), n - 1);
        mat.opacity = keyframes[idx];
        mesh.visible = mat.opacity > 0.01;
      }
    }

    // Drive WheeledVehicle wheel/spring/turn animations from ghost state.
    const wheelAnims = wheelAnimsRef.current;
    if (wheelAnims && animationEnabled) {
      const entity = streamEntityRef.current;
      const wheels = entity?.wheels;
      const steeringYaw = entity?.steeringYaw ?? 0;
      // From VehicleData datablock (e.g. MPB = 0.3 rad).
      const maxSteeringAngle = entity?.maxSteeringAngle ?? 0.3;

      for (let i = 0; i < wheelAnims.length; i++) {
        const wa = wheelAnims[i];
        const wheel = wheels?.[i];

        // Wheel rotation: accumulate from speed, matching Torque's
        // advanceTime: rotation += wheelSpeed * dt * TWO_PI, then
        // wrap to [0,1) and flip negative to 1-rotation.
        if (wa.wheelAction && wheel) {
          wa.rotation += wheel.speed * effectDelta * Math.PI * 2;
          wa.rotation -= Math.floor(wa.rotation); // wrap to [0,1)
          wa.wheelAction.time = wa.rotation * wa.wheelAction.getClip().duration;
        }

        // Spring: ghost vehicles stay at rest (fully extended = pos 0).
        // The server already accounts for spring height in the ghost position.
        // (Spring animation would only change with client-side raycasts.)

        // Turn: steering angle → animation position.
        // Torque: pos = 0.5 - t * 0.5 where t = steerAngle² / maxSteeringAngle
        if (wa.turnAction) {
          const t = (steeringYaw * Math.abs(steeringYaw)) / maxSteeringAngle;
          const pos = 0.5 - t * 0.5;
          wa.turnAction.time =
            Math.max(0, Math.min(1, pos)) * wa.turnAction.getClip().duration;
        }
      }
    }

    // Advance IFL texture atlases.
    // Matches Torque's animateIfls():
    //   time = th->pos * th->sequence->duration + th->sequence->toolBegin
    // where pos is [0,1) cyclic or [0,1] clamped, then frame is looked up in
    // cumulative iflFrameOffTimes (seconds, at 1/30s per IFL tick).
    // toolBegin offsets into the IFL timeline so the sequence window aligns
    // with the desired frames (e.g. skipping a long "off" period).
    const iflAnimInfos = iflAnimInfosRef.current;
    if (iflAnimInfos.length > 0) {
      iflTimeRef.current += effectDelta;
      for (const info of iflAnimInfos) {
        const updateAtlasAndMaterial = (
          info: IflAnimInfo,
          frameIndex: number,
        ) => {
          updateAtlasFrame(info.atlas, frameIndex);
          if (info.atlas.swapMode && info.mat.map !== info.atlas.texture) {
            info.mat.map = info.atlas.texture;
            info.mat.needsUpdate = true;
          }
        };
        let frameIndex = 0;
        if (animationEnabled) {
          let iflTime = 0;
          if (info.sequenceName && info.sequenceDuration) {
            // Sequence-driven IFL: find the thread playing this sequence and
            // compute time = pos * duration + toolBegin (matching the engine).
            for (const [, thread] of threads) {
              if (thread.sequence === info.sequenceName) {
                const elapsed = shapeNowSec() - thread.startTime;
                const dur = info.sequenceDuration;
                // Reproduce th->pos: cyclic wraps [0,1), non-cyclic clamps [0,1]
                const pos = info.cyclic
                  ? (elapsed / dur) % 1
                  : Math.min(elapsed / dur, 1);
                iflTime = pos * dur + (info.toolBegin ?? 0);
                break;
              }
            }
          } else {
            // No controlling sequence: use accumulated real time.
            // (In the engine, these would stay at frame 0, but cycling is more
            // useful for display purposes.)
            iflTime = iflTimeRef.current;
          }
          frameIndex = getFrameIndexForTime(info.atlas, iflTime);
        }
        updateAtlasAndMaterial(info, frameIndex);
      }
    }
  });

  // ShapeBase fade opacity and cloak texture effect.
  // Fade (mFadeVal): opacity-only, used by startFade().
  // Cloak (mCloakLevel): replaces textures with cloakTexture + UV scrolling,
  // alpha = 0.125 + (1 - cloakLevel) * 0.875. Binary-verified rendering path.
  const lastFadeValRef = useRef(1);
  const lastCloakLevelRef = useRef(0);
  useFrame((state) => {
    const entity = streamEntityRef.current;
    const fadeVal = entity?.fadeVal ?? 1;
    const cloakLevel = entity?.cloakLevel ?? 0;
    const isCloak = cloakLevel > 0;

    // Advance global cloak UV offset once per frame (all cloaked shapes share it).
    if (isCloak)
      advanceCloakUV(
        state.frameloop === "never" ? 0 : (state.clock.elapsedTime * 60) | 0,
      );

    if (
      fadeVal === lastFadeValRef.current &&
      cloakLevel === lastCloakLevelRef.current
    )
      return;
    lastFadeValRef.current = fadeVal;
    lastCloakLevelRef.current = cloakLevel;

    // Cloak alpha OVERRIDES fade (binary-verified: TSMesh uses else-if —
    // alwaysAlpha takes precedence over overrideFade when both are set).
    const combinedAlpha = isCloak ? 0.125 + (1 - cloakLevel) * 0.875 : fadeVal;
    const cloakTex = isCloak ? getCloakTexture() : _cloakTexture;

    clonedScene.traverse((node: any) => {
      if (!node.isMesh || !node.material || Array.isArray(node.material))
        return;
      const mat = node.material;
      const ud = (mat.userData ??= {});

      // Save originals on first encounter.
      if (ud._baseFadeOpacity == null) {
        ud._baseFadeOpacity = mat.opacity ?? 1;
        ud._baseFadeTransparent = mat.transparent ?? false;
        ud._originalMap = mat.map;
        // Originally-translucent materials keep their own texture during cloak.
        // Detect via alphaTest (organic/Translucent cutout) or non-normal blending
        // (Additive). These match how createMaterialFromFlags sets up materials.
        ud._isOriginallyTranslucent =
          (ud._baseFadeTransparent as boolean) ||
          mat.alphaTest > 0 ||
          mat.blending !== NormalBlending;
      }

      const baseOpacity = ud._baseFadeOpacity as number;

      // Cloak texture replacement (non-translucent materials only).
      if (isCloak && !ud._isOriginallyTranslucent) {
        if (mat.map !== cloakTex) {
          mat.map = cloakTex;
          mat.needsUpdate = true;
        }
      } else if (
        !isCloak &&
        ud._originalMap !== undefined &&
        mat.map === cloakTex
      ) {
        mat.map = ud._originalMap;
        mat.needsUpdate = true;
      }

      mat.opacity = combinedAlpha * baseOpacity;
      mat.transparent =
        combinedAlpha < 1 || (ud._baseFadeTransparent as boolean);
      mat.depthWrite =
        combinedAlpha >= 1 && !(ud._baseFadeTransparent as boolean);
    });
  });

  // ShapeBase sound slots — managed as PositionalAudio, not entities.
  useEntitySoundSlots(streamEntityRef, clonedScene);

  const isTarget = useIsDebugTourTarget(entityId ?? "");
  const shapeBounds = useMemo(() => {
    if (!isTarget) return null;
    const box = new Box3().setFromObject(gltf.scene);
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    return {
      center: [center.x, center.y, center.z] as [number, number, number],
      size: [size.x, size.y, size.z] as [number, number, number],
    };
  }, [isTarget, gltf.scene]);

  // Find mount point bones in the cloned scene for portal rendering
  // and for vehicle mount position tracking.
  const mountBones = useMemo(() => {
    const bones: Record<number, Group> = {};
    // Always look for Mount0 (pilot seat for vehicles).
    clonedScene.traverse((node: any) => {
      const match = node.name.match(/^Mount(\d+)$/);
      if (match) bones[Number(match[1])] = node;
    });
    return Object.keys(bones).length > 0 ? bones : null;
  }, [clonedScene]);

  // Find Eye node for vehicle camera positioning. Vehicles have an Eye node
  // in their DTS shape that defines the cockpit viewpoint.
  const eyeBone = useMemo((): Object3D | null => {
    let found: Object3D | null = null;
    clonedScene.traverse((node: any) => {
      if (node.name === "Eye") found = node;
    });
    return found;
  }, [clonedScene]);

  // Write animated Eye node position to the shared eye position map so the
  // camera system can use it (same map as PlayerModel's eye bone).
  useEffect(() => {
    if (!eyeBone || !entityId) return;
    return () => {
      playerEyePositions.delete(entityId);
    };
  }, [eyeBone, entityId]);

  useFrame(() => {
    if (!eyeBone || !entityId) return;
    let eyePos = playerEyePositions.get(entityId);
    if (!eyePos) {
      eyePos = new Vector3();
      playerEyePositions.set(entityId, eyePos);
    }
    eyeBone.getWorldPosition(eyePos);
    clonedScene.worldToLocal(eyePos);
    // Convert GLB (x,y,z) → entity-local Three.js space via R90
    // (same swizzle as PlayerModel's eye extraction).
    const gx = eyePos.x;
    const gy = eyePos.y;
    const gz = eyePos.z;
    eyePos.set(gz, gy, -gx);
  });

  // Item/ShapeBase built-in dynamic light (binary-verified pulsing formula).
  // Torque places a GL point light at getBoxCenter() with:
  //   constant_attenuation = 0, linear_attenuation = 1/radius, quadratic = 0
  // This gives attenuation = radius/distance — surfaces at zero distance get
  // infinite brightness, producing the characteristic "opaque glow" where the
  // item's own mesh is massively overlit and goes pure white at peak pulse.
  const lightRef = useRef<PointLight>(null);
  const lightConfig = useMemo(() => {
    const cfg = lightConfigProp;
    if (!cfg) return null;
    const box = new Box3().setFromObject(gltf.scene);
    const center = new Vector3();
    box.getCenter(center);
    return {
      type: cfg.type,
      color: new Color(cfg.color[0], cfg.color[1], cfg.color[2]),
      time: cfg.time,
      radius: cfg.radius,
      onlyStatic: cfg.onlyStatic,
      isStatic: cfg.isStatic,
      center: [center.x, center.y, center.z] as [number, number, number],
    };
  }, [gltf.scene, lightConfigProp]);

  useFrame(() => {
    if (!lightRef.current || !lightConfig) return;
    if (lightConfig.onlyStatic && !lightConfig.isStatic) {
      lightRef.current.intensity = 0;
      return;
    }
    const fadeVal = streamEntityRef.current?.fadeVal ?? 1;
    const elapsed = shapeNowSec() * 1000; // ms
    let intensity: number;
    if (lightConfig.type === 2) {
      // PulsingLight (binary-verified): sin(PI * t / lightTime), period = 2 * lightTime
      const sinVal = Math.sin((Math.PI * elapsed) / lightConfig.time);
      const raw = 0.5 + 0.5 * sinVal;
      intensity = (0.15 + raw * 0.85) * fadeVal;
    } else {
      // ConstantLight
      intensity = fadeVal;
    }
    // Torque uses GL attenuation = radius/d (linear, constant=0). With decay=1
    // in Three.js, the falloff is ~1/d within the distance window. Scale by
    // radius² to approximate Torque's overbright behavior — surfaces near the
    // light center get extremely bright (flag mesh goes pure white at peak pulse).
    lightRef.current.intensity =
      intensity * lightConfig.radius * lightConfig.radius;
  });

  return (
    <group rotation={noRotation ? undefined : STANDARD_90_ROTATION}>
      <primitive object={clonedScene} />
      {lightConfig && (
        <pointLight
          ref={lightRef}
          color={lightConfig.color}
          position={lightConfig.center}
          intensity={0}
          distance={lightConfig.radius * 2}
          decay={1}
        />
      )}
      {debugMode ? (
        <FloatingLabel>
          {entityId}: {shapeName}
        </FloatingLabel>
      ) : null}
      {shapeBounds && (
        <group position={shapeBounds.center}>
          <DebugBounds size={shapeBounds.size} />
        </group>
      )}
      {children}
      {mountBones &&
        mounted &&
        Object.entries(mounted).map(([slot, content]) => {
          const bone = mountBones[Number(slot)];
          return bone ? (
            <Fragment key={slot}>
              {createPortal(<group>{content}</group>, bone)}
            </Fragment>
          ) : null;
        })}
    </group>
  );
});

function ShapeModelLoader({
  streamEntity,
  emap,
  entityId,
  children,
  mounted,
  noRotation,
  skinName,
  lightConfig,
}: {
  streamEntity?: StreamShapeEntity;
  emap?: boolean;
  entityId?: string;
  children?: ReactNode;
  mounted?: Record<number, ReactNode>;
  noRotation?: boolean;
  skinName?: string;
  lightConfig?: ShapeLightConfig;
}) {
  const { shapeName } = useShapeInfo();
  const gltf = useStaticShape(shapeName);
  return (
    <ShapeModel
      gltf={gltf}
      streamEntity={streamEntity}
      emap={emap}
      entityId={entityId}
      mounted={mounted}
      noRotation={noRotation}
      skinName={skinName}
      lightConfig={lightConfig}
    >
      {children}
    </ShapeModel>
  );
}

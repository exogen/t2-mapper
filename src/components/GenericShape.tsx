import {
  Fragment,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { AnimationAction, Material, Object3D, Texture } from "three";
import type { LightAnchor } from "../stream/types";
import { useGLTF } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber";
import { createLogger } from "../logger";
import { shapeToUrl } from "../loaders";
import {
  MeshStandardMaterial,
  AdditiveAnimationBlendMode,
  AnimationMixer,
  AnimationClip,
  AnimationUtils,
  LoopOnce,
  LoopRepeat,
  Color,
  Group,
  Vector3,
} from "three";
import { useEffectLight } from "./useEffectLight";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { useAnisotropy } from "./useAnisotropy";
import { useDebug, useSettings } from "./SettingsProvider";
import { useShapeInfo, ShapeInfoProvider } from "./ShapeInfoProvider";
import type { StaticShapeType } from "./ShapeInfoProvider";
import {
  useEngineSelector,
  effectDeltaSec,
  effectNow,
  engineStore,
} from "../state/engineStore";
import { FloatingLabel } from "./FloatingLabel";
import {
  collectIflMeshes,
  driveIflFrames,
  loadIflMaterialInstance,
} from "../iflAtlas";
import type { IflMaterialInstance } from "../iflAtlas";
import { DebugShapeBounds } from "./DebugShapeBounds";
import { useEntitySoundSlots } from "./useEntitySoundSlots";
import {
  processShapeScene,
  replaceWithShapeMaterial,
  disposeClonedScene,
  buildRestPoseClip,
  getPosedNodeTransform,
} from "../stream/playbackUtils";
import { resolveEmapFromImageSlot } from "./resolveEmap";
import { useEyePosition } from "./eyePositions";
import type {
  ImageSlot,
  ThreadState as StreamThreadState,
  TurretAim,
} from "../stream/types";
import { driveTurretAim, type TurretAnimActions } from "./turretAim";
import { gameEntityStore } from "../state/gameEntityStore";
import { streamClock } from "../state/streamPlaybackStore";
import { dtsNodeExtras } from "../dtsNodeExtras";
import { collectMorphClips, isMorphClip } from "./sequenceClips";
import { useVehicleJets, type VehicleJetShape } from "./useVehicleJets";
import { collectOwnNodes } from "./sceneNodes";
import { readDtsSequences } from "../dtsSequences";
import type { GameEntity } from "../state/gameEntityTypes";
import { useImageStateAnimation } from "./useImageStateAnimation";
import {
  applyVisAt,
  collectVisNodes,
  prepareVisMaterial,
  resetVisNode,
  visThreadPosition,
  type VisNode,
} from "./visSequences";
import { useFadeAndCloak } from "./shapeFadeCloak";
import { shapeBoxCenter } from "../shapeLighting";
import { useShapeLighting } from "./useShapeLighting";
import { useShadowCaster } from "./useShadowCaster";
import {
  resolveImageLight,
  useImageLight,
  type ImageLightConfig,
} from "./useImageLight";
import {
  registerStaticShapeCollider,
  unregisterStaticShapeCollider,
} from "../collision/worldCollision";
import { staticShapeColliderMeshes } from "../world/colliderPolicy";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { registerShapeSequences } from "../stream/shapeSequences";
import { FramePriority } from "./framePriority";
import {
  getShapeBounds,
  registerShapeBounds,
  shapeBoundsFromExtras,
} from "../stream/shapeBounds";

/** Item/ShapeBase built-in light config from datablock. */
export interface ShapeLightConfig {
  type: number;
  color: [number, number, number, number];
  time: number;
  radius: number;
  /** Projectile light withheld until this age (missile flechette phase). */
  delayMS?: number;
  onlyStatic: boolean;
  isStatic: boolean;
  anchor: LightAnchor;
}

/** The light's anchor-local position: the engine's box centre, or the origin. */
function shapeLightOffset(
  anchor: LightAnchor,
  shapeName: string,
  scene: Object3D,
): Vector3 {
  if (anchor === "origin") return new Vector3();
  return shapeBoxCenter(shapeName, scene);
}

const STANDARD_90_ROTATION: [x: number, y: number, z: number] = [
  0,
  SHAPE_MODEL_ROTATION_Y,
  0,
];

/** Shape entity data readable in useFrame for streaming mode. */
interface StreamShapeEntity {
  id: string;
  /** The game's identity for this object, used to key its collider so
   *  world dumps stay comparable across stacks. */
  ghostIndex?: number;
  threads?: StreamThreadState[];
  damageState?: number;
  turretAim?: TurretAim;
  wheels?: Array<{
    speed: number;
    lateralSlip: number;
    longitudinalSlip: number;
  }>;
  steeringYaw?: number;
  frozen?: boolean;
  maxSteeringAngle?: number;
  className?: string;
  /** Vehicle jets on (Vehicle::unpackUpdate flag). */
  jetting?: boolean;
  /** Vehicle jet direction (0 forward, 1 backward, 2 down). */
  thrustDirection?: number;
  keyframes?: Array<{
    rotation: [number, number, number, number];
    velocity?: [number, number, number];
  }>;
  soundSlots?: Array<{ index: number; playing: boolean; profileId?: number }>;
  fadeVal?: number;
  cloakLevel?: number;
  dataBlockId?: number;
  projectileAgeMS?: number;
  projectileActivateDelayMS?: number;
}

/** Thread slots for a projectile shape's client-side sequences. */
const PROJECTILE_AMBIENT_SLOT = 1;
const PROJECTILE_ACTIVATE_SLOT = 2;

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
  slot,
}: {
  shapeName: string;
  imageDataBlockId?: number;
  entityId?: string;
  /** Owner image slot, for the image datablock's light (fire flashes). */
  slot?: number;
  shapeType?: StaticShapeType;
  skinName?: string;
}) {
  const childGltf = useStaticShape(shapeName);
  const emap = useMemo(
    () => resolveEmapFromImageSlot(imageDataBlockId),
    [imageDataBlockId],
  );
  const imageLight = useMemo(
    () => resolveImageLight(imageDataBlockId),
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
      <group
        position={offset?.position}
        quaternion={offset?.quaternion}
        userData={{ imageMount: true }}
      >
        <ShapeRenderer
          emap={emap}
          entityId={entityId}
          skinName={skinName}
          noRotation
          imageLight={imageLight}
          imageSlot={slot}
        />
      </group>
    </ShapeInfoProvider>
  );
}

/** The owner's image slot, if the owner is a shape with image slots. */
function ownerImageSlot(
  owner: GameEntity | undefined,
  slot: number,
): ImageSlot | undefined {
  return owner && "imageSlots" in owner ? owner.imageSlots?.[slot] : undefined;
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
  const gltf = useGLTF(url);
  registerShapeSequences(shapeName, gltf.animations);
  // This runs every render of every shape; parse the extra only once.
  if (!getShapeBounds(shapeName)) {
    const bounds = shapeBoundsFromExtras(gltf.scene.userData);
    if (bounds) registerShapeBounds(shapeName, bounds);
  }
  return gltf;
}

// IFL materials are driven imperatively rather than by React components: the
// animated meshes are collected with collectIflMeshes before processShapeScene
// swaps in Tribes 2 materials, their atlases load via loadIflMaterialInstance,
// and driveIflFrames advances the frames each render.

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

function DebugPlaceholder({ color, label }: { color: string; label?: string }) {
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
  imageLight,
  imageSlot,
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
  /** Mounted image datablock light and the owner slot that fires it. */
  imageLight?: ImageLightConfig;
  imageSlot?: number;
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
          imageLight={imageLight}
          imageSlot={imageSlot}
        >
          {children}
        </ShapeModelLoader>
      </Suspense>
    </ErrorBoundary>
  );
});

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
  imageLight,
  imageSlot,
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
  /** Mounted image datablock light and the owner slot that fires it. */
  imageLight?: ImageLightConfig;
  imageSlot?: number;
}) {
  const { object, shapeName, type, isOrganic } = useShapeInfo();
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
    const iflInfos = collectIflMeshes(scene);

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

    const visBySeq = collectVisNodes(scene);

    // Build clips by name (case-insensitive).
    // Blend sequences (DTS flag 0x8) store absolute transforms but must be
    // played in additive mode. Clone and convert them here so the original
    // cached clips from useGLTF are never mutated.
    const sequences = readDtsSequences(scene, gltf.animations);
    const blendNames = sequences.blend;
    const knownSeqNames = sequences.names;

    const clips = new Map<string, AnimationClip>();
    // Morph target frame animations are exported as separate clips named
    // "{SeqName}_{MeshName}_frame". Collect them so they can be played
    // alongside the main sequence clip.
    const morphClipsBySeq = collectMorphClips(gltf.animations, knownSeqNames);
    for (const clip of gltf.animations) {
      const lower = clip.name.toLowerCase();
      if (isMorphClip(clip, morphClipsBySeq)) continue;
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

  // Mission-placed statics (a generator, a bunker prop) occlude a camera
  // exactly like interior walls, so register their meshes as CAMERA
  // occluders — a separate collider class, so projectile physics keeps
  // colliding with exactly what it always did. Vegetation is skipped
  // (crossed alpha planes read solid to a ray while looking sparse), and
  // so is anything too small to meaningfully block a frame. World
  // matrices are snapshotted once, like interiors — these do not move.
  // Keyed on the GHOST index, not `entity.id` (a per-session counter
  // that differs between stacks) and not `useId` (React-internal), so a
  // dump of this world is comparable with a headless build's.
  const fallbackColliderId = useId();
  const colliderId =
    streamEntity?.ghostIndex != null
      ? `ghost:${streamEntity.ghostIndex}`
      : fallbackColliderId;
  useEffect(() => {
    const meshes = staticShapeColliderMeshes({
      root: clonedScene,
      type,
      isOrganic,
    });
    if (!meshes) return;
    registerStaticShapeCollider(colliderId, meshes);
    return () => unregisterStaticShapeCollider(colliderId);
  }, [clonedScene, colliderId, type, isOrganic]);

  const threadsRef = useRef(new Map<number, ThreadState>());
  /** Per-mesh live IFL (see loadIflMaterialInstance). */
  const iflMeshInstanceRef = useRef(new Map<any, IflMaterialInstance>());
  const iflAnimInfosRef = useRef<IflMaterialInstance[]>([]);
  const iflTimeRef = useRef(0);
  const animationEnabledRef = useRef(animationEnabled);
  animationEnabledRef.current = animationEnabled;

  const wheelAnimsRef = useRef<WheelAnimState[] | null>(null);
  const turretAnimRef = useRef<TurretAnimActions | null>(null);

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
    iflMeshInstanceRef.current.clear();
    for (const info of iflMeshes) {
      loadIflMaterialInstance(info)
        .then((inst) => {
          if (!inst) return;
          iflAnimInfosRef.current.push(inst);
          iflMeshInstanceRef.current.set(info.mesh, inst);
        })
        .catch((err) => {
          log.warn("Failed to load IFL atlas for %s: %o", info.iflPath, err);
        });
    }
  }, [iflMeshes]);

  // DTS sequence flags by name (readDtsSequences).
  const { seqCyclicByName, seqBlendByName } = useMemo(() => {
    const table = readDtsSequences(gltf.scene, gltf.animations);
    const cycMap = new Map<string, boolean>();
    const blendMap = new Map<string, boolean>();
    for (const name of table.names) {
      cycMap.set(name, table.cyclic.has(name));
      if (table.blend.has(name)) blendMap.set(name, true);
    }
    return { seqCyclicByName: cycMap, seqBlendByName: blendMap };
  }, [gltf]);

  // Ready a vis-keyframed mesh for opacity animation: give it a shape
  // material (with its default vis) and hook up its IFL atlas texture.
  const prepareVisNode = useCallback((v: VisNode) => {
    v.mesh.visible = true;
    const material = v.mesh.material;
    if (
      !Array.isArray(material) &&
      (material as MeshStandardMaterial).isMeshStandardMaterial
    ) {
      const result = replaceWithShapeMaterial(
        material as MeshStandardMaterial,
        (dtsNodeExtras(v.mesh).vis as number | undefined) ?? 0,
      );
      v.mesh.material = result.material;
    }
    prepareVisMaterial(v);
    const inst = iflMeshInstanceRef.current.get(v.mesh);
    if (inst && v.mesh.material && !Array.isArray(v.mesh.material)) {
      const mapped = v.mesh.material as Material & { map?: Texture | null };
      mapped.map = inst.texture;
      mapped.needsUpdate = true;
    }
  }, []);

  // Vehicle jet flares and nozzle/contrail emitters (FlyingVehicle and
  // HoverVehicle ghosts only; other shapes get a no-op driver).
  const vehicleJetShape = useMemo<VehicleJetShape>(
    () => ({
      scene: clonedScene,
      mixer,
      clipsByName,
      morphClipsBySeq,
      visNodesBySequence,
      seqBlendByName,
      prepareVisNode,
    }),
    [
      clonedScene,
      mixer,
      clipsByName,
      morphClipsBySeq,
      visNodesBySequence,
      seqBlendByName,
      prepareVisNode,
    ],
  );
  const driveVehicleJets = useVehicleJets(
    streamEntityRef,
    streamEntity?.id,
    vehicleJetShape,
    streamEntity?.className,
    streamEntity?.dataBlockId,
  );

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
      if (thread.visNodes) {
        for (const v of thread.visNodes) resetVisNode(v);
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

    // Turret aim: the engine scrubs "activate" to the activation level and
    // "turn"/"elevate" to the aim (TurretData requires all three sequences,
    // though a deployable's activate is empty and has no clip). The threads
    // exist only while aiming, so the actions start stopped.
    const activateClip = clipsByName.get("activate");
    const elevateClip = clipsByName.get("elevate");
    const turnClip = clipsByName.get("turn");
    if (mixer && elevateClip && turnClip) {
      const positional = (clip: AnimationClip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        return action;
      };
      turretAnimRef.current = {
        activate: activateClip ? positional(activateClip) : undefined,
        elevate: positional(elevateClip),
        turn: positional(turnClip),
      };
    } else {
      turretAnimRef.current = null;
    }

    // ── Demo/live mode: ghost thread handler in useFrame drives everything ──
    if (!isMissionMode) {
      // A projectile's shape instance gets an ambient thread the moment it
      // is added (Projectile::onAdd FUN_00631bb0, from ProjectileData's
      // "ambient" sequence); activate/maintain follow in useFrame.
      if (
        streamEntityRef.current?.projectileAgeMS != null &&
        (clipsByName.has("ambient") ||
          visNodesBySequence.has("ambient") ||
          morphClipsBySeq.has("ambient"))
      ) {
        handlePlayThread(PROJECTILE_AMBIENT_SLOT, "ambient");
      }
      return () => {
        handlePlayThreadRef.current = null;
        handleStopThreadRef.current = null;
        prevDemoThreadsRef.current = undefined;
        wheelAnimsRef.current = null;
        turretAnimRef.current = null;
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
    // A streamed mounted image gets its ambient thread from
    // useImageStateAnimation, as ShapeBase::setImage gives it one.
    const streamedImage =
      imageSlot != null &&
      entityId != null &&
      gameEntityStore.getState().streamEntities.has(entityId);
    const defaults: Array<[number, string]> = streamedImage
      ? []
      : scriptThreads
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
      turretAnimRef.current = null;
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
    prepareVisNode,
  ]);

  // Build DTS sequence index → animation name lookup. If the glTF has the
  // dts_sequence_names extra (set by the addon), use it for an exact mapping
  // from ghost ThreadMask indices to animation names. Otherwise fall back to
  // positional indexing (which only works if no sequences were filtered).
  const seqIndexToName = useMemo(
    () => readDtsSequences(gltf.scene, gltf.animations).names,
    [gltf],
  );

  // A mounted image (turret barrel, vehicle turret) runs its datablock's
  // state machine off the owner's ghosted image state, like a player's
  // weapon: fire, reload and activate sequences, spin and state sounds.
  const imageActionsRef = useRef(new Map<string, AnimationAction>());
  const imageMorphActionsRef = useRef(new Map<string, AnimationAction[]>());
  const spinActionRef = useRef<AnimationAction | null>(null);
  const cyclicSequenceNames = useMemo(
    () => readDtsSequences(gltf.scene, gltf.animations).cyclic,
    [gltf],
  );
  useEffect(() => {
    if (!mixer || imageSlot == null) return;
    const actions = new Map<string, AnimationAction>();
    for (const [name, clip] of clipsByName) {
      actions.set(name, mixer.clipAction(clip));
    }
    imageActionsRef.current = actions;
    const morph = new Map<string, AnimationAction[]>();
    for (const [name, clips] of morphClipsBySeq) {
      morph.set(
        name,
        clips.map((clip) => mixer.clipAction(clip)),
      );
    }
    imageMorphActionsRef.current = morph;
    const spin = actions.get("spin");
    if (spin) {
      spin.setLoop(LoopRepeat, Infinity);
      spin.timeScale = 0;
      spin.play();
    }
    spinActionRef.current = spin ?? null;
    return () => {
      spin?.stop();
      imageActionsRef.current = new Map();
      imageMorphActionsRef.current = new Map();
      spinActionRef.current = null;
    };
  }, [mixer, clipsByName, morphClipsBySeq, imageSlot]);
  useImageStateAnimation(
    () =>
      entityId != null && imageSlot != null
        ? ownerImageSlot(
            gameEntityStore.getState().streamEntities.get(entityId),
            imageSlot,
          )
        : undefined,
    {
      actions: imageActionsRef,
      morphActions: imageMorphActionsRef,
      setSpinTimeScale: (timeScale) => {
        if (spinActionRef.current) spinActionRef.current.timeScale = timeScale;
      },
      visNodesBySequence,
      imageRoot: clonedScene,
      ownerId: entityId,
      seqIndexToName,
      cyclicSequences: cyclicSequenceNames,
      iflInstances: iflAnimInfosRef,
    },
  );

  useFrame((_, delta) => {
    const threads = threadsRef.current;

    // In demo/live mode, scale animation by playback rate; freeze when paused.
    // Check streamEntity existence (not .threads) so shapes without thread
    // data (e.g. Items) also freeze correctly when paused. A mounted image
    // has no stream entity of its own but belongs to one.
    const inDemo =
      streamEntityRef.current != null ||
      (entityId != null &&
        gameEntityStore.getState().streamEntities.has(entityId));
    const effectDelta = !inDemo ? delta : effectDeltaSec(delta);

    // LinearProjectile shape sequences (binary-verified): "activate" starts
    // once the projectile's age reaches activateDelayMS (processTick
    // FUN_0062e010) and plays once; when the next frame would run past its
    // end, the looping "maintain" takes over (advanceTime FUN_0062ee40).
    // The disc's blue trail is these vis-animated meshes.
    const projectile = streamEntityRef.current;
    const playProjectileThread = handlePlayThreadRef.current;
    if (
      projectile?.projectileAgeMS != null &&
      projectile.projectileActivateDelayMS != null &&
      playProjectileThread
    ) {
      const thread = threads.get(PROJECTILE_ACTIVATE_SLOT);
      if (!thread) {
        if (
          projectile.projectileAgeMS >= projectile.projectileActivateDelayMS &&
          seqCyclicByName.has("activate")
        ) {
          playProjectileThread(PROJECTILE_ACTIVATE_SLOT, "activate");
        }
      } else if (thread.sequence === "activate" && thread.action) {
        const clip = thread.action.getClip();
        if (
          thread.action.time + effectDelta >= clip.duration &&
          seqCyclicByName.has("maintain")
        ) {
          playProjectileThread(PROJECTILE_ACTIVATE_SLOT, "maintain");
        }
      }
    }

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

    if (animationEnabled) driveVehicleJets(effectDelta);

    if (mixer && animationEnabled) {
      mixer.update(effectDelta);
    }

    // Drive vis opacity animations for active threads.
    // Direction is handled by computing position forward or backward.
    for (const [, thread] of threads) {
      if (!thread.visNodes) continue;

      const elapsed = shapeNowSec() - thread.startTime;
      for (const node of thread.visNodes) {
        if (!animationEnabled) {
          resetVisNode(node);
          continue;
        }
        // Cyclic sequences wrap and ignore direction; one-shots clamp.
        applyVisAt(
          node,
          visThreadPosition(
            elapsed,
            node.duration,
            node.cyclic,
            thread.forward,
          ),
        );
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

    const turretAnim = turretAnimRef.current;
    if (turretAnim && animationEnabled) {
      driveTurretAim(turretAnim, streamEntityRef.current?.turretAim);
    }

    // Advance IFL texture atlases (Torque's animateIfls — see
    // iflSequenceTime): a sequence-driven IFL follows the thread playing its
    // sequence; one without a controlling sequence free-runs on real time
    // (the engine would hold frame 0, but cycling is more useful to look at).
    // A streamed mounted image's IFLs belong to its image threads
    // (useImageStateAnimation drives them).
    const iflAnimInfos = iflAnimInfosRef.current;
    if (iflAnimInfos.length > 0 && !(imageSlot != null && inDemo)) {
      iflTimeRef.current += effectDelta;
      const now = shapeNowSec();
      driveIflFrames(
        iflAnimInfos,
        (sequence) => {
          for (const [, thread] of threads) {
            if (thread.sequence === sequence) return now - thread.startTime;
          }
          return null;
        },
        iflTimeRef.current,
        animationEnabled,
      );
    }
  }, FramePriority.ShapeAnimation);

  // ShapeBase fade (mFadeVal) and cloak (mCloakLevel) — see shapeFadeCloak.ts.
  useFadeAndCloak(clonedScene, () => streamEntityRef.current);
  useShapeLighting(clonedScene, shapeName);
  // Map mode has no stream entity; the mission object's class decides.
  useShadowCaster(
    clonedScene,
    shapeName,
    () => streamEntityRef.current ?? { className: type },
  );
  // ShapeImageData light (turret barrel fire flashes), driven by the
  // owner's ghosted image slot.
  useImageLight(clonedScene, imageLight, entityId, imageSlot);

  // Turret::setImage on the client (Tribes2.exe FUN_00654e60) adds a
  // "deploy" thread to a mounted barrel that advanceTime (FUN_00655b50)
  // runs at half speed, so a base turret's barrel extends once on mount —
  // in map mode too, where the mission script mounts the barrel. A model
  // mounted after the image was set (a seek) starts the thread where it
  // would be by now, or holds its end.
  useEffect(() => {
    if (!mixer || imageSlot == null || entityId == null) return;
    const clip = clipsByName.get("deploy");
    if (!clip) return;
    const store = gameEntityStore.getState();
    const owner =
      store.streamEntities.get(entityId) ?? store.missionEntities.get(entityId);
    if (owner?.className !== "Turret") return;
    const mountedAt = ownerImageSlot(owner, imageSlot)?.mountedAtSec;
    const elapsed =
      mountedAt != null ? Math.max(0, streamClock.time - mountedAt) : 0;
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = 0.5;
    action.reset().play();
    const at = elapsed * 0.5;
    if (at >= clip.duration) {
      action.time = clip.duration;
      action.paused = true;
    } else {
      action.time = at;
    }
    return () => {
      action.stop();
    };
  }, [mixer, clipsByName, entityId, imageSlot]);

  // ShapeBase sound slots — managed as PositionalAudio, not entities.
  useEntitySoundSlots(streamEntityRef, clonedScene);

  // The shape's own nodes: mount point bones for portal rendering and
  // mount position tracking, and the Eye node vehicles define for the
  // cockpit viewpoint. DTS node lookups are case insensitive (the tank
  // and belly turret bases name their seats `mount0`).
  const { mountBones, eyeBone } = useMemo(() => {
    const nodes = collectOwnNodes(clonedScene);
    const bones: Record<number, Object3D> = {};
    for (const [name, node] of nodes) {
      const match = name.match(/^mount(\d+)$/);
      if (match) bones[Number(match[1])] = node;
    }
    return {
      mountBones: Object.keys(bones).length > 0 ? bones : null,
      eyeBone: nodes.get("eye") ?? null,
    };
  }, [clonedScene]);

  useEyePosition(entityId, eyeBone, clonedScene);

  // Item/ShapeBase built-in dynamic light. Item::registerLights
  // (FUN_00603de0) skips lightOnlyStatic items that are not static and
  // places the light at the world box centre; LightPool turns it into a
  // GL-style point light for shapes and a projected falloff disc for
  // terrain and interiors.
  const lightConfig = useMemo(() => {
    const cfg = lightConfigProp;
    if (!cfg || (cfg.onlyStatic && !cfg.isStatic)) return null;
    return {
      type: cfg.type,
      color: new Color(cfg.color[0], cfg.color[1], cfg.color[2]),
      time: cfg.time,
      radius: cfg.radius,
      delayMS: cfg.delayMS,
      offset: shapeLightOffset(cfg.anchor, shapeName, gltf.scene),
    };
  }, [gltf.scene, lightConfigProp, shapeName]);

  // The light lives in the effect-light registry; LightPool drives a fixed
  // set of real point lights from it, so mounting a glowing shape never
  // changes the scene's light count (which would recompile every lit
  // material). The pool resolves the anchor to a world position before each
  // render; only the intensity is animated here.
  const effectLightRef = useEffectLight(
    clonedScene,
    lightConfig ?? undefined,
    0,
  );

  useFrame(() => {
    const light = effectLightRef.current;
    if (!light || !lightConfig) return;
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
    if (
      lightConfig.delayMS != null &&
      (streamEntityRef.current?.projectileAgeMS ?? 0) < lightConfig.delayMS
    ) {
      intensity = 0;
    }
    // The colour × intensity clamp to [0,1] in Item::registerLights never
    // binds for datablock colours ≤ 1.
    light.intensity = intensity;
  }, FramePriority.ShapeAnimation);

  return (
    <group rotation={noRotation ? undefined : STANDARD_90_ROTATION}>
      <primitive object={clonedScene} />
      {debugMode ? (
        <FloatingLabel>
          {entityId}: {shapeName}
        </FloatingLabel>
      ) : null}
      {entityId && <DebugShapeBounds entityId={entityId} scene={gltf.scene} />}
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
  imageLight,
  imageSlot,
}: {
  streamEntity?: StreamShapeEntity;
  emap?: boolean;
  entityId?: string;
  children?: ReactNode;
  mounted?: Record<number, ReactNode>;
  noRotation?: boolean;
  skinName?: string;
  lightConfig?: ShapeLightConfig;
  imageLight?: ImageLightConfig;
  imageSlot?: number;
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
      imageLight={imageLight}
      imageSlot={imageSlot}
    >
      {children}
    </ShapeModel>
  );
}

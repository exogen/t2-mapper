import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { createLogger } from "../logger";
import { FALLBACK_TEXTURE_URL, textureToUrl, shapeToUrl } from "../loaders";
import {
  MeshStandardMaterial,
  MeshBasicMaterial,
  MeshLambertMaterial,
  AdditiveBlending,
  AdditiveAnimationBlendMode,
  AnimationMixer,
  AnimationClip,
  LoopOnce,
  LoopRepeat,
  Texture,
  BufferGeometry,
  Group,
} from "three";
import type { AnimationAction, Material } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { setupTexture } from "../textureUtils";
import { useAnisotropy } from "./useAnisotropy";
import { useDebug, useSettings } from "./SettingsProvider";
import { useShapeInfo, isOrganicShape } from "./ShapeInfoProvider";
import {
  useEngineSelector,
  effectNow,
  engineStore,
} from "../state/engineStore";
import { FloatingLabel } from "./FloatingLabel";
import {
  useIflTexture,
  loadIflAtlas,
  getFrameIndexForTime,
  updateAtlasFrame,
} from "./useIflTexture";
import type { IflAtlas } from "./useIflTexture";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { injectShapeLighting } from "../shapeMaterial";
import {
  processShapeScene,
  replaceWithShapeMaterial,
  disposeClonedScene,
} from "../stream/playbackUtils";
import type { ThreadState as StreamThreadState } from "../stream/types";

/** Shape entity data readable in useFrame for streaming mode. */
interface StreamShapeEntity {
  threads?: StreamThreadState[];
  wheels?: Array<{ speed: number; lateralSlip: number; longitudinalSlip: number }>;
  steeringYaw?: number;
  frozen?: boolean;
  maxSteeringAngle?: number;
}

const log = createLogger("GenericShape");

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

/** Shared props for texture rendering components */
interface TextureProps {
  material: MeshStandardMaterial;
  shapeName?: string;
  geometry?: BufferGeometry;
  backGeometry?: BufferGeometry;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** DTS object visibility (0–1). Values < 1 enable alpha blending. */
  vis?: number;
  /** When true, material is created transparent for vis keyframe animation. */
  animated?: boolean;
}

/**
 * DTS Material Flags (from tsShape.h):
 * - Translucent: Material has alpha transparency (smooth blending)
 * - Additive: Additive blending mode
 * - Subtractive: Subtractive blending mode
 * - SelfIlluminating: Fullbright, no lighting applied
 * - NeverEnvMap: Don't apply environment mapping
 */
type SingleMaterial =
  | MeshStandardMaterial
  | MeshBasicMaterial
  | MeshLambertMaterial;
type MaterialResult =
  | SingleMaterial
  | [MeshLambertMaterial, MeshLambertMaterial];

// Stable onBeforeCompile callbacks — using shared function references lets
// Three.js's program cache match by identity rather than toString().
const lambertBeforeCompile: Material["onBeforeCompile"] = (shader) => {
  injectCustomFog(shader, globalFogUniforms);
  injectShapeLighting(shader);
};

const basicBeforeCompile: Material["onBeforeCompile"] = (shader) => {
  injectCustomFog(shader, globalFogUniforms);
};

/**
 * Helper to apply volumetric fog and lighting multipliers to a material.
 */
export function applyShapeShaderModifications(
  mat: MeshBasicMaterial | MeshLambertMaterial,
): void {
  mat.onBeforeCompile =
    mat instanceof MeshLambertMaterial
      ? lambertBeforeCompile
      : basicBeforeCompile;
}

export function createMaterialFromFlags(
  baseMaterial: MeshStandardMaterial,
  texture: Texture | null,
  flagNames: Set<string>,
  isOrganic: boolean,
  vis: number = 1,
  animated: boolean = false,
): MaterialResult {
  const isTranslucent = flagNames.has("Translucent");
  const isAdditive = flagNames.has("Additive");
  const isSelfIlluminating = flagNames.has("SelfIlluminating");
  // DTS per-object visibility: when vis < 1, the engine sets fadeSet=true which
  // forces the Translucent flag and renders with GL_SRC_ALPHA/GL_ONE_MINUS_SRC_ALPHA.
  // Animated vis also needs transparent materials so opacity can be updated per frame.
  const isFaded = vis < 1 || animated;

  // SelfIlluminating or Additive materials are unlit (use MeshBasicMaterial).
  // Additive materials without SelfIlluminating (e.g. explosion shells) must
  // also be unlit, otherwise they render black with no scene lighting.
  if (isSelfIlluminating || isAdditive) {
    const isBlended = isAdditive || isTranslucent || isFaded;
    const mat = new MeshBasicMaterial({
      map: texture,
      side: 2, // DoubleSide
      transparent: isBlended,
      depthWrite: !isBlended,
      alphaTest: 0,
      fog: true,
      ...(isFaded && { opacity: vis }),
      ...(isAdditive && { blending: AdditiveBlending }),
    });
    applyShapeShaderModifications(mat);
    return mat;
  }

  // For organic shapes or Translucent flag, use alpha cutout with Lambert shading
  // Tribes 2 used fixed-function GL with specular disabled - purely diffuse lighting
  // MeshLambertMaterial gives us the diffuse-only look that matches the original
  // Return [BackSide, FrontSide] materials to render in two passes - avoids z-fighting
  if (isOrganic || isTranslucent) {
    const baseProps = {
      map: texture,
      // When vis < 1, switch from alpha cutout to alpha blend (matching the engine's
      // fadeSet behavior which forces GL_BLEND with no alpha test)
      transparent: isFaded,
      alphaTest: isFaded ? 0 : 0.5,
      ...(isFaded && { opacity: vis, depthWrite: false }),
      reflectivity: 0,
    };
    const backMat = new MeshLambertMaterial({
      ...baseProps,
      side: 1, // BackSide
      // Push back faces slightly behind in depth to avoid z-fighting with front
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const frontMat = new MeshLambertMaterial({
      ...baseProps,
      side: 0, // FrontSide
    });
    applyShapeShaderModifications(backMat);
    applyShapeShaderModifications(frontMat);
    return [backMat, frontMat];
  }

  // Default: use Lambert for diffuse-only lighting (matches Tribes 2)
  // Tribes 2 used fixed-function GL with specular disabled
  const mat = new MeshLambertMaterial({
    map: texture,
    side: 2, // DoubleSide
    reflectivity: 0,
    ...(isFaded && {
      transparent: true,
      opacity: vis,
      depthWrite: false,
    }),
  });
  applyShapeShaderModifications(mat);
  return mat;
}

/**
 * Load a .glb file that was converted from a .dts, used for static shapes.
 */
export function useStaticShape(shapeName: string) {
  const url = shapeToUrl(shapeName);
  return useGLTF(url);
}

/**
 * Animated IFL (Image File List) material component. Creates a sprite sheet
 * from all frames and animates via texture offset.
 */
const IflTexture = memo(function IflTexture({
  material,
  shapeName,
  geometry,
  backGeometry,
  castShadow = false,
  receiveShadow = false,
  vis = 1,
  animated = false,
}: TextureProps) {
  const resourcePath = material.userData.resource_path;
  const flagNames = useMemo(
    () =>
      material.userData.flag_names
        ? new Set<string>(material.userData.flag_names)
        : EMPTY_FLAG_NAMES,
    [material.userData.flag_names],
  );
  const iflPath = `textures/${resourcePath}.ifl`;

  const texture = useIflTexture(iflPath);
  const isOrganic = !!(shapeName && isOrganicShape(shapeName));

  const customMaterial = useMemo(
    () =>
      createMaterialFromFlags(
        material,
        texture,
        flagNames,
        isOrganic,
        vis,
        animated,
      ),
    [material, texture, flagNames, isOrganic, vis, animated],
  );

  useDisposeMaterial(customMaterial);

  // Two-pass rendering for organic/translucent materials
  // Render BackSide first (with flipped normals), then FrontSide
  if (Array.isArray(customMaterial)) {
    return (
      <>
        <mesh
          geometry={backGeometry || geometry}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <primitive object={customMaterial[0]} attach="material" />
        </mesh>
        <mesh
          geometry={geometry}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <primitive object={customMaterial[1]} attach="material" />
        </mesh>
      </>
    );
  }

  return (
    <mesh
      geometry={geometry}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <primitive object={customMaterial} attach="material" />
    </mesh>
  );
});

function useDisposeMaterial(material: MaterialResult) {
  useEffect(() => {
    return () => {
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material.dispose();
      }
    };
  }, [material]);
}

const EMPTY_FLAG_NAMES = new Set<string>();

const StaticTexture = memo(function StaticTexture({
  material,
  shapeName,
  geometry,
  backGeometry,
  castShadow = false,
  receiveShadow = false,
  vis = 1,
  animated = false,
}: TextureProps) {
  const resourcePath = material.userData.resource_path;
  const flagNames = useMemo(
    () =>
      material.userData.flag_names
        ? new Set<string>(material.userData.flag_names)
        : EMPTY_FLAG_NAMES,
    [material.userData.flag_names],
  );

  const url = useMemo(() => {
    if (!resourcePath) {
      log.warn(
        'No resource_path found on "%s" — rendering fallback',
        shapeName,
      );
    }
    return resourcePath ? textureToUrl(resourcePath) : FALLBACK_TEXTURE_URL;
  }, [resourcePath, shapeName]);

  const isOrganic = !!(shapeName && isOrganicShape(shapeName));
  const isTranslucent = flagNames.has("Translucent");
  const anisotropy = useAnisotropy();

  const texture = useTexture(url, (texture) => {
    // Organic/alpha-tested textures need special handling to avoid mipmap artifacts
    if (isOrganic || isTranslucent) {
      return setupTexture(texture, { disableMipmaps: true, anisotropy });
    }
    // Standard color texture setup for diffuse-only materials
    return setupTexture(texture, { anisotropy });
  });

  const customMaterial = useMemo(
    () =>
      createMaterialFromFlags(
        material,
        texture,
        flagNames,
        isOrganic,
        vis,
        animated,
      ),
    [material, texture, flagNames, isOrganic, vis, animated],
  );

  useDisposeMaterial(customMaterial);

  // Two-pass rendering for organic/translucent materials
  // Render BackSide first (with flipped normals), then FrontSide
  if (Array.isArray(customMaterial)) {
    return (
      <>
        <mesh
          geometry={backGeometry || geometry}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <primitive object={customMaterial[0]} attach="material" />
        </mesh>
        <mesh
          geometry={geometry}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <primitive object={customMaterial[1]} attach="material" />
        </mesh>
      </>
    );
  }

  return (
    <mesh
      geometry={geometry}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <primitive object={customMaterial} attach="material" />
    </mesh>
  );
});

export const ShapeTexture = memo(function ShapeTexture({
  material,
  shapeName,
  geometry,
  backGeometry,
  castShadow = false,
  receiveShadow = false,
  vis = 1,
  animated = false,
}: TextureProps) {
  const flagNames = new Set(material.userData.flag_names ?? []);
  const isIflMaterial = flagNames.has("IflMaterial");
  const resourcePath = material.userData.resource_path;

  // Use IflTexture for animated materials
  if (isIflMaterial && resourcePath) {
    return (
      <IflTexture
        material={material}
        shapeName={shapeName}
        geometry={geometry}
        backGeometry={backGeometry}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
        vis={vis}
        animated={animated}
      />
    );
  } else if (material.name) {
    return (
      <StaticTexture
        material={material}
        shapeName={shapeName}
        geometry={geometry}
        backGeometry={backGeometry}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
        vis={vis}
        animated={animated}
      />
    );
  } else {
    return null;
  }
});

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
  children,
}: {
  loadingColor?: string;
  /** Stable entity reference whose fields are mutated in-place. */
  streamEntity?: StreamShapeEntity;
  children?: React.ReactNode;
}) {
  const { object, shapeName } = useShapeInfo();

  if (!shapeName) {
    return (
      <DebugPlaceholder color="orange" label={`${object?._id}: <missing>`} />
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <DebugPlaceholder color="red" label={`${object?._id}: ${shapeName}`} />
      }
    >
      <Suspense fallback={<ShapePlaceholder color={loadingColor} />}>
        <ShapeModelLoader streamEntity={streamEntity} />
        {children}
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
  visNodes?: VisNode[];
  startTime: number;
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
}: {
  gltf: ReturnType<typeof useStaticShape>;
  /** Stable entity reference whose fields are mutated in-place. */
  streamEntity?: StreamShapeEntity;
}) {
  const { object, shapeName } = useShapeInfo();
  const { debugMode } = useDebug();
  const { animationEnabled } = useSettings();
  const runtime = useEngineSelector((state) => state.runtime.runtime);
  const anisotropy = useAnisotropy();

  const { clonedScene, mixer, clipsByName, visNodesBySequence, iflMeshes } =
    useMemo(() => {
      const scene = SkeletonUtils.clone(gltf.scene) as Group;

      // Detect IFL materials BEFORE processShapeScene replaces them, since the
      // replacement materials lose the original userData (flag_names, resource_path).
      const iflInfos: Array<{
        mesh: any;
        iflPath: string;
        hasVisSequence: boolean;
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
            iflSequence: iflSeq,
            iflDuration: iflDur,
            iflCyclic,
            iflToolBegin,
          });
        }
      });

      processShapeScene(scene, shapeName ?? undefined, { anisotropy });

      // Un-hide IFL meshes that don't have a vis sequence — they should always
      // be visible. IFL meshes WITH vis sequences stay hidden until their
      // sequence is activated by playThread.
      for (const { mesh, hasVisSequence } of iflInfos) {
        if (!hasVisSequence) {
          mesh.visible = true;
        }
      }

      // Collect ALL vis-animated nodes, grouped by sequence name.
      const visBySeq = new Map<string, VisNode[]>();
      scene.traverse((node: any) => {
        if (!node.isMesh) return;
        const ud = node.userData;
        if (!ud) return;
        const kf = ud.vis_keyframes;
        const dur = ud.vis_duration;
        const seqName = (ud.vis_sequence ?? "").toLowerCase();
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
        list.push({
          mesh: node,
          keyframes: kf,
          duration: dur,
          cyclic: !!ud.vis_cyclic,
        });
      });

      // Build clips by name (case-insensitive)
      const clips = new Map<string, AnimationClip>();
      for (const clip of gltf.animations) {
        clips.set(clip.name.toLowerCase(), clip);
      }

      // Only create a mixer if there are skeleton animation clips.
      const mix = clips.size > 0 ? new AnimationMixer(scene) : null;

      return {
        clonedScene: scene,
        mixer: mix,
        clipsByName: clips,
        visNodesBySequence: visBySeq,
        iflMeshes: iflInfos,
      };
    }, [gltf, anisotropy]);

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
    ((slot: number, seq: string) => void) | null
  >(null);
  const handleStopThreadRef = useRef<((slot: number) => void) | null>(null);
  const prevDemoThreadsRef = useRef<StreamThreadState[] | undefined>(undefined);

  // Load IFL texture atlases imperatively (processShapeScene can't resolve
  // .ifl paths since they require async loading of the frame list).
  useEffect(() => {
    iflAnimInfosRef.current = [];
    iflMeshAtlasRef.current.clear();
    for (const info of iflMeshes) {
      loadIflAtlas(info.iflPath)
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
        const cyclic: boolean[] = typeof rawCyclic === "string" ? JSON.parse(rawCyclic) : [];
        const blend: boolean[] = typeof rawBlend === "string" ? JSON.parse(rawBlend) : [];
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
  // Mission mode (streamEntity absent): auto-play default looping sequences
  //   (power, ambient) so static shapes look alive. TorqueScript playThread/
  //   stopThread/pauseThread events can override if scripts are loaded.
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
        v.mesh.material.transparent = true;
        v.mesh.material.depthWrite = false;
      }
      const atlas = iflMeshAtlasRef.current.get(v.mesh);
      if (atlas && v.mesh.material && !Array.isArray(v.mesh.material)) {
        v.mesh.material.map = atlas.texture;
        v.mesh.material.needsUpdate = true;
      }
    }

    function handlePlayThread(slot: number, sequenceName: string) {
      const seqLower = sequenceName.toLowerCase();
      handleStopThread(slot);

      const clip = clipsByName.get(seqLower);
      const vNodes = visNodesBySequence.get(seqLower);
      const thread: ThreadState = {
        sequence: seqLower,
        startTime: shapeNowSec(),
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
        action.reset().play();
        thread.action = action;
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
      if (thread.visNodes) {
        for (const v of thread.visNodes) {
          v.mesh.visible = false;
          if (v.mesh.material && !Array.isArray(v.mesh.material)) {
            v.mesh.material.opacity = v.keyframes[0];
          }
        }
      }
      threads.delete(slot);
    }

    handlePlayThreadRef.current = handlePlayThread;
    handleStopThreadRef.current = handleStopThread;

    // ── Demo/live mode: no auto-play, useFrame drives from ghost data ──
    if (!isMissionMode) {
      return () => {
        handlePlayThreadRef.current = null;
        handleStopThreadRef.current = null;
        prevDemoThreadsRef.current = undefined;
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
            }
          },
        ),
      );
    }

    // Start default looping sequences immediately. Thread slots match
    // power.cs globals: $PowerThread=0, $AmbientThread=1.
    const defaults: Array<[number, string]> = [
      [0, "power"],
      [1, "ambient"],
    ];
    for (const [slot, seqName] of defaults) {
      if (clipsByName.has(seqName) || visNodesBySequence.has(seqName)) {
        handlePlayThread(slot, seqName);
      }
    }

    // Set up WheeledVehicle wheel/spring/turn animations.
    // These are position-controlled (setPos) not thread-controlled.
    // Detect by checking if wheel0/spring0 clips exist.
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
              prev.atEnd !== t.atEnd;
            if (!changed) continue;

            // When only atEnd changed (false→true) on a playing thread with
            // the same sequence, the animation has finished on the server.
            // Don't restart it — snap to the end pose so one-shot animations
            // like "deploy" stay clamped instead of collapsing back.
            const onlyAtEndChanged =
              prev &&
              prev.sequence === t.sequence &&
              prev.state === t.state &&
              t.state === 0 &&
              !prev.atEnd &&
              t.atEnd;
            if (onlyAtEndChanged) {
              const thread = threads.get(slot);
              if (thread?.action) {
                const clip = thread.action.getClip();
                thread.action.time = t.forward ? clip.duration : 0;
                thread.action.setLoop(LoopOnce, 1);
                thread.action.clampWhenFinished = true;
                thread.action.paused = true;
              }
              continue;
            }

            const seqName = seqIndexToName[t.sequence];
            if (!seqName) continue;
            if (t.state === 0) {
              playThread(slot, seqName);
              // If the animation is already finished (atEnd=true on first
              // appearance — e.g. a deployed MPB entering scope), snap to
              // the end pose immediately instead of replaying it.
              if (t.atEnd) {
                const thread = threads.get(slot);
                if (thread?.action) {
                  const clip = thread.action.getClip();
                  thread.action.time = t.forward ? clip.duration : 0;
                  thread.action.setLoop(LoopOnce, 1);
                  thread.action.clampWhenFinished = true;
                  thread.action.paused = true;
                }
              }
            } else {
              stopThread(slot);
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
    for (const [, thread] of threads) {
      if (!thread.visNodes) continue;

      for (const { mesh, keyframes, duration, cyclic } of thread.visNodes) {
        const mat = mesh.material;
        if (!mat || Array.isArray(mat)) continue;

        if (!animationEnabled) {
          mat.opacity = keyframes[0];
          continue;
        }

        const elapsed = shapeNowSec() - thread.startTime;
        const t = cyclic
          ? (elapsed % duration) / duration
          : Math.min(elapsed / duration, 1);

        const n = keyframes.length;
        const pos = t * n;
        const lo = Math.floor(pos) % n;
        const hi = (lo + 1) % n;
        const frac = pos - Math.floor(pos);
        mat.opacity = keyframes[lo] + (keyframes[hi] - keyframes[lo]) * frac;
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
          wa.wheelAction.time =
            wa.rotation * wa.wheelAction.getClip().duration;
        }

        // Spring: ghost vehicles stay at rest (fully extended = pos 0).
        // The server already accounts for spring height in the ghost position.
        // (Spring animation would only change with client-side raycasts.)

        // Turn: steering angle → animation position.
        // Torque: pos = 0.5 - t * 0.5 where t = steerAngle² / maxSteeringAngle
        if (wa.turnAction) {
          const t =
            (steeringYaw * Math.abs(steeringYaw)) / maxSteeringAngle;
          const pos = 0.5 - t * 0.5;
          wa.turnAction.time =
            Math.max(0, Math.min(1, pos)) *
            wa.turnAction.getClip().duration;
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
        if (!animationEnabled) {
          updateAtlasFrame(info.atlas, 0);
          continue;
        }

        if (info.sequenceName && info.sequenceDuration) {
          // Sequence-driven IFL: find the thread playing this sequence and
          // compute time = pos * duration + toolBegin (matching the engine).
          let iflTime = 0;
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
          updateAtlasFrame(
            info.atlas,
            getFrameIndexForTime(info.atlas, iflTime),
          );
        } else {
          // No controlling sequence: use accumulated real time.
          // (In the engine, these would stay at frame 0, but cycling is more
          // useful for display purposes.)
          updateAtlasFrame(
            info.atlas,
            getFrameIndexForTime(info.atlas, iflTimeRef.current),
          );
        }
      }
    }
  });

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <primitive object={clonedScene} />
      {debugMode ? (
        <FloatingLabel>
          {object?._id}: {shapeName}
        </FloatingLabel>
      ) : null}
    </group>
  );
});

function ShapeModelLoader({
  streamEntity,
}: {
  streamEntity?: { threads?: StreamThreadState[] };
}) {
  const { shapeName } = useShapeInfo();
  const gltf = useStaticShape(shapeName);
  return <ShapeModel gltf={gltf} streamEntity={streamEntity} />;
}

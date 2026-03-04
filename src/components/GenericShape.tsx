import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_TEXTURE_URL, textureToUrl, shapeToUrl } from "../loaders";
import {
  MeshStandardMaterial,
  MeshBasicMaterial,
  MeshLambertMaterial,
  AdditiveBlending,
  AnimationMixer,
  AnimationClip,
  LoopOnce,
  LoopRepeat,
  Texture,
  BufferGeometry,
  Group,
} from "three";
import type { AnimationAction } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { setupTexture } from "../textureUtils";
import { useDebug, useSettings } from "./SettingsProvider";
import { useShapeInfo, isOrganicShape } from "./ShapeInfoProvider";
import { useEngineSelector } from "../state";
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
} from "../demo/demoPlaybackUtils";
import type { DemoThreadState } from "../demo/types";

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

/**
 * Helper to apply volumetric fog and lighting multipliers to a material
 */
export function applyShapeShaderModifications(
  mat: MeshBasicMaterial | MeshLambertMaterial,
): void {
  mat.onBeforeCompile = (shader) => {
    injectCustomFog(shader, globalFogUniforms);
    // Only inject lighting for Lambert materials (Basic materials are unlit)
    if (mat instanceof MeshLambertMaterial) {
      injectShapeLighting(shader);
    }
  };
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
  const flagNames = new Set<string>(material.userData.flag_names ?? []);
  const iflPath = `textures/${resourcePath}.ifl`;

  const texture = useIflTexture(iflPath);
  const isOrganic = shapeName && isOrganicShape(shapeName);

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
  const flagNames = new Set<string>(material.userData.flag_names ?? []);

  const url = useMemo(() => {
    if (!resourcePath) {
      console.warn(
        `No resource_path was found on "${shapeName}" - rendering fallback.`,
      );
    }
    return resourcePath ? textureToUrl(resourcePath) : FALLBACK_TEXTURE_URL;
  }, [resourcePath, shapeName]);

  const isOrganic = shapeName && isOrganicShape(shapeName);
  const isTranslucent = flagNames.has("Translucent");

  const texture = useTexture(url, (texture) => {
    // Organic/alpha-tested textures need special handling to avoid mipmap artifacts
    if (isOrganic || isTranslucent) {
      return setupTexture(texture, { disableMipmaps: true });
    }
    // Standard color texture setup for diffuse-only materials
    return setupTexture(texture);
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

/** Shapes that don't have a .glb conversion and are rendered with built-in
 * Three.js geometry instead. These are editor-only markers in Tribes 2. */
const HARDCODED_SHAPES = new Set(["octahedron.dts"]);

function HardcodedShape({ label }: { label?: string }) {
  const { debugMode } = useDebug();
  if (!debugMode) return null;
  return (
    <mesh>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color="cyan" wireframe />
      {label ? <FloatingLabel color="cyan">{label}</FloatingLabel> : null}
    </mesh>
  );
}

/**
 * Wrapper component that handles the common ErrorBoundary + Suspense + ShapeModel
 * pattern used across shape-rendering components.
 */
export function ShapeRenderer({
  loadingColor = "yellow",
  demoThreads,
  children,
}: {
  loadingColor?: string;
  demoThreads?: DemoThreadState[];
  children?: React.ReactNode;
}) {
  const { object, shapeName } = useShapeInfo();

  if (!shapeName) {
    return (
      <DebugPlaceholder color="orange" label={`${object._id}: <missing>`} />
    );
  }

  if (HARDCODED_SHAPES.has(shapeName.toLowerCase())) {
    return <HardcodedShape label={`${object._id}: ${shapeName}`} />;
  }

  return (
    <ErrorBoundary
      fallback={
        <DebugPlaceholder color="red" label={`${object._id}: ${shapeName}`} />
      }
    >
      <Suspense fallback={<ShapePlaceholder color={loadingColor} />}>
        <ShapeModelLoader demoThreads={demoThreads} />
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

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

// Thread slot constants matching power.cs globals
const DEPLOY_THREAD = 3;

/**
 * Unified shape renderer. Clones the full scene graph (preserving skeleton
 * bindings), applies Tribes 2 materials via processShapeScene, and drives
 * animation threads either through TorqueScript (for deployable shapes with
 * a runtime) or directly (ambient/power vis sequences).
 */
export const ShapeModel = memo(function ShapeModel({
  gltf,
  demoThreads,
}: {
  gltf: ReturnType<typeof useStaticShape>;
  demoThreads?: DemoThreadState[];
}) {
  const { object, shapeName } = useShapeInfo();
  const { debugMode } = useDebug();
  const { animationEnabled } = useSettings();
  const runtime = useEngineSelector((state) => state.runtime.runtime);

  const {
    clonedScene,
    mixer,
    clipsByName,
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
        const iflDur = ud?.ifl_duration
          ? Number(ud.ifl_duration)
          : undefined;
        const iflCyclic = ud?.ifl_sequence ? !!ud.ifl_cyclic : undefined;
        const iflToolBegin = ud?.ifl_tool_begin != null
          ? Number(ud.ifl_tool_begin)
          : undefined;
        iflInfos.push({
          mesh: node,
          iflPath: `textures/${rp}.ifl`,
          hasVisSequence: !!(ud?.vis_sequence),
          iflSequence: iflSeq,
          iflDuration: iflDur,
          iflCyclic,
          iflToolBegin,
        });
      }
    });

    processShapeScene(scene);

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
      if (!seqName || !Array.isArray(kf) || kf.length <= 1 || !dur || dur <= 0)
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
  }, [gltf]);

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

  // Stable ref for the deploy-end callback so useFrame can advance the
  // lifecycle when animation is toggled off mid-deploy.
  const onDeployEndRef = useRef<((slot: number) => void) | null>(null);

  // Refs for demo thread-driven animation (exposed from the main animation effect).
  const demoThreadsRef = useRef(demoThreads);
  demoThreadsRef.current = demoThreads;
  const handlePlayThreadRef = useRef<((slot: number, seq: string) => void) | null>(null);
  const handleStopThreadRef = useRef<((slot: number) => void) | null>(null);
  const prevDemoThreadsRef = useRef<DemoThreadState[] | undefined>(undefined);

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
          iflAnimInfosRef.current.push({
            atlas,
            sequenceName: info.iflSequence,
            sequenceDuration: info.iflDuration,
            cyclic: info.iflCyclic,
            toolBegin: info.iflToolBegin,
          });
          iflMeshAtlasRef.current.set(info.mesh, atlas);
        })
        .catch(() => {});
    }
  }, [iflMeshes]);

  // Animation setup. Shared helpers (handlePlayThread, handleStopThread) are
  // used by both mission rendering and demo playback. The lifecycle that
  // decides WHEN to call them differs: mission mode auto-plays deploy and
  // subscribes to TorqueScript; demo mode does nothing on mount and lets
  // the useFrame handler drive everything from ghost thread data.
  useEffect(() => {
    const threads = threadsRef.current;

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
        startTime: performance.now() / 1000,
      };

      if (clip && mixer) {
        const action = mixer.clipAction(clip);
        if (seqLower === "deploy") {
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(LoopRepeat, Infinity);
        }
        action.reset().play();
        thread.action = action;

        // When animations are disabled, snap deploy to its end pose.
        if (!animationEnabledRef.current && seqLower === "deploy") {
          action.time = clip.duration;
          mixer.update(0);
          // In mission mode, onDeployEndRef advances the lifecycle.
          // In demo mode it's null — the ghost data drives what's next.
          if (onDeployEndRef.current) {
            queueMicrotask(() => onDeployEndRef.current?.(slot));
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

    // ── Demo playback: all animation driven by ghost thread data ──
    // No deploy lifecycle, no auto-play, no TorqueScript. The useFrame
    // handler reads demoThreads and calls handlePlayThread/handleStopThread.
    if (demoThreadsRef.current != null) {
      return () => {
        handlePlayThreadRef.current = null;
        handleStopThreadRef.current = null;
        for (const slot of [...threads.keys()]) handleStopThread(slot);
      };
    }

    // ── Mission rendering: deploy lifecycle + TorqueScript ──
    const hasDeployClip = clipsByName.has("deploy");
    const useTorqueDeploy = !!(runtime && hasDeployClip && object.datablock);

    function fireOnEndSequence(slot: number) {
      if (!runtime) return;
      const dbName = object.datablock;
      if (!dbName) return;
      const datablock = runtime.getObjectByName(String(dbName));
      if (datablock) {
        runtime.$.call(datablock, "onEndSequence", object, slot);
      }
    }

    onDeployEndRef.current = useTorqueDeploy
      ? fireOnEndSequence
      : () => startPostDeployThreads();

    function startPostDeployThreads() {
      const autoPlaySequences = ["ambient", "power"];
      for (const seqName of autoPlaySequences) {
        const vNodes = visNodesBySequence.get(seqName);
        if (vNodes) {
          const startTime = performance.now() / 1000;
          for (const v of vNodes) prepareVisNode(v);
          const slot = seqName === "power" ? 0 : 1;
          threads.set(slot, { sequence: seqName, visNodes: vNodes, startTime });
        }
        const clip = clipsByName.get(seqName);
        if (clip && mixer) {
          const action = mixer.clipAction(clip);
          action.setLoop(LoopRepeat, Infinity);
          action.reset().play();
          const slot = seqName === "power" ? 0 : 1;
          const existing = threads.get(slot);
          if (existing) {
            existing.action = action;
          } else {
            threads.set(slot, {
              sequence: seqName,
              action,
              startTime: performance.now() / 1000,
            });
          }
        }
      }
    }

    const unsubs: (() => void)[] = [];

    const onFinished = mixer
      ? (e: { action: AnimationAction }) => {
          for (const [slot, thread] of threads) {
            if (thread.action === e.action) {
              if (useTorqueDeploy) {
                fireOnEndSequence(slot);
              } else {
                startPostDeployThreads();
              }
              break;
            }
          }
        }
      : null;

    if (onFinished && mixer) {
      mixer.addEventListener("finished", onFinished);
    }

    if (runtime) {
      unsubs.push(
        runtime.$.onMethodCalled(
          "ShapeBase",
          "playThread",
          (thisObj, slot, sequence) => {
            if (thisObj._id !== object._id) return;
            handlePlayThread(Number(slot), String(sequence));
          },
        ),
      );
      unsubs.push(
        runtime.$.onMethodCalled(
          "ShapeBase",
          "stopThread",
          (thisObj, slot) => {
            if (thisObj._id !== object._id) return;
            handleStopThread(Number(slot));
          },
        ),
      );
      unsubs.push(
        runtime.$.onMethodCalled(
          "ShapeBase",
          "pauseThread",
          (thisObj, slot) => {
            if (thisObj._id !== object._id) return;
            const thread = threads.get(Number(slot));
            if (thread?.action) {
              thread.action.paused = true;
            }
          },
        ),
      );
    }

    if (useTorqueDeploy) {
      runtime.$.call(object, "deploy");
    } else if (hasDeployClip) {
      handlePlayThread(DEPLOY_THREAD, "deploy");
    } else {
      startPostDeployThreads();
    }

    return () => {
      if (onFinished && mixer) {
        mixer.removeEventListener("finished", onFinished);
      }
      unsubs.forEach((fn) => fn());
      onDeployEndRef.current = null;
      handlePlayThreadRef.current = null;
      handleStopThreadRef.current = null;
      for (const slot of [...threads.keys()]) handleStopThread(slot);
    };
  }, [mixer, clipsByName, visNodesBySequence, object, runtime]);

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
      } catch {}
    }
    return gltf.animations.map((a) => a.name.toLowerCase());
  }, [gltf]);

  useFrame((_, delta) => {
    const threads = threadsRef.current;

    // React to demo thread state changes. The ghost ThreadMask data tells us
    // exactly which DTS sequences are playing/stopped on each of 4 thread slots.
    const currentDemoThreads = demoThreadsRef.current;
    const prevDemoThreads = prevDemoThreadsRef.current;
    if (currentDemoThreads !== prevDemoThreads) {
      const playThread = handlePlayThreadRef.current;
      const stopThread = handleStopThreadRef.current;
      // Don't consume thread data until handlers are ready — leave
      // prevDemoThreadsRef unchanged so the change is re-detected next frame.
      if (playThread && stopThread) {
        prevDemoThreadsRef.current = currentDemoThreads;
        // Use sparse arrays instead of Maps — thread indices are 0-3.
        const currentBySlot: Array<DemoThreadState | undefined> = [];
        if (currentDemoThreads) {
          for (const t of currentDemoThreads) currentBySlot[t.index] = t;
        }
        const prevBySlot: Array<DemoThreadState | undefined> = [];
        if (prevDemoThreads) {
          for (const t of prevDemoThreads) prevBySlot[t.index] = t;
        }
        const maxSlot = Math.max(currentBySlot.length, prevBySlot.length);
        for (let slot = 0; slot < maxSlot; slot++) {
          const t = currentBySlot[slot];
          const prev = prevBySlot[slot];
          if (t) {
            const changed = !prev
              || prev.sequence !== t.sequence
              || prev.state !== t.state
              || prev.atEnd !== t.atEnd;
            if (!changed) continue;

            // When only atEnd changed (false→true) on a playing thread with
            // the same sequence, the animation has finished on the server.
            // Don't restart it — snap to the end pose so one-shot animations
            // like "deploy" stay clamped instead of collapsing back.
            const onlyAtEndChanged = prev
              && prev.sequence === t.sequence
              && prev.state === t.state
              && t.state === 0
              && !prev.atEnd && t.atEnd;
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

    if (mixer) {
      // If animation is disabled and deploy is still mid-animation,
      // snap to the fully-deployed pose and fire onEndSequence.
      if (!animationEnabled) {
        const deployThread = threads.get(DEPLOY_THREAD);
        if (deployThread?.action) {
          const clip = deployThread.action.getClip();
          if (deployThread.action.time < clip.duration - 0.001) {
            deployThread.action.time = clip.duration;
            mixer.update(0);
            onDeployEndRef.current?.(DEPLOY_THREAD);
          }
        }
      }

      if (animationEnabled) {
        mixer.update(delta);
      }
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

        const elapsed = performance.now() / 1000 - thread.startTime;
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

    // Advance IFL texture atlases.
    // Matches Torque's animateIfls():
    //   time = th->pos * th->sequence->duration + th->sequence->toolBegin
    // where pos is [0,1) cyclic or [0,1] clamped, then frame is looked up in
    // cumulative iflFrameOffTimes (seconds, at 1/30s per IFL tick).
    // toolBegin offsets into the IFL timeline so the sequence window aligns
    // with the desired frames (e.g. skipping a long "off" period).
    const iflAnimInfos = iflAnimInfosRef.current;
    if (iflAnimInfos.length > 0) {
      iflTimeRef.current += delta;
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
              const elapsed = performance.now() / 1000 - thread.startTime;
              const dur = info.sequenceDuration;
              // Reproduce th->pos: cyclic wraps [0,1), non-cyclic clamps [0,1]
              const pos = info.cyclic
                ? (elapsed / dur) % 1
                : Math.min(elapsed / dur, 1);
              iflTime = pos * dur + (info.toolBegin ?? 0);
              break;
            }
          }
          updateAtlasFrame(info.atlas, getFrameIndexForTime(info.atlas, iflTime));
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
          {object._id}: {shapeName}
        </FloatingLabel>
      ) : null}
    </group>
  );
});

function ShapeModelLoader({ demoThreads }: { demoThreads?: DemoThreadState[] }) {
  const { shapeName } = useShapeInfo();
  const gltf = useStaticShape(shapeName);
  return <ShapeModel gltf={gltf} demoThreads={demoThreads} />;
}

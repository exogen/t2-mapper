import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ErrorInfo, MutableRefObject, ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF, useTexture } from "@react-three/drei";
import {
  AdditiveBlending,
  AnimationClip,
  AnimationMixer,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  LoopOnce,
  Matrix4,
  MeshLambertMaterial,
  NoColorSpace,
  Object3D,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from "three";
import type {
  AnimationAction,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  Texture,
  MeshStandardMaterial,
} from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { useDemoRecording } from "./DemoProvider";
import { createEntityClip } from "../demo/clips";
import { pickMoveAnimation } from "../demo/playerAnimation";
import { shapeToUrl, textureToUrl } from "../loaders";
import { TickProvider } from "./TickProvider";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import { FloatingLabel } from "./FloatingLabel";
import { useDebug } from "./SettingsProvider";
import {
  ShapeRenderer,
  useStaticShape,
  createMaterialFromFlags,
  applyShapeShaderModifications,
} from "./GenericShape";
import { getHullBoneIndices, filterGeometryByVertexGroups } from "../meshUtils";
import { setupTexture } from "../textureUtils";
import type { TorqueObject } from "../torqueScript";
import type {
  DemoEntity,
  DemoTracerVisual,
  DemoSpriteVisual,
  DemoKeyframe,
  CameraModeFrame,
  DemoRecording,
  DemoStreamSnapshot,
} from "../demo/types";
import { useEngineStoreApi } from "../state";

/** Fallback eye height when the player model isn't loaded or has no Cam node. */
const DEFAULT_EYE_HEIGHT = 2.1;

/**
 * Interpolate camera position and rotation from keyframes at the given time.
 * Uses linear interpolation for position and slerp for rotation.
 * Position is stored in Torque space [x,y,z] and converted to Three.js [y,z,x].
 * Rotation is stored as a Three.js quaternion [x,y,z,w].
 */
function interpolateCameraAtTime(
  entity: DemoEntity,
  time: number,
  outPosition: Vector3,
  outQuaternion: Quaternion,
): number | undefined {
  const { keyframes } = entity;
  if (keyframes.length === 0) return undefined;

  // Clamp to range
  if (time <= keyframes[0].time) {
    const kf = keyframes[0];
    outPosition.set(kf.position[1], kf.position[2], kf.position[0]);
    outQuaternion.set(...kf.rotation);
    return kf.fov;
  }
  if (time >= keyframes[keyframes.length - 1].time) {
    const kf = keyframes[keyframes.length - 1];
    outPosition.set(kf.position[1], kf.position[2], kf.position[0]);
    outQuaternion.set(...kf.rotation);
    return kf.fov;
  }

  // Binary search for the bracketing keyframes.
  let lo = 0;
  let hi = keyframes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].time <= time) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const kfA = keyframes[lo];
  const kfB = keyframes[hi];
  const t = (time - kfA.time) / (kfB.time - kfA.time);

  // Lerp position (in Three.js space).
  outPosition.set(kfA.position[1], kfA.position[2], kfA.position[0]);
  _tmpVec.set(kfB.position[1], kfB.position[2], kfB.position[0]);
  outPosition.lerp(_tmpVec, t);

  // Slerp rotation (already in Three.js space).
  outQuaternion.set(...kfA.rotation);
  _tmpQuat.set(...kfB.rotation);
  outQuaternion.slerp(_tmpQuat, t);
  return kfA.fov ?? kfB.fov;
}

const _tmpVec = new Vector3();
const _tmpQuat = new Quaternion();
const _interpQuatA = new Quaternion();
const _interpQuatB = new Quaternion();
const _orbitDir = new Vector3();
const _orbitTarget = new Vector3();
const _orbitCandidate = new Vector3();
const _hitNormal = new Vector3();
const _orbitRaycaster = new Raycaster();
const _tracerDir = new Vector3();
const _tracerDirFromCam = new Vector3();
const _tracerCross = new Vector3();
const _tracerStart = new Vector3();
const _tracerEnd = new Vector3();
const _tracerWorldPos = new Vector3();
const _tracerOrientI = new Vector3();
const _tracerOrientK = new Vector3();
const _tracerOrientMat = new Matrix4();
const _upY = new Vector3(0, 1, 0);

/** ShapeRenderer's 90° Y rotation and its inverse, used for mount transforms. */
const _r90 = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  Math.PI / 2,
);
const _r90inv = _r90.clone().invert();

/** Torque's animation crossfade duration (seconds). */
const ANIM_TRANSITION_TIME = 0.25;

/**
 * Torque/Tribes stores camera FOV as horizontal degrees, while Three.js
 * PerspectiveCamera.fov expects vertical degrees.
 */
function torqueHorizontalFovToThreeVerticalFov(
  torqueFovDeg: number,
  aspect: number,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0.000001 ? aspect : 4 / 3;
  const clampedFov = Math.max(0.01, Math.min(179.99, torqueFovDeg));
  const hRad = (clampedFov * Math.PI) / 180;
  const vRad = 2 * Math.atan(Math.tan(hRad / 2) / safeAspect);
  return (vRad * 180) / Math.PI;
}

function setupEffectTexture(tex: Texture): void {
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.colorSpace = NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
}

function torqueVecToThree(
  v: [number, number, number],
  out: Vector3,
): Vector3 {
  return out.set(v[1], v[2], v[0]);
}

function setQuaternionFromDir(dir: Vector3, out: Quaternion): void {
  // Equivalent to MathUtils::createOrientFromDir in Torque:
  // column1 = direction, with Torque up-vector converted to Three up-vector.
  _tracerOrientI.crossVectors(dir, _upY);
  if (_tracerOrientI.lengthSq() < 1e-8) {
    _tracerOrientI.set(-1, 0, 0);
  }
  _tracerOrientI.normalize();
  _tracerOrientK.crossVectors(_tracerOrientI, dir).normalize();

  _tracerOrientMat.set(
    _tracerOrientI.x,
    dir.x,
    _tracerOrientK.x,
    0,
    _tracerOrientI.y,
    dir.y,
    _tracerOrientK.y,
    0,
    _tracerOrientI.z,
    dir.z,
    _tracerOrientK.z,
    0,
    0,
    0,
    0,
    1,
  );
  out.setFromRotationMatrix(_tracerOrientMat);
}

/** Binary search for the keyframe at or before the given time. */
function getKeyframeAtTime(
  keyframes: DemoKeyframe[],
  time: number,
): DemoKeyframe | null {
  if (keyframes.length === 0) return null;
  if (time <= keyframes[0].time) return keyframes[0];
  if (time >= keyframes[keyframes.length - 1].time)
    return keyframes[keyframes.length - 1];

  let lo = 0;
  let hi = keyframes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return keyframes[lo];
}

/**
 * Clone a shape scene, apply the "Root" idle animation at t=0, and return the
 * world-space transform of the named node. This evaluates the skeleton at its
 * idle pose rather than using the collapsed bind pose.
 */
function getPosedNodeTransform(
  scene: Group,
  animations: AnimationClip[],
  nodeName: string,
): { position: Vector3; quaternion: Quaternion } | null {
  const clone = scene.clone(true);

  const rootClip = animations.find((a) => a.name === "Root");
  if (rootClip) {
    const mixer = new AnimationMixer(clone);
    mixer.clipAction(rootClip).play();
    mixer.setTime(0);
  }

  clone.updateMatrixWorld(true);

  let position: Vector3 | null = null;
  let quaternion: Quaternion | null = null;
  clone.traverse((n) => {
    if (!position && n.name === nodeName) {
      position = new Vector3();
      quaternion = new Quaternion();
      n.getWorldPosition(position);
      n.getWorldQuaternion(quaternion);
    }
  });

  if (!position || !quaternion) return null;
  return { position, quaternion };
}

/** Binary search for the active CameraModeFrame at a given time. */
function getCameraModeAtTime(
  frames: CameraModeFrame[],
  time: number,
): CameraModeFrame | null {
  if (frames.length === 0) return null;
  if (time < frames[0].time) return null;
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1];

  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return frames[lo];
}

function applyEntityLifetimeVisibility(
  root: Group,
  lifetimes: Map<string, { spawn: number; despawn?: number }>,
  time: number,
): void {
  for (const child of root.children) {
    const lifetime = lifetimes.get(child.name);
    if (!lifetime) continue;
    child.visible =
      time >= lifetime.spawn &&
      (lifetime.despawn == null || time < lifetime.despawn);
  }
}

/**
 * Smooth vertex normals across co-located split vertices (same position, different
 * UVs). Matches the technique used by ShapeModel for consistent lighting.
 */
function smoothVertexNormals(geometry: BufferGeometry): void {
  geometry.computeVertexNormals();

  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  if (!posAttr || !normAttr) return;

  const positions = posAttr.array as Float32Array;
  const normals = normAttr.array as Float32Array;

  // Build map of position -> vertex indices at that position.
  const positionMap = new Map<string, number[]>();
  for (let i = 0; i < posAttr.count; i++) {
    const key = `${positions[i * 3].toFixed(4)},${positions[i * 3 + 1].toFixed(4)},${positions[i * 3 + 2].toFixed(4)}`;
    if (!positionMap.has(key)) {
      positionMap.set(key, []);
    }
    positionMap.get(key)!.push(i);
  }

  // Average normals for vertices at the same position.
  for (const indices of positionMap.values()) {
    if (indices.length > 1) {
      let nx = 0,
        ny = 0,
        nz = 0;
      for (const idx of indices) {
        nx += normals[idx * 3];
        ny += normals[idx * 3 + 1];
        nz += normals[idx * 3 + 2];
      }
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      for (const idx of indices) {
        normals[idx * 3] = nx;
        normals[idx * 3 + 1] = ny;
        normals[idx * 3 + 2] = nz;
      }
    }
  }
  normAttr.needsUpdate = true;
}

const _textureLoader = new TextureLoader();

/**
 * Replace a PBR MeshStandardMaterial with a diffuse-only Lambert/Basic material
 * matching the Tribes 2 material pipeline. Textures are loaded asynchronously
 * from URLs (GLB files don't embed texture data; they store a resource_path in
 * material userData instead).
 */
function replaceWithShapeMaterial(mat: MeshStandardMaterial, vis: number) {
  const resourcePath: string | undefined = mat.userData?.resource_path;
  const flagNames = new Set<string>(mat.userData?.flag_names ?? []);

  if (!resourcePath) {
    // No texture path — plain Lambert fallback with fog/lighting shaders.
    const fallback = new MeshLambertMaterial({
      color: mat.color,
      side: 2, // DoubleSide
      reflectivity: 0,
    });
    applyShapeShaderModifications(fallback);
    return fallback;
  }

  // Load texture asynchronously via Three.js TextureLoader. The returned
  // Texture is empty initially and gets populated when the image arrives;
  // Three.js re-renders automatically once loaded.
  const url = textureToUrl(resourcePath);
  const texture = _textureLoader.load(url);
  setupTexture(texture);

  const result = createMaterialFromFlags(mat, texture, flagNames, false, vis);
  // createMaterialFromFlags may return a [back, front] pair for translucent
  // materials. Use the front material since we can't split meshes imperatively.
  if (Array.isArray(result)) {
    return result[1];
  }
  return result;
}

/**
 * Post-process a cloned shape scene: hide collision/hull geometry, smooth
 * normals, and replace PBR materials with diffuse-only Lambert materials.
 */
function processShapeScene(scene: Object3D): void {
  // Find skeleton for hull bone filtering.
  let skeleton: any = null;
  scene.traverse((n: any) => {
    if (!skeleton && n.skeleton) skeleton = n.skeleton;
  });
  const hullBoneIndices = skeleton
    ? getHullBoneIndices(skeleton)
    : new Set<number>();

  scene.traverse((node: any) => {
    if (!node.isMesh) return;

    // Hide unwanted nodes: hull geometry, unassigned materials, invisible objects.
    if (
      node.name.match(/^Hulk/i) ||
      node.material?.name === "Unassigned" ||
      (node.userData?.vis ?? 1) < 0.01
    ) {
      node.visible = false;
      return;
    }

    // Filter hull-influenced triangles and smooth normals.
    if (node.geometry) {
      let geometry = filterGeometryByVertexGroups(
        node.geometry,
        hullBoneIndices,
      );
      geometry = geometry.clone();
      smoothVertexNormals(geometry);
      node.geometry = geometry;
    }

    // Replace PBR materials with diffuse-only Lambert materials.
    const vis: number = node.userData?.vis ?? 1;
    if (Array.isArray(node.material)) {
      node.material = node.material.map((m: MeshStandardMaterial) =>
        replaceWithShapeMaterial(m, vis),
      );
    } else if (node.material) {
      node.material = replaceWithShapeMaterial(node.material, vis);
    }
  });
}

function collectSceneObjectCounts(scene: Object3D): {
  sceneObjects: number;
  visibleSceneObjects: number;
} {
  let sceneObjects = 0;
  let visibleSceneObjects = 0;
  scene.traverse((node) => {
    sceneObjects += 1;
    if (node.visible) {
      visibleSceneObjects += 1;
    }
  });
  return { sceneObjects, visibleSceneObjects };
}

function DemoPlaybackDiagnostics({ recording }: { recording: DemoRecording }) {
  const { gl, scene } = useThree();
  const engineStore = useEngineStoreApi();
  const previousSampleRef = useRef<{
    geometries: number;
    textures: number;
    programs: number;
    sceneObjects: number;
    visibleSceneObjects: number;
  } | null>(null);
  const lastSpikeEventMsRef = useRef(0);

  useEffect(() => {
    engineStore.getState().recordPlaybackDiagnosticEvent({
      kind: "recording.loaded",
      meta: {
        missionName: recording.missionName ?? null,
        gameType: recording.gameType ?? null,
        isMetadataOnly: !!recording.isMetadataOnly,
        isPartial: !!recording.isPartial,
        hasStreamingPlayback: !!recording.streamingPlayback,
        durationSec: Number(recording.duration.toFixed(3)),
      },
    });
  }, [engineStore]);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const getIsContextLost = () => {
      try {
        const context = gl.getContext();
        if (
          context &&
          typeof (context as { isContextLost?: () => boolean }).isContextLost ===
            "function"
        ) {
          return !!(
            context as {
              isContextLost: () => boolean;
            }
          ).isContextLost();
        }
      } catch {
        // no-op
      }
      return undefined;
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      const store = engineStore.getState();
      store.setWebglContextLost(true);
      store.recordPlaybackDiagnosticEvent({
        kind: "webgl.context.lost",
        message: "Renderer emitted webglcontextlost",
        meta: {
          contextLost: getIsContextLost(),
        },
      });
      console.error("[demo diagnostics] WebGL context lost");
    };

    const handleContextRestored = () => {
      const store = engineStore.getState();
      store.setWebglContextLost(false);
      store.recordPlaybackDiagnosticEvent({
        kind: "webgl.context.restored",
        message: "Renderer emitted webglcontextrestored",
        meta: {
          contextLost: getIsContextLost(),
        },
      });
      console.warn("[demo diagnostics] WebGL context restored");
    };

    const handleContextCreationError = (event: Event) => {
      const contextEvent = event as Event & { statusMessage?: string };
      engineStore.getState().recordPlaybackDiagnosticEvent({
        kind: "webgl.context.creation_error",
        message: contextEvent.statusMessage ?? "Context creation error",
        meta: {
          contextLost: getIsContextLost(),
        },
      });
      console.error(
        "[demo diagnostics] WebGL context creation error",
        contextEvent.statusMessage ?? "",
      );
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
    canvas.addEventListener(
      "webglcontextcreationerror",
      handleContextCreationError,
      false,
    );

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      canvas.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
        false,
      );
      canvas.removeEventListener(
        "webglcontextcreationerror",
        handleContextCreationError,
        false,
      );
    };
  }, [engineStore, gl]);

  useEffect(() => {
    const collectSample = () => {
      const { sceneObjects, visibleSceneObjects } = collectSceneObjectCounts(scene);
      const programs = Array.isArray((gl.info as any).programs)
        ? (gl.info as any).programs.length
        : 0;
      const perfMemory = (performance as any).memory as
        | {
            usedJSHeapSize?: number;
            totalJSHeapSize?: number;
            jsHeapSizeLimit?: number;
          }
        | undefined;
      const nextSample = {
        t: Date.now(),
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs,
        renderCalls: gl.info.render.calls,
        renderTriangles: gl.info.render.triangles,
        renderPoints: gl.info.render.points,
        renderLines: gl.info.render.lines,
        sceneObjects,
        visibleSceneObjects,
        jsHeapUsed: perfMemory?.usedJSHeapSize,
        jsHeapTotal: perfMemory?.totalJSHeapSize,
        jsHeapLimit: perfMemory?.jsHeapSizeLimit,
      };
      engineStore.getState().appendRendererSample(nextSample);

      const previous = previousSampleRef.current;
      previousSampleRef.current = {
        geometries: nextSample.geometries,
        textures: nextSample.textures,
        programs: nextSample.programs,
        sceneObjects: nextSample.sceneObjects,
        visibleSceneObjects: nextSample.visibleSceneObjects,
      };
      if (!previous) {
        return;
      }

      const now = nextSample.t;
      const geometryDelta = nextSample.geometries - previous.geometries;
      const textureDelta = nextSample.textures - previous.textures;
      const programDelta = nextSample.programs - previous.programs;
      const sceneObjectDelta = nextSample.sceneObjects - previous.sceneObjects;

      if (
        now - lastSpikeEventMsRef.current >= 5000 &&
        (geometryDelta >= 200 ||
          textureDelta >= 100 ||
          programDelta >= 20 ||
          sceneObjectDelta >= 400)
      ) {
        lastSpikeEventMsRef.current = now;
        engineStore.getState().recordPlaybackDiagnosticEvent({
          kind: "renderer.resource.spike",
          message: "Detected large one-second renderer resource increase",
          meta: {
            geometryDelta,
            textureDelta,
            programDelta,
            sceneObjectDelta,
            geometries: nextSample.geometries,
            textures: nextSample.textures,
            programs: nextSample.programs,
            sceneObjects: nextSample.sceneObjects,
          },
        });
      }
    };

    collectSample();
    const intervalId = window.setInterval(collectSample, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [engineStore, gl, scene]);

  return null;
}

export function DemoPlayback() {
  const engineStore = useEngineStoreApi();
  const recording = useDemoRecording();
  const instanceIdRef = useRef<string | null>(null);
  if (!instanceIdRef.current) {
    instanceIdRef.current = nextLifecycleInstanceId("DemoPlayback");
  }

  useEffect(() => {
    demoPlaybackMountCount += 1;
    const mountedAt = Date.now();
    engineStore.getState().recordPlaybackDiagnosticEvent({
      kind: "component.lifecycle",
      message: "DemoPlayback mounted",
      meta: {
        component: "DemoPlayback",
        phase: "mount",
        instanceId: instanceIdRef.current,
        mountCount: demoPlaybackMountCount,
        unmountCount: demoPlaybackUnmountCount,
        recordingMissionName: recording?.missionName ?? null,
        recordingDurationSec: recording
          ? Number(recording.duration.toFixed(3))
          : null,
        ts: mountedAt,
      },
    });
    console.info("[demo diagnostics] DemoPlayback mounted", {
      instanceId: instanceIdRef.current,
      mountCount: demoPlaybackMountCount,
      unmountCount: demoPlaybackUnmountCount,
      recordingMissionName: recording?.missionName ?? null,
      mountedAt,
    });

    return () => {
      demoPlaybackUnmountCount += 1;
      const unmountedAt = Date.now();
      engineStore.getState().recordPlaybackDiagnosticEvent({
        kind: "component.lifecycle",
        message: "DemoPlayback unmounted",
        meta: {
          component: "DemoPlayback",
          phase: "unmount",
          instanceId: instanceIdRef.current,
          mountCount: demoPlaybackMountCount,
          unmountCount: demoPlaybackUnmountCount,
          recordingMissionName: recording?.missionName ?? null,
          ts: unmountedAt,
        },
      });
      console.info("[demo diagnostics] DemoPlayback unmounted", {
        instanceId: instanceIdRef.current,
        mountCount: demoPlaybackMountCount,
        unmountCount: demoPlaybackUnmountCount,
        recordingMissionName: recording?.missionName ?? null,
        unmountedAt,
      });
    };
  }, [engineStore]);

  if (!recording) return null;
  return (
    <>
      <DemoPlaybackDiagnostics recording={recording} />
      {recording.isMetadataOnly || recording.isPartial ? (
        <StreamingDemoPlayback recording={recording} />
      ) : (
        <FullDemoPlayback recording={recording} />
      )}
    </>
  );
}

/**
 * R3F component that plays back a fully prebuilt recording using
 * Three.js AnimationMixer clips.
 */
function FullDemoPlayback({ recording }: { recording: DemoRecording }) {
  const engineStore = useEngineStoreApi();
  const rootRef = useRef<Group>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const timeRef = useRef(0);
  const eyeOffsetRef = useRef(new Vector3(0, DEFAULT_EYE_HEIGHT, 0));

  // Identify the camera entity and non-camera entities.
  const { cameraEntity, otherEntities } = useMemo(() => {
    if (!recording) return { cameraEntity: null, otherEntities: [] };
    const cam = recording.entities.find((e) => e.type === "Camera") ?? null;
    const others = recording.entities.filter((e) => e.type !== "Camera");
    return { cameraEntity: cam, otherEntities: others };
  }, [recording]);

  // Create clips for non-camera entities.
  const entityClips = useMemo(() => {
    const map = new Map<string, AnimationClip>();
    for (const entity of otherEntities) {
      map.set(String(entity.id), createEntityClip(entity));
    }
    return map;
  }, [otherEntities]);

  // Build a lookup of spawn/despawn windows for visibility toggling.
  const entityLifetimes = useMemo(() => {
    const map = new Map<string, { spawn: number; despawn?: number }>();
    for (const entity of otherEntities) {
      map.set(String(entity.id), {
        spawn: entity.spawnTime ?? 0,
        despawn: entity.despawnTime,
      });
    }
    return map;
  }, [otherEntities]);

  // Resolve the first-person player's shape name so we can extract the
  // eye offset from its Eye node at render time.
  const firstPersonShape = useMemo(() => {
    if (!recording) return null;
    const entityShapes = new Map<string, string>();
    for (const e of otherEntities) {
      if (e.dataBlock) entityShapes.set(String(e.id), e.dataBlock);
    }
    for (const frame of recording.cameraModes) {
      if (frame.mode === "first-person" && frame.controlEntityId) {
        return entityShapes.get(frame.controlEntityId) ?? null;
      }
    }
    return null;
  }, [recording, otherEntities]);

  // Set up the mixer and actions when recording/clips change.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || entityClips.size === 0) {
      mixerRef.current = null;
      return;
    }

    const mixer = new AnimationMixer(root);
    mixerRef.current = mixer;

    for (const [, clip] of entityClips) {
      const action = mixer.clipAction(clip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }

    // Evaluate time 0 so entities show their initial keyframe positions
    // even before playback starts.
    mixer.setTime(0);

    // Start paused — useFrame will unpause based on playback state.
    mixer.timeScale = 0;

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [entityClips]);

  // Keep local playback cursor aligned with store-driven seeks/resets.
  useEffect(() => {
    const playback = engineStore.getState().playback;
    timeRef.current = playback.timeMs / 1000;
    if (mixerRef.current) {
      mixerRef.current.setTime(timeRef.current);
    }
  }, [engineStore]);

  // Drive playback each frame.
  useFrame((state, delta) => {
    const sceneCamera = state.camera;
    const storeState = engineStore.getState();
    const playback = storeState.playback;
    const mixer = mixerRef.current;
    const status = playback.status;
    const speed = playback.rate;
    const requestedTimeSec = playback.timeMs / 1000;

    // Handle external seeks (scrubber/programmatic updates).
    if (Math.abs(requestedTimeSec - timeRef.current) > 0.0005) {
      timeRef.current = requestedTimeSec;
      if (mixer) {
        mixer.setTime(requestedTimeSec);
      }
    }

    // Advance time if playing.
    if (status === "playing" && recording) {
      const advance = delta * speed;
      timeRef.current += advance;

      // Clamp to duration; stop at end.
      if (timeRef.current >= recording.duration) {
        timeRef.current = recording.duration;
        storeState.setPlaybackStatus("paused");
      }

      if (mixer) {
        mixer.timeScale = 1;
        mixer.update(advance);
      }
    } else if (mixer) {
      mixer.timeScale = 0;
    }

    // Interpolate camera.
    if (cameraEntity && cameraEntity.keyframes.length > 0) {
      const fov = interpolateCameraAtTime(
        cameraEntity,
        timeRef.current,
        sceneCamera.position,
        sceneCamera.quaternion,
      );
      if (
        typeof fov === "number" &&
        Number.isFinite(fov) &&
        "isPerspectiveCamera" in sceneCamera &&
        (sceneCamera as any).isPerspectiveCamera
      ) {
        const perspectiveCamera = sceneCamera as any;
        const verticalFov = torqueHorizontalFovToThreeVerticalFov(
          fov,
          perspectiveCamera.aspect,
        );
        if (Math.abs(perspectiveCamera.fov - verticalFov) > 0.01) {
          perspectiveCamera.fov = verticalFov;
          perspectiveCamera.updateProjectionMatrix();
        }
      }
    }

    // Determine current camera mode.
    const frame = recording
      ? getCameraModeAtTime(recording.cameraModes, timeRef.current)
      : null;

    // In first-person mode, the camera keyframes store the player's foot
    // position. Offset up to eye level using the Eye node from the player's
    // loaded shape (or the default fallback), matching Player::getEyeTransform()
    // which multiplies the eye node position by the entity transform (body yaw).
    if (frame?.mode === "first-person" && rootRef.current) {
      const playerGroup = rootRef.current.children.find(
        (c) => c.name === frame.controlEntityId,
      );
      if (playerGroup) {
        _tmpVec
          .copy(eyeOffsetRef.current)
          .applyQuaternion(playerGroup.quaternion);
        sceneCamera.position.add(_tmpVec);
      } else {
        sceneCamera.position.y += eyeOffsetRef.current.y;
      }
    }

    // Toggle entity visibility based on lifecycle windows.
    if (rootRef.current && entityLifetimes.size > 0) {
      applyEntityLifetimeVisibility(
        rootRef.current,
        entityLifetimes,
        timeRef.current,
      );
    }

    // Keep the store cursor synced with the animation clock.
    const timeMs = timeRef.current * 1000;
    if (Math.abs(timeMs - playback.timeMs) > 0.5) {
      storeState.setPlaybackTime(timeMs);
    }
  });

  return (
    <TickProvider>
      <group ref={rootRef}>
        {otherEntities.map((entity) => (
          <DemoEntityGroup key={entity.id} entity={entity} timeRef={timeRef} />
        ))}
      </group>
      {firstPersonShape && (
        <Suspense fallback={null}>
          <PlayerEyeOffset
            shapeName={firstPersonShape}
            eyeOffsetRef={eyeOffsetRef}
          />
        </Suspense>
      )}
    </TickProvider>
  );
}

function streamSnapshotSignature(snapshot: DemoStreamSnapshot): string {
  const parts: string[] = [];
  for (const entity of snapshot.entities) {
    const visualPart =
      entity.visual?.kind === "tracer"
        ? `tracer:${entity.visual.texture}:${entity.visual.crossTexture ?? ""}:${entity.visual.tracerLength}:${entity.visual.tracerWidth}:${entity.visual.crossViewAng}:${entity.visual.crossSize}:${entity.visual.renderCross ? 1 : 0}`
        : entity.visual?.kind === "sprite"
          ? `sprite:${entity.visual.texture}:${entity.visual.color.r}:${entity.visual.color.g}:${entity.visual.color.b}:${entity.visual.size}`
          : "";
    parts.push(
      `${entity.id}|${entity.type}|${entity.dataBlock ?? ""}|${entity.weaponShape ?? ""}|${entity.playerName ?? ""}|${entity.className ?? ""}|${entity.ghostIndex ?? ""}|${entity.dataBlockId ?? ""}|${entity.shapeHint ?? ""}|${entity.faceViewer ? "fv" : ""}|${visualPart}`,
    );
  }
  parts.sort();
  return parts.join(";");
}

function buildStreamDemoEntity(
  id: string,
  type: string,
  dataBlock: string | undefined,
  visual: DemoEntity["visual"] | undefined,
  direction: DemoEntity["direction"] | undefined,
  weaponShape: string | undefined,
  playerName: string | undefined,
  className: string | undefined,
  ghostIndex: number | undefined,
  dataBlockId: number | undefined,
  shapeHint: string | undefined,
): DemoEntity {
  return {
    id,
    type,
    dataBlock,
    visual,
    direction,
    weaponShape,
    playerName,
    className,
    ghostIndex,
    dataBlockId,
    shapeHint,
    keyframes: [
      {
        time: 0,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    ],
  };
}

const STREAM_TICK_MS = 32;
const STREAM_TICK_SEC = STREAM_TICK_MS / 1000;
const CAMERA_COLLISION_RADIUS = 0.05;
let demoPlaybackMountCount = 0;
let demoPlaybackUnmountCount = 0;
let streamingDemoPlaybackMountCount = 0;
let streamingDemoPlaybackUnmountCount = 0;
let lifecycleInstanceIdSeed = 0;

function nextLifecycleInstanceId(prefix: string): string {
  lifecycleInstanceIdSeed += 1;
  return `${prefix}-${lifecycleInstanceIdSeed}`;
}

function hasAncestorNamed(object: Object3D | null, name: string): boolean {
  let node: Object3D | null = object;
  while (node) {
    if (node.name === name) return true;
    node = node.parent;
  }
  return false;
}

function StreamingDemoPlayback({ recording }: { recording: DemoRecording }) {
  const engineStore = useEngineStoreApi();
  const instanceIdRef = useRef<string | null>(null);
  if (!instanceIdRef.current) {
    instanceIdRef.current = nextLifecycleInstanceId("StreamingDemoPlayback");
  }
  const rootRef = useRef<Group>(null);
  const timeRef = useRef(0);
  const playbackClockRef = useRef(0);
  const prevTickSnapshotRef = useRef<DemoStreamSnapshot | null>(null);
  const currentTickSnapshotRef = useRef<DemoStreamSnapshot | null>(null);
  const eyeOffsetRef = useRef(new Vector3(0, DEFAULT_EYE_HEIGHT, 0));
  const streamRef = useRef(recording.streamingPlayback ?? null);
  const publishedSnapshotRef = useRef<DemoStreamSnapshot | null>(null);
  const entitySignatureRef = useRef("");
  const entityMapRef = useRef<Map<string, DemoEntity>>(new Map());
  const lastEntityRebuildEventMsRef = useRef(0);
  const exhaustedEventLoggedRef = useRef(false);
  const [entities, setEntities] = useState<DemoEntity[]>([]);
  const [firstPersonShape, setFirstPersonShape] = useState<string | null>(null);

  useEffect(() => {
    streamingDemoPlaybackMountCount += 1;
    const mountedAt = Date.now();
    engineStore.getState().recordPlaybackDiagnosticEvent({
      kind: "component.lifecycle",
      message: "StreamingDemoPlayback mounted",
      meta: {
        component: "StreamingDemoPlayback",
        phase: "mount",
        instanceId: instanceIdRef.current,
        mountCount: streamingDemoPlaybackMountCount,
        unmountCount: streamingDemoPlaybackUnmountCount,
        recordingMissionName: recording.missionName ?? null,
        recordingDurationSec: Number(recording.duration.toFixed(3)),
        ts: mountedAt,
      },
    });
    console.info("[demo diagnostics] StreamingDemoPlayback mounted", {
      instanceId: instanceIdRef.current,
      mountCount: streamingDemoPlaybackMountCount,
      unmountCount: streamingDemoPlaybackUnmountCount,
      recordingMissionName: recording.missionName ?? null,
      mountedAt,
    });

    return () => {
      streamingDemoPlaybackUnmountCount += 1;
      const unmountedAt = Date.now();
      engineStore.getState().recordPlaybackDiagnosticEvent({
        kind: "component.lifecycle",
        message: "StreamingDemoPlayback unmounted",
        meta: {
          component: "StreamingDemoPlayback",
          phase: "unmount",
          instanceId: instanceIdRef.current,
          mountCount: streamingDemoPlaybackMountCount,
          unmountCount: streamingDemoPlaybackUnmountCount,
          recordingMissionName: recording.missionName ?? null,
          ts: unmountedAt,
        },
      });
      console.info("[demo diagnostics] StreamingDemoPlayback unmounted", {
        instanceId: instanceIdRef.current,
        mountCount: streamingDemoPlaybackMountCount,
        unmountCount: streamingDemoPlaybackUnmountCount,
        recordingMissionName: recording.missionName ?? null,
        unmountedAt,
      });
    };
  }, [engineStore]);

  const syncRenderableEntities = useCallback((snapshot: DemoStreamSnapshot) => {
    const previousEntityCount = entityMapRef.current.size;
    const nextSignature = streamSnapshotSignature(snapshot);
    const shouldRebuild = entitySignatureRef.current !== nextSignature;
    const nextMap = new Map<string, DemoEntity>();

    for (const entity of snapshot.entities) {
      let renderEntity = entityMapRef.current.get(entity.id);
      if (
        !renderEntity ||
        renderEntity.type !== entity.type ||
        renderEntity.dataBlock !== entity.dataBlock ||
        renderEntity.weaponShape !== entity.weaponShape ||
        renderEntity.className !== entity.className ||
        renderEntity.ghostIndex !== entity.ghostIndex ||
        renderEntity.dataBlockId !== entity.dataBlockId ||
        renderEntity.shapeHint !== entity.shapeHint
      ) {
        renderEntity = buildStreamDemoEntity(
          entity.id,
          entity.type,
          entity.dataBlock,
          entity.visual,
          entity.direction,
          entity.weaponShape,
          entity.playerName,
          entity.className,
          entity.ghostIndex,
          entity.dataBlockId,
          entity.shapeHint,
        );
      }

      renderEntity.playerName = entity.playerName;
      renderEntity.iffColor = entity.iffColor;
      renderEntity.dataBlock = entity.dataBlock;
      renderEntity.visual = entity.visual;
      renderEntity.direction = entity.direction;
      renderEntity.weaponShape = entity.weaponShape;
      renderEntity.className = entity.className;
      renderEntity.ghostIndex = entity.ghostIndex;
      renderEntity.dataBlockId = entity.dataBlockId;
      renderEntity.shapeHint = entity.shapeHint;

      if (renderEntity.keyframes.length === 0) {
        renderEntity.keyframes.push({
          time: snapshot.timeSec,
          position: entity.position ?? [0, 0, 0],
          rotation: entity.rotation ?? [0, 0, 0, 1],
        });
      }

      const kf = renderEntity.keyframes[0];
      kf.time = snapshot.timeSec;
      if (entity.position) kf.position = entity.position;
      if (entity.rotation) kf.rotation = entity.rotation;
      kf.velocity = entity.velocity;
      kf.health = entity.health;
      kf.energy = entity.energy;

      nextMap.set(entity.id, renderEntity);
    }

    entityMapRef.current = nextMap;
    if (shouldRebuild) {
      entitySignatureRef.current = nextSignature;
      setEntities(Array.from(nextMap.values()));
      const now = Date.now();
      if (now - lastEntityRebuildEventMsRef.current >= 500) {
        lastEntityRebuildEventMsRef.current = now;
        engineStore.getState().recordPlaybackDiagnosticEvent({
          kind: "stream.entities.rebuild",
          message: "Renderable demo entity list was rebuilt",
          meta: {
            previousEntityCount,
            nextEntityCount: nextMap.size,
            snapshotTimeSec: Number(snapshot.timeSec.toFixed(3)),
          },
        });
      }
    }

    let nextFirstPersonShape: string | null = null;
    if (snapshot.camera?.mode === "first-person" && snapshot.camera.controlEntityId) {
      const entity = nextMap.get(snapshot.camera.controlEntityId);
      if (entity?.dataBlock) {
        nextFirstPersonShape = entity.dataBlock;
      }
    }
    setFirstPersonShape((prev) =>
      prev === nextFirstPersonShape ? prev : nextFirstPersonShape,
    );
  }, [engineStore]);

  useEffect(() => {
    streamRef.current = recording.streamingPlayback ?? null;
    entityMapRef.current = new Map();
    entitySignatureRef.current = "";
    publishedSnapshotRef.current = null;
    timeRef.current = 0;
    playbackClockRef.current = 0;
    prevTickSnapshotRef.current = null;
    currentTickSnapshotRef.current = null;
    exhaustedEventLoggedRef.current = false;

    const stream = streamRef.current;
    if (!stream) {
      engineStore.getState().setPlaybackStreamSnapshot(null);
      return;
    }

    stream.reset();
    // Preload weapon effect shapes (explosions) so they're cached before
    // the first projectile detonates — otherwise the GLB fetch latency
    // causes the short-lived explosion entity to expire before it renders.
    for (const shape of stream.getEffectShapes()) {
      useGLTF.preload(shapeToUrl(shape));
    }
    const snapshot = stream.getSnapshot();
    timeRef.current = snapshot.timeSec;
    playbackClockRef.current = snapshot.timeSec;
    prevTickSnapshotRef.current = snapshot;
    currentTickSnapshotRef.current = snapshot;
    syncRenderableEntities(snapshot);
    engineStore.getState().setPlaybackStreamSnapshot(snapshot);
    publishedSnapshotRef.current = snapshot;

    return () => {
      engineStore.getState().setPlaybackStreamSnapshot(null);
    };
  }, [recording, engineStore, syncRenderableEntities]);

  useFrame((state, delta) => {
    const stream = streamRef.current;
    if (!stream) return;

    const storeState = engineStore.getState();
    const playback = storeState.playback;
    const isPlaying = playback.status === "playing";
    const requestedTimeSec = playback.timeMs / 1000;
    const externalSeekWhilePaused =
      !isPlaying && Math.abs(requestedTimeSec - playbackClockRef.current) > 0.0005;
    const externalSeekWhilePlaying =
      isPlaying && Math.abs(requestedTimeSec - timeRef.current) > 0.05;
    const isSeeking = externalSeekWhilePaused || externalSeekWhilePlaying;
    if (isSeeking) {
      // Sync stream cursor to UI/programmatic seek.
      playbackClockRef.current = requestedTimeSec;
    }

    if (isPlaying) {
      playbackClockRef.current += delta * playback.rate;
    }

    const moveTicksNeeded = Math.max(
      1,
      Math.ceil((delta * 1000 * Math.max(playback.rate, 0.01)) / 32) + 2,
    );

    // Torque interpolates backwards from the end of the current 32ms tick.
    // We sample one tick ahead and blend previous->current for smooth render.
    const sampleTimeSec = playbackClockRef.current + STREAM_TICK_SEC;
    // During a seek, process all ticks to the target immediately so the world
    // state is fully reconstructed. The per-frame tick limit only applies
    // during normal playback advancement.
    const snapshot = stream.stepToTime(
      sampleTimeSec,
      isPlaying && !isSeeking ? moveTicksNeeded : Number.POSITIVE_INFINITY,
    );

    const currentTick = currentTickSnapshotRef.current;
    if (
      !currentTick ||
      snapshot.timeSec < currentTick.timeSec ||
      snapshot.timeSec - currentTick.timeSec > STREAM_TICK_SEC * 1.5
    ) {
      prevTickSnapshotRef.current = snapshot;
      currentTickSnapshotRef.current = snapshot;
    } else if (snapshot.timeSec !== currentTick.timeSec) {
      prevTickSnapshotRef.current = currentTick;
      currentTickSnapshotRef.current = snapshot;
    }

    const renderCurrent = currentTickSnapshotRef.current ?? snapshot;
    const renderPrev = prevTickSnapshotRef.current ?? renderCurrent;
    const tickStartTime = renderCurrent.timeSec - STREAM_TICK_SEC;
    const interpT = Math.max(
      0,
      Math.min(1, (playbackClockRef.current - tickStartTime) / STREAM_TICK_SEC),
    );

    timeRef.current = playbackClockRef.current;
    if (snapshot.exhausted && isPlaying) {
      playbackClockRef.current = Math.min(playbackClockRef.current, snapshot.timeSec);
    }
    syncRenderableEntities(renderCurrent);

    const publishedSnapshot = publishedSnapshotRef.current;
    const shouldPublish =
      !publishedSnapshot ||
      renderCurrent.timeSec !== publishedSnapshot.timeSec ||
      renderCurrent.exhausted !== publishedSnapshot.exhausted ||
      renderCurrent.status.health !== publishedSnapshot.status.health ||
      renderCurrent.status.energy !== publishedSnapshot.status.energy ||
      renderCurrent.camera?.mode !== publishedSnapshot.camera?.mode ||
      renderCurrent.camera?.controlEntityId !==
        publishedSnapshot.camera?.controlEntityId ||
      renderCurrent.camera?.orbitTargetId !==
        publishedSnapshot.camera?.orbitTargetId;

    if (shouldPublish) {
      publishedSnapshotRef.current = renderCurrent;
      storeState.setPlaybackStreamSnapshot(renderCurrent);
    }

    const currentCamera = renderCurrent.camera;
    const previousCamera =
      currentCamera &&
      renderPrev.camera &&
      renderPrev.camera.mode === currentCamera.mode &&
      renderPrev.camera.controlEntityId === currentCamera.controlEntityId &&
      renderPrev.camera.orbitTargetId === currentCamera.orbitTargetId
        ? renderPrev.camera
        : null;

    if (currentCamera) {
      if (previousCamera) {
        const px = previousCamera.position[0];
        const py = previousCamera.position[1];
        const pz = previousCamera.position[2];
        const cx = currentCamera.position[0];
        const cy = currentCamera.position[1];
        const cz = currentCamera.position[2];
        const ix = px + (cx - px) * interpT;
        const iy = py + (cy - py) * interpT;
        const iz = pz + (cz - pz) * interpT;
        state.camera.position.set(iy, iz, ix);

        _interpQuatA.set(...previousCamera.rotation);
        _interpQuatB.set(...currentCamera.rotation);
        _interpQuatA.slerp(_interpQuatB, interpT);
        state.camera.quaternion.copy(_interpQuatA);
      } else {
        state.camera.position.set(
          currentCamera.position[1],
          currentCamera.position[2],
          currentCamera.position[0],
        );
        state.camera.quaternion.set(...currentCamera.rotation);
      }

      if (
        Number.isFinite(currentCamera.fov) &&
        "isPerspectiveCamera" in state.camera &&
        (state.camera as any).isPerspectiveCamera
      ) {
        const perspectiveCamera = state.camera as any;
        const fovValue =
          previousCamera && Number.isFinite(previousCamera.fov)
            ? previousCamera.fov + (currentCamera.fov - previousCamera.fov) * interpT
            : currentCamera.fov;
        const verticalFov = torqueHorizontalFovToThreeVerticalFov(
          fovValue,
          perspectiveCamera.aspect,
        );
        if (Math.abs(perspectiveCamera.fov - verticalFov) > 0.01) {
          perspectiveCamera.fov = verticalFov;
          perspectiveCamera.updateProjectionMatrix();
        }
      }
    }

    const currentEntities = new Map(renderCurrent.entities.map((e) => [e.id, e]));
    const previousEntities = new Map(renderPrev.entities.map((e) => [e.id, e]));
    const root = rootRef.current;
    if (root) {
      for (const child of root.children) {
        const entity = currentEntities.get(child.name);
        if (!entity?.position) {
          child.visible = false;
          continue;
        }

        child.visible = true;
        const previousEntity = previousEntities.get(child.name);
        if (previousEntity?.position) {
          const px = previousEntity.position[0];
          const py = previousEntity.position[1];
          const pz = previousEntity.position[2];
          const cx = entity.position[0];
          const cy = entity.position[1];
          const cz = entity.position[2];
          const ix = px + (cx - px) * interpT;
          const iy = py + (cy - py) * interpT;
          const iz = pz + (cz - pz) * interpT;
          child.position.set(iy, iz, ix);
        } else {
          child.position.set(entity.position[1], entity.position[2], entity.position[0]);
        }

        if (entity.faceViewer) {
          child.quaternion.copy(state.camera.quaternion);
        } else if (entity.visual?.kind === "tracer") {
          child.quaternion.identity();
        } else if (entity.rotation) {
          if (previousEntity?.rotation) {
            _interpQuatA.set(...previousEntity.rotation);
            _interpQuatB.set(...entity.rotation);
            _interpQuatA.slerp(_interpQuatB, interpT);
            child.quaternion.copy(_interpQuatA);
          } else {
            child.quaternion.set(...entity.rotation);
          }
        }
      }
    }

    const mode = currentCamera?.mode;
    if (mode === "third-person" && root && currentCamera?.orbitTargetId) {
      const targetGroup = root.children.find(
        (child) => child.name === currentCamera.orbitTargetId,
      );
      if (targetGroup) {
        const orbitEntity = currentEntities.get(currentCamera.orbitTargetId);
        _orbitTarget.copy(targetGroup.position);
        // Torque orbits the target's render world-box center; player positions
        // in our stream are feet-level, so lift to an approximate center.
        if (orbitEntity?.type === "Player") {
          _orbitTarget.y += 1.0;
        }

        let hasDirection = false;
        if (
          typeof currentCamera.yaw === "number" &&
          typeof currentCamera.pitch === "number"
        ) {
          const sx = Math.sin(currentCamera.pitch);
          const cx = Math.cos(currentCamera.pitch);
          const sz = Math.sin(currentCamera.yaw);
          const cz = Math.cos(currentCamera.yaw);
          // Camera::validateEyePoint uses Camera::setPosition's column1 in
          // Torque space as the orbit pull-back direction. Converted to Three,
          // that target->camera vector is (-cx, -sz*sx, -cz*sx).
          _orbitDir.set(-cx, -sz * sx, -cz * sx);
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        }
        if (!hasDirection) {
          _orbitDir.copy(state.camera.position).sub(_orbitTarget);
          hasDirection = _orbitDir.lengthSq() > 1e-8;
        }
        if (hasDirection) {
          _orbitDir.normalize();
          const orbitDistance = Math.max(0.1, currentCamera.orbitDistance ?? 4);
          _orbitCandidate.copy(_orbitTarget).addScaledVector(_orbitDir, orbitDistance);

          // Mirror Camera::validateEyePoint: cast 2.5x desired distance toward
          // the candidate and pull in if an obstacle blocks the orbit.
          _orbitRaycaster.near = 0.001;
          _orbitRaycaster.far = orbitDistance * 2.5;
          _orbitRaycaster.camera = state.camera;
          _orbitRaycaster.set(_orbitTarget, _orbitDir);
          const hits = _orbitRaycaster.intersectObjects(state.scene.children, true);
          for (const hit of hits) {
            if (hit.distance <= 0.0001) continue;
            if (hasAncestorNamed(hit.object, currentCamera.orbitTargetId)) continue;
            if (!hit.face) break;

            _hitNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
            const dot = -_orbitDir.dot(_hitNormal);
            if (dot > 0.01) {
              let colDist = hit.distance - CAMERA_COLLISION_RADIUS / dot;
              if (colDist > orbitDistance) colDist = orbitDistance;
              if (colDist < 0) colDist = 0;
              _orbitCandidate
                .copy(_orbitTarget)
                .addScaledVector(_orbitDir, colDist);
            }
            break;
          }

          state.camera.position.copy(_orbitCandidate);
          state.camera.lookAt(_orbitTarget);
        }
      }
    }

    if (mode === "first-person" && root && currentCamera?.controlEntityId) {
      const playerGroup = root.children.find(
        (child) => child.name === currentCamera.controlEntityId,
      );
      if (playerGroup) {
        _tmpVec.copy(eyeOffsetRef.current).applyQuaternion(playerGroup.quaternion);
        state.camera.position.add(_tmpVec);
      } else {
        state.camera.position.y += eyeOffsetRef.current.y;
      }
    }

    if (isPlaying && snapshot.exhausted) {
      if (!exhaustedEventLoggedRef.current) {
        exhaustedEventLoggedRef.current = true;
        storeState.recordPlaybackDiagnosticEvent({
          kind: "stream.exhausted",
          message: "Streaming playback reached end-of-stream while playing",
          meta: {
            streamTimeSec: Number(snapshot.timeSec.toFixed(3)),
            requestedPlaybackSec: Number(playbackClockRef.current.toFixed(3)),
          },
        });
      }
      storeState.setPlaybackStatus("paused");
    } else if (!snapshot.exhausted) {
      exhaustedEventLoggedRef.current = false;
    }

    const timeMs = playbackClockRef.current * 1000;
    if (Math.abs(timeMs - playback.timeMs) > 0.5) {
      storeState.setPlaybackTime(timeMs);
    }
  });

  return (
    <TickProvider>
      <group ref={rootRef}>
        {entities.map((entity) => (
          <DemoEntityGroup key={entity.id} entity={entity} timeRef={timeRef} />
        ))}
      </group>
      {firstPersonShape && (
        <Suspense fallback={null}>
          <PlayerEyeOffset shapeName={firstPersonShape} eyeOffsetRef={eyeOffsetRef} />
        </Suspense>
      )}
    </TickProvider>
  );
}

/** Max distance at which nameplates are visible. */
const NAMEPLATE_FADE_DISTANCE = 150;

/** Height above the entity origin to place the nameplate (above the player's head). */
const NAMEPLATE_HEIGHT = 2.8;

/**
 * Floating nameplate above a player model showing the entity name and a health
 * bar. Fades out with distance.
 */
function PlayerNameplate({
  entity,
  timeRef,
}: {
  entity: DemoEntity;
  timeRef: MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const groupRef = useRef<Object3D>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  const displayName = useMemo(() => {
    if (entity.playerName) return entity.playerName;
    if (typeof entity.id === "string") {
      return entity.id.replace(/^player_/, "Player ");
    }
    return `Player ${entity.id}`;
  }, [entity.id, entity.playerName]);

  // Check whether this entity has any health data at all.
  const hasHealthData = useMemo(
    () => entity.keyframes.some((kf) => kf.health != null),
    [entity.keyframes],
  );

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    // Compute world-space distance to camera.
    group.getWorldPosition(_tmpVec);
    const distance = camera.position.distanceTo(_tmpVec);
    const shouldBeVisible = distance < NAMEPLATE_FADE_DISTANCE;

    if (isVisible !== shouldBeVisible) {
      setIsVisible(shouldBeVisible);
    }

    if (!shouldBeVisible) return;

    // Update opacity.
    if (containerRef.current) {
      const opacity = Math.max(
        0,
        Math.min(1, 1 - distance / NAMEPLATE_FADE_DISTANCE),
      );
      containerRef.current.style.opacity = opacity.toString();
    }

    // Update health bar fill.
    if (fillRef.current && hasHealthData) {
      const kf = getKeyframeAtTime(entity.keyframes, timeRef.current);
      const health = kf?.health ?? 1;
      fillRef.current.style.width = `${Math.max(0, Math.min(100, health * 100))}%`;
      fillRef.current.style.background = entity.iffColor
        ? `rgb(${entity.iffColor.r}, ${entity.iffColor.g}, ${entity.iffColor.b})`
        : "";
    }
  });

  return (
    <group ref={groupRef}>
      {isVisible && (
        <Html position={[0, NAMEPLATE_HEIGHT, 0]} center>
          <div ref={containerRef} className="PlayerNameplate">
            <div className="PlayerNameplate-name">{displayName}</div>
            {hasHealthData && (
              <div className="PlayerNameplate-healthBar">
                <div ref={fillRef} className="PlayerNameplate-healthFill" />
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function DemoSpriteProjectile({ visual }: { visual: DemoSpriteVisual }) {
  const url = textureToUrl(visual.texture);
  const texture = useTexture(url, (tex) => {
    const t = Array.isArray(tex) ? tex[0] : tex;
    setupEffectTexture(t);
  });
  const map = Array.isArray(texture) ? texture[0] : texture;

  // Convert sRGB datablock color to linear for Three.js material.
  const color = useMemo(
    () =>
      new Color().setRGB(visual.color.r, visual.color.g, visual.color.b, SRGBColorSpace),
    [visual.color.r, visual.color.g, visual.color.b],
  );

  return (
    <sprite scale={[visual.size, visual.size, 1]}>
      <spriteMaterial
        map={map}
        color={color}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

function DemoTracerProjectile({
  entity,
  visual,
}: {
  entity: DemoEntity;
  visual: DemoTracerVisual;
}) {
  const tracerRef = useRef<Mesh>(null);
  const tracerPosRef = useRef<BufferAttribute>(null);
  const crossRef = useRef<Mesh>(null);
  const orientQuatRef = useRef(new Quaternion());
  const tracerUrls = useMemo(
    () => [
      textureToUrl(visual.texture),
      textureToUrl(visual.crossTexture ?? visual.texture),
    ],
    [visual.texture, visual.crossTexture],
  );
  const textures = useTexture(tracerUrls, (loaded) => {
    const list = Array.isArray(loaded) ? loaded : [loaded];
    for (const tex of list) {
      setupEffectTexture(tex);
    }
  });
  const [tracerTexture, crossTexture] = Array.isArray(textures)
    ? textures
    : [textures, textures];

  useFrame(({ camera }) => {
    const tracerMesh = tracerRef.current;
    const posAttr = tracerPosRef.current;
    if (!tracerMesh || !posAttr) return;

    const kf = entity.keyframes[0];
    const pos = kf?.position;
    const direction = entity.direction ?? kf?.velocity;
    if (!pos || !direction) {
      tracerMesh.visible = false;
      if (crossRef.current) crossRef.current.visible = false;
      return;
    }

    torqueVecToThree(direction, _tracerDir);
    if (_tracerDir.lengthSq() < 1e-8) {
      tracerMesh.visible = false;
      if (crossRef.current) crossRef.current.visible = false;
      return;
    }
    _tracerDir.normalize();

    tracerMesh.visible = true;
    torqueVecToThree(pos, _tracerWorldPos);
    _tracerDirFromCam.copy(_tracerWorldPos).sub(camera.position);
    _tracerCross.crossVectors(_tracerDirFromCam, _tracerDir);
    if (_tracerCross.lengthSq() < 1e-8) {
      _tracerCross.crossVectors(_upY, _tracerDir);
      if (_tracerCross.lengthSq() < 1e-8) {
        _tracerCross.set(1, 0, 0);
      }
    }
    _tracerCross.normalize().multiplyScalar(visual.tracerWidth);

    const halfLength = visual.tracerLength * 0.5;
    _tracerStart.copy(_tracerDir).multiplyScalar(-halfLength);
    _tracerEnd.copy(_tracerDir).multiplyScalar(halfLength);

    const posArray = posAttr.array as Float32Array;
    posArray[0] = _tracerStart.x + _tracerCross.x;
    posArray[1] = _tracerStart.y + _tracerCross.y;
    posArray[2] = _tracerStart.z + _tracerCross.z;
    posArray[3] = _tracerStart.x - _tracerCross.x;
    posArray[4] = _tracerStart.y - _tracerCross.y;
    posArray[5] = _tracerStart.z - _tracerCross.z;
    posArray[6] = _tracerEnd.x - _tracerCross.x;
    posArray[7] = _tracerEnd.y - _tracerCross.y;
    posArray[8] = _tracerEnd.z - _tracerCross.z;
    posArray[9] = _tracerEnd.x + _tracerCross.x;
    posArray[10] = _tracerEnd.y + _tracerCross.y;
    posArray[11] = _tracerEnd.z + _tracerCross.z;
    posAttr.needsUpdate = true;

    const crossMesh = crossRef.current;
    if (!crossMesh) return;
    if (!visual.renderCross) {
      crossMesh.visible = false;
      return;
    }

    _tracerDirFromCam.normalize();
    const angle = _tracerDir.dot(_tracerDirFromCam);
    if (angle > -visual.crossViewAng && angle < visual.crossViewAng) {
      crossMesh.visible = false;
      return;
    }

    crossMesh.visible = true;
    setQuaternionFromDir(_tracerDir, orientQuatRef.current);
    crossMesh.quaternion.copy(orientQuatRef.current);
    crossMesh.scale.setScalar(visual.crossSize);
  });

  return (
    <>
      <mesh ref={tracerRef}>
        <bufferGeometry>
          <bufferAttribute
            ref={tracerPosRef}
            attach="attributes-position"
            args={[new Float32Array(12), 3]}
          />
          <bufferAttribute
            attach="attributes-uv"
            args={[
              new Float32Array([
                0, 0, 0, 1, 1, 1, 1, 0,
              ]),
              2,
            ]}
          />
          <bufferAttribute attach="index" args={[new Uint16Array([0, 1, 2, 0, 2, 3]), 1]} />
        </bufferGeometry>
        <meshBasicMaterial
          map={tracerTexture}
          transparent
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {visual.renderCross ? (
        <mesh ref={crossRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array([
                  -0.5, 0, -0.5,
                  0.5, 0, -0.5,
                  0.5, 0, 0.5,
                  -0.5, 0, 0.5,
                ]),
                3,
              ]}
            />
            <bufferAttribute
              attach="attributes-uv"
              args={[
                new Float32Array([
                  0, 0, 0, 1, 1, 1, 1, 0,
                ]),
                2,
              ]}
            />
            <bufferAttribute attach="index" args={[new Uint16Array([0, 1, 2, 0, 2, 3]), 1]} />
          </bufferGeometry>
          <meshBasicMaterial
            map={crossTexture}
            transparent
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </>
  );
}

/**
 * Renders a non-camera demo entity.
 * The group name must match the entity ID so the AnimationMixer can target it.
 * Player entities use DemoPlayerModel for skeletal animation; others use
 * DemoShapeModel.
 */
function DemoMissingShapeLabel({ entity }: { entity: DemoEntity }) {
  const id = String(entity.id);
  const bits: string[] = [];
  bits.push(`${id} (${entity.type})`);
  if (entity.className) bits.push(`class ${entity.className}`);
  if (typeof entity.ghostIndex === "number") bits.push(`ghost ${entity.ghostIndex}`);
  if (typeof entity.dataBlockId === "number") bits.push(`db ${entity.dataBlockId}`);
  bits.push(
    entity.shapeHint
      ? `shapeHint ${entity.shapeHint}`
      : "shapeHint <none resolved>",
  );
  return <FloatingLabel color="#ff6688">{bits.join(" | ")}</FloatingLabel>;
}

function DemoEntityGroup({
  entity,
  timeRef,
}: {
  entity: DemoEntity;
  timeRef: MutableRefObject<number>;
}) {
  const debug = useDebug();
  const debugMode = debug?.debugMode ?? false;
  const name = String(entity.id);

  if (entity.visual?.kind === "tracer") {
    return (
      <group name={name}>
        <group name="model" userData={{ demoVisualKind: "tracer" }}>
          <Suspense fallback={null}>
            <DemoTracerProjectile entity={entity} visual={entity.visual} />
          </Suspense>
          {debugMode ? <DemoMissingShapeLabel entity={entity} /> : null}
        </group>
      </group>
    );
  }

  if (entity.visual?.kind === "sprite") {
    return (
      <group name={name}>
        <group name="model" userData={{ demoVisualKind: "sprite" }}>
          <Suspense fallback={null}>
            <DemoSpriteProjectile visual={entity.visual} />
          </Suspense>
          {debugMode ? <DemoMissingShapeLabel entity={entity} /> : null}
        </group>
      </group>
    );
  }

  if (!entity.dataBlock) {
    return (
      <group name={name}>
        <group name="model">
          <mesh>
            <sphereGeometry args={[0.3, 6, 4]} />
            <meshBasicMaterial color={entityTypeColor(entity.type)} wireframe />
          </mesh>
          {debugMode ? <DemoMissingShapeLabel entity={entity} /> : null}
        </group>
      </group>
    );
  }

  const fallback = (
    <mesh>
      <sphereGeometry args={[0.5, 8, 6]} />
      <meshBasicMaterial color={entityTypeColor(entity.type)} wireframe />
    </mesh>
  );

  // Player entities use skeleton-preserving DemoPlayerModel for animation.
  if (entity.type === "Player") {
    return (
      <group name={name}>
        <group name="model">
          <ShapeErrorBoundary fallback={fallback}>
            <Suspense fallback={fallback}>
              <DemoPlayerModel entity={entity} timeRef={timeRef} />
            </Suspense>
          </ShapeErrorBoundary>
          <PlayerNameplate entity={entity} timeRef={timeRef} />
        </group>
      </group>
    );
  }

  return (
    <group name={name}>
      <group name="model">
        <ShapeErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <DemoShapeModel shapeName={entity.dataBlock} entityId={entity.id} />
          </Suspense>
        </ShapeErrorBoundary>
      </group>
      {entity.weaponShape && (
        <group name="weapon">
          <ShapeErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <DemoWeaponModel
                shapeName={entity.weaponShape}
                playerShapeName={entity.dataBlock}
              />
            </Suspense>
          </ShapeErrorBoundary>
        </group>
      )}
    </group>
  );
}

/**
 * Renders a player model with skeleton-preserving animation.
 *
 * Uses SkeletonUtils.clone to deep-clone the GLTF scene with skeleton bindings
 * intact, then drives a per-entity AnimationMixer to play movement animations
 * (Root, Forward, Back, Side, Fall) selected from the keyframe velocity data.
 * Weapon is attached to the animated Mount0 bone.
 */
function DemoPlayerModel({
  entity,
  timeRef,
}: {
  entity: DemoEntity;
  timeRef: MutableRefObject<number>;
}) {
  const engineStore = useEngineStoreApi();
  const gltf = useStaticShape(entity.dataBlock!);

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

  // Build case-insensitive clip lookup and start with Root animation.
  const animActionsRef = useRef(new Map<string, AnimationAction>());
  const currentAnimRef = useRef({ name: "Root", timeScale: 1 });

  useEffect(() => {
    const actions = new Map<string, AnimationAction>();
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      actions.set(clip.name.toLowerCase(), action);
    }
    animActionsRef.current = actions;

    // Start with Root (idle) animation.
    const rootAction = actions.get("root");
    if (rootAction) {
      rootAction.play();
    }
    currentAnimRef.current = { name: "Root", timeScale: 1 };

    // Force initial pose evaluation.
    mixer.update(0);

    return () => {
      mixer.stopAllAction();
      animActionsRef.current = new Map();
    };
  }, [mixer, gltf.animations]);

  // Per-frame animation selection and mixer update.
  useFrame((_, delta) => {
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const time = timeRef.current;

    // Resolve velocity at current playback time.
    const kf = getKeyframeAtTime(entity.keyframes, time);
    const anim = pickMoveAnimation(kf?.velocity, kf?.rotation ?? [0, 0, 0, 1]);

    // Switch animation if the target changed.
    const prev = currentAnimRef.current;
    if (anim.animation !== prev.name || anim.timeScale !== prev.timeScale) {
      const actions = animActionsRef.current;
      const prevAction = actions.get(prev.name.toLowerCase());
      const nextAction = actions.get(anim.animation.toLowerCase());

      if (nextAction) {
        if (isPlaying && prevAction && prevAction !== nextAction) {
          // Crossfade when playing.
          prevAction.fadeOut(ANIM_TRANSITION_TIME);
          nextAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
        } else {
          // Immediate switch when paused or same clip (direction change).
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
function AnimatedWeaponMount({
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

/** Renders a shape model for a demo entity using the existing shape pipeline. */
function DemoShapeModel({
  shapeName,
  entityId,
}: {
  shapeName: string;
  entityId: number | string;
}) {
  const torqueObject = useMemo<TorqueObject>(
    () => ({
      _class: "player",
      _className: "Player",
      _id: typeof entityId === "number" ? entityId : 0,
    }),
    [entityId],
  );

  return (
    <ShapeInfoProvider
      object={torqueObject}
      shapeName={shapeName}
      type="StaticShape"
    >
      <ShapeRenderer loadingColor="#00ff88" />
    </ShapeInfoProvider>
  );
}

/**
 * Renders a mounted weapon using the Torque engine's mount system.
 *
 * The weapon's `Mountpoint` node is aligned to the player's `Mount0` node
 * (right hand). Both nodes come from the GLB skeleton in its idle ("Root"
 * animation) pose. The mount transform is conjugated by ShapeRenderer's 90° Y
 * rotation: T_mount = R90 * M0 * MP^(-1) * R90^(-1).
 */
function DemoWeaponModel({
  shapeName,
  playerShapeName,
}: {
  shapeName: string;
  playerShapeName: string;
}) {
  const playerGltf = useStaticShape(playerShapeName);
  const weaponGltf = useStaticShape(shapeName);

  const mountTransform = useMemo(() => {
    // Get Mount0 from the player's posed (Root animation) skeleton.
    const m0 = getPosedNodeTransform(
      playerGltf.scene,
      playerGltf.animations,
      "Mount0",
    );
    if (!m0) return { position: undefined, quaternion: undefined };

    // Get Mountpoint from weapon (may not be animated).
    const mp = getPosedNodeTransform(
      weaponGltf.scene,
      weaponGltf.animations,
      "Mountpoint",
    );

    // Compute T_mount = R90 * M0 * MP^(-1) * R90^(-1)
    // This conjugates the GLB-space mount transform by ShapeRenderer's 90° Y
    // rotation so the weapon is correctly oriented in entity space.
    let combinedPos: Vector3;
    let combinedQuat: Quaternion;

    if (mp) {
      // MP^(-1)
      const mpInvQuat = mp.quaternion.clone().invert();
      const mpInvPos = mp.position.clone().negate().applyQuaternion(mpInvQuat);

      // M0 * MP^(-1)
      combinedQuat = m0.quaternion.clone().multiply(mpInvQuat);
      combinedPos = mpInvPos
        .clone()
        .applyQuaternion(m0.quaternion)
        .add(m0.position);
    } else {
      combinedPos = m0.position.clone();
      combinedQuat = m0.quaternion.clone();
    }

    // R90 * combined * R90^(-1)
    const mountPos = combinedPos.applyQuaternion(_r90);
    const mountQuat = _r90.clone().multiply(combinedQuat).multiply(_r90inv);

    return { position: mountPos, quaternion: mountQuat };
  }, [playerGltf, weaponGltf]);

  const torqueObject = useMemo<TorqueObject>(
    () => ({
      _class: "weapon",
      _className: "Weapon",
      _id: 0,
    }),
    [],
  );

  return (
    <ShapeInfoProvider object={torqueObject} shapeName={shapeName} type="Item">
      <group
        position={mountTransform.position}
        quaternion={mountTransform.quaternion}
      >
        <ShapeRenderer loadingColor="#4488ff" />
      </group>
    </ShapeInfoProvider>
  );
}

/**
 * Extracts the eye offset from a player model's Eye bone in the idle ("Root"
 * animation) pose. The Eye node is a child of "Bip01 Head" in the skeleton
 * hierarchy. Its world Y in GLB Y-up space gives the height above the player's
 * feet, which we use as the first-person camera offset.
 */
function PlayerEyeOffset({
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

/** Error boundary that renders a fallback when shape loading fails. */
class ShapeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      "[demo] Shape load failed:",
      error.message,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function entityTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case "player":
      return "#00ff88";
    case "vehicle":
      return "#ff8800";
    case "projectile":
      return "#ff0044";
    case "deployable":
      return "#ffcc00";
    default:
      return "#8888ff";
  }
}

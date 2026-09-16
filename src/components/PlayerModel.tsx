import {
  buildActionAnimMap,
  getPlayerAnimationActions,
  type ActionAnimEntry,
} from "../stream/playerActionMap";
import { shapeThreadTime } from "../stream/shapeThreads";
import {
  applyStreamEntityRotation,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { sameImageMounts } from "../stream/imageMount";
import { observeShapeMeshes } from "../dts/dtsScene";
import {
  Fragment,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal, useFrame } from "@react-three/fiber";
import {
  AdditiveAnimationBlendMode,
  type AnimationMixer,
  FrontSide,
  Group,
  Object3D,
} from "three";
import type { AnimationAction } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  ANIM_TRANSITION_TIME,
  disposeClonedScene,
  getKeyframeAtTime,
  processShapeScene,
} from "../stream/playbackUtils";
import { samplePlayerPose } from "../stream/playerAnimation";
import { stepFlareThread } from "./jetThreads";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { DTSShape } from "../dts/dtsModel";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import {
  createDtsDamageThreads,
  type DtsDamageThreads,
} from "../dts/dtsDamage";
import {
  holdDtsAction,
  createDtsThread,
  scrubDtsThread,
  type DtsThread,
} from "../dts/dtsThread";
import {
  addNodeEmitter,
  removeNodeEmitter,
  type NodeEmitter,
  type NodeEmitterFrame,
} from "./nodeEmitters";
import { useJetSound } from "./useJetSound";
import { findOwnNode, getMountNode } from "../sceneNodes";
import { useDebug } from "./SettingsProvider";
import { readDtsSequences } from "../dts/dtsSequences";
import { useQuery } from "@tanstack/react-query";
import { useStaticShape, MountedShapeContent } from "./GenericShape";
import { textureToUrl } from "../loaders";
import { useAnisotropy } from "./useAnisotropy";
import { DebugShapeBounds } from "./DebugShapeBounds";
import { useEntitySoundSlots } from "./useEntitySoundSlots";
import {
  resolveCloakableFromImageSlot,
  resolveEmapFromDatablock,
} from "./resolveEmap";
import { useFadeAndCloak } from "./shapeFadeCloak";
import { useShapeLighting } from "./useShapeLighting";
import { useShadowCaster } from "./useShadowCaster";
import type { MountedImageRoot } from "./shapeFadeCloak";
import { effectDeltaSec, useEngineStoreApi } from "../state/engineStore";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { CommandCircuitPlayerMarker } from "./CommandCircuitPlayerMarker";
import { PlayerNameplate } from "./PlayerNameplate";
import { streamClock } from "../state/streamPlaybackStore";
import type { PlayerEntity } from "../state/gameEntityTypes";

import { useEyePosition } from "./eyePositions";
import { FramePriority } from "./framePriority";

const SKIN_BASE_URL = "https://assets.tribes2.online/skins/files/";
const SKIN_MANIFEST_URL = "https://assets.tribes2.online/skins/manifest.json";

/** Map shape DTS name to skin texture suffix. */
const SKIN_SUFFIXES: Record<string, string> = {
  "light_male.dts": "lmale",
  "light_female.dts": "lfemale",
  "medium_male.dts": "mmale",
  "medium_female.dts": "mfemale",
  "heavy_male.dts": "hmale",
  "bioderm_light.dts": "lbioderm",
  "bioderm_medium.dts": "mbioderm",
  "bioderm_heavy.dts": "hbioderm",
};

/** Processed custom skin manifest: suffix → Set of available skin names. */
type SkinLookup = Record<string, Set<string>>;

/** Skin manifest query key and fetcher, shared with AppProviders prefetch. */
export const skinManifestQueryKey = ["customSkinManifest"] as const;
export async function fetchSkinManifest(): Promise<SkinLookup> {
  const res = await fetch(SKIN_MANIFEST_URL);
  if (!res.ok) throw new Error(`${res.status}`);
  const raw: { customSkins?: Record<string, string[]> } = await res.json();
  const lookup: SkinLookup = {};
  if (raw.customSkins) {
    for (const [suffix, names] of Object.entries(raw.customSkins)) {
      lookup[suffix] = new Set(names);
    }
  }
  return lookup;
}

function useCustomSkinManifest() {
  return useQuery<SkinLookup>({
    queryKey: skinManifestQueryKey,
    queryFn: fetchSkinManifest,
    staleTime: Infinity,
    retry: 1,
  });
}

/**
 * Debug view of the mixer's live actions (clip, effective weight, time,
 * paused), published on the scene's userData for probes.
 */
function describeMixer(mixer: AnimationMixer): string {
  const actions = (mixer as unknown as { _actions: AnimationAction[] })
    ._actions;
  return actions
    .filter((a) => a.isScheduled())
    .map((a) => {
      const clip = a.getClip();
      const pelvis = clip.tracks.some((t) => /pelvis/i.test(t.name));
      const mode = a.blendMode === AdditiveAnimationBlendMode ? "add" : "";
      return `${clip.name}:w${a.getEffectiveWeight().toFixed(2)}:t${a.time.toFixed(2)}${a.paused ? ":paused" : ""}${mode ? ":" + mode : ""}${pelvis ? ":pelvis" : ""}`;
    })
    .join(" ");
}

/** The nozzle emitters of one player. */
interface JetFlareParts {
  emitters: NodeEmitter[];
}

const NO_JET_FLARE: JetFlareParts = { emitters: [] };

function buildJetFlare(
  scene: Object3D,
  ownerId: string,
  jetEmitterId: number | null,
  frame: NodeEmitterFrame,
): JetFlareParts {
  const emitters: NodeEmitter[] = [];
  if (jetEmitterId != null) {
    // PlayerData resolves "jetNozzle0"/"jetNozzle1" on the player's own
    // shape; the light armours only have the first.
    for (const name of ["jetnozzle0", "jetnozzle1"]) {
      const anchor = findOwnNode(scene, name);
      if (anchor) {
        emitters.push({ dataBlockId: jetEmitterId, anchor, frame, ownerId });
      }
    }
  }
  return { emitters };
}

function buildJetFlareSequence(
  actions: Map<string | number, AnimationAction>,
): DtsThread | null {
  const action = actions.get("jetflare");
  return action ? createDtsThread(action, false) : null;
}

/**
 * Renders a player model with skeleton-preserving animation.
 *
 * Uses SkeletonUtils.clone to clone the native scene with skeleton bindings
 * intact, then drives a per-entity AnimationMixer to play movement animations
 * (Root, Forward, Back, Side, Fall) selected from the keyframe velocity data.
 * Each image attaches to the animated mount selected by its datablock.
 */
export function PlayerModel({
  entity,
  objectMounts,
}: {
  entity: PlayerEntity;
  objectMounts?: Record<number, ReactNode>;
}) {
  const engineStore = useEngineStoreApi();
  const shapeName = entity.shapeName!;
  const gltf = useStaticShape(shapeName);
  const anisotropy = useAnisotropy();
  const controlPlayerGhostId = useStreamSnapshot(
    (snap) => snap?.controlPlayerGhostId,
  );
  // On the command circuit map every player (including the control player)
  // gets a radar-style marker instead of the world-space nameplate.
  const commandCircuitActive = useCommandCircuit((s) => s.active);

  // Resolve skin texture URL: local manifest first, then remote manifest.
  // The manifest is prefetched at app startup (see AppProviders) so it's
  // available synchronously here — no async wait that could be starved
  // by store mutations during streaming playback.
  const { data: skinManifest } = useCustomSkinManifest();

  const skinUrl = useMemo(() => {
    const skin = entity.skinPrefName ?? entity.skinName;
    if (!skin || skin === "base") return undefined;
    const suffix = SKIN_SUFFIXES[shapeName.toLowerCase()];
    if (!suffix) return undefined;

    // 1. Check local manifest (built-in skins like beagle, swolf, baseb).
    try {
      return textureToUrl(`skins/${skin}.${suffix}`, null);
    } catch {
      // Not in local manifest.
    }

    // 2. Check remote manifest (custom skins).
    if (skinManifest?.[suffix]?.has(skin)) {
      return `${SKIN_BASE_URL}${skin}.${suffix}.png`;
    }

    // 3. Not found — no skin override.
    return undefined;
  }, [entity.skinPrefName, entity.skinName, shapeName, skinManifest]);

  // Resolve emap per-datablock (emap is a datablock property, not entity).
  const emap = useMemo(
    () => resolveEmapFromDatablock(entity.dataBlockId, entity.dataBlock),
    [entity.dataBlockId, entity.dataBlock],
  );

  // Clone scene preserving skeleton bindings, create mixer, find mount bones.
  const { clonedScene, mixer, eyeBone } = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as DTSShape;
    processShapeScene(scene, undefined, {
      anisotropy,
      emap: emap,
      skinUrl,
    });

    // Use front-face-only rendering so the camera can see out from inside the
    // model in first-person (backface culling hides interior faces).
    // Disable frustum culling — when portaled into a vehicle mount bone, the
    // bounding sphere is in local space but the world transform comes from the
    // bone chain, causing incorrect culling.
    observeShapeMeshes(scene, (n: any) => {
      if (n.isMesh) {
        n.frustumCulled = false;
        if (n.material) {
          const mats = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of mats) m.side = FrontSide;
        }
      }
    });

    const mix = new DTSAnimationMixer(scene);

    const eye = findOwnNode(scene, "eye");

    return {
      clonedScene: scene,
      mixer: mix,
      eyeBone: eye as Object3D | null,
    };
  }, [gltf.scene, anisotropy, emap, skinUrl]);

  useEffect(() => {
    return () => {
      disposeClonedScene(clonedScene);
      mixer.uncacheRoot(clonedScene);
    };
  }, [clonedScene, mixer]);

  // Build case-insensitive clip lookup with alias support.
  const animActionsRef = useRef(new Map<string | number, AnimationAction>());
  const blendActionsRef = useRef<{
    head: AnimationAction | null;
    headside: AnimationAction | null;
  }>({ head: null, headside: null });
  const activeArmRef = useRef<AnimationAction | null>(null);
  const bodyActionsRef = useRef<AnimationAction[]>([]);
  // Build action index -> animation clip name mapping from TSShapeConstructor.
  const actionAnimMap = useMemo(() => {
    const playback = engineStore.getState().playback;
    const sp = playback.recording?.streamingPlayback;
    const sn = shapeName?.toLowerCase();
    if (!sp || !sn) return new Map<number, ActionAnimEntry>();
    const sequences = sp.getShapeConstructorSequences(sn);
    // Derive prefix: "heavy_male.dts" -> "heavy_male_"
    const stem = sn.replace(/\.dts$/i, "");
    const prefix = stem + "_";
    return buildActionAnimMap(sequences ?? [], prefix, gltf.animations);
  }, [engineStore, shapeName, gltf.animations]);

  // Read cyclicity from the resolved clip, not its action-table alias.
  // Non-cyclic sequences (fall, jet, jump, land) play once and clamp.
  const cyclicSequences = useMemo(
    () => readDtsSequences(gltf.scene, gltf.animations).cyclic,
    [gltf.scene, gltf.animations],
  );

  const entityRef = useRef(entity);
  entityRef.current = entity; // eslint-disable-line react-hooks/refs
  useLayoutEffect(() => {
    const sp = engineStore.getState().playback.recording?.streamingPlayback;
    const db =
      entity.dataBlockId != null
        ? sp?.getDataBlockData(entity.dataBlockId)
        : undefined;
    const box = db?.boxSize as { x: number; y: number; z: number } | undefined;
    return renderShapeRaycast.register(
      entity.id,
      clonedScene,
      "Player",
      () =>
        gameEntityStore.getState().streamEntities.has(entity.id) &&
        (entityRef.current.damageState ?? 0) === 0,
      box,
    );
  }, [entity.id, entity.dataBlockId, clonedScene, engineStore]);
  const damageThreadsRef = useRef<DtsDamageThreads | undefined>(undefined);
  useEffect(() => {
    const damageThreads = createDtsDamageThreads(
      mixer,
      gltf.animations,
      "Player",
    );
    damageThreadsRef.current = damageThreads;
    damageThreads?.update(
      entityRef.current.health,
      entityRef.current.damageState,
    );
    const actions = getPlayerAnimationActions(
      gltf.animations,
      mixer,
      actionAnimMap,
    );
    animActionsRef.current = actions;

    // Start with root (idle) animation.
    const rootAction = actions.get("root");
    if (rootAction) {
      rootAction.play();
    }
    bodyActionsRef.current = rootAction ? [rootAction] : [];

    // Native DTS blend clips already postmultiply the current node pose.
    const blendRefs: typeof blendActionsRef.current = {
      head: null,
      headside: null,
    };
    for (const key of ["head", "headside"] as const) {
      const action = actions.get(key);
      if (!action) continue;
      action.timeScale = 0;
      action.weight = 1;
      action.play();
      blendRefs[key] = action;
    }
    blendActionsRef.current = blendRefs;

    // Player has one arm thread, initially the datablock's "look" action.
    // Other aim clips are activated only when the server selects them.
    const defaultArm = actions.get("look");
    if (defaultArm) {
      holdDtsAction(defaultArm, 0);
      activeArmRef.current = defaultArm;
    }

    // Force initial pose evaluation.
    mixer.update(0);

    return () => {
      damageThreads?.dispose();
      damageThreadsRef.current = undefined;
      mixer.stopAllAction();
      animActionsRef.current = new Map();
      blendActionsRef.current = { head: null, headside: null };
      activeArmRef.current = null;
    };
  }, [mixer, gltf.animations, gltf.scene, actionAnimMap]);

  // StreamEngine replaces the array only when an image's visual identity changes.
  const imagesRef = useRef(entity.imageSlots);
  const [images, setImages] = useState(entity.imageSlots);
  const imageRoots = useRef(new Map<number, Group>());

  // ShapeBase sound slots (weapon switch sounds, etc.) — managed by shared hook.
  useEntitySoundSlots(entityRef, clonedScene);

  // ShapeBase fade (mFadeVal) and cloak (mCloakLevel): the body takes the
  // cloak texture, the mounted weapon/pack/flag only fade (when their
  // image datablock is cloakable) — see shapeFadeCloak.ts.
  useFadeAndCloak(
    clonedScene,
    () => entityRef.current,
    () => {
      const slots = entityRef.current.imageSlots;
      const mounted: MountedImageRoot[] = [];
      for (const [slot, root] of imageRoots.current) {
        mounted.push({
          root,
          cloakable: resolveCloakableFromImageSlot(slots?.[slot]?.dataBlockId),
        });
      }
      return mounted;
    },
  );
  useShapeLighting(clonedScene);
  useShadowCaster(clonedScene, entity.shapeName, () => entityRef.current);

  // Client-side jet effects (Player::updateJet, FUN_005d65e0): the jet
  // sound loops and the jetEmitter runs at the JetNozzle nodes while
  // jetting. PlayerData.Sounds puts the jet sounds first in Tribes 2
  // (index 0 = jetSound, 1 = wetJetSound).
  const { jetSoundId, jetEmitterId } = useMemo(() => {
    const sp = engineStore.getState().playback.recording?.streamingPlayback;
    const db =
      entity.dataBlockId != null
        ? sp?.getDataBlockData(entity.dataBlockId)
        : undefined;
    const sounds = db?.sounds as (number | null)[] | undefined;
    const emitter = db?.jetEmitter;
    return {
      jetSoundId: sounds?.[0] ?? null,
      jetEmitterId: typeof emitter === "number" ? emitter : null,
    };
  }, [engineStore, entity.dataBlockId]);
  const updateJetSound = useJetSound(clonedScene, jetSoundId);
  useEyePosition(entity.id, eyeBone, clonedScene);
  const { debugMode } = useDebug();
  const jetFlareRef = useRef<JetFlareParts>(NO_JET_FLARE);
  // The player's velocity this frame, shared by its nozzle emitters.
  const jetFrameRef = useRef<NodeEmitterFrame>({
    velocity: [0, 0, 0],
    dtScale: 1,
  });
  const jetFlarePosRef = useRef(0);
  const mountYawRef = useRef<Group>(null);
  // The flare thread's outputs, rebuilt when the body's actions are.
  const jetFlareThreadRef = useRef<{
    source: Map<string | number, AnimationAction> | null;
    sequence: DtsThread | null;
  }>({ source: null, sequence: null });
  useEffect(() => {
    const parts = buildJetFlare(
      clonedScene,
      entity.id,
      jetEmitterId,
      jetFrameRef.current,
    );
    jetFlareRef.current = parts;
    return () => {
      for (const emitter of parts.emitters) removeNodeEmitter(emitter);
      jetFlareRef.current = NO_JET_FLARE;
    };
  }, [clonedScene, entity.id, jetEmitterId]);

  // Per-frame animation selection and mixer update.
  useFrame((_, delta) => {
    if (entity.imageSlots !== imagesRef.current) {
      const mountsChanged = !sameImageMounts(
        entity.imageSlots,
        imagesRef.current,
      );
      imagesRef.current = entity.imageSlots;
      if (mountsChanged) setImages(entity.imageSlots);
    }
    const time = streamClock.time;
    const current = streamRenderFrame.current?.get(entity.id);

    // Resolve velocity at current playback time.
    const kf = getKeyframeAtTime(entity.keyframes ?? [], time);
    const isDead = kf?.damageState != null && kf.damageState >= 1;
    // Player::setPosition (FUN_005d97c0): a mounted player's transform is
    // the vehicle's mount node transform × RotZ(its own yaw) — the seat
    // places the body and the ghost's yaw turns it (passengers look
    // around; the server zeroes a pilot's yaw on mount).
    const mounted = entity.mountObjectId != null;
    const mountYaw = mountYawRef.current;
    if (mountYaw) {
      const pose = current ?? kf;
      if (mounted && pose)
        applyStreamEntityRotation(
          mountYaw.quaternion,
          pose,
          streamRenderFrame.previous?.get(entity.id),
          streamRenderFrame.interpT,
        );
      else mountYaw.quaternion.identity();
    }
    const actions = animActionsRef.current;

    const recorded = current?.clientAnimation;
    if (recorded?.move) {
      const poses = samplePlayerPose(
        recorded.move,
        kf ?? {},
        mounted,
        time,
        ANIM_TRANSITION_TIME,
        (index) => index,
        (name) => {
          const action = actions.get(name);
          return (
            action && {
              duration: action.getClip().duration,
              cyclic: cyclicSequences.has(action.getClip().name.toLowerCase()),
            }
          );
        },
      );
      const selected: AnimationAction[] = [];
      for (const pose of poses) {
        const action = actions.get(pose.name);
        if (!action) continue;
        holdDtsAction(action, pose.position);
        action.setEffectiveWeight(pose.weight);
        selected.push(action);
      }
      for (const action of bodyActionsRef.current)
        if (!selected.includes(action)) action.stop();
      bodyActionsRef.current = selected;
    }

    // Switch arm blend animation based on the networked arm action index.
    // The server resolves the weapon datablock's armThread field to an action
    // index and sends it via Player::packUpdate (ActionMask).
    const desiredArm = actions.get(entity.armAction ?? "look");
    if (desiredArm && desiredArm !== activeArmRef.current) {
      activeArmRef.current?.stop();
      activeArmRef.current = desiredArm;
    }

    // Drive the arm and head threads without changing their authored blend mode.
    const { head, headside } = blendActionsRef.current;
    const armAction = activeArmRef.current;
    const blendWeight = isDead ? 0 : 1;

    const prediction = current?.playerDelta;
    const dt = 1 - streamRenderFrame.interpT;
    const lookAngle = prediction?.maxLookAngle || 1;
    const headPitch = prediction
      ? (prediction.head[0] + prediction.headVec[0] * dt) / lookAngle
      : (entity.headPitch ?? 0);
    const headYaw = prediction
      ? (prediction.head[1] + prediction.headVec[1] * dt) / lookAngle
      : (entity.headYaw ?? 0);
    const pitchPos = (headPitch + 1) / 2;
    const yawPos = (headYaw + 1) / 2;

    if (armAction) {
      holdDtsAction(armAction, pitchPos);
      armAction.weight = blendWeight;
    }
    if (head) {
      head.time = pitchPos * head.getClip().duration;
      head.weight = blendWeight;
    }
    if (headside) {
      headside.time = yawPos * headside.getClip().duration;
      headside.weight = blendWeight;
    }

    // Jet flare thread (Player::processTick FUN_005d2d60): the non-cyclic
    // JetFlare sequence runs at time scale +1 while jetting and −1
    // otherwise, so its visibility and mesh frames fade the flare
    // meshes in and back out. The nozzle emitters and jet sound run only
    // while jetting.
    const isJetting = !!entity.jetting && !isDead;
    updateJetSound(isJetting);
    const jetDelta = effectDeltaSec(delta);
    const jetFlare = jetFlareRef.current;
    const flareThread = jetFlareThreadRef.current;
    if (flareThread.source !== actions) {
      flareThread.source = actions;
      flareThread.sequence = buildJetFlareSequence(actions);
    }
    const flare = flareThread.sequence;
    if (flare) {
      const pos =
        recorded?.flare && flare.duration > 0
          ? shapeThreadTime(recorded.flare, time, flare.duration, false) /
            flare.duration
          : stepFlareThread(
              jetFlarePosRef.current,
              isJetting,
              jetDelta,
              flare.duration,
            );
      jetFlarePosRef.current = pos;
      scrubDtsThread(flare, pos);
    }
    const velocity = kf?.velocity;
    if (velocity) {
      const jetVelocity = jetFrameRef.current.velocity;
      jetVelocity[0] = velocity[0];
      jetVelocity[1] = velocity[1];
      jetVelocity[2] = velocity[2];
    }
    for (const emitter of jetFlare.emitters) {
      if (isJetting) addNodeEmitter(emitter);
      else removeNodeEmitter(emitter);
    }

    damageThreadsRef.current?.update(entity.health, entity.damageState);
    // Evaluate the sampled body pose, damage and blends once.
    mixer.update(0);
    if (debugMode) clonedScene.userData.animDebug = describeMixer(mixer);
  }, FramePriority.ShapeAnimation);

  return (
    <>
      {entity.id !== controlPlayerGhostId && (
        <PlayerNameplate entity={entity} />
      )}
      {commandCircuitActive && <CommandCircuitPlayerMarker entity={entity} />}
      <group ref={mountYawRef}>
        <group rotation={[0, SHAPE_MODEL_ROTATION_Y, 0]}>
          <primitive object={clonedScene} />
          <DebugShapeBounds entityId={entity.id} scene={gltf.scene} />
        </group>
      </group>
      {images?.map(
        (image, slot) =>
          image?.shapeName && (
            <Fragment key={`image-${slot}`}>
              {createPortal(
                <Suspense
                  key={`image-${slot}:${image.dataBlockId}:${image.shapeName}`}
                >
                  <MountedShapeContent
                    shapeName={image.shapeName}
                    imageDataBlockId={image.dataBlockId}
                    entityId={entity.id}
                    skinName={image.skinName}
                    mountOffset={image.mountOffset}
                    slot={slot}
                    rootRef={(root) => {
                      if (root) imageRoots.current.set(slot, root);
                      else imageRoots.current.delete(slot);
                    }}
                  />
                </Suspense>,
                getMountNode(clonedScene, image.mountPoint),
              )}
            </Fragment>
          ),
      )}
      {objectMounts &&
        Object.entries(objectMounts).map(([point, content]) => (
          <Fragment key={`object-${point}`}>
            {createPortal(content, getMountNode(clonedScene, Number(point)))}
          </Fragment>
        ))}
    </>
  );
}

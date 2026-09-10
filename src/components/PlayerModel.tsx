import { streamRenderFrame } from "../stream/interpolateEntity";
import { observeShapeMeshes } from "../dts/dtsScene";
import {
  Fragment,
  Suspense,
  useEffect,
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
  LoopOnce,
  LoopRepeat,
  Object3D,
} from "three";
import type { AnimationAction } from "three";
import { AnimationClip } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  ANIM_TRANSITION_TIME,
  disposeClonedScene,
  getKeyframeAtTime,
  processShapeScene,
} from "../stream/playbackUtils";
import {
  actionStartPosition,
  NO_ACTION_ANIM,
  NUM_TABLE_ACTION_ANIMS,
  pickMoveAnimation,
  stepActionAnim,
  type ActionAnimState,
} from "../stream/playerAnimation";
import { stepFlareThread } from "./jetThreads";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import {
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
import { getAliasedActions } from "../torqueScript/shapeConstructor";
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
import {
  effectDeltaSec,
  useEngineStoreApi,
  useEngineSelector,
} from "../state/engineStore";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
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

/** Table action names in engine order (indices 0-7). */
const TABLE_ACTION_NAMES = [
  "root",
  "run",
  "back",
  "side",
  "fall",
  "jet",
  "jump",
  "land",
];

interface ActionAnimEntry {
  /** DTS clip name (lowercase, e.g. "diehead"). */
  clipName: string;
  /** Engine alias (lowercase, e.g. "death1"). */
  alias: string;
}

/**
 * Build the engine's action index -> animation entry mapping from a
 * TSShapeConstructor's sequence entries (e.g. `"heavy_male_root.dsq root"`).
 *
 * The engine builds its action list as:
 * 1. Table actions (0-7): found by searching for aliased names (root, run, etc.)
 * 2. Non-table actions (8+): ALL remaining shape sequences in order.
 *
 * The shape's sequence array contains DTS-embedded sequences (e.g. JetFlare,
 * Damage) BEFORE the TSShapeConstructor-loaded ones. These occupy non-table
 * action slots and shift all TSShapeConstructor non-table indices up.
 */
function buildActionAnimMap(
  sequences: string[],
  shapePrefix: string,
  embeddedNonTableCount: number = 0,
): Map<number, ActionAnimEntry> {
  const result = new Map<number, ActionAnimEntry>();

  // Parse each sequence entry into { clipName, alias }.
  const parsed: Array<{ clipName: string; alias: string }> = [];
  for (const entry of sequences) {
    const spaceIdx = entry.indexOf(" ");
    if (spaceIdx === -1) continue;
    const dsqFile = entry.slice(0, spaceIdx).toLowerCase();
    const alias = entry
      .slice(spaceIdx + 1)
      .trim()
      .toLowerCase();
    if (!alias || !dsqFile.startsWith(shapePrefix) || !dsqFile.endsWith(".dsq"))
      continue;
    const clipName = dsqFile.slice(shapePrefix.length, -4);
    if (clipName) parsed.push({ clipName, alias });
  }

  // Find which parsed entries are table actions (by alias name).
  const tableEntryIndices = new Set<number>();
  for (let i = 0; i < TABLE_ACTION_NAMES.length; i++) {
    const name = TABLE_ACTION_NAMES[i];
    for (let pi = 0; pi < parsed.length; pi++) {
      if (parsed[pi].alias === name) {
        tableEntryIndices.add(pi);
        result.set(i, parsed[pi]);
        break;
      }
    }
  }

  // Non-table actions: remaining entries in TSShapeConstructor order, offset
  // by embedded non-table sequences that precede them in the shape.
  let actionIdx = NUM_TABLE_ACTION_ANIMS + embeddedNonTableCount;
  for (let pi = 0; pi < parsed.length; pi++) {
    if (!tableEntryIndices.has(pi)) {
      result.set(actionIdx, parsed[pi]);
      actionIdx++;
    }
  }

  return result;
}

const TABLE_ACTION_NAME_SET = new Set(TABLE_ACTION_NAMES);

/**
 * Count DTS-embedded sequences that occupy non-table action slots. The engine's
 * shape sequence array starts with embedded sequences (e.g. JetFlare, Damage)
 * before TSShapeConstructor sequences. We detect them by comparing the native DTS sequence table with TSShapeConstructor-derived clip names.
 */
function countEmbeddedNonTableSequences(
  scene: Object3D,
  animations: readonly AnimationClip[],
  tscSequences: string[],
  shapePrefix: string,
): number {
  const dtsNames = readDtsSequences(scene, animations).names;
  if (dtsNames.length === 0) return 0;

  // Build set of clip names derived from TSShapeConstructor DSQ entries.
  const tscClipNames = new Set<string>();
  for (const entry of tscSequences) {
    const spaceIdx = entry.indexOf(" ");
    if (spaceIdx === -1) continue;
    const dsqFile = entry.slice(0, spaceIdx).toLowerCase();
    if (!dsqFile.startsWith(shapePrefix) || !dsqFile.endsWith(".dsq")) continue;
    const clipName = dsqFile.slice(shapePrefix.length, -4);
    if (clipName) tscClipNames.add(clipName);
  }

  // Embedded sequences come first in the DTS. Count leading entries that don't
  // match any TSShapeConstructor clip name, excluding any that are table actions.
  let count = 0;
  for (const name of dtsNames) {
    if (tscClipNames.has(name)) break;
    if (!TABLE_ACTION_NAME_SET.has(name)) count++;
  }
  return count;
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
  actions: Map<string, AnimationAction>,
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
  const shapeAliases = useEngineSelector((state) => {
    const sn = shapeName?.toLowerCase();
    return sn ? state.runtime.sequenceAliases.get(sn) : undefined;
  });
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
    const scene = SkeletonUtils.clone(gltf.scene) as Group;
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
  const animActionsRef = useRef(new Map<string, AnimationAction>());
  const blendActionsRef = useRef<{
    head: AnimationAction | null;
    headside: AnimationAction | null;
  }>({ head: null, headside: null });
  // Arm pose blend actions keyed by animation name (lookde, lookms, looksn).
  const armActionsRef = useRef(new Map<string, AnimationAction>());
  const activeArmRef = useRef<string | null>(null);
  const currentAnimRef = useRef({ name: "root", timeScale: 1 });
  const isDeadRef = useRef(false);
  // Action animation (taunts, celebrations, etc.) tracking.
  const actionAnimRef = useRef<number | undefined>(undefined);
  // The wired action the mixer is playing, if any (see stepActionAnim).
  const actionStateRef = useRef<ActionAnimState>(NO_ACTION_ANIM);

  // Build action index -> animation clip name mapping from TSShapeConstructor.
  const actionAnimMap = useMemo(() => {
    const playback = engineStore.getState().playback;
    const sp = playback.recording?.streamingPlayback;
    const sn = shapeName?.toLowerCase();
    if (!sp || !sn) return new Map<number, ActionAnimEntry>();
    const sequences = sp.getShapeConstructorSequences(sn);
    if (!sequences) return new Map<number, ActionAnimEntry>();
    // Derive prefix: "heavy_male.dts" -> "heavy_male_"
    const stem = sn.replace(/\.dts$/i, "");
    const prefix = stem + "_";
    const embeddedNonTable = countEmbeddedNonTableSequences(
      gltf.scene,
      gltf.animations,
      sequences,
      prefix,
    );
    return buildActionAnimMap(sequences, prefix, embeddedNonTable);
  }, [engineStore, shapeName, gltf.scene]);

  // Build a map of animation alias → cyclic flag from DTS metadata.
  // Non-cyclic sequences (fall, jet, jump, land) play once and clamp.
  const seqCyclicByAlias = useMemo(() => {
    const map = new Map<string, boolean>();
    const table = readDtsSequences(gltf.scene, gltf.animations);
    for (const name of table.names) map.set(name, table.cyclic.has(name));
    if (shapeAliases)
      for (const [alias, clipName] of shapeAliases) {
        if (table.names.includes(clipName))
          map.set(alias, table.cyclic.has(clipName));
      }
    return map;
  }, [gltf.scene, shapeAliases]);

  useEffect(() => {
    const actions = getAliasedActions(gltf.animations, mixer, shapeAliases);
    animActionsRef.current = actions;

    // Start with root (idle) animation.
    const rootAction = actions.get("root");
    if (rootAction) {
      rootAction.play();
    }
    currentAnimRef.current = { name: "root", timeScale: 1 };

    // Set up additive blend animations for aim/head articulation.
    // These clips must be cloned before makeClipAdditive (which mutates in
    // place) since multiple player entities share the same shape cache.

    // Head blend actions.
    const blendRefs: typeof blendActionsRef.current = {
      head: null,
      headside: null,
    };
    for (const { key, names } of [
      { key: "head" as const, names: ["head"] },
      { key: "headside" as const, names: ["headside"] },
    ]) {
      const clip = gltf.animations.find((c) =>
        names.includes(c.name.toLowerCase()),
      );
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.blendMode = AdditiveAnimationBlendMode;
      action.timeScale = 0;
      action.weight = 1;
      action.play();
      blendRefs[key] = action;
    }
    blendActionsRef.current = blendRefs;

    // In Torque, the "root" animation provides arm bone values (R Clavicle,
    // R UpperArm, etc.) that persist even when movement anims play — because
    // movement anims don't animate arm bones. In Three.js, when root fades
    // out, arm bones fall to the rest pose. Fix: extract root's arm-only
    // tracks into a permanent action that always plays at weight=1.
    const rootClip = gltf.animations.find(
      (c) => c.name.toLowerCase() === "root",
    );
    if (rootClip) {
      // Find bones that movement anims DON'T animate — these need root's values.
      const movementBones = new Set<string>();
      for (const clip of gltf.animations) {
        const lower = clip.name.toLowerCase();
        if (["forward", "back", "side", "fall"].includes(lower)) {
          for (const t of clip.tracks) {
            movementBones.add(t.name.slice(0, t.name.lastIndexOf(".")));
          }
        }
      }
      const rootArmTracks = rootClip.tracks.filter((t) => {
        const bone = t.name.slice(0, t.name.lastIndexOf("."));
        return !movementBones.has(bone);
      });
      if (rootArmTracks.length > 0) {
        const rootArmsClip = new AnimationClip(
          "root_arms",
          rootClip.duration,
          rootArmTracks,
        );
        const rootArmsAction = mixer.clipAction(rootArmsClip);
        rootArmsAction.play(); // weight=1, always on
      }
    }

    // Native blend clips postmultiply the current pose. Head/headside
    // are scrubbed separately; the remaining blends supply arm poses.
    const armActions = new Map<string, AnimationAction>();
    for (const name of readDtsSequences(gltf.scene, gltf.animations).blend) {
      if (name === "head" || name === "headside") continue;
      const clip = gltf.animations.find((c) => c.name.toLowerCase() === name);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.blendMode = AdditiveAnimationBlendMode;
      action.timeScale = 0;
      action.weight = 0;
      action.play();
      armActions.set(name, action);
    }
    armActionsRef.current = armActions;

    // Start with default arm pose.
    const defaultArm = armActions.get("lookde");
    if (defaultArm) {
      defaultArm.weight = 1;
      activeArmRef.current = "lookde";
    }

    // Force initial pose evaluation.
    mixer.update(0);

    return () => {
      mixer.stopAllAction();
      animActionsRef.current = new Map();
      blendActionsRef.current = { head: null, headside: null };
      armActionsRef.current = new Map();
      activeArmRef.current = null;
    };
  }, [mixer, gltf.animations, gltf.scene, shapeAliases]);

  // StreamEngine replaces the array only when an image's visual identity changes.
  const imagesRef = useRef(entity.imageSlots);
  const [images, setImages] = useState(entity.imageSlots);
  const imageRoots = useRef(new Map<number, Group>());

  // ShapeBase sound slots (weapon switch sounds, etc.) — managed by shared hook.
  const entityRef = useRef(entity);
  entityRef.current = entity; // eslint-disable-line react-hooks/refs
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
    source: Map<string, AnimationAction> | null;
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
      imagesRef.current = entity.imageSlots;
      setImages(entity.imageSlots);
    }
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const time = streamClock.time;

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
      if (mounted && kf?.rotation) mountYaw.quaternion.fromArray(kf.rotation);
      else mountYaw.quaternion.identity();
    }
    const actions = animActionsRef.current;

    // Alive->Dead transition: play the server-specified death animation.
    if (isDead && !isDeadRef.current) {
      isDeadRef.current = true;

      // The server sends the death animation as an actionAnim index.
      const deathEntry =
        kf.actionAnim != null ? actionAnimMap.get(kf.actionAnim) : undefined;
      if (deathEntry) {
        const deathAction = actions.get(deathEntry.clipName);
        if (deathAction) {
          const prevAction = actions.get(
            currentAnimRef.current.name.toLowerCase(),
          );
          if (prevAction) prevAction.fadeOut(ANIM_TRANSITION_TIME);

          deathAction.setLoop(LoopOnce, 1);
          deathAction.clampWhenFinished = true;
          deathAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
          currentAnimRef.current = { name: deathEntry.clipName, timeScale: 1 };
          actionAnimRef.current = kf.actionAnim;
        }
      }
    }

    // Dead->Alive transition: stop death animation, let movement resume.
    if (!isDead && isDeadRef.current) {
      isDeadRef.current = false;
      actionAnimRef.current = undefined;
      actionStateRef.current = NO_ACTION_ANIM;

      const deathAction = actions.get(
        currentAnimRef.current.name.toLowerCase(),
      );
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

    // Action animation (taunts, cels, the PDA idle). A wired non-table
    // action overrides movement until its clip ends; then the client
    // picks its own movement animation again unless the action holds —
    // the server never sends the table action that ends it.
    // Until the clip actions exist (they are built in an effect after
    // the first frame) nothing can be judged, so leave the state alone.
    let playingActionAnim = false;
    if (!isDeadRef.current && actions.size > 0) {
      const started = actionStateRef.current;
      const startedAction =
        started.index != null
          ? actions.get(actionAnimMap.get(started.index)?.clipName ?? "")
          : undefined;
      // LoopOnce with clampWhenFinished: the mixer pauses the action on
      // its last frame, which is how "finished" reads.
      const clipFinished = !!startedAction && startedAction.paused;
      const wiredEntry =
        kf?.actionAnim != null ? actionAnimMap.get(kf.actionAnim) : undefined;
      const wiredAction = wiredEntry
        ? actions.get(wiredEntry.clipName)
        : undefined;
      const { state, command } = stepActionAnim(
        started,
        kf ?? {},
        clipFinished,
        wiredAction
          ? actionStartPosition(kf ?? {}, time, wiredAction.getClip().duration)
          : 0,
        mounted,
      );
      actionStateRef.current = state;
      if (command.kind === "start") {
        const entry = actionAnimMap.get(command.index);
        const actionAction = entry ? actions.get(entry.clipName) : undefined;
        if (entry && actionAction) {
          const prevAction = actions.get(
            currentAnimRef.current.name.toLowerCase(),
          );
          if (prevAction && prevAction !== actionAction) {
            prevAction.fadeOut(ANIM_TRANSITION_TIME);
          }
          actionAction.setLoop(LoopOnce, 1);
          actionAction.clampWhenFinished = true;
          actionAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
          if (command.position >= 1) {
            // Already on its last frame server-side (a held pose that
            // came into scope late): land there.
            actionAction.time = actionAction.getClip().duration;
            actionAction.paused = true;
          } else if (command.position > 0) {
            actionAction.time =
              command.position * actionAction.getClip().duration;
          }
          currentAnimRef.current = { name: entry.clipName, timeScale: 1 };
        } else {
          // No clip for this index on this shape: nothing to play, and
          // nothing to wait for.
          actionStateRef.current = { ...state, ended: true };
        }
      } else if (command.kind === "revert") {
        const entry = actionAnimMap.get(command.index);
        const actionAction = entry ? actions.get(entry.clipName) : undefined;
        if (actionAction) {
          actionAction.fadeOut(ANIM_TRANSITION_TIME);
          actionAction.setLoop(LoopRepeat, Infinity);
          actionAction.clampWhenFinished = false;
        }
        currentAnimRef.current = { name: "root", timeScale: 1 };
        const rootAction = actions.get("root");
        if (rootAction) rootAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
      }
      playingActionAnim =
        actionStateRef.current.index != null && !actionStateRef.current.ended;
    }

    // Movement animation selection (skip while dead or playing action anim).
    // A mounted player never runs a movement animation: pickActionAnimation
    // swaps any table action for root (HAPC passengers stand at root).
    if (!isDeadRef.current && !playingActionAnim) {
      const anim = mounted
        ? { animation: "root", timeScale: 1 }
        : pickMoveAnimation(
            kf?.velocity,
            kf?.rotation ?? [0, 0, 0, 1],
            entity.falling,
            entity.jetting,
          );

      const prev = currentAnimRef.current;
      if (anim.animation !== prev.name || anim.timeScale !== prev.timeScale) {
        const prevAction = actions.get(prev.name.toLowerCase());
        const nextAction = actions.get(anim.animation.toLowerCase());

        if (nextAction) {
          // Set loop mode from the DTS cyclic flag. Non-cyclic sequences
          // (fall, jet, jump, land) play once and hold their end pose.
          const isCyclic = seqCyclicByAlias.get(anim.animation) ?? true;
          if (isCyclic) {
            nextAction.setLoop(LoopRepeat, Infinity);
            nextAction.clampWhenFinished = false;
          } else {
            nextAction.setLoop(LoopOnce, 1);
            nextAction.clampWhenFinished = true;
          }

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

    // Switch arm blend animation based on the networked arm action index.
    // The server resolves the weapon datablock's armThread field to an action
    // index and sends it via Player::packUpdate (ActionMask).
    const armEntry =
      entity.armAction != null
        ? actionAnimMap.get(entity.armAction)
        : undefined;
    const desiredArm = armEntry?.clipName ?? "lookde";
    if (desiredArm !== activeArmRef.current) {
      const armActions = armActionsRef.current;
      const prev = activeArmRef.current
        ? armActions.get(activeArmRef.current)
        : null;
      const next = armActions.get(desiredArm);
      if (next) {
        if (prev) prev.weight = 0;
        next.weight = isDead ? 0 : 1;
        activeArmRef.current = desiredArm;
      }
    }

    // Drive additive blend animations for aim/head articulation.
    const { head, headside } = blendActionsRef.current;
    const armAction = activeArmRef.current
      ? armActionsRef.current.get(activeArmRef.current)
      : null;
    const blendWeight = isDead ? 0 : 1;

    const prediction = streamRenderFrame.current?.get(entity.id)?.playerDelta;
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
      armAction.time = pitchPos * armAction.getClip().duration;
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
      const pos = stepFlareThread(
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

    // Advance or evaluate the body animation mixer.
    if (isPlaying) {
      mixer.update(delta * playback.rate);
    } else {
      mixer.update(0);
    }
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

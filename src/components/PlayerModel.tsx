import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, useFrame } from "@react-three/fiber";
import {
  AdditiveAnimationBlendMode,
  AnimationMixer,
  AnimationUtils,
  FrontSide,
  Group,
  LoopOnce,
  LoopRepeat,
  Object3D,
  Vector3,
  Box3,
} from "three";
import type { AnimationAction } from "three";
import { AnimationClip } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  ANIM_TRANSITION_TIME,
  buildRestPoseClip,
  disposeClonedScene,
  getKeyframeAtTime,
  getPosedNodeTransform,
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
import {
  readCyclicSequences,
  useImageStateAnimation,
} from "./useImageStateAnimation";
import {
  applyVisAt,
  collectVisNodes,
  prepareVisMaterial,
  type VisNode,
} from "./visSequences";
import { stepFlareThread } from "./jetThreads";
import {
  createJetSequence,
  scrubJetSequence,
  type JetSequence,
} from "./jetSequence";
import {
  addNodeEmitter,
  removeNodeEmitter,
  type NodeEmitter,
  type NodeEmitterFrame,
} from "./nodeEmitters";
import { useJetSound } from "./useJetSound";
import { collectOwnNodes } from "./sceneNodes";
import { useDebug } from "./SettingsProvider";
import { collectMorphClips, isMorphClip } from "./sequenceClips";
import {
  collectIflMeshes,
  loadIflMaterialInstance,
  type IflMaterialInstance,
} from "./iflAtlas";
import { useQuery } from "@tanstack/react-query";
import { getAliasedActions } from "../torqueScript/shapeConstructor";
import {
  useStaticShape,
  ShapePlaceholder,
  MountedShapeContent,
} from "./GenericShape";
import { textureToUrl } from "../loaders";
import { useAnisotropy } from "./useAnisotropy";
import { ShapeErrorBoundary } from "./ShapeErrorBoundary";
import { DebugSuspense } from "./DebugSuspense";
import { useIsDebugTourTarget } from "../state/cameraTourStore";
import { DebugBounds } from "./DebugBounds";
import { useEntitySoundSlots } from "./useEntitySoundSlots";
import {
  resolveCloakableFromImageSlot,
  resolveEmapFromDatablock,
  resolveEmapFromImageSlot,
} from "./resolveEmap";
import { useFadeAndCloak } from "./shapeFadeCloak";
import { useShapeLighting } from "./useShapeLighting";
import { useShadowCaster } from "./useShadowCaster";
import type { MountedImageRoot } from "./shapeFadeCloak";
import { useEngineStoreApi, useEngineSelector } from "../state/engineStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { CommandCircuitPlayerMarker } from "./CommandCircuitPlayerMarker";
import { PlayerNameplate } from "./PlayerNameplate";
import { streamClock } from "../state/streamPlaybackStore";
import type { PlayerEntity } from "../state/gameEntityTypes";

import { playerEyePositions } from "./playerEyePositions";

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

/** Skin manifest query key and fetcher, shared with App.tsx prefetch. */
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
  /** GLB clip name (lowercase, e.g. "diehead"). */
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
 * before TSShapeConstructor sequences. We detect them by comparing the GLB's
 * `dts_sequence_names` metadata with TSShapeConstructor-derived clip names.
 */
function countEmbeddedNonTableSequences(
  scene: Group,
  tscSequences: string[],
  shapePrefix: string,
): number {
  const raw = scene.userData?.dts_sequence_names;
  if (typeof raw !== "string") return 0;
  let dtsNames: string[];
  try {
    dtsNames = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(dtsNames) || dtsNames.length === 0) return 0;

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
    if (tscClipNames.has(name.toLowerCase())) break;
    if (!TABLE_ACTION_NAME_SET.has(name.toLowerCase())) {
      count++;
    }
  }
  return count;
}

/**
 * Renders a player model with skeleton-preserving animation.
 *
 * Uses SkeletonUtils.clone to deep-clone the GLTF scene with skeleton bindings
 * intact, then drives a per-entity AnimationMixer to play movement animations
 * (Root, Forward, Back, Side, Fall) selected from the keyframe velocity data.
 * Weapon is attached to the animated Mount0 bone.
 */
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

/** The JetFlare sequence's vis meshes and the nozzle emitters of one player. */
interface JetFlareParts {
  visNodes: VisNode[];
  emitters: NodeEmitter[];
}

const NO_JET_FLARE: JetFlareParts = { visNodes: [], emitters: [] };

function buildJetFlare(
  scene: Object3D,
  ownerId: string,
  jetEmitterId: number | null,
  frame: NodeEmitterFrame,
): JetFlareParts {
  const visNodes = collectVisNodes(scene).get("jetflare") ?? [];
  for (const node of visNodes) {
    prepareVisMaterial(node);
    applyVisAt(node, 0);
  }
  const emitters: NodeEmitter[] = [];
  if (jetEmitterId != null) {
    // PlayerData resolves "jetNozzle0"/"jetNozzle1" on the player's own
    // shape; the light armours only have the first.
    const nodes = collectOwnNodes(scene);
    for (const name of ["jetnozzle0", "jetnozzle1"]) {
      const anchor = nodes.get(name);
      if (anchor) {
        emitters.push({ dataBlockId: jetEmitterId, anchor, frame, ownerId });
      }
    }
  }
  return { visNodes, emitters };
}

/**
 * The JetFlare thread's outputs: its "{JetFlare}_{Mesh}_frame" morph clips
 * and vis meshes, timed by the clip, or null when the shape has none.
 */
function buildJetFlareSequence(
  actions: Map<string, AnimationAction>,
  visNodes: VisNode[],
): JetSequence | null {
  // Only the morph frames and vis play: the JetFlare node track keys the
  // pelvis at rest, which the engine's higher-priority body threads
  // always override but the mixer would blend in at half weight.
  const flareActions: AnimationAction[] = [];
  const main = actions.get("jetflare");
  for (const [name, action] of actions) {
    if (name.startsWith("jetflare_") && name.endsWith("_frame")) {
      flareActions.push(action);
    }
  }
  const duration = main?.getClip().duration ?? visNodes[0]?.duration ?? 0;
  if (duration <= 0) return null;
  return createJetSequence(flareActions, visNodes, duration);
}

export function PlayerModel({ entity }: { entity: PlayerEntity }) {
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
  // The manifest is prefetched at app startup (see App.tsx) so it's
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
  const {
    clonedScene,
    mixer,
    mount0,
    mount1,
    mount2,
    eyeBone,
    iflInitializers,
  } = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as Group;
    const iflInits = processShapeScene(scene, undefined, {
      anisotropy,
      emap: emap,
      skinUrl,
    });

    // Use front-face-only rendering so the camera can see out from inside the
    // model in first-person (backface culling hides interior faces).
    // Disable frustum culling — when portaled into a vehicle mount bone, the
    // bounding sphere is in local space but the world transform comes from the
    // bone chain, causing incorrect culling.
    scene.traverse((n: any) => {
      if (n.isMesh) {
        n.frustumCulled = false;
        if (n.material) {
          const mats = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of mats) m.side = FrontSide;
        }
      }
    });

    const mix = new AnimationMixer(scene);

    let m0: Object3D | null = null;
    let m1: Object3D | null = null;
    let m2: Object3D | null = null;
    let eye: Object3D | null = null;
    // DTS node lookups are case insensitive.
    const nodes = collectOwnNodes(scene);
    m0 = nodes.get("mount0") ?? null;
    m1 = nodes.get("mount1") ?? null;
    m2 = nodes.get("mount2") ?? null;
    eye = nodes.get("eye") ?? null;

    return {
      clonedScene: scene,
      mixer: mix,
      mount0: m0,
      mount1: m1,
      mount2: m2,
      eyeBone: eye as Object3D | null,
      iflInitializers: iflInits,
    };
  }, [gltf.scene, anisotropy, emap, skinUrl]);

  useEffect(() => {
    return () => {
      playerEyePositions.delete(entity.id);
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
      sequences,
      prefix,
    );
    return buildActionAnimMap(sequences, prefix, embeddedNonTable);
  }, [engineStore, shapeName, gltf.scene]);

  // Build a map of animation alias → cyclic flag from DTS metadata.
  // Non-cyclic sequences (fall, jet, jump, land) play once and clamp.
  const seqCyclicByAlias = useMemo(() => {
    const map = new Map<string, boolean>();
    const rawNames = gltf.scene.userData?.dts_sequence_names;
    const rawCyclic = gltf.scene.userData?.dts_sequence_cyclic;
    if (typeof rawNames === "string" && typeof rawCyclic === "string") {
      try {
        const names: string[] = JSON.parse(rawNames);
        const cyclic: boolean[] = JSON.parse(rawCyclic);
        // Map clip names → cyclic.
        const clipCyclic = new Map<string, boolean>();
        for (let i = 0; i < names.length; i++) {
          clipCyclic.set(names[i].toLowerCase(), cyclic[i] ?? true);
        }
        // Map aliases → cyclic via the alias→clip mapping.
        if (shapeAliases) {
          for (const [alias, clipName] of shapeAliases) {
            const c = clipCyclic.get(clipName);
            if (c != null) map.set(alias, c);
          }
        }
        // Also include raw clip names so lookups by either name work.
        for (const [name, c] of clipCyclic) {
          if (!map.has(name)) map.set(name, c);
        }
      } catch {
        /* ignore */
      }
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
    // place) since multiple player entities share the same GLTF cache.

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
      const cloned = clip.clone();
      const fps = 30;
      const neutralFrame = Math.round((clip.duration * fps) / 2);
      AnimationUtils.makeClipAdditive(cloned, neutralFrame, clip, fps);
      const action = mixer.clipAction(cloned);
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

    // Arm pose blend actions (DTS blend sequences). These are applied
    // additively on top of root's arm base. Subtracting the rest pose via
    // buildRestPoseClip recovers pure deltas from the GLB's rest*delta
    // keyframes. Applied onto root's arm values, this matches Torque's
    // post-multiply behavior.
    //
    // Instead of hardcoding arm pose names, iterate ALL blend sequences
    // from the GLB's dts_sequence_blend metadata (skipping head/headside
    // which are handled separately with their own pitch/yaw scrubbing).
    const armActions = new Map<string, AnimationAction>();
    const rawSeqNames = gltf.scene.userData?.dts_sequence_names;
    const rawSeqBlend = gltf.scene.userData?.dts_sequence_blend;
    if (typeof rawSeqNames === "string" && typeof rawSeqBlend === "string") {
      try {
        const seqNames: string[] = JSON.parse(rawSeqNames);
        const seqBlend: boolean[] = JSON.parse(rawSeqBlend);
        for (let i = 0; i < seqNames.length; i++) {
          if (!seqBlend[i]) continue;
          const name = seqNames[i].toLowerCase();
          // head/headside are blend sequences but driven by headPitch/headYaw,
          // not the arm action index — handled separately above.
          if (name === "head" || name === "headside") continue;
          const clip = gltf.animations.find(
            (c) => c.name.toLowerCase() === name,
          );
          if (!clip) continue;
          const cloned = clip.clone();
          const restClip = buildRestPoseClip(gltf.scene, cloned);
          AnimationUtils.makeClipAdditive(cloned, 0, restClip, 30);
          const action = mixer.clipAction(cloned);
          action.blendMode = AdditiveAnimationBlendMode;
          action.timeScale = 0;
          action.weight = 0;
          action.play();
          armActions.set(name, action);
        }
      } catch {
        /* malformed metadata */
      }
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
  }, [mixer, gltf.animations, shapeAliases]);

  // Initialize IFL materials: load atlas textures and set up onBeforeRender
  // callbacks that animate texture offsets based on the current playback time.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const { mesh, initialize } of iflInitializers) {
      initialize(mesh, () => streamClock.time)
        .then((dispose) => cleanups.push(dispose))
        .catch(() => {});
    }
    return () => cleanups.forEach((fn) => fn());
  }, [iflInitializers]);

  // Track weaponShape changes. The entity is mutated in-place by the
  // streaming layer (no React re-render), so we sync it in useFrame.
  // Derive weapon/pack/flag from imageSlots.
  const getSlotShape = (slot: number) => entity.imageSlots?.[slot]?.shapeName;
  const weaponShapeRef = useRef(getSlotShape(0));
  const [currentWeaponShape, setCurrentWeaponShape] = useState(getSlotShape(0));
  const packShapeRef = useRef(getSlotShape(2));
  const [currentPackShape, setCurrentPackShape] = useState(getSlotShape(2));
  const flagShapeRef = useRef(getSlotShape(3));
  const [currentFlagShape, setCurrentFlagShape] = useState(getSlotShape(3));

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
      for (const [bone, slot] of [
        [mount0, 0],
        [mount1, 2],
        [mount2, 3],
      ] as const) {
        if (bone)
          mounted.push({
            root: bone,
            cloakable: resolveCloakableFromImageSlot(
              slots?.[slot]?.dataBlockId,
            ),
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
    sequence: JetSequence | null;
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
    const curWeapon = getSlotShape(0);
    if (curWeapon !== weaponShapeRef.current) {
      weaponShapeRef.current = curWeapon;
      setCurrentWeaponShape(curWeapon);
    }
    const curPack = getSlotShape(2);
    if (curPack !== packShapeRef.current) {
      packShapeRef.current = curPack;
      setCurrentPackShape(curPack);
    }
    const curFlag = getSlotShape(3);
    if (curFlag !== flagShapeRef.current) {
      flagShapeRef.current = curFlag;
      setCurrentFlagShape(curFlag);
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

    const headPitch = entity.headPitch ?? 0;
    const headYaw = entity.headYaw ?? 0;
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
    // otherwise, so its vis keyframes and morph frames fade the flare
    // meshes in and back out. The nozzle emitters and jet sound run only
    // while jetting.
    const isJetting = !!entity.jetting && !isDead;
    updateJetSound(isJetting);
    const jetDelta = isPlaying ? delta * playback.rate : 0;
    const jetFlare = jetFlareRef.current;
    const flareThread = jetFlareThreadRef.current;
    if (flareThread.source !== actions) {
      flareThread.source = actions;
      flareThread.sequence = buildJetFlareSequence(actions, jetFlare.visNodes);
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
      scrubJetSequence(flare, pos, false);
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

    // Write animated Eye bone position for first-person camera.
    // Torque's Player::getEyeTransform reads the eye node's POSITION
    // from the animated skeleton (rotation is discarded — head rotation
    // is constructed from mHead pitch/yaw instead).
    if (eyeBone) {
      let eyePos = playerEyePositions.get(entity.id);
      if (!eyePos) {
        eyePos = new Vector3();
        playerEyePositions.set(entity.id, eyePos);
      }
      // Get Eye bone position in GLB model-local space.
      eyeBone.getWorldPosition(eyePos);
      clonedScene.worldToLocal(eyePos);
      // Convert GLB (x,y,z) → entity-local Three.js space via R90:
      // same swizzle as PlayerEyeOffset's static extraction.
      const gx = eyePos.x;
      const gy = eyePos.y;
      const gz = eyePos.z;
      eyePos.set(gz, gy, -gx);
    }
  });

  return (
    <>
      {entity.id !== controlPlayerGhostId && (
        <PlayerNameplate entity={entity} />
      )}
      {commandCircuitActive && <CommandCircuitPlayerMarker entity={entity} />}
      <group ref={mountYawRef}>
        <group rotation={[0, Math.PI / 2, 0]}>
          <primitive object={clonedScene} />
          <PlayerDebugBounds entityId={entity.id} scene={gltf.scene} />
        </group>
      </group>
      {currentWeaponShape && mount0 && (
        <ShapeErrorBoundary
          key={currentWeaponShape}
          fallback={<ShapePlaceholder color="red" label={currentWeaponShape} />}
        >
          <DebugSuspense
            name={`Weapon:${entity.id}/${currentWeaponShape}`}
            fallback={
              <ShapePlaceholder color="cyan" label={currentWeaponShape} />
            }
          >
            <MountedImageModel
              entity={entity}
              slot={0}
              shape={currentWeaponShape}
              mount={mount0}
            />
          </DebugSuspense>
        </ShapeErrorBoundary>
      )}
      {currentPackShape && mount1 && (
        <ShapeErrorBoundary
          key={currentPackShape}
          fallback={<ShapePlaceholder color="red" label={currentPackShape} />}
        >
          <DebugSuspense
            name={`Pack:${entity.id}/${currentPackShape}`}
            fallback={
              <ShapePlaceholder color="cyan" label={currentPackShape} />
            }
          >
            <MountedImageModel
              entity={entity}
              slot={2}
              shape={currentPackShape}
              mount={mount1}
            />
          </DebugSuspense>
        </ShapeErrorBoundary>
      )}
      {currentFlagShape &&
        mount2 &&
        createPortal(
          <Suspense key={currentFlagShape}>
            <MountedShapeContent
              shapeName={currentFlagShape}
              imageDataBlockId={entity.imageSlots?.[3]?.dataBlockId}
              entityId={entity.id}
              skinName={entity.imageSlots?.[3]?.skinName}
            />
          </Suspense>,
          mount2,
        )}
    </>
  );
}

function PlayerDebugBounds({
  entityId,
  scene,
}: {
  entityId: string;
  scene: Group;
}) {
  const isTarget = useIsDebugTourTarget(entityId);
  const bounds = useMemo(() => {
    if (!isTarget) return null;
    const box = new Box3().setFromObject(scene);
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    return {
      center: [center.x, center.y, center.z] as [number, number, number],
      size: [size.x, size.y, size.z] as [number, number, number],
    };
  }, [isTarget, scene]);
  if (!bounds) return null;
  return (
    <group position={bounds.center}>
      <DebugBounds size={bounds.size} />
    </group>
  );
}

/**
 * Build a DTS sequence-index -> name lookup from GLB metadata.
 * Weapon GLBs include `dts_sequence_names` in scene extras, providing the
 * original DTS sequence ordering that datablock state indices reference.
 */
function buildSeqIndexToName(
  scene: Group,
  animations: AnimationClip[],
): string[] {
  const raw = scene.userData?.dts_sequence_names;
  if (typeof raw === "string") {
    try {
      const names: string[] = JSON.parse(raw);
      return names.map((n) => n.toLowerCase());
    } catch {
      /* fall through */
    }
  }
  return animations.map((a) => a.name.toLowerCase());
}

/**
 * Attaches an animated mounted image (weapon in slot 0, pack in slot 2)
 * to one of the player's mount bones.
 * Drives a weapon-specific AnimationMixer using the WeaponImageStateMachine
 * to play fire, reload, spin, and other weapon animations based on the
 * server-replicated condition flags.
 *
 * Reads the slot's `imageState` and `imageStates` off `entity.imageSlots`
 * inside useFrame, since the slots are mutated per-tick without
 * triggering React re-renders.
 */
function MountedImageModel({
  entity,
  slot,
  shape,
  mount,
}: {
  entity: PlayerEntity;
  slot: number;
  shape: string;
  mount: Object3D;
}) {
  const engineStore = useEngineStoreApi();
  const weaponGltf = useStaticShape(shape);
  const emap = useMemo(
    () => resolveEmapFromImageSlot(entity.imageSlots?.[slot]?.dataBlockId),
    [entity.imageSlots, slot],
  );
  const anisotropy = useAnisotropy();

  // Clone weapon with skeleton bindings, create dedicated mixer.
  const {
    weaponClone,
    weaponMixer,
    seqIndexToName,
    cyclicSequences,
    visNodesBySequence,
    weaponIflMeshes,
  } = useMemo(() => {
    const clone = SkeletonUtils.clone(weaponGltf.scene) as Group;
    // Marks the subtree as a mounted image so effects that redraw the
    // player's own shape (the shocklance zap) can skip it.
    clone.userData.imageMount = true;
    // IFL meshes are collected before the materials are replaced; their
    // frames follow the image's threads (useImageStateAnimation).
    const iflInfos = collectIflMeshes(clone);
    processShapeScene(clone, undefined, {
      anisotropy,
      emap,
    });

    // Compute Mountpoint inverse offset so the weapon's grip aligns to Mount0.
    const mp = getPosedNodeTransform(
      weaponGltf.scene,
      weaponGltf.animations,
      "Mountpoint",
    );
    if (mp) {
      const invQuat = mp.quaternion.clone().invert();
      const invPos = mp.position.clone().negate().applyQuaternion(invQuat);
      clone.position.copy(invPos);
      clone.quaternion.copy(invQuat);
    }

    const visBySeq = collectVisNodes(clone);

    const mix = new AnimationMixer(clone);
    const seq = buildSeqIndexToName(
      weaponGltf.scene as Group,
      weaponGltf.animations,
    );
    return {
      weaponClone: clone,
      weaponMixer: mix,
      seqIndexToName: seq,
      cyclicSequences: readCyclicSequences(
        weaponGltf.scene,
        weaponGltf.animations,
      ),
      visNodesBySequence: visBySeq,
      weaponIflMeshes: iflInfos,
    };
  }, [weaponGltf, anisotropy, emap]);

  useEffect(() => {
    return () => {
      disposeClonedScene(weaponClone);
      weaponMixer.uncacheRoot(weaponClone);
    };
  }, [weaponClone, weaponMixer]);
  useShapeLighting(weaponClone);

  // Build case-insensitive action map for weapon animations.
  const weaponActionsRef = useRef(new Map<string, AnimationAction>());
  const weaponMorphActionsRef = useRef(new Map<string, AnimationAction[]>());
  const spinActionRef = useRef<AnimationAction | null>(null);
  useEffect(() => {
    // Mesh frame clips ("{Sequence}_{Mesh}_frame") ride along with their
    // sequence's clip rather than standing as sequences of their own.
    const morphClips = collectMorphClips(weaponGltf.animations, seqIndexToName);
    const actions = new Map<string, AnimationAction>();
    for (const clip of weaponGltf.animations) {
      if (isMorphClip(clip, morphClips)) continue;
      actions.set(clip.name.toLowerCase(), weaponMixer.clipAction(clip));
    }
    weaponActionsRef.current = actions;
    const morph = new Map<string, AnimationAction[]>();
    for (const [name, clips] of morphClips) {
      morph.set(
        name,
        clips.map((clip) => weaponMixer.clipAction(clip)),
      );
    }
    weaponMorphActionsRef.current = morph;

    // Set up the spin thread: a looping "spin" animation with variable timeScale.
    const spinAction = actions.get("spin");
    if (spinAction) {
      spinAction.setLoop(LoopRepeat, Infinity);
      spinAction.timeScale = 0;
      spinAction.play();
    }
    spinActionRef.current = spinAction ?? null;

    // Force initial pose.
    weaponMixer.update(0);
    return () => {
      weaponMixer.stopAllAction();
      weaponActionsRef.current = new Map();
      weaponMorphActionsRef.current = new Map();
      spinActionRef.current = null;
    };
  }, [weaponMixer, weaponGltf.animations, seqIndexToName]);

  // Load the weapon's IFL atlases; the image threads pick the frames.
  const weaponIflRef = useRef<IflMaterialInstance[]>([]);
  useEffect(() => {
    let disposed = false;
    weaponIflRef.current = [];
    for (const info of weaponIflMeshes) {
      loadIflMaterialInstance(info)
        .then((inst) => {
          if (inst && !disposed) weaponIflRef.current.push(inst);
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      weaponIflRef.current = [];
    };
  }, [weaponIflMeshes]);

  // Imperatively attach/detach the clone to the mount bone.
  useEffect(() => {
    mount.add(weaponClone);
    return () => {
      mount.remove(weaponClone);
    };
  }, [weaponClone, mount]);

  useImageStateAnimation(() => entity.imageSlots?.[slot], {
    actions: weaponActionsRef,
    morphActions: weaponMorphActionsRef,
    setSpinTimeScale: (timeScale) => {
      if (spinActionRef.current) spinActionRef.current.timeScale = timeScale;
    },
    visNodesBySequence,
    imageRoot: weaponClone,
    ownerId: entity.id,
    seqIndexToName,
    cyclicSequences,
    iflInstances: weaponIflRef,
  });

  // Advance the weapon mixer.
  useFrame((_, delta) => {
    const playback = engineStore.getState().playback;
    weaponMixer.update(
      playback.status === "playing" ? delta * playback.rate : 0,
    );
  });

  return null;
}

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
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
  PositionalAudio,
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
import { pickMoveAnimation } from "../stream/playerAnimation";
import { WeaponImageStateMachine } from "../stream/weaponStateMachine";
import { useQuery } from "@tanstack/react-query";
import type { WeaponAnimState } from "../stream/weaponStateMachine";
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
  resolveEmapFromDatablock,
  resolveEmapFromImageSlot,
} from "./resolveEmap";
import { useAudio } from "./AudioContext";
import {
  resolveAudioProfile,
  playOneShotSound,
  createPositionalAudio,
  getCachedAudioBuffer,
  getSoundGeneration,
  stopAndDetachSound,
  trackSound,
  untrackSound,
} from "./AudioEmitter";
import { getEffectiveSoundRate } from "./AudioEmitter";
import type { ResolvedAudioProfile } from "./AudioEmitter";
import { audioToUrl } from "../loaders";
import { useSettings } from "./SettingsProvider";
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

/** Number of table actions in the engine's ActionAnimationList (Tribes2.exe build 25034). */
const NUM_TABLE_ACTION_ANIMS = 8;

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

/** Stop, disconnect, and remove a looping PositionalAudio from its parent. */
function stopLoopingSound(
  soundRef: React.MutableRefObject<PositionalAudio | null>,
  stateRef: React.MutableRefObject<number>,
) {
  const sound = soundRef.current;
  if (!sound) return;
  stopAndDetachSound(sound);
  soundRef.current = null;
  stateRef.current = -1;
}

/**
 * Renders a player model with skeleton-preserving animation.
 *
 * Uses SkeletonUtils.clone to deep-clone the GLTF scene with skeleton bindings
 * intact, then drives a per-entity AnimationMixer to play movement animations
 * (Root, Forward, Back, Side, Fall) selected from the keyframe velocity data.
 * Weapon is attached to the animated Mount0 bone.
 */
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
    scene.traverse((n) => {
      if (!m0 && n.name === "Mount0") m0 = n;
      if (!m1 && n.name === "Mount1") m1 = n;
      if (!m2 && n.name === "Mount2") m2 = n;
      if (!eye && n.name === "Eye") eye = n;
    });

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

  // Jet thrust sound. Played client-side by Player::updateJetEffects via
  // direct alxPlay3d — NOT networked through SoundMask. We derive it from
  // entity.jetting (which comes from move trigger[3] or ghost MoveMask).
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();
  const jetSoundRef = useRef<PositionalAudio | null>(null);
  const jetBufferRef = useRef<AudioBuffer | null>(null);
  const jetProfileRef = useRef<ResolvedAudioProfile | null>(null);

  // Resolve and preload the jet sound from the player's datablock.
  useEffect(() => {
    if (!audioLoader) return;
    const playback = engineStore.getState().playback;
    const sp = playback.recording?.streamingPlayback;
    if (!sp || !entity.dataBlockId) return;
    const getDb = sp.getDataBlockData.bind(sp);
    const playerDb = getDb(entity.dataBlockId);
    // PlayerData.Sounds enum: Tribes 2 reordered the open-source Torque
    // enum to put jet sounds first (index 0 = jetSound, 1 = wetJetSound).
    const sounds = playerDb?.sounds as (number | null)[] | undefined;
    const jetSoundId = sounds?.[0];
    if (jetSoundId == null) return;
    const resolved = resolveAudioProfile(jetSoundId, getDb);
    if (!resolved) return;
    jetProfileRef.current = resolved;
    try {
      const url = audioToUrl(resolved.filename);
      getCachedAudioBuffer(url, audioLoader, (buffer) => {
        jetBufferRef.current = buffer;
      });
    } catch {
      // File not in manifest.
    }
  }, [audioLoader, engineStore, entity.dataBlockId]);

  // Cleanup jet sound on unmount.
  useEffect(() => {
    return () => {
      const sound = jetSoundRef.current;
      if (sound) {
        untrackSound(sound);
        try {
          sound.stop();
        } catch {
          /* already stopped */
        }
        try {
          sound.disconnect();
        } catch {
          /* already disconnected */
        }
        sound.parent?.remove(sound);
        jetSoundRef.current = null;
      }
    };
  }, []);

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

    // Action animation (taunts, celebrations, etc.).
    // Non-table actions (index >= 7) override movement animation.
    const actionAnim = kf?.actionAnim;
    const prevActionAnim = actionAnimRef.current;
    if (!isDeadRef.current && actionAnim !== prevActionAnim) {
      actionAnimRef.current = actionAnim;
      const isNonTableAction =
        actionAnim != null && actionAnim >= NUM_TABLE_ACTION_ANIMS;
      const wasNonTableAction =
        prevActionAnim != null && prevActionAnim >= NUM_TABLE_ACTION_ANIMS;

      if (isNonTableAction) {
        // Start or change action animation.
        const entry = actionAnimMap.get(actionAnim);
        if (entry) {
          const actionAction = actions.get(entry.clipName);
          if (actionAction) {
            const prevAction = actions.get(
              currentAnimRef.current.name.toLowerCase(),
            );
            if (prevAction) prevAction.fadeOut(ANIM_TRANSITION_TIME);
            actionAction.setLoop(LoopOnce, 1);
            actionAction.clampWhenFinished = true;
            actionAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
            currentAnimRef.current = { name: entry.clipName, timeScale: 1 };
          }
        }
      } else if (wasNonTableAction) {
        // Action ended -- stop the action clip and resume movement.
        const prevEntry = actionAnimMap.get(prevActionAnim);
        if (prevEntry) {
          const prevAction = actions.get(prevEntry.clipName);
          if (prevAction) {
            prevAction.fadeOut(ANIM_TRANSITION_TIME);
            prevAction.setLoop(LoopRepeat, Infinity);
            prevAction.clampWhenFinished = false;
          }
        }
        currentAnimRef.current = { name: "root", timeScale: 1 };
        const rootAction = actions.get("root");
        if (rootAction) rootAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
      }
    }

    // If atEnd, clamp the action animation at its final frame.
    if (
      actionAnim != null &&
      actionAnim >= NUM_TABLE_ACTION_ANIMS &&
      kf?.actionAtEnd
    ) {
      const entry = actionAnimMap.get(actionAnim);
      if (entry) {
        const actionAction = actions.get(entry.clipName);
        if (actionAction) {
          actionAction.paused = true;
        }
      }
    }

    // Movement animation selection (skip while dead or playing action anim).
    const playingActionAnim =
      actionAnimRef.current != null &&
      actionAnimRef.current >= NUM_TABLE_ACTION_ANIMS;
    if (!isDeadRef.current && !playingActionAnim) {
      const anim = pickMoveAnimation(
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

    // Jet thrust sound: start/stop based on entity.jetting.
    // Client-side only — Player::updateJetEffects uses alxPlay3d directly.
    const isJetting = !!entity.jetting && !isDead;
    const jetProfile = jetProfileRef.current;
    const jetSound = jetSoundRef.current;
    const jetPlaying = jetSound?.isPlaying ?? false;
    if (isJetting && !jetPlaying) {
      if (audioEnabled && audioListener && jetBufferRef.current && jetProfile) {
        let sound = jetSound;
        if (!sound) {
          sound = createPositionalAudio(audioListener, jetProfile);
          clonedScene.add(sound);
          jetSoundRef.current = sound;
        }
        try {
          sound.setBuffer(jetBufferRef.current);
          sound.setLoop(true);
          sound.setPlaybackRate(getEffectiveSoundRate());
          sound.play();
          trackSound(sound, 1);
        } catch {
          /* AudioContext suspended */
        }
      }
    } else if (jetPlaying && (!isJetting || !audioEnabled)) {
      // Also stop when audio is turned off mid-thrust — the start branch
      // is gated on audioEnabled, but an already-running loop isn't.
      if (jetSound) {
        untrackSound(jetSound);
        try {
          jetSound.stop();
        } catch {
          /* already stopped */
        }
      }
    }

    // Advance or evaluate the body animation mixer.
    if (isPlaying) {
      mixer.update(delta * playback.rate);
    } else {
      mixer.update(0);
    }

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
      <group rotation={[0, Math.PI / 2, 0]}>
        <primitive object={clonedScene} />
        <PlayerDebugBounds entityId={entity.id} scene={gltf.scene} />
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
            <WeaponModel
              entity={entity}
              weaponShape={currentWeaponShape}
              mount0={mount0}
            />
          </DebugSuspense>
        </ShapeErrorBoundary>
      )}
      {currentPackShape &&
        mount1 &&
        createPortal(
          <Suspense>
            <MountedShapeContent
              shapeName={currentPackShape}
              imageDataBlockId={entity.imageSlots?.[2]?.dataBlockId}
              entityId={entity.id}
            />
          </Suspense>,
          mount1,
        )}
      {currentFlagShape &&
        mount2 &&
        createPortal(
          <Suspense>
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
 * Attaches an animated weapon model to the player's Mount0 bone.
 * Drives a weapon-specific AnimationMixer using the WeaponImageStateMachine
 * to play fire, reload, spin, and other weapon animations based on the
 * server-replicated condition flags.
 *
 * Reads `entity.weaponImageState` and `entity.weaponImageStates` directly
 * from the entity inside useFrame, since these fields are mutated per-tick
 * without triggering React re-renders.
 */
function WeaponModel({
  entity,
  weaponShape,
  mount0,
}: {
  entity: PlayerEntity;
  weaponShape: string;
  mount0: Object3D;
}) {
  const engineStore = useEngineStoreApi();
  const weaponGltf = useStaticShape(weaponShape);
  const emap = useMemo(
    () => resolveEmapFromImageSlot(entity.imageSlots?.[0]?.dataBlockId),
    [entity.imageSlots],
  );
  const anisotropy = useAnisotropy();

  // Clone weapon with skeleton bindings, create dedicated mixer.
  const {
    weaponClone,
    weaponMixer,
    seqIndexToName,
    visNodesBySequence,
    weaponIflInitializers,
  } = useMemo(() => {
    const clone = SkeletonUtils.clone(weaponGltf.scene) as Group;
    const iflInits = processShapeScene(clone, undefined, {
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

    // Collect vis-animated meshes grouped by controlling sequence name.
    // E.g. the disc launcher's Disc mesh has vis_sequence="discSpin" and is
    // hidden by default (vis=0). When "discSpin" plays, the mesh becomes
    // visible; when a different sequence plays, it hides again.
    const visBySeq = new Map<string, Object3D[]>();
    clone.traverse((node: any) => {
      if (!node.isMesh) return;
      const ud = node.userData;
      const seqName = (ud?.vis_sequence ?? "").toLowerCase();
      if (!seqName) return;
      let list = visBySeq.get(seqName);
      if (!list) {
        list = [];
        visBySeq.set(seqName, list);
      }
      list.push(node);
    });

    const mix = new AnimationMixer(clone);
    const seq = buildSeqIndexToName(
      weaponGltf.scene as Group,
      weaponGltf.animations,
    );
    return {
      weaponClone: clone,
      weaponMixer: mix,
      seqIndexToName: seq,
      visNodesBySequence: visBySeq,
      weaponIflInitializers: iflInits,
    };
  }, [weaponGltf, anisotropy, emap]);

  useEffect(() => {
    return () => {
      disposeClonedScene(weaponClone);
      weaponMixer.uncacheRoot(weaponClone);
    };
  }, [weaponClone, weaponMixer]);

  // Build case-insensitive action map for weapon animations.
  const weaponActionsRef = useRef(new Map<string, AnimationAction>());
  const spinActionRef = useRef<AnimationAction | null>(null);
  useEffect(() => {
    const actions = new Map<string, AnimationAction>();
    for (const clip of weaponGltf.animations) {
      actions.set(clip.name.toLowerCase(), weaponMixer.clipAction(clip));
    }
    weaponActionsRef.current = actions;

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
      spinActionRef.current = null;
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
    };
  }, [weaponMixer, weaponGltf.animations]);

  // Initialize IFL materials on the weapon model.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const { mesh, initialize } of weaponIflInitializers) {
      initialize(mesh, () => streamClock.time)
        .then((dispose) => cleanups.push(dispose))
        .catch(() => {});
    }
    return () => cleanups.forEach((fn) => fn());
  }, [weaponIflInitializers]);

  // Audio context for weapon sounds.
  const { audioLoader, audioListener } = useAudio();
  const settings = useSettings();
  const audioEnabled = settings?.audioEnabled ?? false;

  // Weapon state machine, lazily initialized on first tick with data.
  const stateMachineRef = useRef<WeaponImageStateMachine | null>(null);
  const currentWeaponAnimRef = useRef<string | null>(null);
  const lastWeaponStatesRef = useRef(entity.weaponImageStates);

  // Track active looping weapon sound (e.g. chaingun fire).
  const loopingSoundRef = useRef<PositionalAudio | null>(null);
  const loopingSoundStateRef = useRef<number>(-1);

  // Imperatively attach/detach weapon clone to Mount0.
  useEffect(() => {
    mount0.add(weaponClone);
    return () => {
      mount0.remove(weaponClone);
    };
  }, [weaponClone, mount0]);

  // Per-frame: tick state machine and drive weapon animation mixer.
  useFrame((_, delta) => {
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const actions = weaponActionsRef.current;

    // Read weapon state directly from entity (mutated per-tick, not via props).
    const imageState = entity.weaponImageState;
    const imageStates = entity.weaponImageStates;

    // Lazily create or recreate the state machine when the datablock states
    // become available or change (e.g. weapon switch within same shape).
    if (imageStates !== lastWeaponStatesRef.current) {
      lastWeaponStatesRef.current = imageStates;
      if (imageStates && imageStates.length > 0) {
        stateMachineRef.current = new WeaponImageStateMachine(
          imageStates,
          seqIndexToName,
        );
      } else {
        stateMachineRef.current = null;
      }
      currentWeaponAnimRef.current = null;
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
    }

    // Initialize state machine if we have states but haven't created it yet.
    if (!stateMachineRef.current && imageStates && imageStates.length > 0) {
      stateMachineRef.current = new WeaponImageStateMachine(
        imageStates,
        seqIndexToName,
      );
    }

    const sm = stateMachineRef.current;

    // The state-change stop below only runs while the state machine is
    // ticking — a weapon that loses its image state (holstered, player
    // died, ghost stopped sending) or audio being disabled must also kill
    // an active fire loop, or it plays until the component unmounts. A
    // loop that is no longer playing was stopped externally (global stop
    // on seek) — clear it so the next state entry can re-trigger.
    // (Pause is deliberately not a stop condition: the suspended
    // AudioContext silences the loop, and it must survive to resume.)
    if (
      loopingSoundRef.current &&
      (!sm ||
        !imageState ||
        !audioEnabled ||
        !loopingSoundRef.current.isPlaying)
    ) {
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
    }

    if (sm && imageState && isPlaying) {
      const effectiveDelta = delta * playback.rate;
      const animState = sm.tick(effectiveDelta, imageState);

      applyWeaponAnim(
        animState,
        actions,
        currentWeaponAnimRef,
        visNodesBySequence,
      );

      // Stop active looping sound when the state changes.
      if (
        loopingSoundRef.current &&
        animState.stateIndex !== loopingSoundStateRef.current
      ) {
        stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
      }

      // Play weapon state-entry sounds as positional audio on transitions.
      // The engine plays a sound for every state entered during a transition
      // chain, so there may be multiple sounds per tick.
      if (
        audioEnabled &&
        audioLoader &&
        audioListener &&
        animState.soundDataBlockIds.length > 0
      ) {
        const getDb =
          playback.recording?.streamingPlayback.getDataBlockData.bind(
            playback.recording.streamingPlayback,
          );
        if (getDb) {
          for (const soundDbId of animState.soundDataBlockIds) {
            const resolved = resolveAudioProfile(soundDbId, getDb);
            if (!resolved) continue;

            if (resolved.isLooping) {
              // Looping sounds (e.g. chaingun fire) persist while in this
              // state and stop on transition to a different state.
              if (!loopingSoundRef.current) {
                try {
                  const url = audioToUrl(resolved.filename);
                  const gen = getSoundGeneration();
                  getCachedAudioBuffer(url, audioLoader, (buffer) => {
                    // Guard: state may have changed by the time buffer loads.
                    if (gen !== getSoundGeneration()) return;
                    if (loopingSoundRef.current) return;
                    // Read live state index (not the closure-captured one).
                    const currentIdx = sm.stateIndex;
                    const sound = createPositionalAudio(
                      audioListener,
                      resolved,
                    );
                    sound.setBuffer(buffer);
                    sound.setPlaybackRate(getEffectiveSoundRate());
                    sound.setLoop(true);
                    weaponClone.add(sound);
                    trackSound(sound);
                    sound.play();
                    loopingSoundRef.current = sound;
                    loopingSoundStateRef.current = currentIdx;
                  });
                } catch {
                  /* expected */
                }
              }
            } else {
              playOneShotSound(
                resolved,
                audioListener,
                audioLoader,
                undefined,
                weaponClone,
              );
            }
          }
        }
      }

      // Drive the spin thread (e.g. chaingun barrel rotation).
      if (spinActionRef.current) {
        spinActionRef.current.timeScale = animState.spinTimeScale;
      }
    }

    // Advance the weapon mixer.
    if (isPlaying) {
      weaponMixer.update(delta * playback.rate);
    } else {
      weaponMixer.update(0);
    }
  });

  return null;
}

/**
 * Applies the weapon state machine output to the weapon's AnimationMixer.
 * Handles crossfading between sequences, configuring loop/timeScale, and
 * toggling DTS vis-node visibility (e.g. disc launcher's disc mesh).
 */
function applyWeaponAnim(
  animState: WeaponAnimState,
  actions: Map<string, AnimationAction>,
  currentAnimRef: MutableRefObject<string | null>,
  visNodesBySequence: Map<string, Object3D[]>,
): void {
  const targetName = animState.sequenceName;
  const currentName = currentAnimRef.current;

  if (targetName === currentName && !animState.transitioned) {
    return;
  }

  // Toggle vis-node visibility when the active sequence changes.
  // Meshes with vis_sequence are hidden by default (processShapeScene sets
  // visible=false for vis<0.01). They become visible only when their
  // controlling sequence is the active one. E.g. the disc launcher's Disc
  // mesh has vis_sequence="discspin" and appears only during the discSpin
  // (Ready) state.
  if (targetName !== currentName) {
    // Hide vis nodes from the previous sequence.
    if (currentName) {
      const prevVis = visNodesBySequence.get(currentName);
      if (prevVis) {
        for (const node of prevVis) node.visible = false;
      }
    }
    // Show vis nodes for the new sequence.
    if (targetName) {
      const nextVis = visNodesBySequence.get(targetName);
      if (nextVis) {
        for (const node of nextVis) node.visible = true;
      }
    }
  }

  if (!targetName) {
    // No sequence for this state -- stop current animation.
    if (currentName) {
      const prev = actions.get(currentName);
      if (prev) prev.fadeOut(ANIM_TRANSITION_TIME);
      currentAnimRef.current = null;
    }
    return;
  }

  const action = actions.get(targetName);
  if (!action) return;

  // On state transition, restart the animation.
  if (animState.transitioned || targetName !== currentName) {
    const prevAction = currentName ? actions.get(currentName) : null;

    // Fire/reload animations play once; others loop.
    if (animState.isFiring || animState.timeoutValue > 0) {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }

    // Scale animation to fit the state timeout if requested.
    if (animState.scaleAnimation && animState.timeoutValue > 0) {
      const clipDuration = action.getClip().duration;
      action.timeScale =
        clipDuration > 0 ? clipDuration / animState.timeoutValue : 1;
    } else {
      action.timeScale = animState.reverse ? -1 : 1;
    }

    if (prevAction && prevAction !== action) {
      prevAction.fadeOut(ANIM_TRANSITION_TIME);
      action.reset().fadeIn(ANIM_TRANSITION_TIME).play();
    } else {
      action.reset().play();
    }

    currentAnimRef.current = targetName;
  }
}

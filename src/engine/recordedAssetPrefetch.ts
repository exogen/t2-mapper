import { sampleClipTake, type ClipTake } from "../../relay/clipTypes";
import { startAssetPrefetch } from "../assetPrefetch";
import { createLogger } from "../logger";
import { performanceTuning } from "../performanceTuning";
import { clipStore } from "../state/clipStore";
import { engineStore } from "../state/engineStore";
import {
  MAX_RESOURCE_LOOKAHEAD_MS,
  settingsStore,
} from "../state/settingsStore";
import {
  asObservedDemoEffect,
  collectDemoDatablockResources,
  demoResourceKey,
  isDemoEffectEntity,
  type DemoResourceHint,
  type DemoResourceScanResult,
} from "../stream/demoResourceLookahead";
import type {
  PreloadAsset,
  StreamSnapshot,
  StreamingPlayback,
} from "../stream/types";
import { warmDemoResource } from "./demoResourceWarmup";
import type { GameEngine } from "./gameEngine";

const MAX_OPENING_JOBS = 24;
const MAX_OPENING_EFFECT_JOBS = 32;
const OPENING_FUTURE_JOBS = 8;
const log = createLogger("recordedAssetPrefetch");

function currentResources(
  snapshot: StreamSnapshot,
  stream: StreamingPlayback,
): DemoResourceHint[] {
  const hints: DemoResourceHint[] = [];
  for (const entity of snapshot.entities) {
    const effect = isDemoEffectEntity(entity.className ?? entity.type);
    const add = (hint: DemoResourceHint) =>
      hints.push(effect ? asObservedDemoEffect(hint) : hint);
    const shape = (name: string | undefined) => {
      if (name) add({ kind: "shape", name });
    };
    const texture = (name: string | undefined) => {
      if (name) add({ kind: "texture", name });
    };
    if (entity.shapeHint && entity.className === "Player") {
      hints.push({
        kind: "playerSkin",
        shapeName: entity.shapeHint,
        skinName: entity.skinName,
        skinPrefName: entity.skinPrefName,
      });
    } else if (!entity.sceneData) {
      shape(entity.shapeHint);
    }
    for (const image of entity.imageSlots ?? []) shape(image?.shapeName);
    const particleTexture = entity.particleEmitter?.particles.textureName;
    if (particleTexture)
      add({ kind: "particleTexture", name: particleTexture });
    const visual = entity.visual;
    if (!visual) continue;
    if ("textures" in visual) for (const name of visual.textures) texture(name);
    if ("texture" in visual) texture(visual.texture);
    if (visual.kind === "tracer") texture(visual.crossTexture);
    if (visual.kind === "linkBeam") {
      texture(visual.flareTexture);
      texture(visual.lightningTexture);
    }
    if (visual.kind === "flare") {
      shape(visual.shapeName);
      texture(visual.baseTexture);
      texture(visual.modTexture);
    }
  }
  const seen = new Set<number>();
  const seenEffects = new Set<number>();
  const lookup = (id: number) => stream.getDataBlockData(id);
  const add = (hint: DemoResourceHint) => hints.push(hint);
  const addEffect = (hint: DemoResourceHint) => add(asObservedDemoEffect(hint));
  for (const entity of snapshot.entities) {
    const effect = isDemoEffectEntity(entity.className ?? entity.type);
    collectDemoDatablockResources(
      entity.dataBlockId,
      lookup,
      effect ? addEffect : add,
      effect ? seenEffects : seen,
    );
    collectDemoDatablockResources(
      entity.explosionDataBlockId,
      lookup,
      addEffect,
      seenEffects,
    );
    collectDemoDatablockResources(
      entity.maintainEmitterId,
      lookup,
      addEffect,
      seenEffects,
    );
    collectDemoDatablockResources(
      entity.bubbleEmitterId,
      lookup,
      addEffect,
      seenEffects,
    );
    for (const image of entity.imageSlots ?? [])
      collectDemoDatablockResources(image?.dataBlockId, lookup, add, seen);
  }
  return hints;
}

function activePublishedClip() {
  const { active, draft } = clipStore.getState();
  return draft ? null : active;
}

function indexResources(hints: readonly DemoResourceHint[]) {
  const resources = new Map<string, DemoResourceHint>();
  for (const hint of hints) {
    const key = demoResourceKey(hint);
    if (!resources.get(key)?.observedEffect || hint.observedEffect)
      resources.set(key, hint);
  }
  return resources;
}

function resourceJobKey(hint: DemoResourceHint): string {
  const key = demoResourceKey(hint);
  if (hint.kind === "shape") return key;
  // An observed effect must be able to promote an earlier queued bitmap
  // or retry one that failed while it was still speculative.
  if (hint.observedEffect && hint.kind !== "effectShape")
    return `recorded:effect:${key}`;
  return `recorded:${key}`;
}

function prioritizeResources(
  current: readonly DemoResourceHint[],
  future: readonly DemoResourceHint[],
  openingSlots: number,
) {
  const currentByKey = indexResources(current);
  const futureByKey = indexResources(future);
  const effects = new Map<string, DemoResourceHint>();
  for (const entries of [currentByKey, futureByKey]) {
    for (const [key, hint] of entries) {
      if (hint.observedEffect) effects.set(key, hint);
    }
  }
  // A regular dependency job cannot stand in for preparing the effect's sampler.
  for (const hint of effects.values()) {
    if (hint.kind === "effectShape") {
      currentByKey.delete(`shape:${hint.name}`);
      futureByKey.delete(`shape:${hint.name}`);
    }
  }
  const openingEffects = Array.from(effects).slice(0, MAX_OPENING_EFFECT_JOBS);
  const remainingSlots = Math.max(0, openingSlots - openingEffects.length);
  const futureSlots = Math.min(OPENING_FUTURE_JOBS, remainingSlots);
  const openingCurrent = new Map(
    Array.from(currentByKey)
      .filter(([key]) => !effects.has(key))
      .slice(0, remainingSlots - futureSlots),
  );
  // Prefer assets the opening view does not already reference.
  const openingFuture = Array.from(futureByKey)
    .filter(([key]) => !effects.has(key) && !openingCurrent.has(key))
    .sort(
      ([a], [b]) => Number(currentByKey.has(a)) - Number(currentByKey.has(b)),
    )
    .slice(0, futureSlots);
  const ordered = new Map(openingEffects);
  const currentEntries = Array.from(openingCurrent);
  // Put the earliest future asset just after the first current asset.
  for (const [index, entry] of currentEntries.entries()) {
    ordered.set(...entry);
    if (index % 2 === 0) {
      const future = openingFuture[index / 2];
      if (future) ordered.set(...future);
    }
  }
  for (const entry of openingFuture) ordered.set(...entry);
  const addRemaining = (entries: Map<string, DemoResourceHint>) => {
    for (const entry of entries)
      if (!ordered.has(entry[0])) ordered.set(...entry);
  };
  addRemaining(currentByKey);
  addRemaining(futureByKey);
  return { ordered, openingEffectCount: openingEffects.length };
}

/** Scan the demo clock in both ordinary playback and published clips. */
export function startRecordedAssetPrefetch(
  engine: GameEngine,
  stream: StreamingPlayback,
): () => void {
  let known:
    | {
        assets: PreloadAsset[];
        terrainKeys: string[];
        seekNonce: number;
        worldGeneration: number | undefined;
        refreshAt: number;
      }
    | undefined;
  let opening:
    | {
        seekNonce: number;
        clip: ClipTake | null;
        lookaheadMs: number;
        complete: boolean;
        keys: string[];
      }
    | undefined;
  let prepared:
    | {
        snapshot: StreamSnapshot;
        scan: DemoResourceScanResult | undefined;
        openingSlots: number;
        keys: string[];
        effectKeys: string[];
        jobs: { key: string; load: () => Promise<void> }[];
      }
    | undefined;
  // The packet cursor advances in short slices. Keep the broader datablock
  // and scene inventory on its existing, slower cadence for both consumers.
  const readKnownAssets = () => {
    const { playback } = engineStore.getState();
    if (playback.status === "seeking") return undefined;
    const now = performance.now();
    if (
      !known ||
      now >= known.refreshAt ||
      playback.seekNonce !== known.seekNonce ||
      stream.worldGeneration !== known.worldGeneration
    ) {
      let assets: PreloadAsset[] = [];
      try {
        assets = stream.getPreloadAssets();
      } catch (error) {
        log.warn({ err: error }, "Preload asset inventory failed");
      }
      const terrainKeys = new Set<string>();
      for (const { kind, name } of assets)
        if (kind === "terrain" && name) terrainKeys.add(`terrain:${name}`);
      known = {
        assets,
        terrainKeys: Array.from(terrainKeys).slice(0, MAX_OPENING_JOBS),
        seekNonce: playback.seekNonce,
        worldGeneration: stream.worldGeneration,
        refreshAt: now + performanceTuning.assetPrefetch.rescanDelayMs,
      };
    }
    return known;
  };
  const queue = startAssetPrefetch(
    () => readKnownAssets()?.assets ?? [],
    () => ({
      assets: engine.sceneAssets,
      manager: engine.assetLoadingManager,
    }),
    () => {
      const { resourceLookaheadMs: lookaheadMs } = settingsStore.getState();
      const { playback } = engineStore.getState();
      const snapshot = engine.streamSnapshot.current;
      if (!lookaheadMs || !snapshot || playback.status === "seeking") {
        opening = undefined;
        prepared = undefined;
        return null;
      }

      const clip = activePublishedClip();
      const clipTimeMs = clipStore.getState().playheadMs;
      const throughSec = clip
        ? sampleClipTake(clip, clipTimeMs + lookaheadMs).demoTimeSec
        : snapshot.timeSec + (lookaheadMs / 1_000) * playback.rate;
      const target = Math.min(
        throughSec,
        snapshot.timeSec + MAX_RESOURCE_LOOKAHEAD_MS / 1_000,
      );
      const scan = stream.getResourceLookahead?.(target);
      const terrainKeys = readKnownAssets()?.terrainKeys ?? [];
      const openingSlots = MAX_OPENING_JOBS - terrainKeys.length;
      if (
        !prepared ||
        prepared.snapshot !== snapshot ||
        prepared.scan !== scan ||
        prepared.openingSlots !== openingSlots
      ) {
        const { ordered, openingEffectCount } = prioritizeResources(
          currentResources(snapshot, stream),
          scan?.hints ?? [],
          openingSlots,
        );
        const jobs = Array.from(ordered.values(), (hint) => ({
          key: resourceJobKey(hint),
          load: () => warmDemoResource(hint, engine),
        }));
        prepared = {
          snapshot,
          scan,
          openingSlots,
          keys: jobs
            .slice(0, Math.max(openingSlots, openingEffectCount))
            .map(({ key }) => key),
          effectKeys: jobs.slice(0, openingEffectCount).map(({ key }) => key),
          jobs,
        };
      }
      opening = {
        seekNonce: playback.seekNonce,
        clip,
        lookaheadMs,
        complete: scan?.complete ?? true,
        keys: [...terrainKeys, ...prepared.keys],
      };
      const openingClip = !!clip && clipTimeMs === 0;
      const blockBackground =
        openingClip &&
        (!opening.complete ||
          (prepared.effectKeys.length > 0 &&
            !queue.prioritySettled(prepared.effectKeys)));
      return {
        scanning: !opening.complete,
        jobs: blockBackground
          ? prepared.jobs.slice(0, prepared.effectKeys.length)
          : prepared.jobs,
        blockBackground,
      };
    },
  );
  const ready = () => {
    const { resourceLookaheadMs } = settingsStore.getState();
    return (
      !resourceLookaheadMs ||
      (!!opening?.complete &&
        opening.seekNonce === engineStore.getState().playback.seekNonce &&
        opening.clip === activePublishedClip() &&
        opening.lookaheadMs === resourceLookaheadMs &&
        queue.prioritySettled(opening.keys))
    );
  };
  engine.recordedResourcesReady = ready;
  const stopClip = clipStore.subscribe((state, previous) => {
    if (state.active !== previous.active) queue.refresh();
  });
  const stopSettings = settingsStore.subscribe((state, previous) => {
    if (state.resourceLookaheadMs !== previous.resourceLookaheadMs)
      queue.refresh();
  });
  const stopSeek = engineStore.subscribe((state, previous) => {
    if (
      previous.playback.status === "seeking" &&
      state.playback.status !== "seeking"
    )
      queue.refresh();
  });
  return () => {
    stopSeek();
    stopSettings();
    stopClip();
    if (engine.recordedResourcesReady !== ready) return;
    engine.recordedResourcesReady = undefined;
    queue.stop();
  };
}

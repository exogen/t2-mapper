import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { GameEntity, RenderType } from "./gameEntityTypes";
import { normalizedMissionTypes } from "../mission";
import { findMissionInfo } from "../manifest";

export type DataSource = "map" | "demo" | "live";

/** Whether a data source is a live/demo stream (vs a static map, or none).
 *  The single source of truth — there is no stored `isStreaming` flag. */
export function isStreamingSource(dataSource: DataSource | null): boolean {
  return dataSource === "demo" || dataSource === "live";
}

export interface GameEntityState {
  /**
   * Mission-authored entities (from .mis TorqueObject tree).
   * Persists while the mission is loaded. Overridden by streamEntities
   * when streaming is active.
   */
  missionEntities: Map<string, GameEntity>;
  /**
   * Stream entities from demo playback or live server connection.
   * When non-empty, these are rendered instead of missionEntities.
   */
  streamEntities: Map<string, GameEntity>;
  /** Which data source is currently populating entities, or null if empty.
   *  demo/live means a stream is active (see isStreamingSource). */
  dataSource: DataSource | null;
  /** Mission slug (e.g. "ScarabRae") — the $MissionName / $CurrentMission value. */
  missionName: string | null;
  /** Mission type short code (e.g. "CTF"), as used in .mis MissionTypes. */
  missionType: string | null;
  /** Mission type display name (e.g. "Capture the Flag"), from MsgMissionDropInfo. */
  missionTypeDisplayName: string | null;
  /** Mission display name (e.g. "Scarabrae"), from MsgMissionDropInfo. */
  missionDisplayName: string | null;
  /** Game class name (e.g. "CTFGame"), from MsgClientReady. */
  gameClassName: string | null;
  /** Server display name. */
  serverDisplayName: string | null;
  /** Name of the player who recorded the demo / connected to the server. */
  recorderName: string | null;
  /** Recording date string from readplayerinfo (e.g. "May-4-2025 10:37PM"). */
  recordingDate: string | null;
  /** Monotonically increasing version counter, bumped on any mutation. */
  version: number;

  // ── Mission entity mutations ──
  setEntity(entity: GameEntity): void;
  deleteEntity(id: string): void;
  setEntities(entities: GameEntity[]): void;
  setAllEntities(entities: GameEntity[]): void;
  clearEntities(): void;

  /** Update mission info fields. Pass null to clear a field, omit to leave unchanged. */
  setMissionInfo(info: {
    missionName?: string | null;
    missionType?: string | null;
    missionTypeDisplayName?: string | null;
    missionDisplayName?: string | null;
    gameClassName?: string | null;
    serverDisplayName?: string | null;
    recorderName?: string | null;
    recordingDate?: string | null;
  }): void;

  // ── Stream entity mutations ──
  /** Begin streaming mode. Stream entities will be rendered instead of mission entities. */
  beginStreaming(source: "demo" | "live"): void;
  /** End streaming mode and clear stream entities. Mission entities become active again. */
  endStreaming(): void;
  setStreamEntity(entity: GameEntity): void;
  deleteStreamEntity(id: string): void;
  setStreamEntities(entities: GameEntity[]): void;
  setAllStreamEntities(entities: GameEntity[]): void;
  clearStreamEntities(): void;
  /** Returns the store's streamEntities Map for direct mutation.
   *  Call bumpStreamVersion() after structural changes (adds/removes). */
  getStreamEntitiesMap(): Map<string, GameEntity>;
  /** Bump version to notify React subscribers. Call after adds/removes/
   *  identity rebuilds, NOT for in-place field mutations. */
  bumpStreamVersion(): void;
}

export const gameEntityStore = createStore<GameEntityState>()((set, get) => ({
  missionEntities: new Map(),
  streamEntities: new Map(),
  dataSource: null,
  missionName: null,
  missionType: null,
  missionTypeDisplayName: null,
  missionDisplayName: null,
  gameClassName: null,
  serverDisplayName: null,
  recorderName: null,
  recordingDate: null,
  version: 0,

  // ── Mission entity mutations ──

  setEntity(entity: GameEntity) {
    set((state) => {
      const next = new Map(state.missionEntities);
      next.set(entity.id, entity);
      return { missionEntities: next, version: state.version + 1 };
    });
  },

  deleteEntity(id: string) {
    set((state) => {
      if (!state.missionEntities.has(id)) return state;
      const next = new Map(state.missionEntities);
      next.delete(id);
      return { missionEntities: next, version: state.version + 1 };
    });
  },

  setEntities(entities: GameEntity[]) {
    set((state) => {
      const next = new Map(state.missionEntities);
      for (const entity of entities) {
        next.set(entity.id, entity);
      }
      return { missionEntities: next, version: state.version + 1 };
    });
  },

  setAllEntities(entities: GameEntity[]) {
    set((state) => {
      const next = new Map<string, GameEntity>();
      for (const entity of entities) {
        next.set(entity.id, entity);
      }
      return {
        missionEntities: next,
        dataSource: isStreamingSource(state.dataSource)
          ? state.dataSource
          : "map",
      };
    });
  },

  clearEntities() {
    set((state) => {
      if (state.missionEntities.size === 0) return state;
      // When streaming is active, only clear mission entities — don't
      // touch dataSource or metadata, those belong to the stream.
      if (isStreamingSource(state.dataSource)) {
        return {
          missionEntities: new Map(),
          version: state.version + 1,
        };
      }
      return {
        missionEntities: new Map(),
        dataSource: null,
        missionName: null,
        missionType: null,
        missionTypeDisplayName: null,
        missionDisplayName: null,
        gameClassName: null,
        serverDisplayName: null,
        recorderName: null,
        recordingDate: null,
        version: state.version + 1,
      };
    });
  },

  setMissionInfo(info) {
    const updates: Partial<GameEntityState> = {};
    if (info.missionName !== undefined) updates.missionName = info.missionName;
    if (info.missionType !== undefined) updates.missionType = info.missionType;
    if (info.missionTypeDisplayName !== undefined)
      updates.missionTypeDisplayName = info.missionTypeDisplayName;
    if (info.missionDisplayName !== undefined)
      updates.missionDisplayName = info.missionDisplayName;
    if (info.gameClassName !== undefined) {
      updates.gameClassName = info.gameClassName;
      // Derive missionType from gameClassName (e.g. "CTFGame" → "CTF")
      // unless missionType was explicitly provided.
      if (info.missionType === undefined) {
        if (info.gameClassName) {
          const raw = info.gameClassName.replace(/Game$/i, "");
          updates.missionType =
            (normalizedMissionTypes as Record<string, string>)[
              raw.toLowerCase()
            ] ?? raw;
        } else {
          updates.missionType = null;
        }
      }
    }
    if (info.serverDisplayName !== undefined)
      updates.serverDisplayName = info.serverDisplayName;
    if (info.recorderName !== undefined)
      updates.recorderName = info.recorderName;
    if (info.recordingDate !== undefined)
      updates.recordingDate = info.recordingDate;
    set((state) => ({ ...updates, version: state.version + 1 }));
  },

  // ── Stream entity mutations ──

  beginStreaming(source: "demo" | "live") {
    set((state) => ({
      dataSource: source,
      streamEntities: new Map(),
      missionName: null,
      missionType: null,
      missionTypeDisplayName: null,
      missionDisplayName: null,
      gameClassName: null,
      serverDisplayName: null,
      recorderName: null,
      recordingDate: null,
      version: state.version + 1,
    }));
  },

  endStreaming() {
    set((state) => {
      if (!isStreamingSource(state.dataSource)) return state;
      return {
        dataSource: state.missionEntities.size > 0 ? "map" : null,
        missionName: null,
        missionType: null,
        missionTypeDisplayName: null,
        missionDisplayName: null,
        gameClassName: null,
        serverDisplayName: null,
        recorderName: null,
        recordingDate: null,
        streamEntities: new Map(),
        version: state.version + 1,
      };
    });
  },

  setStreamEntity(entity: GameEntity) {
    set((state) => {
      const next = new Map(state.streamEntities);
      next.set(entity.id, entity);
      return { streamEntities: next, version: state.version + 1 };
    });
  },

  deleteStreamEntity(id: string) {
    set((state) => {
      if (!state.streamEntities.has(id)) return state;
      const next = new Map(state.streamEntities);
      next.delete(id);
      return { streamEntities: next, version: state.version + 1 };
    });
  },

  setStreamEntities(entities: GameEntity[]) {
    set((state) => {
      const next = new Map(state.streamEntities);
      for (const entity of entities) {
        next.set(entity.id, entity);
      }
      return { streamEntities: next, version: state.version + 1 };
    });
  },

  setAllStreamEntities(entities: GameEntity[]) {
    set((state) => {
      const next = new Map<string, GameEntity>();
      for (const entity of entities) {
        next.set(entity.id, entity);
      }
      // Skip store update if the entity key set is unchanged.
      const prev = state.streamEntities;
      if (
        next.size === prev.size &&
        [...next.keys()].every((id) => prev.has(id))
      ) {
        return state;
      }
      return { streamEntities: next, version: state.version + 1 };
    });
  },

  clearStreamEntities() {
    set((state) => {
      if (state.streamEntities.size === 0) return state;
      return { streamEntities: new Map(), version: state.version + 1 };
    });
  },

  getStreamEntitiesMap() {
    return get().streamEntities;
  },

  bumpStreamVersion() {
    set((state) => ({ version: state.version + 1 }));
  },
}));

// ── Selectors ──

function selectActiveEntities(state: GameEntityState) {
  return isStreamingSource(state.dataSource)
    ? state.streamEntities
    : state.missionEntities;
}

function selectVersion(state: GameEntityState) {
  return state.version;
}

function useGameEntitiesInternal() {
  useStoreWithEqualityFn(gameEntityStore, selectVersion);
  return useStoreWithEqualityFn(gameEntityStore, selectActiveEntities);
}

/** Hook that returns the active game entities. Re-renders on any entity change. */
export function useGameEntities(): Map<string, GameEntity> {
  return useGameEntitiesInternal();
}

// ── All-entity selector ──

function selectAllEntities(state: GameEntityState): GameEntity[] {
  const entities = isStreamingSource(state.dataSource)
    ? state.streamEntities
    : state.missionEntities;
  const result: GameEntity[] = [];
  for (const entity of entities.values()) {
    if (entity.renderType !== "None") {
      result.push(entity);
    }
  }
  return result;
}

/** Compare entity sets by reference identity. Field-only mutations
 * (threads, colors, position) reuse the same object so this won't trigger.
 * Identity rebuilds (new datablock, shape change) create new objects,
 * which correctly triggers a re-render to pick up the new entity. */
function entitySetEqual(a: GameEntity[], b: GameEntity[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Hook that returns all renderable entities (renderType !== "None").
 * Re-renders when entities are added, removed, or identity-rebuilt
 * (new datablock/shape → new object reference). Does NOT re-render
 * for in-place field mutations (threads, colors, position).
 */
export function useAllGameEntities(): GameEntity[] {
  return useStoreWithEqualityFn(
    gameEntityStore,
    selectAllEntities,
    entitySetEqual,
  );
}

/**
 * Hook returning the count of entities of a render type. Unlike
 * useGameEntitiesByRenderType, the selected value is a primitive, so
 * consumers only re-render when the count actually changes — not on
 * every entity mutation in the store.
 */
export function useGameEntityCountByRenderType(renderType: RenderType): number {
  return useStoreWithEqualityFn(gameEntityStore, (state) => {
    let count = 0;
    for (const entity of selectActiveEntities(state).values()) {
      if (entity.renderType === renderType) count++;
    }
    return count;
  });
}

/** Hook returning entities filtered by render type. */
export function useGameEntitiesByRenderType(
  renderType: RenderType,
): GameEntity[] {
  const entities = useGameEntitiesInternal();
  const result: GameEntity[] = [];
  for (const entity of entities.values()) {
    if (entity.renderType === renderType) result.push(entity);
  }
  return result;
}

// ── Scene infrastructure queries ──

import type { SceneSky, SceneSun, SceneMissionArea } from "../scene/types";

// Scene infrastructure selectors use Object.is equality (default) on the
// extracted data object — these are set once and referentially stable, so
// the hooks won't re-render when unrelated (dynamic) entities update.

function selectSkyData(state: GameEntityState): SceneSky | null {
  const entities = isStreamingSource(state.dataSource)
    ? state.streamEntities
    : state.missionEntities;
  for (const e of entities.values()) {
    if (e.renderType === "Sky") return e.skyData;
  }
  return null;
}

/** Memo for combined multi-sun data (selector must return stable refs). */
let lastSunInputs: SceneSun[] = [];
let lastSunResult: SceneSun | null = null;

function selectSunData(state: GameEntityState): SceneSun | null {
  const entities = isStreamingSource(state.dataSource)
    ? state.streamEntities
    : state.missionEntities;
  const suns: SceneSun[] = [];
  for (const e of entities.values()) {
    if (e.renderType === "Sun" && e.sunData) suns.push(e.sunData);
  }
  if (suns.length === 0) return null;
  if (suns.length === 1) return suns[0];
  if (
    suns.length === lastSunInputs.length &&
    suns.every((s, i) => s === lastSunInputs[i])
  ) {
    return lastSunResult;
  }

  // Multiple Sun objects: each Sun registers itself with the engine's
  // light manager (Sun::onAdd, Tribes2.exe 0x5b11e0), and fixed-function
  // lighting sums registered lights — contributions ADD. Mappers exploit
  // this with an all-black Sun plus a real one (e.g. SuperiorWaterworks);
  // picking just the first would light the map with black. Sum colors and
  // ambients, and take the direction from the sun with the strongest
  // direct color — our pipeline has a single directional light.
  const sumChannel = (pick: (s: SceneSun) => number) =>
    Math.min(
      1,
      suns.reduce((total, s) => total + pick(s), 0),
    );
  const luminance = (s: SceneSun) => s.color.r + s.color.g + s.color.b;
  const strongest = suns.reduce((best, s) =>
    luminance(s) > luminance(best) ? s : best,
  );
  lastSunInputs = suns;
  lastSunResult = {
    ...strongest,
    color: {
      r: sumChannel((s) => s.color.r),
      g: sumChannel((s) => s.color.g),
      b: sumChannel((s) => s.color.b),
      a: 1,
    },
    ambient: {
      r: sumChannel((s) => s.ambient.r),
      g: sumChannel((s) => s.ambient.g),
      b: sumChannel((s) => s.ambient.b),
      a: 1,
    },
  };
  return lastSunResult;
}

function selectMissionAreaData(
  state: GameEntityState,
): SceneMissionArea | null {
  const entities = isStreamingSource(state.dataSource)
    ? state.streamEntities
    : state.missionEntities;
  for (const e of entities.values()) {
    if (e.renderType === "MissionArea") return e.missionAreaData;
  }
  return null;
}

/** Hook returning the Sky data, or null if no sky entity exists. */
export function useSceneSky(): SceneSky | null {
  return useStoreWithEqualityFn(gameEntityStore, selectSkyData);
}

/** Hook returning the Sun data, or null if no sun entity exists. */
export function useSceneSun(): SceneSun | null {
  return useStoreWithEqualityFn(gameEntityStore, selectSunData);
}

/** Hook returning the MissionArea data, or null if none exists. */
export function useSceneMissionArea(): SceneMissionArea | null {
  return useStoreWithEqualityFn(gameEntityStore, selectMissionAreaData);
}

/** Hook returning which data source is currently populating entities. */
export function useDataSource(): DataSource | null {
  return useStoreWithEqualityFn(gameEntityStore, (state) => state.dataSource);
}

/** Hook returning the current mission name. */
export function useMissionName(): string | null {
  return useStoreWithEqualityFn(gameEntityStore, (state) => state.missionName);
}

/** Hook returning the mission type short code (e.g. "CTF"). */
export function useMissionType(): string | null {
  return useStoreWithEqualityFn(gameEntityStore, (state) => state.missionType);
}

/** Hook returning the mission type display name (e.g. "Capture the Flag"). */
export function useMissionTypeDisplayName(): string | null {
  return useStoreWithEqualityFn(
    gameEntityStore,
    (state) => state.missionTypeDisplayName,
  );
}

/** Hook returning the debugHidden state for a specific entity. */
export function useDebugHidden(entityId: string): boolean {
  return useStoreWithEqualityFn(gameEntityStore, (state) => {
    const entities = isStreamingSource(state.dataSource)
      ? state.streamEntities
      : state.missionEntities;
    return entities.get(entityId)?.debugHidden ?? false;
  });
}

/**
 * Hook returning the mission display name (e.g. "Scarabrae"), falling
 * back to the manifest's display name for the raw mission name — a live
 * catch-up or demo can know the mission file (often lowercased) before
 * or without the server's MsgMissionDropInfo display strings.
 */
export function useMissionDisplayName(): string | null {
  return useStoreWithEqualityFn(gameEntityStore, (state) => {
    if (state.missionDisplayName) return state.missionDisplayName;
    if (!state.missionName) return null;
    return findMissionInfo(state.missionName)?.displayName ?? state.missionName;
  });
}

/** Hook returning the server display name. */
export function useServerDisplayName(): string | null {
  return useStoreWithEqualityFn(
    gameEntityStore,
    (state) => state.serverDisplayName,
  );
}

/** Hook returning the name of the player who recorded the demo / connected. */
export function useRecorderName(): string | null {
  return useStoreWithEqualityFn(gameEntityStore, (state) => state.recorderName);
}

/** Hook returning the demo recording date string. */
export function useRecordingDate(): string | null {
  return useStoreWithEqualityFn(
    gameEntityStore,
    (state) => state.recordingDate,
  );
}

/**
 * Whether a mission entity is a CTF flag (Shape with the Flag dataBlock).
 */
export function isFlagEntity(entityId: string): boolean {
  const entity = gameEntityStore.getState().missionEntities.get(entityId);
  return (
    entity?.renderType === "Shape" && entity.dataBlock?.toLowerCase() === "flag"
  );
}

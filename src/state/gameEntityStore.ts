import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { GameEntity, RenderType } from "./gameEntityTypes";
import { normalizedMissionTypes } from "../mission";

export type DataSource = "map" | "demo" | "live";

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
  /** True when a demo/live source is actively driving entity state. */
  isStreaming: boolean;
  /** Which data source is currently populating entities, or null if empty. */
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
  isStreaming: false,
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
        dataSource: state.isStreaming ? state.dataSource : "map",
      };
    });
  },

  clearEntities() {
    set((state) => {
      if (state.missionEntities.size === 0) return state;
      // When streaming is active, only clear mission entities — don't
      // touch dataSource or metadata, those belong to the stream.
      if (state.isStreaming) {
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
      isStreaming: true,
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
      if (!state.isStreaming) return state;
      return {
        isStreaming: false,
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
  return state.isStreaming ? state.streamEntities : state.missionEntities;
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
  const entities = state.isStreaming
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

/** Hook returning entities filtered by class name. */
export function useGameEntitiesByClass(className: string): GameEntity[] {
  const entities = useGameEntitiesInternal();
  const result: GameEntity[] = [];
  for (const entity of entities.values()) {
    if (entity.className === className) result.push(entity);
  }
  return result;
}

/** Hook returning a single entity by id, or undefined. */
export function useGameEntity(id: string): GameEntity | undefined {
  const entities = useGameEntitiesInternal();
  return entities.get(id);
}

// ── Scene infrastructure queries ──

import type { SceneSky, SceneSun, SceneMissionArea } from "../scene/types";

// Scene infrastructure selectors use Object.is equality (default) on the
// extracted data object — these are set once and referentially stable, so
// the hooks won't re-render when unrelated (dynamic) entities update.

function selectSkyData(state: GameEntityState): SceneSky | null {
  const entities = state.isStreaming
    ? state.streamEntities
    : state.missionEntities;
  for (const e of entities.values()) {
    if (e.renderType === "Sky") return e.skyData;
  }
  return null;
}

function selectSunData(state: GameEntityState): SceneSun | null {
  const entities = state.isStreaming
    ? state.streamEntities
    : state.missionEntities;
  for (const e of entities.values()) {
    if (e.renderType === "Sun") return e.sunData;
  }
  return null;
}

function selectMissionAreaData(
  state: GameEntityState,
): SceneMissionArea | null {
  const entities = state.isStreaming
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
    const entities = state.isStreaming
      ? state.streamEntities
      : state.missionEntities;
    return entities.get(entityId)?.debugHidden ?? false;
  });
}

/** Hook returning the mission display name (e.g. "Scarabrae"). */
export function useMissionDisplayName(): string | null {
  return useStoreWithEqualityFn(
    gameEntityStore,
    (state) => state.missionDisplayName,
  );
}

/** Hook returning the game class name (e.g. "CTFGame"). */
export function useGameClassName(): string | null {
  return useStoreWithEqualityFn(
    gameEntityStore,
    (state) => state.gameClassName,
  );
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

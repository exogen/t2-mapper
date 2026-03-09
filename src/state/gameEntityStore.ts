import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { GameEntity, RenderType } from "./gameEntityTypes";

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
  /** Monotonically increasing version counter, bumped on any mutation. */
  version: number;

  // ── Mission entity mutations ──
  setEntity(entity: GameEntity): void;
  deleteEntity(id: string): void;
  setEntities(entities: GameEntity[]): void;
  setAllEntities(entities: GameEntity[]): void;
  clearEntities(): void;

  // ── Stream entity mutations ──
  /** Begin streaming mode. Stream entities will be rendered instead of mission entities. */
  beginStreaming(): void;
  /** End streaming mode and clear stream entities. Mission entities become active again. */
  endStreaming(): void;
  setStreamEntity(entity: GameEntity): void;
  deleteStreamEntity(id: string): void;
  setStreamEntities(entities: GameEntity[]): void;
  setAllStreamEntities(entities: GameEntity[]): void;
  clearStreamEntities(): void;
}

export const gameEntityStore = createStore<GameEntityState>()((set) => ({
  missionEntities: new Map(),
  streamEntities: new Map(),
  isStreaming: false,
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
    set(() => {
      const next = new Map<string, GameEntity>();
      for (const entity of entities) {
        next.set(entity.id, entity);
      }
      return { missionEntities: next };
    });
  },

  clearEntities() {
    set((state) => {
      if (state.missionEntities.size === 0) return state;
      return { missionEntities: new Map(), version: state.version + 1 };
    });
  },

  // ── Stream entity mutations ──

  beginStreaming() {
    set((state) => {
      if (state.isStreaming) return state;
      return { isStreaming: true, streamEntities: new Map(), version: state.version + 1 };
    });
  },

  endStreaming() {
    set((state) => {
      if (!state.isStreaming) return state;
      return { isStreaming: false, streamEntities: new Map(), version: state.version + 1 };
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
      const prev = state.streamEntities;
      const next = new Map<string, GameEntity>();
      for (const entity of entities) {
        next.set(entity.id, entity);
      }
      // Only update (and bump version) when the entity set changed
      // (adds/removes). Render-field-only updates (threads, colors, etc.)
      // are applied via mutateStreamEntities below instead. This prevents
      // frequent Zustand set() calls from starving React Suspense.
      if (next.size === prev.size && [...next.keys()].every((id) => prev.has(id))) {
        return state; // same set — no store update at all
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
export function useGameEntitiesByRenderType(renderType: RenderType): GameEntity[] {
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

import type {
  SceneSky,
  SceneSun,
  SceneMissionArea,
} from "../scene/types";

// Scene infrastructure selectors use Object.is equality (default) on the
// extracted data object — these are set once and referentially stable, so
// the hooks won't re-render when unrelated (dynamic) entities update.

function selectSkyData(state: GameEntityState): SceneSky | null {
  const entities = state.isStreaming ? state.streamEntities : state.missionEntities;
  for (const e of entities.values()) {
    if (e.renderType === "Sky") return e.skyData;
  }
  return null;
}

function selectSunData(state: GameEntityState): SceneSun | null {
  const entities = state.isStreaming ? state.streamEntities : state.missionEntities;
  for (const e of entities.values()) {
    if (e.renderType === "Sun") return e.sunData;
  }
  return null;
}

function selectMissionAreaData(state: GameEntityState): SceneMissionArea | null {
  const entities = state.isStreaming ? state.streamEntities : state.missionEntities;
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

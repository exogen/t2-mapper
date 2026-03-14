import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { StreamRecording, StreamSnapshot } from "../stream/types";
import type {
  RuntimeMutationEvent,
  TorqueObject,
  TorqueRuntime,
} from "../torqueScript";
import {
  buildSequenceAliasMap,
  type SequenceAliasMap,
} from "../torqueScript/shapeConstructor";

export type PlaybackStatus = "stopped" | "playing" | "paused";

export interface RuntimeSliceState {
  runtime: TorqueRuntime | null;
  sequenceAliases: SequenceAliasMap;
  objectVersionById: Record<number, number>;
  globalVersionByName: Record<string, number>;
  objectIdsByName: Record<string, number>;
  datablockIdsByName: Record<string, number>;
  lastRuntimeTick: number;
}

export interface PlaybackSliceState {
  recording: StreamRecording | null;
  status: PlaybackStatus;
  timeMs: number;
  rate: number;
  durationMs: number;
  streamSnapshot: StreamSnapshot | null;
}

export interface RuntimeTickInfo {
  tick?: number;
}

export interface EngineStoreState {
  runtime: RuntimeSliceState;
  playback: PlaybackSliceState;
  setRuntime(runtime: TorqueRuntime): void;
  clearRuntime(): void;
  applyRuntimeBatch(
    events: RuntimeMutationEvent[],
    tickInfo?: RuntimeTickInfo,
  ): void;
  setRecording(recording: StreamRecording | null): void;
  setPlaybackTime(ms: number): void;
  setPlaybackStatus(status: PlaybackStatus): void;
  setPlaybackRate(rate: number): void;
  setPlaybackStreamSnapshot(snapshot: StreamSnapshot | null): void;
}

function normalizeName(name: string): string {
  return name.toLowerCase();
}

function normalizeGlobalName(name: string): string {
  const normalized = normalizeName(name.trim());
  return normalized.startsWith("$") ? normalized.slice(1) : normalized;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function buildRuntimeIndexes(
  runtime: TorqueRuntime,
): Pick<
  RuntimeSliceState,
  | "objectVersionById"
  | "globalVersionByName"
  | "objectIdsByName"
  | "datablockIdsByName"
> {
  const objectVersionById: Record<number, number> = {};
  const globalVersionByName: Record<string, number> = {};
  const objectIdsByName: Record<string, number> = {};
  const datablockIdsByName: Record<string, number> = {};

  for (const object of runtime.state.objectsById.values()) {
    objectVersionById[object._id] = 0;
    if (object._name) {
      objectIdsByName[normalizeName(object._name)] = object._id;
      if (object._isDatablock) {
        datablockIdsByName[normalizeName(object._name)] = object._id;
      }
    }
  }

  for (const globalName of runtime.state.globals.keys()) {
    globalVersionByName[normalizeGlobalName(globalName)] = 0;
  }

  return {
    objectVersionById,
    globalVersionByName,
    objectIdsByName,
    datablockIdsByName,
  };
}

const initialState: Omit<
  EngineStoreState,
  | "setRuntime"
  | "clearRuntime"
  | "applyRuntimeBatch"
  | "setRecording"
  | "setPlaybackTime"
  | "setPlaybackStatus"
  | "setPlaybackRate"
  | "setPlaybackStreamSnapshot"
> = {
  runtime: {
    runtime: null,
    sequenceAliases: new Map(),
    objectVersionById: {},
    globalVersionByName: {},
    objectIdsByName: {},
    datablockIdsByName: {},
    lastRuntimeTick: 0,
  },
  playback: {
    recording: null,
    status: "stopped",
    timeMs: 0,
    rate: 1,
    durationMs: 0,
    streamSnapshot: null,
  },
};

export const engineStore = createStore<EngineStoreState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setRuntime(runtime: TorqueRuntime) {
      const indexes = buildRuntimeIndexes(runtime);
      const sequenceAliases = buildSequenceAliasMap(runtime);
      set((state) => ({
        ...state,
        runtime: {
          runtime,
          sequenceAliases,
          objectVersionById: indexes.objectVersionById,
          globalVersionByName: indexes.globalVersionByName,
          objectIdsByName: indexes.objectIdsByName,
          datablockIdsByName: indexes.datablockIdsByName,
          lastRuntimeTick: 0,
        },
      }));
    },

    clearRuntime() {
      set((state) => ({
        ...state,
        runtime: {
          runtime: null,
          sequenceAliases: new Map(),
          objectVersionById: {},
          globalVersionByName: {},
          objectIdsByName: {},
          datablockIdsByName: {},
          lastRuntimeTick: 0,
        },
      }));
    },

    applyRuntimeBatch(
      events: RuntimeMutationEvent[],
      tickInfo?: RuntimeTickInfo,
    ) {
      if (events.length === 0) {
        return;
      }

      set((state) => {
        const objectVersionById = { ...state.runtime.objectVersionById };
        const globalVersionByName = { ...state.runtime.globalVersionByName };
        const objectIdsByName = { ...state.runtime.objectIdsByName };
        const datablockIdsByName = { ...state.runtime.datablockIdsByName };

        const bumpVersion = (id: number | undefined | null) => {
          if (id == null) return;
          objectVersionById[id] = (objectVersionById[id] ?? 0) + 1;
        };

        for (const event of events) {
          if (event.type === "object.created") {
            const object = event.object;
            bumpVersion(event.objectId);
            if (object._name) {
              const key = normalizeName(object._name);
              objectIdsByName[key] = event.objectId;
              if (object._isDatablock) {
                datablockIdsByName[key] = event.objectId;
              }
            }
            bumpVersion(object._parent?._id);
            continue;
          }

          if (event.type === "object.deleted") {
            const object = event.object;
            delete objectVersionById[event.objectId];
            if (object?._name) {
              const key = normalizeName(object._name);
              delete objectIdsByName[key];
              if (object._isDatablock) {
                delete datablockIdsByName[key];
              }
            }
            bumpVersion(object?._parent?._id);
            continue;
          }

          if (event.type === "field.changed") {
            bumpVersion(event.objectId);
            continue;
          }

          if (event.type === "global.changed") {
            const globalName = normalizeGlobalName(event.name);
            globalVersionByName[globalName] =
              (globalVersionByName[globalName] ?? 0) + 1;
            continue;
          }
        }

        const tick =
          tickInfo?.tick ??
          (state.runtime.lastRuntimeTick > 0
            ? state.runtime.lastRuntimeTick + 1
            : 1);

        return {
          ...state,
          runtime: {
            ...state.runtime,
            objectVersionById,
            globalVersionByName,
            objectIdsByName,
            datablockIdsByName,
            lastRuntimeTick: tick,
          },
        };
      });
    },

    setRecording(recording: StreamRecording | null) {
      const durationMs = Math.max(0, (recording?.duration ?? 0) * 1000);
      set((state) => ({
        ...state,
        playback: {
          recording,
          status: recording ? "stopped" : state.playback.status,
          timeMs: recording ? 0 : state.playback.timeMs,
          rate: recording ? 1 : state.playback.rate,
          durationMs,
          // Preserve the last snapshot so HUD/chat persist after unload.
          streamSnapshot: recording ? null : state.playback.streamSnapshot,
        },
      }));
    },

    setPlaybackTime(ms: number) {
      set((state) => {
        const clamped = clamp(ms, 0, state.playback.durationMs);
        return {
          ...state,
          playback: {
            ...state.playback,
            timeMs: clamped,
          },
        };
      });
    },

    setPlaybackStatus(status: PlaybackStatus) {
      set((state) => ({
        ...state,
        playback: {
          ...state.playback,
          status,
        },
      }));
    },

    setPlaybackRate(rate: number) {
      const nextRate = Number.isFinite(rate) ? clamp(rate, 0.01, 16) : 1;
      set((state) => ({
        ...state,
        playback: {
          ...state.playback,
          rate: nextRate,
        },
      }));
    },

    setPlaybackStreamSnapshot(snapshot: StreamSnapshot | null) {
      set((state) => ({
        ...state,
        playback: {
          ...state.playback,
          streamSnapshot: snapshot,
        },
      }));
    },
  })),
);

// ── Rate-scaled effect clock ──
//
// A monotonic clock that advances by (frameDelta × playbackRate) each frame.
// Components use effectNow() instead of performance.now() so that effect
// timers (explosions, particles, shockwaves, animation threads) automatically
// pause when the demo is paused and speed up / slow down with the playback
// rate. The StreamingController component calls advanceEffectClock()
// once per frame.

let _effectClockMs = 0;

/**
 * Returns the current effect clock value in milliseconds.
 * Analogous to performance.now() but only advances when playing,
 * scaled by the playback rate.
 */
export function effectNow(): number {
  return _effectClockMs;
}

/**
 * Advance the effect clock. Called once per frame from
 * StreamingController before other useFrame callbacks run.
 */
export function advanceEffectClock(deltaSec: number, rate: number): void {
  _effectClockMs += deltaSec * rate * 1000;
}

/** Reset the effect clock (call when demo recording changes or stops). */
export function resetEffectClock(): void {
  _effectClockMs = 0;
}

// Reset on stop.
engineStore.subscribe(
  (state) => state.playback.status,
  (status) => {
    if (status === "stopped") {
      resetEffectClock();
    }
  },
);

export function useEngineStoreApi() {
  return engineStore;
}

export function useEngineSelector<T>(
  selector: (state: EngineStoreState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(engineStore, selector, equality);
}

export function useRuntimeObjectById(
  id: number | undefined,
): TorqueObject | undefined {
  const runtime = useEngineSelector((state) => state.runtime.runtime);
  const version = useEngineSelector((state) =>
    id == null ? -1 : (state.runtime.objectVersionById[id] ?? -1),
  );

  if (id == null || !runtime || version === -1) {
    return undefined;
  }
  const object = runtime.state.objectsById.get(id);
  return object ? { ...object } : undefined;
}

export function useRuntimeObjectField<T = any>(
  id: number | undefined,
  fieldName: string,
): T | undefined {
  const runtime = useEngineSelector((state) => state.runtime.runtime);
  const normalizedField = normalizeName(fieldName);
  useEngineSelector((state) =>
    id == null ? -1 : (state.runtime.objectVersionById[id] ?? -1),
  );

  if (id == null || !runtime) {
    return undefined;
  }
  const object = runtime.state.objectsById.get(id);
  if (!object) {
    return undefined;
  }
  return object[normalizedField] as T;
}

export function useRuntimeGlobal<T = any>(
  name: string | undefined,
): T | undefined {
  const runtime = useEngineSelector((state) => state.runtime.runtime);
  const normalizedName = name ? normalizeGlobalName(name) : "";
  useEngineSelector((state) =>
    normalizedName
      ? (state.runtime.globalVersionByName[normalizedName] ?? -1)
      : -1,
  );

  if (!runtime || !normalizedName) {
    return undefined;
  }
  return runtime.$g.get(normalizedName) as T;
}

export function useRuntimeObjectByName(
  name: string | undefined,
): TorqueObject | undefined {
  const runtime = useEngineSelector((state) => state.runtime.runtime);
  const normalizedName = name ? normalizeName(name) : "";
  const objectId = useEngineSelector((state) =>
    normalizedName ? state.runtime.objectIdsByName[normalizedName] : undefined,
  );
  const version = useEngineSelector((state) =>
    objectId == null ? -1 : (state.runtime.objectVersionById[objectId] ?? -1),
  );

  if (!runtime || !normalizedName || objectId == null || version === -1) {
    return undefined;
  }
  const object = runtime.state.objectsById.get(objectId);
  return object ? { ...object } : undefined;
}

export function useDatablockByName(
  name: string | undefined,
): TorqueObject | undefined {
  const runtime = useEngineSelector((state) => state.runtime.runtime);
  const normalizedName = name ? normalizeName(name) : "";
  const objectId = useEngineSelector((state) =>
    normalizedName
      ? state.runtime.datablockIdsByName[normalizedName]
      : undefined,
  );
  const version = useEngineSelector((state) =>
    objectId == null ? -1 : (state.runtime.objectVersionById[objectId] ?? -1),
  );

  if (!runtime || !normalizedName || objectId == null || version === -1) {
    return undefined;
  }
  const object = runtime.state.objectsById.get(objectId);
  return object ? { ...object } : undefined;
}

export function useRuntimeChildIds(
  parentId: number | undefined,
  fallbackChildren: readonly TorqueObject[] = [],
): number[] {
  const runtime = useEngineSelector((state) => state.runtime.runtime);
  const version = useEngineSelector((state) =>
    parentId == null ? -1 : (state.runtime.objectVersionById[parentId] ?? -1),
  );

  if (parentId == null) {
    return fallbackChildren.map((child) => child._id);
  }

  if (!runtime || version === -1) {
    return fallbackChildren.map((child) => child._id);
  }

  const parent = runtime.state.objectsById.get(parentId);
  if (!parent?._children) {
    return [];
  }

  return parent._children.map((child) => child._id);
}

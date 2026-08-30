import { useMemo } from "react";
import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { StreamRecording } from "../stream/types";
import { setStreamSnapshot } from "./streamSnapshotStore";
import { demoLoadStore } from "./demoLoadStore";
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
  /** Seek target in seconds. Written by UI seek actions, read by
   *  StreamingController to detect and execute seeks. */
  seekTime: number;
  /** Bumped on EVERY seekPlayback call. The controller keys seek
   *  detection on this, not on seekTime equality — two seeks to the
   *  same position (click the same spot twice, or a deferred-commit
   *  scrub released where it started) must both execute. */
  seekNonce: number;
  rate: number;
  durationMs: number;
  /**
   * False while a progressive demo download is still running. Seeks
   * into the not-yet-downloaded region become pending (below) instead
   * of executing; seeks within the buffered region work normally.
   */
  downloadComplete: boolean;
  /**
   * A seek requested beyond the downloaded frontier, waiting for the
   * buffer to reach it — fulfilled by fulfillPendingSeek() as the
   * download progresses (the play button shows a wait indicator).
   */
  pendingSeekSec: number | null;
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
  setDownloadComplete(complete: boolean): void;
  seekPlayback(timeSec: number): void;
  /** Execute the pending beyond-the-buffer seek once fulfillable. */
  fulfillPendingSeek(): void;
  setPlaybackStatus(status: PlaybackStatus): void;
  setPlaybackRate(rate: number): void;
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
  | "setDownloadComplete"
  | "seekPlayback"
  | "fulfillPendingSeek"
  | "setPlaybackStatus"
  | "setPlaybackRate"
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
    seekTime: 0,
    seekNonce: 0,
    rate: 1,
    durationMs: 0,
    downloadComplete: true,
    pendingSeekSec: null,
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

      // method.called events don't touch any index this store maintains
      // (method hooks fire in the runtime itself). Batches containing only
      // them — e.g. a script's recurring schedule() timer — would copy the
      // full object indexes and notify every subscriber for nothing.
      if (events.every((event) => event.type === "method.called")) {
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
      // Reset the snapshot on new recordings; preserve it on unload so
      // HUD/chat persist. (The snapshot lives in streamSnapshotStore.)
      if (recording) {
        setStreamSnapshot(null);
      }
      set((state) => ({
        ...state,
        playback: {
          recording,
          status: recording ? "stopped" : state.playback.status,
          seekTime: recording ? 0 : state.playback.seekTime,
          // Monotonic across recordings; the controller re-syncs its
          // ref at mount, so this never reads as a phantom seek.
          seekNonce: state.playback.seekNonce,
          rate: recording ? 1 : state.playback.rate,
          durationMs,
          // A progressively-loading recording reports incomplete; the
          // loader flips this via setDownloadComplete when it finishes.
          downloadComplete:
            recording?.streamingPlayback?.streamComplete !== false,
          pendingSeekSec: null,
        },
      }));
    },

    setDownloadComplete(complete: boolean) {
      set((state) => ({
        ...state,
        playback: { ...state.playback, downloadComplete: complete },
      }));
    },

    seekPlayback(timeSec: number) {
      set((state) => {
        const target = clamp(timeSec, 0, state.playback.durationMs / 1000);
        // A seek past the downloaded frontier can't execute yet — park
        // it as pending; the loader fulfills it as the buffer catches
        // up. Seeks within the buffered region run immediately (and
        // supersede any pending request).
        if (!state.playback.downloadComplete) {
          const buffered = demoLoadStore.getState().downloadedSec ?? 0;
          if (target > buffered) {
            return {
              ...state,
              playback: { ...state.playback, pendingSeekSec: target },
            };
          }
        }
        return {
          ...state,
          playback: {
            ...state.playback,
            seekTime: target,
            seekNonce: state.playback.seekNonce + 1,
            pendingSeekSec: null,
          },
        };
      });
    },

    fulfillPendingSeek() {
      set((state) => {
        const pending = state.playback.pendingSeekSec;
        if (pending == null) return state;
        const buffered = demoLoadStore.getState().downloadedSec ?? 0;
        if (!state.playback.downloadComplete && buffered < pending) {
          return state;
        }
        return {
          ...state,
          playback: {
            ...state.playback,
            seekTime: pending,
            seekNonce: state.playback.seekNonce + 1,
            pendingSeekSec: null,
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

  return useMemo(() => {
    if (id == null || !runtime || version === -1) return undefined;
    const object = runtime.state.objectsById.get(id);
    return object ? { ...object } : undefined;
  }, [id, runtime, version]);
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

  return useMemo(() => {
    if (!runtime || !normalizedName || objectId == null || version === -1) {
      return undefined;
    }
    const object = runtime.state.objectsById.get(objectId);
    return object ? { ...object } : undefined;
  }, [runtime, normalizedName, objectId, version]);
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

  return useMemo(() => {
    if (!runtime || !normalizedName || objectId == null || version === -1) {
      return undefined;
    }
    const object = runtime.state.objectsById.get(objectId);
    return object ? { ...object } : undefined;
  }, [runtime, normalizedName, objectId, version]);
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

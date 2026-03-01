import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { DemoEntity, DemoRecording, DemoStreamSnapshot } from "../demo/types";
import type {
  RuntimeEvent,
  RuntimeMutationEvent,
  TorqueObject,
  TorqueRuntime,
} from "../torqueScript";

export type PlaybackStatus = "stopped" | "playing" | "paused";

export type PlaybackDiagnosticMetaValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export interface PlaybackDiagnosticEvent {
  t: number;
  kind: string;
  message?: string;
  playbackStatus: PlaybackStatus;
  playbackTimeMs: number;
  frameCursor: number;
  streamEntityCount: number;
  streamCameraMode: string | null;
  streamExhausted: boolean;
  meta?: Record<string, PlaybackDiagnosticMetaValue>;
}

export interface RendererDiagnosticsSample {
  t: number;
  playbackStatus: PlaybackStatus;
  playbackTimeMs: number;
  frameCursor: number;
  streamEntityCount: number;
  streamCameraMode: string | null;
  streamExhausted: boolean;
  geometries: number;
  textures: number;
  programs: number;
  renderCalls: number;
  renderTriangles: number;
  renderPoints: number;
  renderLines: number;
  sceneObjects: number;
  visibleSceneObjects: number;
  jsHeapUsed?: number;
  jsHeapTotal?: number;
  jsHeapLimit?: number;
}

export interface RecordPlaybackDiagnosticEventInput {
  kind: string;
  message?: string;
  meta?: Record<string, PlaybackDiagnosticMetaValue>;
}

export interface AppendRendererSampleInput {
  t?: number;
  geometries: number;
  textures: number;
  programs: number;
  renderCalls: number;
  renderTriangles: number;
  renderPoints: number;
  renderLines: number;
  sceneObjects: number;
  visibleSceneObjects: number;
  jsHeapUsed?: number;
  jsHeapTotal?: number;
  jsHeapLimit?: number;
}

export interface RuntimeSliceState {
  runtime: TorqueRuntime | null;
  objectVersionById: Record<number, number>;
  globalVersionByName: Record<string, number>;
  objectIdsByName: Record<string, number>;
  datablockIdsByName: Record<string, number>;
  lastRuntimeTick: number;
}

export interface WorldSliceState {
  entitiesById: Record<string, DemoEntity>;
  players: string[];
  ghosts: string[];
  projectiles: string[];
  flags: string[];
  teams: Record<string, { score: number }>;
  scores: Record<string, number>;
}

export interface PlaybackSliceState {
  recording: DemoRecording | null;
  status: PlaybackStatus;
  timeMs: number;
  rate: number;
  frameCursor: number;
  durationMs: number;
  streamSnapshot: DemoStreamSnapshot | null;
}

export interface DiagnosticsSliceState {
  eventCounts: Record<RuntimeEvent["type"], number>;
  recentEvents: RuntimeEvent[];
  maxRecentEvents: number;
  webglContextLost: boolean;
  playbackEvents: PlaybackDiagnosticEvent[];
  maxPlaybackEvents: number;
  rendererSamples: RendererDiagnosticsSample[];
  maxRendererSamples: number;
}

export interface RuntimeTickInfo {
  tick?: number;
}

export interface EngineStoreState {
  runtime: RuntimeSliceState;
  world: WorldSliceState;
  playback: PlaybackSliceState;
  diagnostics: DiagnosticsSliceState;
  setRuntime(runtime: TorqueRuntime): void;
  clearRuntime(): void;
  applyRuntimeBatch(events: RuntimeMutationEvent[], tickInfo?: RuntimeTickInfo): void;
  setDemoRecording(recording: DemoRecording | null): void;
  setPlaybackTime(ms: number): void;
  setPlaybackStatus(status: PlaybackStatus): void;
  setPlaybackRate(rate: number): void;
  setPlaybackFrameCursor(frameCursor: number): void;
  setPlaybackStreamSnapshot(snapshot: DemoStreamSnapshot | null): void;
  setWebglContextLost(lost: boolean): void;
  recordPlaybackDiagnosticEvent(
    input: RecordPlaybackDiagnosticEventInput,
  ): void;
  appendRendererSample(input: AppendRendererSampleInput): void;
  clearPlaybackDiagnostics(): void;
}

function normalizeName(name: string): string {
  return name.toLowerCase();
}

function normalizeGlobalName(name: string): string {
  const normalized = normalizeName(name.trim());
  return normalized.startsWith("$") ? normalized.slice(1) : normalized;
}

function keyFromEntityId(id: number | string): string {
  return String(id);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function summarizeCallStack(skipFrames = 0): string | null {
  const stack = new Error().stack;
  if (!stack) return null;
  const lines = stack
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const callsiteLines = lines.slice(1 + skipFrames, 9 + skipFrames);
  return callsiteLines.length > 0 ? callsiteLines.join(" <= ") : null;
}

function initialDiagnosticsCounts(): Record<RuntimeEvent["type"], number> {
  return {
    "object.created": 0,
    "object.deleted": 0,
    "field.changed": 0,
    "method.called": 0,
    "global.changed": 0,
    "batch.flushed": 0,
  };
}

function projectWorldFromDemo(recording: DemoRecording | null): WorldSliceState {
  if (!recording) {
    return {
      entitiesById: {},
      players: [],
      ghosts: [],
      projectiles: [],
      flags: [],
      teams: {},
      scores: {},
    };
  }

  const entitiesById: Record<string, DemoEntity> = {};
  const players: string[] = [];
  const ghosts: string[] = [];
  const projectiles: string[] = [];
  const flags: string[] = [];

  for (const entity of recording.entities) {
    const entityId = keyFromEntityId(entity.id);
    entitiesById[entityId] = entity;

    const type = entity.type.toLowerCase();
    if (type === "player") {
      players.push(entityId);
      if (entityId.startsWith("player_")) {
        ghosts.push(entityId);
      }
      continue;
    }
    if (type === "projectile") {
      projectiles.push(entityId);
      continue;
    }

    if (
      entity.dataBlock?.toLowerCase() === "flag" ||
      entity.dataBlock?.toLowerCase().includes("flag")
    ) {
      flags.push(entityId);
    }
  }

  return {
    entitiesById,
    players,
    ghosts,
    projectiles,
    flags,
    teams: {},
    scores: {},
  };
}

function buildRuntimeIndexes(runtime: TorqueRuntime): Pick<
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
  | "setDemoRecording"
  | "setPlaybackTime"
  | "setPlaybackStatus"
  | "setPlaybackRate"
  | "setPlaybackFrameCursor"
  | "setPlaybackStreamSnapshot"
  | "setWebglContextLost"
  | "recordPlaybackDiagnosticEvent"
  | "appendRendererSample"
  | "clearPlaybackDiagnostics"
> = {
  runtime: {
    runtime: null,
    objectVersionById: {},
    globalVersionByName: {},
    objectIdsByName: {},
    datablockIdsByName: {},
    lastRuntimeTick: 0,
  },
  world: {
    entitiesById: {},
    players: [],
    ghosts: [],
    projectiles: [],
    flags: [],
    teams: {},
    scores: {},
  },
  playback: {
    recording: null,
    status: "stopped",
    timeMs: 0,
    rate: 1,
    frameCursor: 0,
    durationMs: 0,
    streamSnapshot: null,
  },
  diagnostics: {
    eventCounts: initialDiagnosticsCounts(),
    recentEvents: [],
    maxRecentEvents: 200,
    webglContextLost: false,
    playbackEvents: [],
    maxPlaybackEvents: 400,
    rendererSamples: [],
    maxRendererSamples: 2400,
  },
};

export const engineStore = createStore<EngineStoreState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setRuntime(runtime: TorqueRuntime) {
      const indexes = buildRuntimeIndexes(runtime);
      set((state) => ({
        ...state,
        runtime: {
          runtime,
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
          objectVersionById: {},
          globalVersionByName: {},
          objectIdsByName: {},
          datablockIdsByName: {},
          lastRuntimeTick: 0,
        },
      }));
    },

    applyRuntimeBatch(events: RuntimeMutationEvent[], tickInfo?: RuntimeTickInfo) {
      if (events.length === 0) {
        return;
      }

      set((state) => {
        const objectVersionById = { ...state.runtime.objectVersionById };
        const globalVersionByName = { ...state.runtime.globalVersionByName };
        const objectIdsByName = { ...state.runtime.objectIdsByName };
        const datablockIdsByName = { ...state.runtime.datablockIdsByName };
        const eventCounts = { ...state.diagnostics.eventCounts };
        const recentEvents = [...state.diagnostics.recentEvents];

        const bumpVersion = (id: number | undefined | null) => {
          if (id == null) return;
          objectVersionById[id] = (objectVersionById[id] ?? 0) + 1;
        };

        for (const event of events) {
          eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
          recentEvents.push(event);

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
        const batchEvent: RuntimeEvent = {
          type: "batch.flushed",
          tick,
          events,
        };
        eventCounts["batch.flushed"] += 1;
        recentEvents.push(batchEvent);

        const maxRecentEvents = state.diagnostics.maxRecentEvents;
        const boundedRecentEvents =
          recentEvents.length > maxRecentEvents
            ? recentEvents.slice(recentEvents.length - maxRecentEvents)
            : recentEvents;

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
          diagnostics: {
            ...state.diagnostics,
            eventCounts,
            recentEvents: boundedRecentEvents,
          },
        };
      });
    },

    setDemoRecording(recording: DemoRecording | null) {
      const durationMs = Math.max(0, (recording?.duration ?? 0) * 1000);
      const stack = summarizeCallStack(1);
      set((state) => {
        const snapshot = state.playback.streamSnapshot;
        const previousRecording = state.playback.recording;
        const event: PlaybackDiagnosticEvent = {
          t: Date.now(),
          kind: "recording.set",
          message: "setDemoRecording invoked",
          playbackStatus: state.playback.status,
          playbackTimeMs: state.playback.timeMs,
          frameCursor: state.playback.frameCursor,
          streamEntityCount: snapshot?.entities.length ?? 0,
          streamCameraMode: snapshot?.camera?.mode ?? null,
          streamExhausted: snapshot?.exhausted ?? false,
          meta: {
            previousMissionName: previousRecording?.missionName ?? null,
            nextMissionName: recording?.missionName ?? null,
            previousDurationSec: previousRecording
              ? Number(previousRecording.duration.toFixed(3))
              : null,
            nextDurationSec: recording ? Number(recording.duration.toFixed(3)) : null,
            isNull: recording == null,
            isMetadataOnly: !!recording?.isMetadataOnly,
            isPartial: !!recording?.isPartial,
            hasStreamingPlayback: !!recording?.streamingPlayback,
            stack: stack ?? "unavailable",
          },
        };
        return {
          ...state,
          world: projectWorldFromDemo(recording),
          playback: {
            recording,
            status: "stopped",
            timeMs: 0,
            rate: 1,
            frameCursor: 0,
            durationMs,
            streamSnapshot: null,
          },
          diagnostics: {
            ...state.diagnostics,
            webglContextLost: false,
            playbackEvents: [event],
            rendererSamples: [],
          },
        };
      });
    },

    setPlaybackTime(ms: number) {
      set((state) => {
        const clamped = clamp(ms, 0, state.playback.durationMs);
        return {
          ...state,
          playback: {
            ...state.playback,
            timeMs: clamped,
            frameCursor: clamped,
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

    setPlaybackFrameCursor(frameCursor: number) {
      const nextCursor = Number.isFinite(frameCursor) ? frameCursor : 0;
      set((state) => ({
        ...state,
        playback: {
          ...state.playback,
          frameCursor: nextCursor,
        },
      }));
    },

    setPlaybackStreamSnapshot(snapshot: DemoStreamSnapshot | null) {
      set((state) => ({
        ...state,
        playback: {
          ...state.playback,
          streamSnapshot: snapshot,
        },
      }));
    },

    setWebglContextLost(lost: boolean) {
      set((state) => ({
        ...state,
        diagnostics: {
          ...state.diagnostics,
          webglContextLost: lost,
        },
      }));
    },

    recordPlaybackDiagnosticEvent(input: RecordPlaybackDiagnosticEventInput) {
      set((state) => {
        const snapshot = state.playback.streamSnapshot;
        const nextEvent: PlaybackDiagnosticEvent = {
          t: Date.now(),
          kind: input.kind,
          message: input.message,
          playbackStatus: state.playback.status,
          playbackTimeMs: state.playback.timeMs,
          frameCursor: state.playback.frameCursor,
          streamEntityCount: snapshot?.entities.length ?? 0,
          streamCameraMode: snapshot?.camera?.mode ?? null,
          streamExhausted: snapshot?.exhausted ?? false,
          meta: input.meta,
        };
        const playbackEvents = [
          ...state.diagnostics.playbackEvents,
          nextEvent,
        ];
        const maxPlaybackEvents = state.diagnostics.maxPlaybackEvents;
        const boundedPlaybackEvents =
          playbackEvents.length > maxPlaybackEvents
            ? playbackEvents.slice(playbackEvents.length - maxPlaybackEvents)
            : playbackEvents;
        return {
          ...state,
          diagnostics: {
            ...state.diagnostics,
            playbackEvents: boundedPlaybackEvents,
          },
        };
      });
    },

    appendRendererSample(input: AppendRendererSampleInput) {
      set((state) => {
        const snapshot = state.playback.streamSnapshot;
        const nextSample: RendererDiagnosticsSample = {
          t: input.t ?? Date.now(),
          playbackStatus: state.playback.status,
          playbackTimeMs: state.playback.timeMs,
          frameCursor: state.playback.frameCursor,
          streamEntityCount: snapshot?.entities.length ?? 0,
          streamCameraMode: snapshot?.camera?.mode ?? null,
          streamExhausted: snapshot?.exhausted ?? false,
          geometries: input.geometries,
          textures: input.textures,
          programs: input.programs,
          renderCalls: input.renderCalls,
          renderTriangles: input.renderTriangles,
          renderPoints: input.renderPoints,
          renderLines: input.renderLines,
          sceneObjects: input.sceneObjects,
          visibleSceneObjects: input.visibleSceneObjects,
          jsHeapUsed: input.jsHeapUsed,
          jsHeapTotal: input.jsHeapTotal,
          jsHeapLimit: input.jsHeapLimit,
        };
        const rendererSamples = [
          ...state.diagnostics.rendererSamples,
          nextSample,
        ];
        const maxRendererSamples = state.diagnostics.maxRendererSamples;
        const boundedRendererSamples =
          rendererSamples.length > maxRendererSamples
            ? rendererSamples.slice(rendererSamples.length - maxRendererSamples)
            : rendererSamples;
        return {
          ...state,
          diagnostics: {
            ...state.diagnostics,
            rendererSamples: boundedRendererSamples,
          },
        };
      });
    },

    clearPlaybackDiagnostics() {
      set((state) => ({
        ...state,
        diagnostics: {
          ...state.diagnostics,
          webglContextLost: false,
          playbackEvents: [],
          rendererSamples: [],
        },
      }));
    },
  })),
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

export function usePlaybackTimeSeconds(): number {
  return useEngineSelector((state) => state.playback.timeMs / 1000);
}

export function useWorldEntity(
  entityId: number | string | undefined,
): DemoEntity | undefined {
  const key = entityId == null ? "" : keyFromEntityId(entityId);
  return useEngineSelector((state) =>
    key ? state.world.entitiesById[key] : undefined,
  );
}

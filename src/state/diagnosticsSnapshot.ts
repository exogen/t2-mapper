import type { EngineStoreState } from "./engineStore";
import type { RuntimeEvent } from "../torqueScript";

interface BuildDiagnosticsSnapshotOptions {
  maxRuntimeEvents?: number;
  maxPlaybackEvents?: number;
  maxRendererSamples?: number;
  maxStreamEntities?: number;
}

type JsonLike = unknown;

const defaultOptions: Required<BuildDiagnosticsSnapshotOptions> = {
  maxRuntimeEvents: 80,
  maxPlaybackEvents: 200,
  maxRendererSamples: 1200,
  maxStreamEntities: 40,
};

function summarizeTorqueObject(value: any): JsonLike {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    kind: "TorqueObject",
    id: typeof value._id === "number" ? value._id : null,
    className: typeof value._className === "string" ? value._className : null,
    class: typeof value._class === "string" ? value._class : null,
    name: typeof value._name === "string" ? value._name : null,
    isDatablock: !!value._isDatablock,
    parentId:
      value._parent && typeof value._parent._id === "number"
        ? value._parent._id
        : null,
    childCount: Array.isArray(value._children) ? value._children.length : 0,
  };
}

function createJsonSafeValueSummarizer() {
  const seen = new WeakSet<object>();

  function summarize(value: any, depth = 0): JsonLike {
    if (value == null) {
      return value as null | undefined;
    }
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      return value;
    }
    if (t === "bigint") {
      return value.toString();
    }
    if (t === "function") {
      return `[Function ${value.name || "anonymous"}]`;
    }
    if (t !== "object") {
      return String(value);
    }

    if ("_id" in value && "_className" in value) {
      return summarizeTorqueObject(value);
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      if (depth >= 2) {
        return {
          kind: "Array",
          length: value.length,
        };
      }
      const sample = value.slice(0, 8).map((entry) => summarize(entry, depth + 1));
      return {
        kind: "Array",
        length: value.length,
        sample,
      };
    }

    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    if (depth >= 2) {
      return {
        kind: value?.constructor?.name ?? "Object",
      };
    }

    const keys = Object.keys(value).slice(0, 12);
    const summary: Record<string, JsonLike> = {};
    for (const key of keys) {
      try {
        summary[key] = summarize(value[key], depth + 1);
      } catch (error) {
        summary[key] = `[Unserializable: ${(error as Error).message}]`;
      }
    }
    if (Object.keys(value).length > keys.length) {
      summary.__truncatedKeys = Object.keys(value).length - keys.length;
    }
    return summary;
  }

  return summarize;
}

function summarizeRuntimeEvent(
  event: RuntimeEvent,
  summarizeValue: (value: any, depth?: number) => JsonLike,
): JsonLike {
  if (event.type === "object.created") {
    return {
      type: event.type,
      objectId: event.objectId,
      object: summarizeTorqueObject(event.object),
    };
  }
  if (event.type === "object.deleted") {
    return {
      type: event.type,
      objectId: event.objectId,
      object: summarizeTorqueObject(event.object),
    };
  }
  if (event.type === "field.changed") {
    return {
      type: event.type,
      objectId: event.objectId,
      field: event.field,
      value: summarizeValue(event.value),
      previousValue: summarizeValue(event.previousValue),
      object: summarizeTorqueObject(event.object),
    };
  }
  if (event.type === "method.called") {
    return {
      type: event.type,
      className: event.className,
      methodName: event.methodName,
      objectId: event.objectId ?? null,
      args: summarizeValue(event.args),
    };
  }
  if (event.type === "global.changed") {
    return {
      type: event.type,
      name: event.name,
      value: summarizeValue(event.value),
      previousValue: summarizeValue(event.previousValue),
    };
  }
  if (event.type === "batch.flushed") {
    const byType: Record<string, number> = {};
    for (const mutation of event.events) {
      byType[mutation.type] = (byType[mutation.type] ?? 0) + 1;
    }
    return {
      type: event.type,
      tick: event.tick,
      eventCount: event.events.length,
      byType,
    };
  }
  return {
    type: "unknown",
  };
}

function summarizeStreamSnapshot(
  state: EngineStoreState,
  maxStreamEntities: number,
): JsonLike {
  const snapshot = state.playback.streamSnapshot;
  if (!snapshot) {
    return null;
  }

  const entitiesByType: Record<string, number> = {};
  const visualsByKind: Record<string, number> = {};

  for (const entity of snapshot.entities) {
    const type = entity.type || "Unknown";
    entitiesByType[type] = (entitiesByType[type] ?? 0) + 1;
    if (entity.visual?.kind) {
      visualsByKind[entity.visual.kind] = (visualsByKind[entity.visual.kind] ?? 0) + 1;
    }
  }

  const entitySample = snapshot.entities.slice(0, maxStreamEntities).map((entity) => ({
    id: entity.id,
    type: entity.type,
    dataBlock: entity.dataBlock ?? null,
    className: entity.className ?? null,
    ghostIndex: entity.ghostIndex ?? null,
    dataBlockId: entity.dataBlockId ?? null,
    shapeHint: entity.shapeHint ?? null,
    visualKind: entity.visual?.kind ?? null,
    hasPosition: !!entity.position,
    hasRotation: !!entity.rotation,
  }));

  return {
    timeSec: snapshot.timeSec,
    exhausted: snapshot.exhausted,
    cameraMode: snapshot.camera?.mode ?? null,
    controlEntityId: snapshot.camera?.controlEntityId ?? null,
    orbitTargetId: snapshot.camera?.orbitTargetId ?? null,
    controlPlayerGhostId: snapshot.controlPlayerGhostId ?? null,
    entityCount: snapshot.entities.length,
    entitiesByType,
    visualsByKind,
    entitySample,
    status: snapshot.status,
  };
}

function summarizeRecording(state: EngineStoreState): JsonLike {
  const recording = state.playback.recording;
  if (!recording) return null;
  return {
    duration: recording.duration,
    missionName: recording.missionName,
    gameType: recording.gameType,
    hasStreamingPlayback: !!recording.streamingPlayback,
  };
}

function summarizeRuntime(state: EngineStoreState): JsonLike {
  const runtime = state.runtime.runtime;
  if (!runtime) {
    return null;
  }
  return {
    lastRuntimeTick: state.runtime.lastRuntimeTick,
    objectCount: runtime.state.objectsById.size,
    datablockCount: runtime.state.datablocks.size,
    globalCount: runtime.state.globals.size,
    activePackageCount: runtime.state.activePackages.length,
    executedScriptCount: runtime.state.executedScripts.size,
    failedScriptCount: runtime.state.failedScripts.size,
  };
}

function summarizeRendererTrend(samples: EngineStoreState["diagnostics"]["rendererSamples"]) {
  if (samples.length < 2) {
    return null;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  return {
    sampleCount: samples.length,
    durationSec: Number(((last.t - first.t) / 1000).toFixed(3)),
    geometriesDelta: last.geometries - first.geometries,
    texturesDelta: last.textures - first.textures,
    programsDelta: last.programs - first.programs,
    sceneObjectsDelta: last.sceneObjects - first.sceneObjects,
    visibleSceneObjectsDelta: last.visibleSceneObjects - first.visibleSceneObjects,
    renderCallsDelta: last.renderCalls - first.renderCalls,
  };
}

function countPlaybackEventsByKind(
  events: EngineStoreState["diagnostics"]["playbackEvents"],
): Record<string, number> {
  const byKind: Record<string, number> = {};
  for (const event of events) {
    byKind[event.kind] = (byKind[event.kind] ?? 0) + 1;
  }
  return byKind;
}

export function buildSerializableDiagnosticsSnapshot(
  state: EngineStoreState,
  options: BuildDiagnosticsSnapshotOptions = {},
): JsonLike {
  const merged: Required<BuildDiagnosticsSnapshotOptions> = {
    ...defaultOptions,
    ...options,
  };

  const summarizeValue = createJsonSafeValueSummarizer();

  const runtimeEvents = state.diagnostics.recentEvents
    .slice(-merged.maxRuntimeEvents)
    .map((event) => summarizeRuntimeEvent(event, summarizeValue));

  const playbackEvents = state.diagnostics.playbackEvents
    .slice(-merged.maxPlaybackEvents)
    .map((event) => ({
      ...event,
      meta: event.meta ? summarizeValue(event.meta) : undefined,
    }));

  const rendererSamples = state.diagnostics.rendererSamples.slice(
    -merged.maxRendererSamples,
  );

  return {
    generatedAt: new Date().toISOString(),
    playback: {
      status: state.playback.status,
      timeMs: state.playback.timeMs,
      frameCursor: state.playback.frameCursor,
      rate: state.playback.rate,
      durationMs: state.playback.durationMs,
      recording: summarizeRecording(state),
      streamSnapshot: summarizeStreamSnapshot(state, merged.maxStreamEntities),
    },
    runtime: summarizeRuntime(state),
    diagnostics: {
      webglContextLost: state.diagnostics.webglContextLost,
      eventCounts: state.diagnostics.eventCounts,
      playbackEventCount: state.diagnostics.playbackEvents.length,
      rendererSampleCount: state.diagnostics.rendererSamples.length,
      runtimeEventCount: state.diagnostics.recentEvents.length,
      playbackEventsByKind: countPlaybackEventsByKind(
        state.diagnostics.playbackEvents,
      ),
      rendererTrend: summarizeRendererTrend(rendererSamples),
      playbackEvents,
      rendererSamples,
      runtimeEvents,
    },
  };
}

export function buildSerializableDiagnosticsJson(
  state: EngineStoreState,
  options: BuildDiagnosticsSnapshotOptions = {},
): string {
  return JSON.stringify(buildSerializableDiagnosticsSnapshot(state, options), null, 2);
}

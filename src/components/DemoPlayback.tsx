import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useDemoRecording } from "./DemoProvider";
import {
  collectSceneObjectCounts,
  nextLifecycleInstanceId,
} from "../demo/demoPlaybackUtils";
import { StreamingDemoPlayback } from "./DemoPlaybackStreaming";
import { useEngineStoreApi } from "../state";
import type { DemoRecording } from "../demo/types";

let demoPlaybackMountCount = 0;
let demoPlaybackUnmountCount = 0;

function DemoPlaybackDiagnostics({ recording }: { recording: DemoRecording }) {
  const { gl, scene } = useThree();
  const engineStore = useEngineStoreApi();
  const previousSampleRef = useRef<{
    geometries: number;
    textures: number;
    programs: number;
    sceneObjects: number;
    visibleSceneObjects: number;
  } | null>(null);
  const lastSpikeEventMsRef = useRef(0);

  useEffect(() => {
    engineStore.getState().recordPlaybackDiagnosticEvent({
      kind: "recording.loaded",
      meta: {
        missionName: recording.missionName ?? null,
        gameType: recording.gameType ?? null,
        isMetadataOnly: !!recording.isMetadataOnly,
        isPartial: !!recording.isPartial,
        hasStreamingPlayback: !!recording.streamingPlayback,
        durationSec: Number(recording.duration.toFixed(3)),
      },
    });
  }, [engineStore]);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const getIsContextLost = () => {
      try {
        const context = gl.getContext();
        if (
          context &&
          typeof (context as { isContextLost?: () => boolean }).isContextLost ===
            "function"
        ) {
          return !!(
            context as {
              isContextLost: () => boolean;
            }
          ).isContextLost();
        }
      } catch {
        // no-op
      }
      return undefined;
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      const store = engineStore.getState();
      store.setWebglContextLost(true);
      store.recordPlaybackDiagnosticEvent({
        kind: "webgl.context.lost",
        message: "Renderer emitted webglcontextlost",
        meta: {
          contextLost: getIsContextLost(),
        },
      });
      console.error("[demo diagnostics] WebGL context lost");
    };

    const handleContextRestored = () => {
      const store = engineStore.getState();
      store.setWebglContextLost(false);
      store.recordPlaybackDiagnosticEvent({
        kind: "webgl.context.restored",
        message: "Renderer emitted webglcontextrestored",
        meta: {
          contextLost: getIsContextLost(),
        },
      });
      console.warn("[demo diagnostics] WebGL context restored");
    };

    const handleContextCreationError = (event: Event) => {
      const contextEvent = event as Event & { statusMessage?: string };
      engineStore.getState().recordPlaybackDiagnosticEvent({
        kind: "webgl.context.creation_error",
        message: contextEvent.statusMessage ?? "Context creation error",
        meta: {
          contextLost: getIsContextLost(),
        },
      });
      console.error(
        "[demo diagnostics] WebGL context creation error",
        contextEvent.statusMessage ?? "",
      );
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
    canvas.addEventListener(
      "webglcontextcreationerror",
      handleContextCreationError,
      false,
    );

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      canvas.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
        false,
      );
      canvas.removeEventListener(
        "webglcontextcreationerror",
        handleContextCreationError,
        false,
      );
    };
  }, [engineStore, gl]);

  useEffect(() => {
    const collectSample = () => {
      const { sceneObjects, visibleSceneObjects } = collectSceneObjectCounts(scene);
      const programs = Array.isArray((gl.info as any).programs)
        ? (gl.info as any).programs.length
        : 0;
      const perfMemory = (performance as any).memory as
        | {
            usedJSHeapSize?: number;
            totalJSHeapSize?: number;
            jsHeapSizeLimit?: number;
          }
        | undefined;
      const nextSample = {
        t: Date.now(),
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs,
        renderCalls: gl.info.render.calls,
        renderTriangles: gl.info.render.triangles,
        renderPoints: gl.info.render.points,
        renderLines: gl.info.render.lines,
        sceneObjects,
        visibleSceneObjects,
        jsHeapUsed: perfMemory?.usedJSHeapSize,
        jsHeapTotal: perfMemory?.totalJSHeapSize,
        jsHeapLimit: perfMemory?.jsHeapSizeLimit,
      };
      engineStore.getState().appendRendererSample(nextSample);

      const previous = previousSampleRef.current;
      previousSampleRef.current = {
        geometries: nextSample.geometries,
        textures: nextSample.textures,
        programs: nextSample.programs,
        sceneObjects: nextSample.sceneObjects,
        visibleSceneObjects: nextSample.visibleSceneObjects,
      };
      if (!previous) {
        return;
      }

      const now = nextSample.t;
      const geometryDelta = nextSample.geometries - previous.geometries;
      const textureDelta = nextSample.textures - previous.textures;
      const programDelta = nextSample.programs - previous.programs;
      const sceneObjectDelta = nextSample.sceneObjects - previous.sceneObjects;

      if (
        now - lastSpikeEventMsRef.current >= 5000 &&
        (geometryDelta >= 200 ||
          textureDelta >= 100 ||
          programDelta >= 20 ||
          sceneObjectDelta >= 400)
      ) {
        lastSpikeEventMsRef.current = now;
        engineStore.getState().recordPlaybackDiagnosticEvent({
          kind: "renderer.resource.spike",
          message: "Detected large one-second renderer resource increase",
          meta: {
            geometryDelta,
            textureDelta,
            programDelta,
            sceneObjectDelta,
            geometries: nextSample.geometries,
            textures: nextSample.textures,
            programs: nextSample.programs,
            sceneObjects: nextSample.sceneObjects,
          },
        });
      }
    };

    collectSample();
    const intervalId = window.setInterval(collectSample, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [engineStore, gl, scene]);

  return null;
}

export function DemoPlayback() {
  const engineStore = useEngineStoreApi();
  const recording = useDemoRecording();
  const instanceIdRef = useRef<string | null>(null);
  if (!instanceIdRef.current) {
    instanceIdRef.current = nextLifecycleInstanceId("DemoPlayback");
  }

  useEffect(() => {
    demoPlaybackMountCount += 1;
    const mountedAt = Date.now();
    engineStore.getState().recordPlaybackDiagnosticEvent({
      kind: "component.lifecycle",
      message: "DemoPlayback mounted",
      meta: {
        component: "DemoPlayback",
        phase: "mount",
        instanceId: instanceIdRef.current,
        mountCount: demoPlaybackMountCount,
        unmountCount: demoPlaybackUnmountCount,
        recordingMissionName: recording?.missionName ?? null,
        recordingDurationSec: recording
          ? Number(recording.duration.toFixed(3))
          : null,
        ts: mountedAt,
      },
    });
    console.info("[demo diagnostics] DemoPlayback mounted", {
      instanceId: instanceIdRef.current,
      mountCount: demoPlaybackMountCount,
      unmountCount: demoPlaybackUnmountCount,
      recordingMissionName: recording?.missionName ?? null,
      mountedAt,
    });

    return () => {
      demoPlaybackUnmountCount += 1;
      const unmountedAt = Date.now();
      engineStore.getState().recordPlaybackDiagnosticEvent({
        kind: "component.lifecycle",
        message: "DemoPlayback unmounted",
        meta: {
          component: "DemoPlayback",
          phase: "unmount",
          instanceId: instanceIdRef.current,
          mountCount: demoPlaybackMountCount,
          unmountCount: demoPlaybackUnmountCount,
          recordingMissionName: recording?.missionName ?? null,
          ts: unmountedAt,
        },
      });
      console.info("[demo diagnostics] DemoPlayback unmounted", {
        instanceId: instanceIdRef.current,
        mountCount: demoPlaybackMountCount,
        unmountCount: demoPlaybackUnmountCount,
        recordingMissionName: recording?.missionName ?? null,
        unmountedAt,
      });
    };
  }, [engineStore]);

  if (!recording) return null;
  return (
    <>
      <DemoPlaybackDiagnostics recording={recording} />
      <StreamingDemoPlayback recording={recording} />
    </>
  );
}

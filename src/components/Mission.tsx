import { useQuery } from "@tanstack/react-query";
import picomatch from "picomatch";
import { loadMission } from "../loaders";
import { type ParsedMission } from "../mission";
import { createScriptLoader } from "../torqueScript/scriptLoader.browser";
import { memo, useEffect, useMemo, useState } from "react";
import { RuntimeProvider } from "./RuntimeProvider";
import {
  createProgressTracker,
  createScriptCache,
  FileSystemHandler,
  runServer,
  TorqueRuntime,
} from "../torqueScript";
import {
  getResourceKey,
  getResourceList,
  getResourceMap,
  getSourceAndPath,
} from "../manifest";
import { MissionProvider } from "./MissionContext";
import { engineStore, gameEntityStore } from "../state";
import { ignoreScripts } from "../torqueScript/ignoreScripts";
import { walkMissionTree } from "../stream/missionEntityBridge";

const loadScript = createScriptLoader();
// Shared cache for parsed scripts - survives runtime restarts
const scriptCache = createScriptCache();
const fileSystem: FileSystemHandler = {
  findFiles: (pattern) => {
    const isMatch = picomatch(pattern, { nocase: true });
    return getResourceList()
      .filter((path) => isMatch(path))
      .map((resourceKey) => {
        const [, actualPath] = getSourceAndPath(resourceKey);
        return actualPath;
      });
  },
  isFile: (resourcePath) => {
    const resourceKeys = getResourceMap();
    const resourceKey = getResourceKey(resourcePath);
    return resourceKeys[resourceKey] != null;
  },
};

function useParsedMission(name: string) {
  return useQuery({
    queryKey: ["parsedMission", name],
    queryFn: () => loadMission(name),
  });
}

interface ExecutedMissionState {
  ready: boolean;
  runtime: TorqueRuntime | undefined;
  progress: number;
}

function useExecutedMission(
  missionName: string,
  missionType: string,
  parsedMission: ParsedMission | undefined,
): ExecutedMissionState {
  const [state, setState] = useState<ExecutedMissionState>({
    ready: false,
    runtime: undefined,
    progress: 0,
  });

  useEffect(() => {
    if (!parsedMission) {
      return;
    }

    const controller = new AbortController();
    let isDisposed = false;
    let unsubscribeRuntimeEvents: (() => void) | null = null;

    // Create progress tracker and update state on changes
    const progressTracker = createProgressTracker();
    const handleProgress = () => {
      setState((prev) => ({ ...prev, progress: progressTracker.progress }));
    };
    progressTracker.on("update", handleProgress);

    const { runtime, ready } = runServer({
      missionName,
      missionType,
      runtimeOptions: {
        loadScript,
        fileSystem,
        cache: scriptCache,
        signal: controller.signal,
        progress: progressTracker,
        ignoreScripts,
      },
    });

    void ready
      .then(() => {
        if (isDisposed || controller.signal.aborted) {
          return;
        }
        // Refresh the reactive runtime snapshot at mission-ready time.
        engineStore.getState().setRuntime(runtime);
        const missionGroup = runtime.getObjectByName("MissionGroup");
        if (missionGroup) {
          const gameEntities = walkMissionTree(missionGroup, runtime);
          gameEntityStore.getState().setAllEntities(gameEntities);
        }
        setState({ ready: true, runtime, progress: 1 });
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Mission runtime failed to become ready:", err);
      });

    // Subscribe as soon as the runtime exists so no mutation batches are missed
    // between mission init and React component mount.
    unsubscribeRuntimeEvents = runtime.subscribeRuntimeEvents((event) => {
      if (event.type !== "batch.flushed") {
        return;
      }
      engineStore.getState().applyRuntimeBatch(event.events, {
        tick: event.tick,
      });
    });
    // Seed store immediately; indexes are refreshed again when `ready` resolves
    // after server mission load reaches its ready state.
    engineStore.getState().setRuntime(runtime);

    return () => {
      isDisposed = true;
      progressTracker.off("update", handleProgress);
      controller.abort();
      unsubscribeRuntimeEvents?.();
      engineStore.getState().clearRuntime();
      gameEntityStore.getState().clearEntities();
      runtime.destroy();
    };
  }, [missionName, missionType, parsedMission]);

  return state;
}

interface MissionProps {
  name: string;
  missionType: string;
  onLoadingChange?: (isLoading: boolean, progress?: number) => void;
}

export const Mission = memo(function Mission({
  name,
  missionType,
  onLoadingChange,
}: MissionProps) {
  const { data: parsedMission } = useParsedMission(name);

  const { ready, runtime, progress } = useExecutedMission(
    name,
    missionType,
    parsedMission,
  );
  const isLoading = !parsedMission || !ready || !runtime;

  const missionContext = useMemo(
    () => ({
      metadata: parsedMission,
      missionType,
    }),
    [parsedMission, missionType],
  );

  useEffect(() => {
    onLoadingChange?.(isLoading, progress);
  }, [isLoading, progress, onLoadingChange]);

  if (isLoading) {
    return null;
  }

  return (
    <MissionProvider value={missionContext}>
      <RuntimeProvider runtime={runtime} />
    </MissionProvider>
  );
});

import { useQuery } from "@tanstack/react-query";
import picomatch from "picomatch";
import { loadMission } from "../loaders";
import { type ParsedMission } from "../mission";
import { createScriptLoader } from "../torqueScript/scriptLoader.browser";
import { SimObject } from "./SimObject";
import { memo, useEffect, useMemo, useState } from "react";
import { RuntimeProvider } from "./RuntimeProvider";
import {
  createProgressTracker,
  createScriptCache,
  FileSystemHandler,
  runServer,
  TorqueObject,
  TorqueRuntime,
} from "../torqueScript";
import {
  getResourceKey,
  getResourceList,
  getResourceMap,
  getSourceAndPath,
} from "../manifest";
import { MissionProvider } from "./MissionContext";

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
  missionGroup: TorqueObject | undefined;
  runtime: TorqueRuntime | undefined;
  progress: number;
}

function useExecutedMission(
  missionName: string,
  missionType: string,
  parsedMission: ParsedMission | undefined,
): ExecutedMissionState {
  const [state, setState] = useState<ExecutedMissionState>({
    missionGroup: undefined,
    runtime: undefined,
    progress: 0,
  });

  useEffect(() => {
    if (!parsedMission) {
      return;
    }

    const controller = new AbortController();

    // Create progress tracker and update state on changes
    const progressTracker = createProgressTracker();
    const handleProgress = () => {
      setState((prev) => ({ ...prev, progress: progressTracker.progress }));
    };
    progressTracker.on("update", handleProgress);

    const { runtime } = runServer({
      missionName,
      missionType,
      runtimeOptions: {
        loadScript,
        fileSystem,
        cache: scriptCache,
        signal: controller.signal,
        progress: progressTracker,
        ignoreScripts: [
          "scripts/admin.cs",
          // `ignoreScripts` supports globs, but out of an abundance of caution
          // we don't want to do `ai*.cs` in case there's some non-AI related
          // word like "air" in a script name.
          "scripts/ai.cs",
          "scripts/aiBotProfiles.cs",
          "scripts/aiBountyGame.cs",
          "scripts/aiChat.cs",
          "scripts/aiCnH.cs",
          "scripts/aiCTF.cs",
          "scripts/aiDeathMatch.cs",
          "scripts/aiDebug.cs",
          "scripts/aiDefaultTasks.cs",
          "scripts/aiDnD.cs",
          "scripts/aiHumanTasks.cs",
          "scripts/aiHunters.cs",
          "scripts/aiInventory.cs",
          "scripts/aiObjectiveBuilder.cs",
          "scripts/aiObjectives.cs",
          "scripts/aiRabbit.cs",
          "scripts/aiSiege.cs",
          "scripts/aiTDM.cs",
          "scripts/aiTeamHunters.cs",
          "scripts/deathMessages.cs",
          "scripts/graphBuild.cs",
          "scripts/navGraph.cs",
          "scripts/serverTasks.cs",
          "scripts/spdialog.cs",
        ],
      },
      onMissionLoadDone: () => {
        const missionGroup = runtime.getObjectByName("MissionGroup");
        setState({ missionGroup, runtime, progress: 1 });
      },
    });

    return () => {
      progressTracker.off("update", handleProgress);
      controller.abort();
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

  const { missionGroup, runtime, progress } = useExecutedMission(
    name,
    missionType,
    parsedMission,
  );
  const isLoading = !parsedMission || !missionGroup || !runtime;

  const missionContext = useMemo(
    () => ({
      metadata: parsedMission,
      missionType,
      missionGroup,
    }),
    [parsedMission, missionType, missionGroup],
  );

  useEffect(() => {
    onLoadingChange?.(isLoading, progress);
  }, [isLoading, progress, onLoadingChange]);

  if (isLoading) {
    return null;
  }

  return (
    <MissionProvider value={missionContext}>
      <RuntimeProvider runtime={runtime}>
        <SimObject object={missionGroup} />
      </RuntimeProvider>
    </MissionProvider>
  );
});

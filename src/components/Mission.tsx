import { useQuery } from "@tanstack/react-query";
import picomatch from "picomatch";
import { loadMission } from "../loaders";
import { type ParsedMission } from "../mission";
import { createScriptLoader } from "../torqueScript/scriptLoader.browser";
import { renderObject } from "./renderObject";
import { memo, useEffect, useState } from "react";
import { RuntimeProvider } from "./RuntimeProvider";
import {
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

const loadScript = createScriptLoader();
// Shared cache for parsed scripts - survives runtime restarts
const scriptCache = createScriptCache();
const fileSystem: FileSystemHandler = {
  findFiles: (pattern) => {
    const isMatch = picomatch(pattern, { nocase: true });
    return getResourceList()
      .filter((path) => isMatch(path))
      .map((resourceKey) => {
        const [sourcePath, actualPath] = getSourceAndPath(resourceKey);
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
}

function useExecutedMission(
  missionName: string,
  parsedMission: ParsedMission | undefined,
): ExecutedMissionState {
  const [state, setState] = useState<ExecutedMissionState>({
    missionGroup: undefined,
    runtime: undefined,
  });

  useEffect(() => {
    if (!parsedMission) {
      return;
    }

    const controller = new AbortController();
    // FIXME: Always just runs as the first game type for now...
    const missionType = parsedMission.missionTypes[0];

    const { runtime } = runServer({
      missionName,
      missionType,
      runtimeOptions: {
        loadScript,
        fileSystem,
        cache: scriptCache,
        signal: controller.signal,
        ignoreScripts: [
          "scripts/admin.cs",
          "scripts/ai.cs",
          "scripts/aiCTF.cs",
          "scripts/aiHunters.cs",
          "scripts/deathMessages.cs",
          "scripts/graphBuild.cs",
          "scripts/navGraph.cs",
          "scripts/serverTasks.cs",
          "scripts/spdialog.cs",
        ],
      },
      onMissionLoadDone: () => {
        const missionGroup = runtime.getObjectByName("MissionGroup");
        setState({ missionGroup, runtime });
      },
    });

    return () => {
      controller.abort();
      runtime.destroy();
    };
  }, [missionName, parsedMission]);

  return state;
}

interface MissionProps {
  name: string;
  onLoadingChange?: (isLoading: boolean) => void;
}

export const Mission = memo(function Mission({
  name,
  onLoadingChange,
}: MissionProps) {
  const { data: parsedMission } = useParsedMission(name);
  const { missionGroup, runtime } = useExecutedMission(name, parsedMission);
  const isLoading = !missionGroup || !runtime;

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  if (isLoading) {
    return null;
  }

  return (
    <RuntimeProvider runtime={runtime}>
      {renderObject(missionGroup)}
    </RuntimeProvider>
  );
});

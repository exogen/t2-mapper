import { useQuery } from "@tanstack/react-query";
import picomatch from "picomatch";
import { loadMission } from "../loaders";
import { type ParsedMission } from "../mission";
import { createScriptLoader } from "../torqueScript/scriptLoader.browser";
import { renderObject } from "./renderObject";
import { memo, useEffect, useState } from "react";
import { TickProvider } from "./TickProvider";
import {
  createScriptCache,
  FileSystemHandler,
  runServer,
  TorqueObject,
} from "../torqueScript";
import { getResourceKey, getResourceList, getResourceMap } from "../manifest";

const loadScript = createScriptLoader();
// Shared cache for parsed scripts - survives runtime restarts
const scriptCache = createScriptCache();
const fileSystem: FileSystemHandler = {
  findFiles: (pattern) => {
    const isMatch = picomatch(pattern, { nocase: true });
    return getResourceList().filter((path) => isMatch(path));
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

function useExecutedMission(
  missionName: string,
  parsedMission: ParsedMission | undefined,
) {
  const [missionGroup, setMissionGroup] = useState<TorqueObject | undefined>();

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
      },
      onMissionLoadDone: () => {
        const missionGroup = runtime.getObjectByName("MissionGroup");
        setMissionGroup(missionGroup);
      },
    });

    return () => {
      controller.abort();
      runtime.destroy();
    };
  }, [missionName, parsedMission]);

  return missionGroup;
}

export const Mission = memo(function Mission({ name }: { name: string }) {
  const { data: parsedMission } = useParsedMission(name);
  const missionGroup = useExecutedMission(name, parsedMission);

  if (!missionGroup) {
    return null;
  }

  return <TickProvider>{renderObject(missionGroup)}</TickProvider>;
});

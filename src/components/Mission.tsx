import { useQuery } from "@tanstack/react-query";
import { Html } from "@react-three/drei";
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

function LoadingSpinner() {
  return (
    <Html>
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          width: 48,
          height: 48,
          border: "4px solid rgba(255, 255, 255, 0.2)",
          borderTopColor: "white",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          pointerEvents: "none",
        }}
      />
      <style>{`@keyframes spin { to { transform: translate(-50%, -50%) rotate(360deg); } from { transform: translate(-50%, -50%) rotate(0deg); } }`}</style>
    </Html>
  );
}

export const Mission = memo(function Mission({ name }: { name: string }) {
  const { data: parsedMission } = useParsedMission(name);
  const missionGroup = useExecutedMission(name, parsedMission);

  if (!missionGroup) {
    return <LoadingSpinner />;
  }

  return <TickProvider>{renderObject(missionGroup)}</TickProvider>;
});

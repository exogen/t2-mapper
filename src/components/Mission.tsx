import { useQuery } from "@tanstack/react-query";
import { loadMission } from "../loaders";
import {
  executeMission,
  type ParsedMission,
  type ExecutedMission,
} from "../mission";
import { createScriptLoader } from "../torqueScript/scriptLoader.browser";
import { renderObject } from "./renderObject";
import { memo, useEffect, useState } from "react";

const loadScript = createScriptLoader();

function useParsedMission(name: string) {
  return useQuery({
    queryKey: ["parsedMission", name],
    queryFn: () => loadMission(name),
  });
}

function useExecutedMission(parsedMission: ParsedMission | undefined) {
  const [executedMission, setExecutedMission] = useState<
    ExecutedMission | undefined
  >();

  useEffect(() => {
    if (!parsedMission) {
      setExecutedMission(undefined);
      return;
    }

    // Clear previous mission immediately to avoid rendering with destroyed runtime
    setExecutedMission(undefined);

    let cancelled = false;
    let result: ExecutedMission | undefined;

    async function run() {
      try {
        const executed = await executeMission(parsedMission, { loadScript });
        if (cancelled) {
          executed.runtime.destroy();
        } else {
          result = executed;
          setExecutedMission(executed);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to execute mission:", error);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
      result?.runtime.destroy();
    };
  }, [parsedMission]);

  return executedMission;
}

export const Mission = memo(function Mission({ name }: { name: string }) {
  const { data: parsedMission } = useParsedMission(name);
  const executedMission = useExecutedMission(parsedMission);

  if (!executedMission) {
    return null;
  }

  return executedMission.objects.map((object, i) => renderObject(object, i));
});

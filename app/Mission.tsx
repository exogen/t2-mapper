import { loadMission } from "@/src/loaders";
import { useQuery } from "@tanstack/react-query";
import { renderObject } from "./renderObject";

function useMission(name: string) {
  return useQuery({
    queryKey: ["mission", name],
    queryFn: () => loadMission(name),
  });
}

export function Mission({ name }: { name: string }) {
  const { data: mission } = useMission(name);

  if (!mission) {
    return null;
  }

  return <>{mission.objects.map((object, i) => renderObject(object, i))}</>;
}

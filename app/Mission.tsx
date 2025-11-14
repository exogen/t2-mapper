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

  return (
    <>
      <hemisphereLight
        args={["rgba(209, 237, 255, 1)", "rgba(186, 200, 181, 1)", 2]}
      />
      {mission.objects.map((object, i) => renderObject(object, i))}
    </>
  );
}

import { useQuery } from "@tanstack/react-query";
import { loadMission } from "../loaders";

/** A mission's parsed .mis file, shared by everything that reads it. */
export function useParsedMission(name: string, enabled = true) {
  return useQuery({
    queryKey: ["parsedMission", name],
    queryFn: () => loadMission(name),
    enabled,
  });
}

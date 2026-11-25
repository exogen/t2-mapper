import { useQuery } from "@tanstack/react-query";
import { loadMission } from "../loaders";

/** A mission's parsed .mis file, shared by everything that reads it. */
export function useParsedMission(name: string, enabled = true) {
  return useQuery({
    queryKey: ["parsedMission", name],
    queryFn: ({ signal }) => loadMission(name, signal),
    // Share across current readers without retaining old maps' parsed objects.
    gcTime: 0,
    enabled,
  });
}

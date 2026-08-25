import { useQuery } from "@tanstack/react-query";
import { DEMOS_BASE_URL, fetchDemoIndex } from "../stream/demoIndex";

/**
 * The published demo index, shared by the demo dropdown and the landing
 * page's featured cards (same query key — one fetch serves both).
 */
export function useDemoIndex() {
  return useQuery({
    queryKey: ["demoIndex"],
    queryFn: fetchDemoIndex,
    enabled: DEMOS_BASE_URL !== "",
    staleTime: 60_000,
  });
}

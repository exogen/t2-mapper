import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  DEMOS_BASE_URL,
  fetchDemoIndex,
  type DemoIndexEntry,
} from "../stream/demoIndex";

const NO_DEMOS: DemoIndexEntry[] = [];

/**
 * One definition behind both hooks below, so the shared cache entry
 * never depends on which of them fetched it first.
 */
const demoIndexQuery = {
  queryKey: ["demoIndex"] as const,
  queryFn: async () => (DEMOS_BASE_URL === "" ? NO_DEMOS : fetchDemoIndex()),
  staleTime: 60_000,
};

/**
 * The published demo index, shared by the demo dropdown and the landing
 * page's featured cards (same query key — one fetch serves both).
 */
export function useDemoIndex() {
  return useQuery({ ...demoIndexQuery, enabled: DEMOS_BASE_URL !== "" });
}

/**
 * The same index for callers that render a Suspense fallback while it
 * loads. Errors reach the nearest error boundary (see
 * QuietErrorBoundary) rather than resolving to empty data.
 */
export function useDemoIndexSuspense() {
  return useSuspenseQuery(demoIndexQuery);
}

import {
  useQuery,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
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
  queryFn: async ({ signal }: { signal: AbortSignal }) =>
    DEMOS_BASE_URL === "" ? NO_DEMOS : fetchDemoIndex(signal),
  staleTime: 60_000,
};

/** Publication needs a read started after the write, even during the initial fetch. */
export async function refreshDemoIndex(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: demoIndexQuery.queryKey });
  await queryClient.invalidateQueries({ queryKey: demoIndexQuery.queryKey });
}

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

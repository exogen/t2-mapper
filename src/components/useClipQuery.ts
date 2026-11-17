import { useQuery } from "@tanstack/react-query";
import { clipRefetchInterval, readClip } from "../stream/clipApi";

/** Shared clip metadata and camera timeline for the viewer and its header. */
export function useClipQuery(id: string | null) {
  return useQuery({
    queryKey: ["clip", id],
    enabled: !!id,
    queryFn: ({ signal }) => readClip(id!, signal),
    refetchInterval: clipRefetchInterval,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 60_000,
  });
}

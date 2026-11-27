import { useQuery } from "@tanstack/react-query";
import type { ClipView } from "../../relay/clipTypes";
import { clipRefetchInterval, readClip } from "../stream/clipApi";

/** Shared clip metadata and camera timeline for the viewer and its header. */
export function useClipQuery<T = ClipView>(
  id: string | null,
  select?: (clip: ClipView) => T,
) {
  return useQuery({
    queryKey: ["clip", id],
    enabled: !!id,
    queryFn: ({ signal }) => readClip(id!, signal),
    select,
    refetchInterval: clipRefetchInterval,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 60_000,
  });
}

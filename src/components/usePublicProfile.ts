import { useQuery } from "@tanstack/react-query";
import {
  isDiscordId,
  type AccountPublicProfile,
} from "../../relay/accountTypes";
import { appApiBaseUrl } from "../account/authClient";

/** Public identity shared by profile pages and recording attribution. */
export function usePublicProfile(
  userId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["userProfile", userId],
    enabled: enabled && isDiscordId(userId),
    queryFn: async ({ signal }): Promise<AccountPublicProfile | null> => {
      const response = await fetch(
        new URL(`/api/users/${encodeURIComponent(userId!)}`, appApiBaseUrl),
        {
          credentials: "omit",
          cache: "no-cache",
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Could not load user profile");
      return response.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

import { useCaster } from "../state/casterStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { getFollowableFlags } from "../state/watchFollow";

/** Subscribe to flag labels and affiliations without rerendering for movement. */
export function useFlagCameras() {
  const names = useCaster((s) => s.settings?.teamNames);
  return useStreamSnapshot(
    () =>
      getFollowableFlags(names).map(({ slot, teamId, label }) => ({
        slot,
        teamId,
        label,
      })),
    (a, b) =>
      a.length === b.length &&
      a.every(
        (flag, i) =>
          flag.slot === b[i].slot &&
          flag.teamId === b[i].teamId &&
          flag.label === b[i].label,
      ),
  );
}

export type FlagCamera = ReturnType<typeof useFlagCameras>[number];

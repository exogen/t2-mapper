import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { IffView } from "../iffTheme";
import { followedIffTeam, selectIffFollowTarget } from "../state/iffView";
import { settingsStore } from "../state/settingsStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";

export function useIffView(): IffView {
  const settings = useStore(
    settingsStore,
    useShallow(({ observerTeamColors, followTeamIff, firstPersonTeamIff }) => ({
      observerTeamColors,
      followTeamIff,
      firstPersonTeamIff,
    })),
  );
  const targetId = useStore(streamPlaybackStore, (state) =>
    selectIffFollowTarget(state, settings),
  );
  const playerSensorGroup = useStreamSnapshot(
    (snap) => snap?.playerSensorGroup,
  );
  // Team changes can update the entity in place between snapshot publishes.
  const followedTeamId = useStreamSnapshot(() => followedIffTeam(targetId));
  return {
    playerSensorGroup,
    followedTeamId,
    scheme: settings.observerTeamColors,
  };
}

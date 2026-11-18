import {
  resolveIffDisplay,
  resolveTeamIffDisplay,
  type IffView,
} from "../iffTheme";
import { gameEntityStore } from "./gameEntityStore";
import type { GameEntity } from "./gameEntityTypes";
import { settingsStore, type Preferences } from "./settingsStore";
import {
  streamPlaybackStore,
  type StreamPlaybackState,
} from "./streamPlaybackStore";
import { streamSnapshotStore } from "./streamSnapshotStore";

/** Entity whose nameplate is included or excluded by the follow-only modes. */
export function selectIffVisibilityTarget({
  cameraMode,
  followEntityId,
}: StreamPlaybackState): string | null {
  return cameraMode === "orbitOverride" || cameraMode === "firstPersonOverride"
    ? followEntityId
    : null;
}

export function selectIffFollowTarget(
  { cameraMode, followEntityId, followFlagSlot }: StreamPlaybackState,
  {
    followTeamIff,
    firstPersonTeamIff,
  }: Pick<Preferences, "followTeamIff" | "firstPersonTeamIff">,
): string | null {
  if (followFlagSlot != null) return null;
  const enabled =
    cameraMode === "orbitOverride"
      ? followTeamIff
      : cameraMode === "firstPersonOverride" && firstPersonTeamIff;
  return enabled ? followEntityId : null;
}

export function followedIffTeam(id: string | null): number | undefined {
  if (!id) return undefined;
  const target = gameEntityStore.getState().streamEntities.get(id);
  return target?.renderType === "Player" &&
    target.teamId != null &&
    target.teamId > 0
    ? target.teamId
    : undefined;
}

let lastView: IffView | undefined;

/** The animated indicators read live affiliation without allocating per player. */
export function getIffView(): IffView {
  const preferences = settingsStore.getState();
  const scheme = preferences.observerTeamColors;
  const playerSensorGroup =
    streamSnapshotStore.getState().snapshot?.playerSensorGroup;
  const followedTeamId = followedIffTeam(
    selectIffFollowTarget(streamPlaybackStore.getState(), preferences),
  );
  if (
    !lastView ||
    lastView.playerSensorGroup !== playerSensorGroup ||
    lastView.followedTeamId !== followedTeamId ||
    lastView.scheme !== scheme
  )
    lastView = { playerSensorGroup, followedTeamId, scheme };
  return lastView;
}

export function getFlagIffDisplay(
  entity: GameEntity,
  flagTeamId: number | null,
) {
  const view = getIffView();
  if (settingsStore.getState().flagColorMode === "matchTeam")
    return resolveTeamIffDisplay(flagTeamId, view);

  // The stock HUD uses the flag item while loose and the player target while held.
  const teamId =
    entity.renderType === "Player" ? (entity.teamId ?? flagTeamId) : flagTeamId;
  const iffColor = "iffColor" in entity ? entity.iffColor : undefined;
  return resolveIffDisplay(
    { teamId, iffColor },
    view,
    resolveTeamIffDisplay(teamId, view),
  );
}

import {
  streamPlaybackStore,
  type DemoCameraMode,
} from "./streamPlaybackStore";
import {
  cycleWatchFollow,
  enterWatchFollow,
  exitToFreeFly,
  getFollowablePlayerIds,
  isFollowingPlayer,
  resolveFlagEntityId,
} from "./watchFollow";

function followTargets() {
  const state = streamPlaybackStore.getState();
  const players = getFollowablePlayerIds();
  const flag =
    state.followFlagSlot != null &&
    resolveFlagEntityId(state.followFlagSlot) != null;
  return { state, players, flag };
}

/** Match the existing follow cycle's living-player eligibility. */
export function getLocalCameraCapabilities() {
  const { state, players, flag } = followTargets();
  return {
    canFollow: flag || players.length > 0,
    canFirstPerson: state.followFlagSlot == null && players.length > 0,
    canCyclePlayers: players.length > 0,
  };
}

/** Cycle a player from any view, entering orbit when no player view is active. */
export function cycleLocalCameraPlayer(direction: 1 | -1): boolean {
  const state = streamPlaybackStore.getState();
  const players = getFollowablePlayerIds();
  if (players.length === 0) return false;
  const playerView =
    (state.cameraMode === "orbitOverride" ||
      state.cameraMode === "firstPersonOverride") &&
    state.followFlagSlot == null &&
    isFollowingPlayer();
  if (!playerView) {
    streamPlaybackStore.setState({ followCameraMode: "orbitOverride" });
  }
  cycleWatchFollow(direction);
  return true;
}

/** Select a local mode directly, leaving the keyboard mode cycle unchanged. */
export function selectLocalCameraMode(
  mode: DemoCameraMode,
  hasOriginalView: boolean,
): boolean {
  if (mode === "original") {
    if (!hasOriginalView) return false;
    streamPlaybackStore.setState({
      cameraMode: "original",
      followEntityId: null,
      followTargetId: null,
      followPlayer: null,
      followFlagSlot: null,
      followCameraMode: "orbitOverride",
    });
    return true;
  }
  if (mode === "freeFly") {
    // Also disarm a player waiting to respawn, whose visible mode is free-fly.
    exitToFreeFly();
    return true;
  }
  if (mode !== "orbitOverride" && mode !== "firstPersonOverride") {
    return false;
  }

  const { state, players, flag } = followTargets();
  if (mode === "firstPersonOverride" && state.followFlagSlot != null) {
    return false;
  }
  const currentPlayer =
    state.followEntityId != null && players.includes(state.followEntityId);
  if (mode === "orbitOverride" && flag) {
    streamPlaybackStore.setState({ cameraMode: mode, followCameraMode: mode });
    return true;
  }
  if (players.length === 0) return false;
  // Switching perspective on the current player must preserve their orbit.
  if (currentPlayer && state.followFlagSlot == null) {
    streamPlaybackStore.setState({ cameraMode: mode, followCameraMode: mode });
  } else {
    // Reuse the remembered/default player selection and orbit seeding.
    streamPlaybackStore.setState({ followCameraMode: mode });
    enterWatchFollow();
  }
  return true;
}

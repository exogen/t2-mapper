import { useStore } from "zustand";
import { useCameraOwner } from "../state/cameraOwner";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { isFollowTargetPlayer } from "../state/watchFollow";
import { useSettings } from "./SettingsProvider";

export function usePlayerOrbitAvailable(): boolean {
  const cameraOwner = useCameraOwner();
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);
  const playerFollow = useStreamSnapshot(
    () => followEntityId != null && isFollowTargetPlayer(),
  );
  return (
    cameraOwner === "input" && cameraMode === "orbitOverride" && playerFollow
  );
}

export function usePlayerOrbitLocked(): boolean {
  const { followBehindPlayer } = useSettings();
  const available = usePlayerOrbitAvailable();
  return followBehindPlayer && available;
}

import { useStore } from "zustand";
import {
  streamPlaybackStore,
  type DemoCameraMode,
} from "../state/streamPlaybackStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { stripTaggedStringMarkup } from "../stream/streamHelpers";
import styles from "./WatchedPlayerHud.module.css";

function clean(name: string | null | undefined): string | null {
  if (!name) return null;
  return stripTaggedStringMarkup(name).trim() || null;
}

/**
 * The followed player's name — only while following (orbit / first-person).
 * Read from gameEntityStore (where `followEntityId` lives) so in-place
 * playerName updates are picked up on each snapshot tick. Other modes
 * (free-fly, original, live default) show nothing.
 */
function resolveFollowedName(
  cameraMode: DemoCameraMode,
  followEntityId: string | null,
): string | null {
  if (cameraMode !== "orbitOverride" && cameraMode !== "firstPersonOverride") {
    return null;
  }
  if (!followEntityId) return null;
  const entity = gameEntityStore.getState().streamEntities.get(followEntityId);
  return clean(entity?.playerName ?? null);
}

/**
 * HUD chip naming the player being followed, with a grayed "Following"
 * label. Shown only in follow/first-person, independent of the input
 * overlay, stacked with it.
 */
export function WatchedPlayerHud() {
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);
  const name = useStreamSnapshot(
    () => resolveFollowedName(cameraMode, followEntityId),
    (a, b) => a === b,
  );

  if (name == null) return null;
  return (
    <div className={styles.WatchedPlayer}>
      <span className={styles.Label}>Following:</span> {name}
    </div>
  );
}

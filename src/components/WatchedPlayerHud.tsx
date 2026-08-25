import { useStore } from "zustand";
import {
  streamPlaybackStore,
  type DemoCameraMode,
} from "../state/streamPlaybackStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { stripTaggedStringMarkup } from "../stream/streamHelpers";
import { flagLabel } from "./flagTeam";
import styles from "./WatchedPlayerHud.module.css";

function clean(name: string | null | undefined): string | null {
  if (!name) return null;
  return stripTaggedStringMarkup(name).trim() || null;
}

/**
 * The followed player's name — or the followed flag's, e.g. "Storm Flag"
 * — only while following (orbit / first-person). Read from
 * gameEntityStore (where `followEntityId` lives) so in-place playerName
 * updates are picked up on each snapshot tick. Other modes (free-fly,
 * original, live default) show nothing.
 */
function resolveFollowedName(
  cameraMode: DemoCameraMode,
  followEntityId: string | null,
  followFlagSlot: number | null,
): string | null {
  if (cameraMode !== "orbitOverride" && cameraMode !== "firstPersonOverride") {
    return null;
  }
  if (!followEntityId) return null;
  const entity = gameEntityStore.getState().streamEntities.get(followEntityId);
  if (!entity) return null;
  // Flag follow names the flag even while a carrier holds it (the
  // followed entity is then the carrier player).
  const flagMarked =
    "targetRenderFlags" in entity &&
    (((entity.targetRenderFlags as number | undefined) ?? 0) & 0x2) !== 0;
  if (
    followFlagSlot != null ||
    (entity.renderType !== "Player" && flagMarked)
  ) {
    return flagLabel(entity);
  }
  if (entity.renderType !== "Player") return null;
  return clean(entity.playerName ?? null);
}

/**
 * HUD chip naming the player being followed, with a grayed "Following"
 * label. Shown only in follow/first-person, independent of the input
 * overlay, stacked with it.
 */
export function WatchedPlayerHud() {
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);
  const followFlagSlot = useStore(streamPlaybackStore, (s) => s.followFlagSlot);
  const name = useStreamSnapshot(
    () => resolveFollowedName(cameraMode, followEntityId, followFlagSlot),
    (a, b) => a === b,
  );

  if (name == null) return null;
  return (
    <div className={styles.WatchedPlayer}>
      <span className={styles.Label}>Following:</span> {name}
    </div>
  );
}

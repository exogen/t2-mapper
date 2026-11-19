import { useCaster } from "../state/casterStore";
import { useStore } from "zustand";
import { TbArrowDownFromArc } from "react-icons/tb";
import {
  streamPlaybackStore,
  type DemoCameraMode,
} from "../state/streamPlaybackStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { playerForEntity } from "../state/playerResolver";
import { flagLabel } from "../state/flagTeam";
import styles from "./WatchedPlayerHUD.module.css";
import { usePlayerOrbitAvailable } from "./usePlayerOrbitLocked";
import { useSettings } from "./SettingsProvider";
import { useInputAction } from "./InputControls";

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
  teamNames?: Record<number, string>,
): string | null {
  if (cameraMode !== "orbitOverride" && cameraMode !== "firstPersonOverride") {
    return null;
  }
  if (!followEntityId) return null;
  const entity = gameEntityStore.getState().streamEntities.get(followEntityId);
  if (!entity) return null;
  // Keep the objective's own label while its camera follows the carrier.
  const flagMarked =
    "targetRenderFlags" in entity &&
    (((entity.targetRenderFlags as number | undefined) ?? 0) & 0x2) !== 0;
  if (
    followFlagSlot != null ||
    (entity.renderType !== "Player" && flagMarked)
  ) {
    return flagLabel(entity, "original", teamNames);
  }
  if (entity.renderType !== "Player") return null;
  return playerForEntity(entity).name || null;
}

/**
 * Follow status chip, shown independently of the input overlay.
 */
export function WatchedPlayerHUD() {
  const teamNames = useCaster((s) => s.teamNames);
  const orbitAvailable = usePlayerOrbitAvailable();
  const { followBehindPlayer, setFollowBehindPlayer } = useSettings();
  const toggleFollowBehindPlayer = () =>
    setFollowBehindPlayer((enabled) => !enabled);
  useInputAction("toggleFollowBehindPlayer", toggleFollowBehindPlayer);
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);
  const followFlagSlot = useStore(streamPlaybackStore, (s) => s.followFlagSlot);
  const projectileFollow = useStore(
    streamPlaybackStore,
    (s) => s.projectileFollow,
  );
  const followedName = useStreamSnapshot(
    () =>
      resolveFollowedName(
        cameraMode,
        followEntityId,
        followFlagSlot,
        teamNames,
      ),
    (a, b) => a === b,
  );

  let label = "Following:";
  let name = followedName;
  const armed = projectileFollow?.kind === "armed";
  if (projectileFollow?.kind === "tracking") {
    label = "Following";
    name = projectileFollow.sourceName
      ? `${projectileFollow.sourceName}’s projectile`
      : "projectile";
  }

  if (!armed && !name) return null;
  const showViewButton =
    orbitAvailable && projectileFollow?.kind !== "tracking";
  return (
    <div
      className={
        showViewButton
          ? styles.WatchedPlayerWithViewButton
          : styles.WatchedPlayer
      }
    >
      <div className={styles.Badge} data-armed={armed || undefined}>
        {armed ? (
          "Following next projectile"
        ) : (
          <>
            <span className={styles.Label}>{label}</span> {name}
          </>
        )}
      </div>
      {showViewButton && (
        <button
          type="button"
          className={styles.ViewButton}
          data-active={followBehindPlayer}
          aria-pressed={followBehindPlayer}
          aria-label="Keep follow camera behind player"
          title={
            followBehindPlayer
              ? "Unlock orbit camera (Shift+↑)"
              : "Keep follow camera behind player (Shift+↑)"
          }
          onClick={toggleFollowBehindPlayer}
        >
          <TbArrowDownFromArc aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

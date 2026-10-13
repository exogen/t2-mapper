import { referencePlayer } from "../../relay/playerReference";
import { useDataSource } from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { exitDirector } from "../state/demoDirectorStore";
import { getPlayerResolver, lookupPlayerBody } from "../state/playerResolver";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  enterWatchFollow,
  followFlag as enterFlagFollow,
  resolveFlagEntityId,
} from "../state/watchFollow";
import type { PlayerRosterEntry } from "../stream/types";

/** HUD selections take over the 3D camera from CC, tours, or the director. */
function takeCamera() {
  cameraTourStore.getState().cancel();
  exitDirector();
  commandCircuitStore.getState().deactivate();
  streamPlaybackStore.setState({
    followCameraMode: "orbitOverride",
    orbitTargetDamping: null,
  });
}

export function useFollowCamera() {
  const source = useDataSource();
  const watching = useLiveSelector((s) => s.role === "watcher" && s.liveReady);
  const enabled = source === "demo" || (source === "live" && watching);
  return {
    enabled,
    followPlayer(player: PlayerRosterEntry): boolean {
      if (!enabled) return false;
      const resolver = getPlayerResolver();
      const ref = resolver.refresh(referencePlayer(player, resolver.scope));
      const match = lookupPlayerBody(ref);
      if (match.status === "ambiguous") return false;
      takeCamera();
      if (match.body) {
        enterWatchFollow(match.body.id);
      } else {
        // Keep the selected identity armed through death or scope loss.
        streamPlaybackStore.setState({
          cameraMode: "freeFly",
          followEntityId: null,
          followTargetId: null,
          followPlayer: ref,
          followFlagSlot: null,
          lastFollowTargetId:
            player.targetId != null && player.targetId >= 0
              ? player.targetId
              : null,
          lastFollowGhostIndex: null,
        });
      }
      return true;
    },
    followFlag(slot: number): boolean {
      if (!enabled || !resolveFlagEntityId(slot)) return false;
      takeCamera();
      enterFlagFollow(slot);
      return true;
    },
  };
}

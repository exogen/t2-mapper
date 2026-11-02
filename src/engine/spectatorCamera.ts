import { createLogger } from "../logger";
import {
  liveConnectionStore,
  type LiveConnectionState,
} from "../state/liveConnectionStore";
import { replayConnectionStore } from "../state/replayConnectionStore";
import { engineStore } from "../state/engineStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { cycleWatchObserverMode, exitWatchFollow } from "../state/watchFollow";
import { cameraRegistry } from "../state/cameraRegistry";
import { subscribeAction } from "../state/inputControls";
import { yawPitchToQuaternion } from "../stream/streamHelpers";
import type { StreamRecording } from "../stream/types";
import type { LiveStreamAdapter } from "../stream/liveStreaming";
import { FramePriority } from "./framePriority";
import { subscribeFollowActions, syncFollowCameraMode } from "./followControls";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";
import { torqueVecToThree } from "../scene/coordinates";

const log = createLogger("SpectatorController");

/** The watch adapter while a watch session is running. */
function watchedAdapter(state: LiveConnectionState) {
  return state.adapter &&
    state.watchStatus !== null &&
    state.watchStatus !== "ended"
    ? state.adapter
    : null;
}

function replayAdapter() {
  const replay = replayConnectionStore.getState();
  return replay.adapter;
}

const isWatching = () =>
  replayAdapter() != null ||
  watchedAdapter(liveConnectionStore.getState()) != null;

/**
 * Watch-mode companion to InputConsumer: wires the watch adapter into the
 * engine store as a live StreamRecording and drives the client-side
 * camera modes — free-fly by default, orbit-follow of a selected player
 * (see watchFollow.ts). Because watch mode never sets `gameStatus`,
 * InputConsumer stays on its local-input path (no moves, no prediction) —
 * this handles recording lifecycle, initial placement, and the
 * fly↔follow input actions.
 */
export function installSpectator(engine: GameEngine): () => void {
  let activeAdapter: LiveStreamAdapter | null = null;
  let placed = false;
  let replayMission: string | null = null;

  const detach = () => {
    if (!activeAdapter) return;
    const current = engineStore.getState().playback.recording;
    if (current?.source === "live") {
      engineStore.getState().setRecording(null);
    }
    streamPlaybackStore.setState({ cameraMode: "original" });
    activeAdapter = null;
    placed = false;
  };

  const attach = () => {
    const adapter =
      replayAdapter() ?? watchedAdapter(liveConnectionStore.getState());
    if (!adapter) {
      detach();
      return;
    }
    if (activeAdapter === adapter) return;
    log.info("wiring watch adapter to engine store");
    const liveState = liveConnectionStore.getState();
    const replay =
      adapter === replayAdapter() ? replayConnectionStore.getState() : null;
    const recording: StreamRecording = {
      source: "live",
      duration: Infinity,
      missionName: replay ? adapter.missionName : (liveState.mapName ?? null),
      gameType: null,
      serverDisplayName: replay
        ? adapter.serverDisplayName
        : (liveState.serverName ?? null),
      recorderName: null,
      recordingDate: null,
      streamingPlayback: adapter,
    };
    engineStore.getState().setRecording(recording);
    engineStore
      .getState()
      .setPlaybackStatus(
        replay
          ? replay.state?.status === "playing" && replay.ready
            ? "playing"
            : "paused"
          : "playing",
      );
    streamPlaybackStore.setState({ cameraMode: "freeFly" });
    activeAdapter = adapter;
    placed = false;
    replayMission = null;
  };

  return combineCleanups(
    detach,
    reaction(liveConnectionStore, watchedAdapter, attach),
    reaction(replayConnectionStore, (state) => state.adapter, attach),
    // Re-place the camera whenever the world (re)hydrates: initial join
    // and every mission change / session reconnect drop liveReady to
    // false first. A follow target from the old mission is meaningless —
    // exit follow.
    reaction(
      liveConnectionStore,
      (state) => state.liveReady,
      (liveReady) => {
        if (!liveReady && activeAdapter !== replayAdapter()) {
          placed = false;
          exitWatchFollow();
        }
      },
    ),
    reaction(
      replayConnectionStore,
      (state) => (state.ready ? state.missionIdentity : null),
      (mission) => {
        if (!mission) return;
        if (replayMission && replayMission !== mission) {
          placed = false;
          exitWatchFollow();
        }
        replayMission = mission;
      },
    ),
    // Client-side fly↔follow controls, mirroring the real observer's:
    // F toggles modes, N / Shift-N or captured clicks cycle players
    // while following (fire and jet triggers), with the same keys in the
    // command circuit to observe the next/previous player.
    subscribeAction("toggleObserverMode", () => {
      if (isWatching()) cycleWatchObserverMode();
    }),
    subscribeFollowActions(isWatching),
    engine.scheduler.add(FramePriority.CameraSelect, () => {
      if (!activeAdapter) return;
      // StreamPlaybackSession's start calls resetStreamPlayback()
      // (cameraMode → "original") after we set freeFly, and does so again
      // on every recording change — keep enforcing the spectator camera:
      // orbitOverride while following, freeFly otherwise. Follow survives
      // respawns (resolveWatchFollowTarget re-locks onto the player's new
      // body); while they have no body at all the camera free-flies in
      // place with follow still armed.
      if (
        !syncFollowCameraMode() &&
        streamPlaybackStore.getState().cameraMode !== "freeFly"
      ) {
        streamPlaybackStore.setState({ cameraMode: "freeFly" });
      }
      const ready =
        activeAdapter === replayAdapter()
          ? replayConnectionStore.getState().ready
          : liveConnectionStore.getState().liveReady;
      if (placed || !ready) return;
      // The relay only sends neutral moves, so its server-side observer camera
      // sits exactly where the server placed it (an observer drop point,
      // chosen per map on connect and on each mission change). Placing
      // spectators there gives the same initial view a real client gets.
      const target = cameraRegistry.perspective;
      if (!target) return;
      // Wait for real control-object data (fresh index + data) — after a
      // mission change the engine can synthesize a camera from the stale
      // compressionPoint with zeroed yaw/pitch before the server re-scopes
      // its observer camera on the new map.
      if (!activeAdapter.hasControlObject()) return;
      const snapshot = activeAdapter.getSnapshot();
      const streamCamera = snapshot?.camera;
      // Require yaw/pitch: real control-camera data always carries them,
      // while getSnapshot's placeholder camera doesn't — never place at
      // the placeholder.
      if (
        streamCamera?.position &&
        typeof streamCamera.yaw === "number" &&
        typeof streamCamera.pitch === "number"
      ) {
        // Torque coords (x=east, y=north, z=up) → Three.js (x=north, y=up, z=east).
        const [tx, ty, tz] = streamCamera.position;
        torqueVecToThree(streamCamera.position, target.position);
        const [qx, qy, qz, qw] = yawPitchToQuaternion(
          streamCamera.yaw,
          streamCamera.pitch,
        );
        target.quaternion.set(qx, qy, qz, qw);
        placed = true;
        log.info(
          "placed spectator camera at (%s, %s, %s)",
          tx.toFixed(1),
          ty.toFixed(1),
          tz.toFixed(1),
        );
      }
    }),
  );
}

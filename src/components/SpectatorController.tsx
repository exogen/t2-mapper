import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { createLogger } from "../logger";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { useEngineStoreApi } from "../state/engineStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  cycleWatchFollow,
  cycleWatchObserverMode,
  enterWatchFollow,
  exitWatchFollow,
  resolveWatchFollowTarget,
} from "../state/watchFollow";
import { cameraRegistry } from "../state/cameraRegistry";
import { useInputAction } from "./InputControls";
import { yawPitchToQuaternion } from "../stream/streamHelpers";
import type { StreamRecording } from "../stream/types";
import type { LiveStreamAdapter } from "../stream/liveStreaming";

const log = createLogger("SpectatorController");

/**
 * Watch-mode companion to InputConsumer: wires the watch adapter into the
 * engine store as a live StreamRecording and drives the client-side
 * camera modes — free-fly by default, orbit-follow of a selected player
 * (see watchFollow.ts). Because watch mode never sets `gameStatus`,
 * InputConsumer stays on its local-input path (no moves, no prediction) —
 * this component handles recording lifecycle, initial placement, and the
 * fly↔follow input actions.
 */
export function SpectatorController() {
  const adapter = useLiveSelector((s) => s.adapter);
  const watchStatus = useLiveSelector((s) => s.watchStatus);
  const liveReady = useLiveSelector((s) => s.liveReady);
  const store = useEngineStoreApi();
  const activeAdapterRef = useRef<LiveStreamAdapter | null>(null);
  const placedRef = useRef(false);

  const isWatching =
    !!adapter && watchStatus !== null && watchStatus !== "ended";

  useEffect(() => {
    if (isWatching && adapter) {
      if (activeAdapterRef.current === adapter) return;
      log.info("wiring watch adapter to engine store");
      const liveState = liveConnectionStore.getState();
      const liveRecording: StreamRecording = {
        source: "live",
        duration: Infinity,
        missionName: liveState.mapName ?? null,
        gameType: null,
        serverDisplayName: liveState.serverName ?? null,
        recorderName: null,
        recordingDate: null,
        streamingPlayback: adapter,
      };
      store.getState().setRecording(liveRecording);
      store.getState().setPlaybackStatus("playing");
      streamPlaybackStore.setState({ cameraMode: "freeFly" });
      activeAdapterRef.current = adapter;
    } else if (!isWatching && activeAdapterRef.current) {
      const current = store.getState().playback.recording;
      if (current?.source === "live") {
        store.getState().setRecording(null);
      }
      streamPlaybackStore.setState({ cameraMode: "original" });
      activeAdapterRef.current = null;
    }
  }, [isWatching, adapter, store]);

  // Re-place the camera whenever the world (re)hydrates: initial join and
  // every mission change / session reconnect drop liveReady to false first.
  // A follow target from the old mission is meaningless — exit follow.
  useEffect(() => {
    if (!liveReady) {
      placedRef.current = false;
      exitWatchFollow();
    }
  }, [liveReady]);

  // Client-side fly↔follow controls, mirroring the real observer's:
  // F toggles modes, fire/click cycles players while following, and
  // ArrowRight (command circuit) observes the next player.
  useInputAction("toggleObserverMode", () => {
    if (isWatching) cycleWatchObserverMode();
  });
  useInputAction("nextPlayer", () => {
    if (isWatching && streamPlaybackStore.getState().followEntityId) {
      cycleWatchFollow();
    }
  });
  useInputAction("observeNextPlayer", () => {
    if (!isWatching) return;
    if (streamPlaybackStore.getState().followEntityId) {
      cycleWatchFollow();
    } else {
      enterWatchFollow();
    }
  });

  useFrame(() => {
    if (!activeAdapterRef.current) return;
    // StreamingController's mount effect calls resetStreamPlayback()
    // (cameraMode → "original") after we set freeFly, and does so again
    // on every recording change — keep enforcing the spectator camera:
    // orbitOverride while following, freeFly otherwise. Follow survives
    // respawns (resolveWatchFollowTarget re-locks onto the player's new
    // body); while they have no body at all the camera free-flies in
    // place with follow still armed.
    const spState = streamPlaybackStore.getState();
    if (spState.followEntityId) {
      const target = resolveWatchFollowTarget();
      if (target) {
        const wanted = streamPlaybackStore.getState().followCameraMode;
        if (streamPlaybackStore.getState().cameraMode !== wanted) {
          streamPlaybackStore.setState({ cameraMode: wanted });
        }
      } else if (streamPlaybackStore.getState().cameraMode !== "freeFly") {
        streamPlaybackStore.setState({ cameraMode: "freeFly" });
      }
    } else if (spState.cameraMode !== "freeFly") {
      streamPlaybackStore.setState({ cameraMode: "freeFly" });
    }
    if (placedRef.current || !liveReady) return;
    // The relay never sends moves, so its server-side observer camera sits
    // exactly where the server placed it (an observer drop point, chosen
    // per map on connect and on each mission change). Placing spectators
    // there gives the same initial view a real client gets.
    // Wait for the REGISTERED render camera: ObserverCamera mounts under
    // Suspense and replaces the default camera (makeDefault, at [0,256,0])
    // — placing before it registers writes to a camera that's about to be
    // swapped out, stranding the view at the world origin.
    const target = cameraRegistry.perspective;
    if (!target) return;
    // Wait for real control-object data (fresh index + data) — after a
    // mission change the engine can synthesize a camera from the stale
    // compressionPoint with zeroed yaw/pitch before the server re-scopes
    // its observer camera on the new map.
    if (!activeAdapterRef.current.hasControlObject()) return;
    const snapshot = activeAdapterRef.current.getSnapshot();
    const streamCamera = snapshot?.camera;
    // Require yaw/pitch: real control-camera data always carries them,
    // while buildSnapshot's placeholder camera doesn't — never place at
    // the placeholder.
    if (
      streamCamera?.position &&
      typeof streamCamera.yaw === "number" &&
      typeof streamCamera.pitch === "number"
    ) {
      // Torque coords (x=east, y=north, z=up) → Three.js (x=north, y=up, z=east).
      const [tx, ty, tz] = streamCamera.position;
      target.position.set(ty, tz, tx);
      const [qx, qy, qz, qw] = yawPitchToQuaternion(
        streamCamera.yaw,
        streamCamera.pitch,
      );
      target.quaternion.set(qx, qy, qz, qw);
      placedRef.current = true;
      log.info(
        "placed spectator camera at (%s, %s, %s)",
        tx.toFixed(1),
        ty.toFixed(1),
        tz.toFixed(1),
      );
    }
  });

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      if (activeAdapterRef.current) {
        const current = store.getState().playback.recording;
        if (current?.source === "live") {
          store.getState().setRecording(null);
        }
        streamPlaybackStore.setState({ cameraMode: "original" });
        activeAdapterRef.current = null;
      }
    };
  }, [store]);

  return null;
}

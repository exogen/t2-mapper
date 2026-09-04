import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import { createLogger } from "../logger";
import { cameraRegistry } from "../state/cameraRegistry";
import { demoDirectorStore } from "../state/demoDirectorStore";
import { directorCamDebug, orbitSpringDebug } from "../state/cameraDebug";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { demoClock } from "../director/shotLog";

const log = createLogger("camdbg");

/** Angular speed above this (rad/s) is a twitch worth reporting. */
const SPIKE_ANGULAR_RATE = 1.2;
/** Positional speed above this (m/s) is a jump worth reporting. */
const SPIKE_POSITION_RATE = 120;
/** At most this many spike lines per second — a sustained whip logs
 *  its onset, not a firehose. */
const MAX_LINES_PER_SEC = 6;

/**
 * Camera twitch watchdog: mounted AFTER every camera driver so it sees
 * each frame's FINAL pose, and logs one line whenever the view turns or
 * moves faster than a deliberate camera move ever should — with the
 * full decision context (shot, camera mode, follow target, spring and
 * pan state) needed to attribute it. Debug tooling; renders nothing.
 */
export function CameraDebugWatchdog() {
  const prevQuat = useRef(new Quaternion());
  const prevPos = useRef(new Vector3());
  const primed = useRef(false);
  const lastLogSec = useRef(0);
  const linesThisSec = useRef(0);

  useFrame((_, delta) => {
    const camera = cameraRegistry.perspective;
    if (!camera || delta <= 0) return;
    if (demoDirectorStore.getState().status !== "playing") {
      primed.current = false;
      return;
    }
    if (!primed.current) {
      primed.current = true;
      prevQuat.current.copy(camera.quaternion);
      prevPos.current.copy(camera.position);
      return;
    }
    const dot = Math.min(1, Math.abs(prevQuat.current.dot(camera.quaternion)));
    const angle = 2 * Math.acos(dot);
    const dist = prevPos.current.distanceTo(camera.position);
    const angRate = angle / delta;
    const posRate = dist / delta;
    prevQuat.current.copy(camera.quaternion);
    prevPos.current.copy(camera.position);
    if (angRate < SPIKE_ANGULAR_RATE && posRate < SPIKE_POSITION_RATE) return;
    const sec = Math.floor(streamClock.time);
    if (sec !== lastLogSec.current) {
      lastLogSec.current = sec;
      linesThisSec.current = 0;
    }
    if (++linesThisSec.current > MAX_LINES_PER_SEC) return;
    const sp = streamPlaybackStore.getState();
    log.info(
      "%s SPIKE ang=%s rad/s pos=%s m/s | %s | mode=%s follow=%s slot=%s | spring{%s target=%s jump=%sm} | pan{%s%s} | travel=%s%s",
      demoClock(streamClock.time),
      angRate.toFixed(2),
      posRate.toFixed(0),
      directorCamDebug.shot || "(no shot)",
      sp.cameraMode,
      sp.followEntityId,
      sp.followFlagSlot,
      orbitSpringDebug.active
        ? `${orbitSpringDebug.frozen ? "frozen" : orbitSpringDebug.handOff ? "handoff" : "track"}`
        : "off",
      orbitSpringDebug.targetId,
      orbitSpringDebug.jump.toFixed(1),
      directorCamDebug.panState,
      directorCamDebug.panActive ? " panning" : "",
      directorCamDebug.travel,
      directorCamDebug.travel === "active"
        ? ` t=${directorCamDebug.travelT.toFixed(2)}`
        : "",
    );
  });

  return null;
}

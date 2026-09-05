import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useStore } from "zustand";
import { engineStore, useEngineSelector } from "../state/engineStore";
import { useDemoLoad } from "../state/demoLoadStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { cameraRegistry } from "../state/cameraRegistry";
import {
  exitToFreeFly,
  findLivingEntityByTargetId,
  followFlag,
} from "../state/watchFollow";
import { parseDemoMoment, type DemoMomentCamera } from "./demoMoment";
import { useDemoQueryState, useDemoTimeQueryState } from "./useQueryParams";
import { createLogger } from "../logger";

const log = createLogger("demoMoment");

/** How long a follow link waits for its player to have a body. */
const FOLLOW_ARM_TIMEOUT_MS = 30_000;

/**
 * Takes a shared link to a moment in the loaded demo: once the demo is
 * ready it seeks to the second the link names and sets up the camera
 * the link describes. A follow is armed as soon as the followed player
 * has a body at the new time — the seek rebuilds the world, so that can
 * be a beat later.
 *
 * Applied once per demo: the URL keeps the moment while the viewer
 * watches on, and a later dropdown pick clears it (see DemoSelect).
 */
export function DemoMomentLoader() {
  const [demoParam] = useDemoQueryState();
  const [t] = useDemoTimeQueryState();
  const recording = useEngineSelector((s) => s.playback.recording);
  const durationMs = useEngineSelector((s) => s.playback.durationMs);
  const sourceUrl = useDemoLoad((s) => s.sourceUrl);
  // Set by StreamingController once it has taken the recording up — the
  // same effect that snapshots the seek nonce as "already handled" and
  // resets the camera mode. A seek or a camera change made before that
  // effect runs is swallowed by it, which is how a link landed at 0:03.
  const attached = useStore(
    streamPlaybackStore,
    (s) => s.playback != null && s.playback === recording?.streamingPlayback,
  );
  const appliedRef = useRef<string | null>(null);
  const pendingFollowRef = useRef<{
    camera: Extract<DemoMomentCamera, { kind: "follow" | "fp" }>;
    untilMs: number;
  } | null>(null);

  useEffect(() => {
    if (!demoParam || recording?.source !== "demo" || !sourceUrl) return;
    if (durationMs <= 0 || !attached) return;
    // The hash is read here, not tracked: the copy button rewrites it
    // for the moment being watched, and that must not seek again.
    const hash = window.location.hash;
    const moment = parseDemoMoment(t, hash);
    if (!moment) return;
    const key = `${demoParam}|${t}|${hash}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;
    // A follow still waiting for its player belongs to the previous
    // link; a player on this demo could share the target id.
    pendingFollowRef.current = null;
    log.info("Seeking to %ds (%s)", moment.timeSec, moment.camera.kind);
    engineStore.getState().seekPlayback(moment.timeSec);
    const cam = moment.camera;
    switch (cam.kind) {
      case "original":
        streamPlaybackStore.setState({
          cameraMode: "original",
          followEntityId: null,
          followTargetId: null,
          followFlagSlot: null,
        });
        break;
      case "fly": {
        exitToFreeFly();
        const camera = cameraRegistry.perspective;
        if (camera) {
          camera.position.copy(cam.position);
          if (cam.quaternion) camera.quaternion.copy(cam.quaternion);
        }
        break;
      }
      case "flag":
        followFlag(cam.slot);
        applyOrbit(cam);
        break;
      case "follow":
      case "fp":
        pendingFollowRef.current = {
          camera: cam,
          untilMs: performance.now() + FOLLOW_ARM_TIMEOUT_MS,
        };
        break;
    }
  }, [demoParam, t, recording, durationMs, sourceUrl, attached]);

  // A player follow can only be armed once that player has a body at
  // the new time; look for it each frame until it appears.
  useFrame(() => {
    const pending = pendingFollowRef.current;
    if (!pending) return;
    if (performance.now() > pending.untilMs) {
      log.warn(
        "Follow link: player %d never appeared",
        pending.camera.targetId,
      );
      pendingFollowRef.current = null;
      return;
    }
    const entityId = findLivingEntityByTargetId(pending.camera.targetId);
    if (!entityId) return;
    pendingFollowRef.current = null;
    const followCameraMode =
      pending.camera.kind === "fp" ? "firstPersonOverride" : "orbitOverride";
    streamPlaybackStore.setState({
      followEntityId: entityId,
      followTargetId: pending.camera.targetId,
      lastFollowTargetId: pending.camera.targetId,
      followCameraMode,
      cameraMode: followCameraMode,
      followFlagSlot: null,
    });
    applyOrbit(pending.camera);
  });

  return null;
}

function applyOrbit(o: { yaw: number; pitch: number; distance: number }) {
  streamPlaybackStore.setState({
    orbitOverrideYaw: o.yaw,
    orbitOverridePitch: o.pitch,
    ...(Number.isFinite(o.distance)
      ? { orbitOverrideDistance: o.distance }
      : {}),
  });
}

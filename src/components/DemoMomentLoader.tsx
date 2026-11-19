import { useEffect, useRef } from "react";
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
import {
  findDemoMomentProjectile,
  parseDemoMoment,
  type DemoMomentCamera,
} from "./demoMoment";
import { useNavigationQueryState } from "./useQueryParams";
import { createLogger } from "../logger";
import { FramePriority } from "../engine/framePriority";
import { startProjectileTracking } from "../engine/projectileFollow";
import { useEngineFrame } from "./useEngine";
import { demoSourceUrl } from "../stream/demoSources";

const log = createLogger("demoMoment");

/** How long a player or flag link waits for its target to enter scope. */
const FOLLOW_ARM_TIMEOUT_MS = 30_000;

/**
 * Takes a shared link to a moment in the loaded demo: once the demo is
 * ready it seeks to the linked time and applies the camera after the
 * destination frame is ready. Player and flag follows can wait for the
 * target to appear.
 *
 * Applied once per demo: the URL keeps the moment while the viewer
 * watches on, and a later dropdown pick clears it (see DemoSelect).
 */
export function DemoMomentLoader() {
  const [{ demo: demoParam, clip }] = useNavigationQueryState();
  const recording = useEngineSelector((s) => s.playback.recording);
  const hasDuration = useEngineSelector((s) => s.playback.durationMs > 0);
  const sourceUrl = useDemoLoad((s) => s.sourceUrl);
  // Set by StreamPlaybackSession once it has taken the recording up — the
  // same effect that snapshots the seek nonce as "already handled" and
  // resets the camera mode. A seek or a camera change made before that
  // effect runs is swallowed by it, which is how a link landed at 0:03.
  const attached = useStore(
    streamPlaybackStore,
    (s) => s.playback != null && s.playback === recording?.streamingPlayback,
  );
  const appliedRef = useRef<{
    recording: typeof recording;
    key: string;
  } | null>(null);
  const pendingMomentRef = useRef<{
    camera: DemoMomentCamera;
    recording: NonNullable<typeof recording>;
    seekIntentNonce: number;
    untilMs: number | null;
  } | null>(null);

  useEffect(() => {
    if (
      clip ||
      !demoParam ||
      recording?.source !== "demo" ||
      !sourceUrl ||
      sourceUrl !== demoSourceUrl(demoParam)
    ) {
      appliedRef.current = null;
      pendingMomentRef.current = null;
      return;
    }
    if (!hasDuration || !attached) return;
    const applyMoment = () => {
      // Browser events may run before the route effect has switched demos.
      const query = new URLSearchParams(window.location.search);
      if (
        query.get("demo") !== demoParam ||
        query.get("clip") ||
        engineStore.getState().playback.recording !== recording
      ) {
        appliedRef.current = null;
        pendingMomentRef.current = null;
        return;
      }
      const t = Number.parseFloat(query.get("t") ?? "");
      const hash = window.location.hash;
      const moment = parseDemoMoment(t, hash);
      if (!moment) {
        appliedRef.current = null;
        pendingMomentRef.current = null;
        return;
      }
      const key = `${demoParam}|${t}|${hash}`;
      if (
        appliedRef.current?.recording === recording &&
        appliedRef.current.key === key
      )
        return;
      appliedRef.current = { recording, key };
      if (!engineStore.getState().seekPlayback(moment.timeSec)) return;
      pendingMomentRef.current = {
        camera: moment.camera,
        recording,
        seekIntentNonce: engineStore.getState().playback.seekIntentNonce,
        untilMs: null,
      };
      log.info("Seeking to %ds (%s)", moment.timeSec, moment.camera.kind);
    };

    // Copy updates the address bar with replaceState, which fires neither
    // event. Only an actual navigation should seek an already attached demo.
    applyMoment();
    window.addEventListener("popstate", applyMoment);
    window.addEventListener("hashchange", applyMoment);
    return () => {
      window.removeEventListener("popstate", applyMoment);
      window.removeEventListener("hashchange", applyMoment);
    };
  }, [demoParam, recording, hasDuration, sourceUrl, attached, clip]);

  // The destination frame also mounts the map's default camera. Set the
  // linked view after that and only while its seek still owns playback.
  useEngineFrame(FramePriority.CameraSelect, () => {
    const pending = pendingMomentRef.current;
    if (!pending) return;
    const playback = engineStore.getState().playback;
    if (
      playback.recording !== pending.recording ||
      playback.seekIntentNonce !== pending.seekIntentNonce
    ) {
      pendingMomentRef.current = null;
      return;
    }
    // The transport can retry a failed seek under the same seek intent.
    if (playback.status === "seeking" || playback.seekFailed) return;
    const { camera } = pending;
    if (camera.kind === "original") {
      pendingMomentRef.current = null;
      streamPlaybackStore.setState({
        cameraMode: "original",
        followEntityId: null,
        followTargetId: null,
        followPlayer: null,
        followFlagSlot: null,
      });
      return;
    }
    if (camera.kind === "fly") {
      pendingMomentRef.current = null;
      applyFly(camera);
      return;
    }
    if (camera.kind === "projectile") {
      pendingMomentRef.current = null;
      const projectile = findDemoMomentProjectile(camera);
      if (
        !projectile ||
        !startProjectileTracking(
          projectile.id,
          projectile.projectileSourceName,
          camera,
        )
      )
        applyFly(camera.fallback);
      return;
    }
    pending.untilMs ??= performance.now() + FOLLOW_ARM_TIMEOUT_MS;
    if (performance.now() > pending.untilMs) {
      if (camera.kind === "flag")
        log.warn("Follow link: flag %d never appeared", camera.slot);
      else log.warn("Follow link: player %d never appeared", camera.targetId);
      pendingMomentRef.current = null;
      return;
    }
    if (camera.kind === "flag") {
      if (!followFlag(camera.slot)) return;
      pendingMomentRef.current = null;
      streamPlaybackStore.setState(orbitSettings(camera));
      return;
    }
    const entityId = findLivingEntityByTargetId(camera.targetId);
    if (!entityId) return;
    pendingMomentRef.current = null;
    const followCameraMode =
      camera.kind === "fp" ? "firstPersonOverride" : "orbitOverride";
    streamPlaybackStore.setState({
      followEntityId: entityId,
      followTargetId: camera.targetId,
      followPlayer: null,
      lastFollowTargetId: camera.targetId,
      followCameraMode,
      cameraMode: followCameraMode,
      followFlagSlot: null,
      ...orbitSettings(camera),
    });
  });

  return null;
}

function applyFly(view: Extract<DemoMomentCamera, { kind: "fly" }>) {
  exitToFreeFly();
  const camera = cameraRegistry.perspective;
  if (!camera) return;
  camera.position.copy(view.position);
  if (view.quaternion) camera.quaternion.copy(view.quaternion);
}

function orbitSettings(o: { yaw: number; pitch: number; distance: number }) {
  return {
    orbitOverrideYaw: o.yaw,
    orbitOverridePitch: o.pitch,
    ...(Number.isFinite(o.distance)
      ? { orbitOverrideDistance: o.distance }
      : {}),
  };
}

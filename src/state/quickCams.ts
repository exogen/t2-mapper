import { MathUtils } from "three";
import {
  casterStore,
  type QuickCamSlot,
  type SavedCamera,
} from "./casterStore";
import { cameraRegistry } from "./cameraRegistry";
import { liveConnectionStore } from "./liveConnectionStore";
import { gameEntityStore } from "./gameEntityStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { cameraTourStore } from "./cameraTourStore";
import { demoDirectorStore, exitDirector } from "./demoDirectorStore";
import { commandCircuitStore } from "./commandCircuitStore";
import { referencePlayerEntity, lookupPlayerBody } from "./playerResolver";
import { exitToFreeFly, followFlag, resolveFlagEntityId } from "./watchFollow";

function ready() {
  const source = gameEntityStore.getState().dataSource;
  const live = liveConnectionStore.getState();
  return (
    source === "demo" ||
    (source === "live" && live.role === "watcher" && live.liveReady)
  );
}

export function saveQuickCam(
  slot: QuickCamSlot,
  followBehindPlayer = false,
): void {
  const caster = casterStore.getState();
  const perspective = cameraRegistry.perspective;
  if (!ready() || !perspective || !caster.context) return;
  const stream = streamPlaybackStore.getState();
  const automatic =
    cameraTourStore.getState().animation != null ||
    demoDirectorStore.getState().status === "playing";
  const following =
    (stream.followEntityId != null || stream.followPlayer != null) &&
    !automatic;
  const orbit = {
    yaw: stream.orbitOverrideYaw,
    pitch: stream.orbitOverridePitch,
    distance: stream.orbitOverrideDistance,
  };
  // Store horizontal FOV so the framing survives changes in viewport aspect.
  const fov = MathUtils.radToDeg(
    2 *
      Math.atan(
        Math.tan(MathUtils.degToRad(perspective.fov) / 2) * perspective.aspect,
      ),
  );
  let saved: SavedCamera;
  if (
    gameEntityStore.getState().dataSource === "demo" &&
    stream.cameraMode === "original" &&
    !automatic &&
    !commandCircuitStore.getState().active
  ) {
    saved = {
      kind: "original",
      fov,
      followBehindPlayer,
    };
  } else if (!following) {
    saved = {
      kind: "fly",
      position: perspective.position.toArray(),
      quaternion: perspective.quaternion.toArray(),
      fov,
      followBehindPlayer,
    };
  } else if (stream.followFlagSlot != null) {
    saved = {
      kind: "flag",
      slot: stream.followFlagSlot,
      ...orbit,
      fov,
      followBehindPlayer,
    };
  } else {
    const entity = gameEntityStore
      .getState()
      .streamEntities.get(stream.followEntityId!);
    const body = entity?.renderType === "Player" ? entity : undefined;
    const player = (body && referencePlayerEntity(body)) ?? stream.followPlayer;
    if (!player) return;
    const firstPerson =
      stream.cameraMode === "firstPersonOverride" ||
      (stream.cameraMode === "freeFly" &&
        stream.followCameraMode === "firstPersonOverride");
    saved = {
      kind: "player",
      mode: firstPerson ? "firstPerson" : "follow",
      ...orbit,
      fov,
      followBehindPlayer,
      player,
    };
  }
  const ortho = cameraRegistry.ortho;
  if (commandCircuitStore.getState().active && ortho) {
    saved.commandCircuit = {
      x: ortho.position.x,
      z: ortho.position.z,
      zoom: ortho.zoom,
    };
  }
  caster.saveCamera(slot, saved);
}

/** Restore the view, waiting for a player without a living body. */
export function restoreQuickCam(slot: QuickCamSlot): SavedCamera | undefined {
  if (!ready()) return;
  const caster = casterStore.getState();
  const saved = caster.settings?.quickCams[slot];
  const flagSlot = saved?.kind === "flag" ? saved.slot : !saved ? slot : null;
  let entityId: string | null = null;
  let targetId: number | null = null;
  let pending = false;
  let ghostIndex: number | null = null;
  if (flagSlot != null) {
    entityId = resolveFlagEntityId(flagSlot);
    if (!entityId) return;
  } else if (!saved) {
    return;
  } else if (saved.kind === "player") {
    const match = lookupPlayerBody(saved.player);
    if (match.status === "ambiguous") return;
    const entity = match.body;
    entityId = entity?.id ?? null;
    ghostIndex = entity?.ghostIndex ?? null;
    pending = !entity;
    if (
      entity?.renderType === "Player" &&
      entity.targetId != null &&
      entity.targetId >= 0
    )
      targetId = entity.targetId;
  }
  if (!cameraRegistry.perspective) return;
  cameraTourStore.getState().cancel();
  exitDirector();
  commandCircuitStore.getState().deactivate();
  casterStore.setState({
    fov: saved?.kind === "original" ? null : (saved?.fov ?? null),
    lastCameraAction: { slot },
  });
  streamPlaybackStore.setState((s) => ({
    orbitTargetDamping: null,
    orbitSnapNonce: s.orbitSnapNonce + 1,
  }));
  if (flagSlot != null) {
    followFlag(flagSlot);
  } else if (saved?.kind === "original") {
    exitToFreeFly();
    streamPlaybackStore.setState({ cameraMode: "original" });
  } else if (saved?.kind === "fly") {
    exitToFreeFly();
    cameraRegistry.perspective.position.fromArray(saved.position);
    cameraRegistry.perspective.quaternion.fromArray(saved.quaternion);
  } else if (saved?.kind === "player") {
    const mode =
      saved.mode === "firstPerson" ? "firstPersonOverride" : "orbitOverride";
    streamPlaybackStore.setState({
      cameraMode: pending ? "freeFly" : mode,
      followCameraMode: mode,
      followEntityId: entityId,
      followTargetId: targetId,
      followPlayer: saved.player,
      lastFollowTargetId: targetId,
      lastFollowGhostIndex: ghostIndex,
      followFlagSlot: null,
      orbitTargetDamping: null,
    });
  }
  if (saved && saved.kind !== "fly" && saved.kind !== "original") {
    streamPlaybackStore.setState({
      orbitOverrideYaw: saved.yaw,
      orbitOverridePitch: saved.pitch,
      orbitOverrideDistance: saved.distance,
    });
  }
  if (saved?.commandCircuit) {
    commandCircuitStore.getState().activate();
    commandCircuitStore.setState({ viewRequest: saved.commandCircuit });
  }
  return saved;
}

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
import { taglessPlayerName } from "../stream/streamHelpers";
import {
  exitToFreeFly,
  followFlag,
  findLivingPlayersByName,
  resolveFlagEntityId,
} from "./watchFollow";

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
    (stream.followEntityId != null || stream.pendingFollowPlayerName != null) &&
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
      label: "Original view",
      fov,
      followBehindPlayer,
    };
  } else if (!following) {
    saved = {
      kind: "fly",
      label: "Free-fly",
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
      label: `Flag ${stream.followFlagSlot}`,
      fov,
      followBehindPlayer,
    };
  } else {
    const entity = gameEntityStore
      .getState()
      .streamEntities.get(stream.followEntityId!);
    const body = entity?.renderType === "Player" ? entity : undefined;
    const playerName =
      stream.pendingFollowPlayerName ??
      (body && taglessPlayerName(body.playerRawName ?? "", body.playerName));
    if (!playerName) return;
    const firstPerson =
      stream.cameraMode === "firstPersonOverride" ||
      (stream.cameraMode === "freeFly" &&
        stream.followCameraMode === "firstPersonOverride");
    saved = {
      kind: firstPerson ? "fp" : "follow",
      ...orbit,
      fov,
      followBehindPlayer,
      label: `${body?.playerName || playerName} · ${firstPerson ? "First person" : "Follow"}`,
      playerName,
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
  let pendingPlayerName: string | null = null;
  let ghostIndex: number | null = null;
  if (flagSlot != null) {
    entityId = resolveFlagEntityId(flagSlot);
    if (!entityId) return;
  } else if (!saved) {
    return;
  } else if (saved.kind === "follow" || saved.kind === "fp") {
    const matches = findLivingPlayersByName(saved.playerName);
    if (matches.length > 1) return;
    const entity = matches[0];
    entityId = entity?.id ?? null;
    ghostIndex = entity?.ghostIndex ?? null;
    if (!entity) pendingPlayerName = saved.playerName;
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
  } else if (entityId || pendingPlayerName) {
    const mode = saved?.kind === "fp" ? "firstPersonOverride" : "orbitOverride";
    streamPlaybackStore.setState({
      cameraMode: pendingPlayerName ? "freeFly" : mode,
      followCameraMode: mode,
      followEntityId: entityId,
      followTargetId: targetId,
      pendingFollowPlayerName: pendingPlayerName,
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

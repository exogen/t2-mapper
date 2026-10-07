import type { StreamRecording } from "../stream/types";
import { isRelayRecording } from "../stream/demoDate";
import {
  STREAM_TICK_SEC,
  stripTaggedStringMarkup,
} from "../stream/streamHelpers";
import type { TimelineEvent } from "./demoTimelineStore";
import { engineStore, isCurrentPlayback } from "./engineStore";
import { gameEntityStore } from "./gameEntityStore";
import { streamSnapshotStore } from "./streamSnapshotStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { demoDirectorStore, exitDirector } from "./demoDirectorStore";
import {
  enterWatchFollow,
  exitToFreeFly,
  getFollowTargets,
} from "./watchFollow";
import { cameraTourStore } from "./cameraTourStore";

function eventPlayerNames(event: TimelineEvent): (string | undefined)[] {
  const snapshot = streamSnapshotStore.getState().snapshot;
  // The roster reflects renames at the destination; recording metadata may
  // still contain the recorder's original name.
  const recorder =
    snapshot?.playerRoster.find(
      (p) => p.clientId === snapshot.connectedClientId,
    )?.name ??
    gameEntityStore.getState().recorderName ??
    undefined;
  switch (event.type) {
    case "kill":
      return event.killer ? [event.killer] : [];
    case "death":
      return [event.killer ?? event.victim ?? recorder];
    case "flag-grab":
    case "flag-drop":
    case "flag-return":
      if (event.actor) return [event.actor];
      return event.teamAffinity === "friendly" ? [recorder] : [];
    case "flag-cap":
      return event.capturer ? [event.capturer] : [];
    case "rename":
      // The three-second lead-in usually lands before the name change.
      return [event.previousName, event.actor].filter(Boolean);
    case "generator-offline":
    case "generator-online":
      return event.actor ? [event.actor] : [];
    default:
      return [];
  }
}

const normalizeName = (name: string) =>
  stripTaggedStringMarkup(name).trim().toLowerCase();

/** Seek with the usual lead-in, then view the recorder, player or generator. */
export function seekToTimelineEvent(
  recording: StreamRecording | null,
  event: TimelineEvent,
): void {
  if (
    !recording ||
    !isCurrentPlayback(recording) ||
    !Number.isFinite(event.timeSec)
  )
    return;
  cameraTourStore.getState().cancel();
  const useOriginalView =
    event.isRecorder &&
    recording.source === "demo" &&
    !isRelayRecording(recording.recorderName);
  const generator =
    !event.actor &&
    (event.type === "generator-offline" || event.type === "generator-online") &&
    event.generator?.position.every(Number.isFinite)
      ? event.generator
      : undefined;
  const snapshotBeforeSeek = streamSnapshotStore.getState().snapshot;
  engineStore.getState().seekPlayback(Math.max(0, event.timeSec - 3));
  const { seekNonce } = engineStore.getState().playback;
  if (!useOriginalView && eventPlayerNames(event).length === 0 && !generator)
    return;

  const cancel = () => {
    unsubscribeEngine();
    unsubscribeSnapshot();
    unsubscribeCamera();
  };
  const followWhenReady = () => {
    if (!isCurrentPlayback(recording, seekNonce)) {
      cancel();
      return;
    }
    const playback = engineStore.getState().playback;
    if (playback.status === "seeking") return;
    const snapshot = streamSnapshotStore.getState().snapshot;
    // Failed seeks also leave "seeking", but retain the old scene. Require
    // a fresh destination snapshot, and expire BEFORE matching a late body.
    // Snapshots bracket the playhead, so allow one tick around the boundary.
    if (
      !snapshot ||
      snapshot === snapshotBeforeSeek ||
      snapshot.timeSec + STREAM_TICK_SEC < playback.seekTime ||
      snapshot.timeSec > event.timeSec + STREAM_TICK_SEC
    ) {
      cancel();
      return;
    }
    if (useOriginalView) {
      cancel();
      exitDirector();
      streamPlaybackStore.setState({
        cameraMode: "original",
        followEntityId: null,
        followTargetId: null,
        pendingFollowPlayerName: null,
        followFlagSlot: null,
      });
      return;
    }
    if (generator) {
      // IDs change on seek/scope re-entry. Resolve the destination model by
      // datablock and position; keep the recorded point if it isn't in scope.
      const entity = [
        ...gameEntityStore.getState().streamEntities.values(),
      ].find(
        (candidate) =>
          candidate.dataBlockId === generator.dataBlockId &&
          "position" in candidate &&
          candidate.position &&
          candidate.position.every(
            (value, i) => Math.abs(value - generator.position[i]) < 0.25,
          ),
      );
      cancel();
      exitDirector();
      exitToFreeFly();
      const [x, y, z] = generator.position;
      cameraTourStore.getState().flyTo({
        entityId: entity?.id ?? `timeline-generator-${event.timeSec}`,
        label: event.generatorLabel ?? "Generator",
        position: [y, z, x],
      });
      return;
    }
    const players = getFollowTargets().filter((p) => p.flagSlot == null);
    for (const name of eventPlayerNames(event)) {
      if (!name) continue;
      const player = players.find(
        (p) => normalizeName(p.label) === normalizeName(name),
      );
      if (!player) continue;
      cancel();
      exitDirector();
      enterWatchFollow(player.entityId);
      return;
    }
    // A player may spawn during the lead-in. Stop looking at the event so
    // an observer rename or an automatic return cannot grab the camera later.
    if (snapshot.exhausted || snapshot.timeSec >= event.timeSec) cancel();
  };
  const unsubscribeEngine = engineStore.subscribe(
    (s) => s.playback,
    followWhenReady,
  );
  const unsubscribeSnapshot = streamSnapshotStore.subscribe(followWhenReady);
  const unsubscribeCamera = streamPlaybackStore.subscribe((next, previous) => {
    if (demoDirectorStore.getState().status === "playing") return;
    // Explicit follow choices supersede the click. Automatic respawn relocks
    // only change followEntityId/orbit angles and must keep the request alive.
    if (
      next.followTargetId !== previous.followTargetId ||
      next.lastFollowGhostIndex !== previous.lastFollowGhostIndex ||
      next.followFlagSlot !== previous.followFlagSlot ||
      next.followCameraMode !== previous.followCameraMode ||
      (next.followEntityId == null &&
        previous.followEntityId == null &&
        next.cameraMode !== previous.cameraMode)
    ) {
      cancel();
    }
  });
}

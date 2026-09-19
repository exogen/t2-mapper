import type { StreamRecording } from "../stream/types";
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
import { enterWatchFollow, getFollowTargets } from "./watchFollow";

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
    default:
      return [];
  }
}

const normalizeName = (name: string) =>
  stripTaggedStringMarkup(name).trim().toLowerCase();

/** Seek with the usual lead-in, then follow the event's player in that scene. */
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
  const snapshotBeforeSeek = streamSnapshotStore.getState().snapshot;
  engineStore.getState().seekPlayback(Math.max(0, event.timeSec - 3));
  const { seekNonce } = engineStore.getState().playback;
  if (eventPlayerNames(event).length === 0) return;

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

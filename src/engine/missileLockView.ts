import { Vector3 } from "three";
import { torqueToThree } from "../scene/coordinates";
import { resolveCameraOwner } from "../state/cameraOwner";
import { engineStore } from "../state/engineStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { missileTargetAudio } from "../stream/missileLockGeometry";
import type { StreamEntity, StreamSnapshot } from "../stream/types";
import type { GameEngine } from "./gameEngine";
import { readStreamEntityCenter } from "./streamEntityCenter";

export interface MissileLockView {
  subjectId: string;
  outgoing?:
    | { kind: "targeting"; position?: never }
    | {
        kind: "tracking" | "locked";
        position?: readonly [number, number, number];
      };
  incomingLock: boolean;
  inbound: boolean;
}

const center = new Vector3();

type MissileLockSubject = Pick<StreamEntity, "id" | "mountObjectId">;

function matchesMissileTarget(subject: MissileLockSubject, targetId?: string) {
  return (
    targetId !== undefined &&
    (targetId === subject.id || targetId === subject.mountObjectId)
  );
}

export function isRecordedMissileLockTarget(
  lock: StreamSnapshot["missileLock"],
  subject: MissileLockSubject,
): boolean {
  return (
    lock?.outgoing?.kind === "object" &&
    matchesMissileTarget(subject, lock.outgoing.targetId)
  );
}

function readOutgoing(
  engine: GameEngine,
  snapshot: StreamSnapshot,
  outgoing: NonNullable<StreamSnapshot["missileLock"]>["outgoing"],
): MissileLockView["outgoing"] {
  if (!outgoing) return;
  if (outgoing.kind !== "object")
    return {
      kind: outgoing.kind === "tracking" ? "tracking" : "locked",
      position: torqueToThree(outgoing.position),
    };

  const target = outgoing.targetId
    ? snapshot.entities.find(({ id }) => id === outgoing.targetId)
    : undefined;
  const group = target ? engine.entities.get(target.id)?.root : undefined;
  const hasPosition =
    target &&
    readStreamEntityCenter(
      center,
      target,
      group?.parent ? group : undefined,
      streamPlaybackStore.getState().playback,
    );
  // Object lock remains audible even when the target isn't in network scope.
  return {
    kind: "locked",
    ...(hasPosition && { position: center.toArray() }),
  };
}

/** Prefer the packet recipient's exact state and explicit missile targets. */
export function sampleMissileLockView(
  engine: GameEngine,
): MissileLockView | undefined {
  const snapshot = engine.streamSnapshot.current;
  const lock = snapshot?.missileLock;
  const targets = snapshot?.inboundMissileTargetIds;
  const inferred = snapshot?.inferredMissileLocks;
  const { playback, cameraMode, followEntityId, projectileFollow } =
    streamPlaybackStore.getState();
  if (
    !snapshot ||
    snapshot.matchEnded ||
    (!lock?.outgoing &&
      !lock?.selfLocked &&
      !lock?.selfHomed &&
      !targets?.length &&
      !inferred?.length &&
      (cameraMode !== "firstPersonOverride" || !followEntityId))
  )
    return;

  const { recording, status, seekFailed } = engineStore.getState().playback;
  const owner = resolveCameraOwner();
  if (
    !recording ||
    recording.streamingPlayback !== playback ||
    status === "seeking" ||
    seekFailed ||
    cameraMode === "freeFly" ||
    projectileFollow?.kind === "tracking" ||
    engine.clipCameraTransition ||
    owner === "tour"
  )
    return;

  const controlId =
    snapshot.controlPlayerGhostId ?? snapshot.camera?.controlEntityId;
  const subjectId =
    cameraMode === "original"
      ? (controlId ?? snapshot.camera?.orbitTargetId)
      : followEntityId;
  if (!subjectId) return;
  const subject = snapshot.entities.find(({ id }) => id === subjectId);
  if (
    !subject ||
    subject.destroyedHidden ||
    (subject.type !== "Player" &&
      subject.type !== "Vehicle" &&
      subject.className !== "Turret") ||
    (subject.type === "Player" && subject.damageState)
  )
    return;

  if (subjectId === controlId) {
    if (!lock) return;
    return {
      subjectId,
      outgoing: readOutgoing(engine, snapshot, lock.outgoing),
      incomingLock: lock.selfLocked,
      inbound: lock.selfHomed,
    };
  }

  const targetId = inferred?.find(
    (lock) => lock.shooterId === subjectId,
  )?.targetId;
  const isSubject = (id: string) => matchesMissileTarget(subject, id);
  // The outgoing packet fields come from the controlled turret/vehicle
  // when present. Incoming fields still belong to the recording player.
  const recordedSourceId = snapshot.camera?.controlEntityId ?? controlId;
  const sourceImage = isRecordedMissileLockTarget(lock, subject)
    ? snapshot.entities.find(({ id }) => id === recordedSourceId)
        ?.imageSlots?.[0]
    : undefined;
  const incomingLock =
    (sourceImage !== undefined &&
      missileTargetAudio(playback.getDataBlockData(sourceImage.dataBlockId)) ===
        true) ||
    (inferred?.some((lock) => lock.warnTarget && isSubject(lock.targetId)) ??
      false);
  const inbound = targets?.some(isSubject) ?? false;
  const image = subject.imageSlots?.[0];
  // The ghost's seeker flag covers searching and locking. The position
  // and which of those states applies are private to the recording client.
  const targeting =
    !targetId &&
    cameraMode === "firstPersonOverride" &&
    owner !== "commandCircuit" &&
    engine.recordingFollowEye !== false &&
    subject.type === "Player" &&
    !subject.mountObjectId &&
    image?.imageState?.target === true &&
    image.imageState.wet === false &&
    playback.getDataBlockData(image.dataBlockId)?.isSeeker === true;
  if (targetId || targeting || incomingLock || inbound)
    return {
      subjectId,
      outgoing: targetId
        ? readOutgoing(engine, snapshot, { kind: "object", targetId })
        : targeting
          ? { kind: "targeting" }
          : undefined,
      incomingLock,
      inbound,
    };
}

import { Vector3 } from "three";
import {
  eventFlagSlot,
  playersAtSecFor,
  playerSampleAt,
  sampleAt,
  sampleIndexAt,
  type FlagTrack,
} from "./dataset";
import { paddedFrameWeight } from "./frameScore";
import { bearingYaw, dist } from "./geometry";
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
} from "./types";

type FollowShot = Extract<Shot, { kind: "followFlag" | "followPlayer" }>;

const THROW_LEAD_SEC = 4;
const NEAR_CARRIER_RANGE = 45;

interface CarrierFraming {
  candidateYaws: readonly number[];
  hasThrow: boolean;
  scoreAt(
    timeSec: number,
    eye: Vector3,
    aim: Vector3,
    visible?: (eye: Vector3, point: Vector3) => boolean,
  ): number;
}

/** Rank clear orbits by the story around the carrier. Show outgoing
 * throws from behind, and otherwise look for a view of the nearby
 * players on either team without losing the carrier. */
export function carrierFramingFor(
  shot: FollowShot,
  dataset: DirectorDataset,
  tracks: ReadonlyMap<number, FlagTrack>,
): CarrierFraming | null {
  if (shot.kind === "followPlayer" && shot.firstPerson) return null;
  const track =
    shot.kind === "followFlag"
      ? tracks.get(shot.slot)
      : [...tracks.values()].find(
          ({ samples }) =>
            heldAt(samples, shot.startSec, dataset)?.carrierTargetId ===
            shot.targetId,
        );
  if (!track) return null;

  const start = heldAt(track.samples, shot.startSec, dataset);
  if (start?.carrierTargetId == null) return null;
  const throwYaw = outgoingFlagYaw(shot, dataset, track, start.carrierTargetId);
  const playersAtSec = playersAtSecFor(dataset);
  const frames = new Map<
    number,
    {
      yaw: number | undefined;
      allies: Vector3[];
      enemies: Vector3[];
    }
  >();

  const frameAt = (timeSec: number) => {
    const existing = frames.get(timeSec);
    if (existing) return existing;
    const held = heldAt(track.samples, timeSec, dataset);
    const carrierId = held?.carrierTargetId;
    const followsCarrier =
      held != null &&
      carrierId != null &&
      (shot.kind === "followFlag" || shot.targetId === carrierId);
    const carrier = followsCarrier
      ? playerSampleAt(dataset, carrierId, timeSec, dataset.playerSampleStepSec)
      : null;
    const players = playersAtSec.get(Math.round(timeSec)) ?? [];
    const frame = {
      yaw: followsCarrier
        ? (travelYaw(track.samples, held, dataset) ?? carrier?.heading)
        : undefined,
      ...nearbyPlayers(players, carrier, dataset.durationSec),
    };
    frames.set(timeSec, frame);
    return frame;
  };

  const leadYaw = throwYaw ?? frameAt(shot.startSec).yaw;
  const candidateYaws =
    leadYaw == null
      ? []
      : [leadYaw, leadYaw - Math.PI / 4, leadYaw + Math.PI / 4];

  return {
    candidateYaws,
    hasThrow: throwYaw != null,
    scoreAt(timeSec, eye, aim, visible) {
      const { allies, enemies, yaw } = frameAt(timeSec);
      const heading = throwYaw ?? yaw;
      const viewYaw = Math.atan2(aim.z - eye.z, aim.x - eye.x);
      const behind =
        heading == null ? 0.5 : 0.5 + 0.5 * Math.cos(heading - viewYaw);
      const groups = Number(allies.length > 0) + Number(enemies.length > 0);
      if (!groups) return behind;

      const company =
        (bestFrameWeight(allies, eye, aim, visible) +
          bestFrameWeight(enemies, eye, aim, visible)) /
        groups;
      const behindWeight = throwYaw == null ? 0.2 : 0.8;
      return behindWeight * behind + (1 - behindWeight) * company;
    },
  };
}

function heldAt(
  samples: readonly DirectorFlagSample[],
  timeSec: number,
  dataset: DirectorDataset,
): DirectorFlagSample | null {
  const sample = sampleAt(samples, Math.min(timeSec, dataset.durationSec));
  return sample?.status === "held" &&
    timeSec - sample.timeSec <= 2 * dataset.flagSampleStepSec
    ? sample
    : null;
}

function travelYaw(
  samples: readonly DirectorFlagSample[],
  now: DirectorFlagSample,
  dataset: DirectorDataset,
): number | undefined {
  const before = heldAt(samples, now.timeSec - 1, dataset);
  const after = heldAt(samples, now.timeSec + 1, dataset);
  const from = before?.carrierTargetId === now.carrierTargetId ? before : now;
  const to = after?.carrierTargetId === now.carrierTargetId ? after : now;
  return movingYaw(from.pos, to.pos, 3);
}

/** Use the first part of the loose flag's actual trajectory, or the
 * receiving teammate for a direct handoff. This evidence can be ready
 * inside the live lookahead, before commentary settles on a drop label. */
function outgoingFlagYaw(
  shot: FollowShot,
  dataset: DirectorDataset,
  track: FlagTrack,
  carrierId: number,
): number | undefined {
  const until = Math.min(
    shot.endSec,
    shot.startSec + THROW_LEAD_SEC,
    dataset.durationSec,
  );
  const { samples } = track;
  for (
    let i = sampleIndexAt(samples, shot.startSec) + 1;
    i < samples.length;
    i++
  ) {
    const next = samples[i];
    if (next.timeSec > until || next.status === "home") break;
    if (next.carrierTargetId === carrierId) continue;

    const release = samples[i - 1];
    const releaseWindow = 2 * dataset.flagSampleStepSec;
    if (
      next.timeSec - release.timeSec > releaseWindow ||
      dataset.deaths.some(
        (death) =>
          death.targetId === carrierId &&
          death.timeSec > next.timeSec - releaseWindow &&
          death.timeSec <= next.timeSec,
      ) ||
      dataset.events.some(
        (event) =>
          event.type === "flag-drop" &&
          event.dropKind === "died" &&
          event.timeSec <= dataset.durationSec &&
          Math.abs(next.timeSec - event.timeSec) <= releaseWindow &&
          eventFlagSlot(event, dataset) === track.slot,
      )
    )
      return undefined;

    if (next.status === "held") {
      const receiverId = next.carrierTargetId;
      if (receiverId == null) return undefined;
      const thrower = playerSampleAt(dataset, carrierId, release.timeSec, 1);
      const receiver = playerSampleAt(dataset, receiverId, next.timeSec, 1);
      return thrower?.teamId != null && receiver?.teamId === thrower.teamId
        ? movingYaw(release.pos, next.pos, 5)
        : undefined;
    }

    const later = samples[i + 1];
    // Distinguish a flag flying away from a carrier who was moving
    // quickly between the last held sample and the drop.
    return later?.status === "field" &&
      later.timeSec <= dataset.durationSec &&
      later.timeSec - next.timeSec <= releaseWindow
      ? movingYaw(next.pos, later.pos, 5)
      : undefined;
  }
  return undefined;
}

function movingYaw(
  from: DirectorVec3,
  to: DirectorVec3,
  minTravel: number,
): number | undefined {
  return Math.hypot(to[0] - from[0], to[1] - from[1]) >= minTravel
    ? bearingYaw(from, to)
    : undefined;
}

function nearbyPlayers(
  players: readonly DirectorPlayerSample[],
  carrier: DirectorPlayerSample | null,
  horizonSec: number,
) {
  const allies: Vector3[] = [];
  const enemies: Vector3[] = [];
  if (carrier?.teamId == null) return { allies, enemies };
  const nearby = players
    .filter(
      (player) =>
        player.targetId !== carrier.targetId &&
        player.teamId != null &&
        player.timeSec <= horizonSec &&
        player.health !== 0,
    )
    .map((player) => ({ player, distance: dist(player.pos, carrier.pos) }))
    .filter(({ distance }) => distance <= NEAR_CARRIER_RANGE)
    .sort((a, b) => a.distance - b.distance);
  for (const { player } of nearby) {
    const group = player.teamId === carrier.teamId ? allies : enemies;
    const [x, y, z] = player.pos;
    if (group.length < 2) group.push(new Vector3(y, z + 1, x));
  }
  return { allies, enemies };
}

function bestFrameWeight(
  points: readonly Vector3[],
  eye: Vector3,
  aim: Vector3,
  visible?: (eye: Vector3, point: Vector3) => boolean,
): number {
  let best = 0;
  for (const point of points) {
    const score = paddedFrameWeight(eye, aim, point);
    if (score > best && (!visible || visible(eye, point))) best = score;
  }
  return best;
}

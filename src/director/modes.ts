/**
 * One planner per game mode, plus the graceful degradation between them.
 *
 * CTF is the real one: score the subjects, cut the timeline into
 * segments, then hand each segment to the shot builders. The others
 * exist so the director never fails on a recording it does not fully
 * understand — Rabbit chases the single flag, deathmatch orbits kill
 * clusters, and landmarks tours the map when there is nothing else to
 * go on.
 */
import type {
  DirectorDataset,
  DirectorEvent,
  DirectorVec3,
  Shot,
} from "./types";
import {
  DIRECTOR_MIN_RUN_SEC,
  DIRECTOR_FIXED_CHUNK_SEC,
  DIRECTOR_ANTICIPATION_SEC,
  DIRECTOR_BASE_ORBIT_RADIUS,
  DIRECTOR_BASE_ORBIT_SPEED,
  DIRECTOR_CLUSTER_OVERHEAD_HEIGHT,
  DIRECTOR_CLUSTER_OVERHEAD_KILLS,
  DIRECTOR_CLUSTER_RADIUS,
  DIRECTOR_CLUSTER_WINDOW_SEC,
  DIRECTOR_CROWD_ORBIT_HEIGHT,
  DIRECTOR_FIXED_HOLD_RADIUS,
  DIRECTOR_CROWD_ORBIT_RADIUS,
  DIRECTOR_KICKOFF_WIDE_SEC,
  DIRECTOR_DIST_CHASE,
  DIRECTOR_DIST_HERO,
  DIRECTOR_DOLLY_DISTANCE,
  DIRECTOR_DOLLY_HEIGHT,
  DIRECTOR_DOLLY_MIN_SEC,
  DIRECTOR_LINEUP_LEAD_SEC,
  DIRECTOR_MIN_SHOT_HOLD_SEC,
  DIRECTOR_PITCH_CHASE,
  DIRECTOR_STAND_BATTLE_SPEED,
} from "./tunables";
import { centroid, dist } from "./geometry";
import {
  buildFlagTracks,
  crowdThreshold,
  flagLabel,
  playersAtSecFor,
} from "./dataset";
import type { FlagTrack, PlayersAtSec } from "./dataset";
import { busiestCluster } from "./analysis";
import { newShotVariety, radiusForSpread } from "./framing";
import {
  buildSubjects,
  interestContext,
  scoreSubjects,
  segmentByInterest,
} from "./interest";
import type { Segment } from "./interest";
import { lineupShots } from "./lineup";
import {
  bombardmentShots,
  idleShots,
  pushReachingBack,
  situationalShot,
} from "./shotBuilders";
import { flagSegmentShots } from "./flagRuns";

/**
 * The kickoff wide: an overhead of everybody streaming out of the
 * bases in the first seconds after the whistle. Centered between the
 * teams' spawn crowds, sized to hold both (fog-capped), dead static —
 * the motion on screen is the players', not the camera's.
 */
function kickoffWideShot(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): Shot | null {
  // Frame the biggest KNOT of the rush, not the midpoint of the map:
  // two teams leaving opposite bases average out to a centroid where
  // nobody is — on a sparse, foggy server that camera stares at an
  // empty hill with every player beyond the fog. The busiest cluster is
  // where the picture is, and its members are inside the frame by
  // construction.
  const rush = busiestCluster(startSec, endSec, playersAtSec);
  if (!rush || rush.count < 3) return null;
  const center = rush.center;
  const positions: DirectorVec3[] = [];
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    for (const p of playersAtSec.get(sec) ?? []) {
      if (dist(p.pos, center) <= DIRECTOR_FIXED_HOLD_RADIUS) {
        positions.push(p.pos);
      }
    }
  }
  if (positions.length < 4) return null;
  const spread = Math.max(...positions.map((p) => dist(p, center)));
  const radius = radiusForSpread(spread, dataset);
  // Hold only while the rush is still IN the frame — within the shot's
  // own radius, which the fog cap already bounds. Skiers disperse
  // within seconds on a sparse server, and a static wide over an
  // emptied hill is a shot of nothing. End when fewer than three
  // players remain inside the framing.
  let holdUntil = startSec;
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    const near = (playersAtSec.get(sec) ?? []).filter(
      (p) => dist(p.pos, center) <= radius,
    ).length;
    if (near < 3) break;
    holdUntil = sec + 1;
  }
  if (holdUntil - startSec < DIRECTOR_MIN_SHOT_HOLD_SEC) return null;
  return {
    kind: "fixedOrbit",
    center,
    radius,
    angularSpeed: 0,
    heightFactor: DIRECTOR_CROWD_ORBIT_HEIGHT,
    startSec,
    endSec: holdUntil,
    transitionIn: "cut",
    // Neutral wording: the booth echoes camera labels, and at kickoff
    // players scatter BOTH ways (spawns out, invs in) — see `moving`.
    reason: "Kickoff — match is live",
  };
}

/**
 * CTF: interest grid → segments → shots. The pre-match line-up window is
 * carved out first and owned exclusively by the roster sweeps.
 */
export function planCtf(dataset: DirectorDataset): Shot[] {
  const tracks = buildFlagTracks(dataset);
  const slots = [...tracks.keys()].sort((a, b) => a - b);
  if (slots.length === 0) return planDeathmatch(dataset);
  const playersAtSec = playersAtSecFor(dataset);
  const ctx = interestContext(dataset, tracks, playersAtSec);
  const subjects = buildSubjects(dataset, slots);
  const segments = segmentByInterest(
    subjects,
    scoreSubjects(subjects, ctx),
    ctx,
  );
  const shots = emitCtfShots(segments, dataset, tracks, playersAtSec);
  applyAnticipation(shots, tracks);
  return shots;
}

/** Segments → shots, threading the variety state that keeps successive
 *  shots from looking alike. */
function emitCtfShots(
  segments: Segment[],
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
  playersAtSec: PlayersAtSec,
): Shot[] {
  const shots: Shot[] = [];
  let baseFlip = 1;
  const variety = newShotVariety();
  const crowdMin = crowdThreshold(dataset, playersAtSec);
  // The run-up to the whistle is the line-up: the teams stand assembled
  // and nothing moves, so sweep the ranks rather than orbit flags that
  // cannot budge. Only that last stretch counts — anything earlier is
  // team-picking on a filling server, which gets skipped, not covered.
  const matchStart = dataset.events.find(
    (e) => e.type === "match-start",
  )?.timeSec;
  const preMatchEnd =
    matchStart != null ? Math.min(matchStart, dataset.durationSec) : 0;
  const lineupStart = Math.max(0, preMatchEnd - DIRECTOR_LINEUP_LEAD_SEC);
  if (preMatchEnd - lineupStart >= DIRECTOR_MIN_SHOT_HOLD_SEC) {
    shots.push(...lineupShots(lineupStart, preMatchEnd, dataset, playersAtSec));
  }
  // The whistle itself: one wide overhead of the spawn rush. Everyone
  // pouring out of the bases is the only action anywhere in the first
  // seconds, and it establishes both teams' opening routes — the flags
  // certainly aren't doing anything yet.
  let exclusiveEnd = preMatchEnd;
  if (matchStart != null && matchStart < dataset.durationSec - 5) {
    const kickoff = kickoffWideShot(
      matchStart,
      Math.min(dataset.durationSec, matchStart + DIRECTOR_KICKOFF_WIDE_SEC),
      dataset,
      playersAtSec,
    );
    if (kickoff) {
      shots.push(kickoff);
      exclusiveEnd = kickoff.endSec;
    }
  }
  // Subtract the line-up + kickoff window from the segment list: those
  // shots own it exclusively, while the team-picking dead air before it
  // still gets ordinary coverage (the plan must stay contiguous even
  // where the director intends to skip).
  const playSegments = segments.flatMap((segment) => {
    if (exclusiveEnd <= lineupStart) return [segment];
    const pieces: typeof segments = [];
    if (segment.startSec < lineupStart) {
      pieces.push({
        ...segment,
        endSec: Math.min(segment.endSec, lineupStart),
      });
    }
    if (segment.endSec > exclusiveEnd) {
      pieces.push({
        ...segment,
        startSec: Math.max(segment.startSec, exclusiveEnd),
      });
    }
    return pieces.filter((p) => p.endSec - p.startSec > 0.05);
  });
  for (const segment of playSegments) {
    const { subject } = segment;
    if (subject.kind === "flag") {
      shots.push(
        ...flagSegmentShots(segment.startSec, segment.endSec, subject.slot, {
          dataset,
          track: tracks.get(subject.slot)!,
          previous: shots[shots.length - 1],
          playersAtSec,
          variety,
          crowdMin,
        }),
      );
    } else if (subject.kind === "bombard") {
      shots.push(
        ...bombardmentShots(
          segment.startSec,
          segment.endSec,
          dataset,
          playersAtSec,
          variety,
        ),
      );
    } else if (subject.kind === "base") {
      const stand = dataset.flagStands.find((s) => s.slot === subject.slot);
      if (!stand) continue;
      baseFlip = -baseFlip;
      // A long base segment is not one slow orbit: every other chunk
      // goes looking for the drama — a kill, a raid, a barrage, a
      // vehicle — so the base beat has perspective changes in it.
      for (
        let t = segment.startSec;
        t < segment.endSec;
        t += DIRECTOR_FIXED_CHUNK_SEC
      ) {
        const chunkEnd = Math.min(t + DIRECTOR_FIXED_CHUNK_SEC, segment.endSec);
        if (chunkEnd - t < DIRECTOR_MIN_RUN_SEC) {
          if (shots.length > 0) shots[shots.length - 1].endSec = chunkEnd;
          break;
        }
        const situational =
          variety.fixedCount % 2 === 1
            ? situationalShot(t, chunkEnd, dataset, playersAtSec, variety)
            : null;
        if (situational) {
          pushReachingBack(shots, situational, segment.startSec);
          continue;
        }
        variety.fixedCount++;
        shots.push({
          kind: "fixedOrbit",
          center: stand.pos,
          radius: DIRECTOR_BASE_ORBIT_RADIUS,
          angularSpeed: DIRECTOR_BASE_ORBIT_SPEED * baseFlip,
          startSec: t,
          endSec: chunkEnd,
          transitionIn: "cut",
          reason: `${flagLabel(subject.slot, dataset).replace(/ flag$/, "")} base`,
        });
      }
    } else {
      shots.push(
        ...idleShots(
          segment.startSec,
          segment.endSec,
          dataset,
          baseFlip,
          variety,
        ),
      );
      baseFlip = -baseFlip;
    }
  }
  return shots;
}

/**
 * Pass C: shift a cut that lands just before a grab earlier, so the
 * camera is already settled at the flag when it goes rather than
 * arriving mid-event.
 */
function applyAnticipation(
  shots: Shot[],
  tracks: Map<number, FlagTrack>,
): void {
  for (let i = 1; i < shots.length; i++) {
    const shot = shots[i];
    if (shot.kind !== "followFlag" || shot.transitionIn !== "cut") continue;
    const track = tracks.get(shot.slot);
    const grabSoon = track?.grabTimes.some(
      (t) => t >= shot.startSec && t <= shot.startSec + 5,
    );
    if (!grabSoon) continue;
    const previous = shots[i - 1];
    const shifted = shot.startSec - DIRECTOR_ANTICIPATION_SEC;
    // The donor must stay a legible shot: shrinking it below the
    // minimum hold just feeds it to the min-duration pass, which undoes
    // the anticipation AND kills the donor (the defender hip views were
    // silently dying this way).
    if (shifted - previous.startSec >= DIRECTOR_MIN_SHOT_HOLD_SEC) {
      previous.endSec = shifted;
      shot.startSec = shifted;
    }
  }
}

export function planRabbit(dataset: DirectorDataset): Shot[] {
  const slot = dataset.flagStands[0]?.slot ?? dataset.flagSamples[0]?.slot ?? 1;
  return [
    {
      kind: "followFlag",
      slot,
      distance: DIRECTOR_DIST_CHASE,
      pitch: DIRECTOR_PITCH_CHASE,
      // Ahead of the rabbit looking back: the whole chasing pack is the
      // show, and it's always behind them.
      aim: { mode: "backward" },
      startSec: 0,
      endSec: dataset.durationSec,
      transitionIn: "cut",
      reason: "Rabbit — chase the flag",
    },
  ];
}

export function planDeathmatch(dataset: DirectorDataset): Shot[] {
  const kills = dataset.events
    .filter((e) => e.type === "kill" && e.pos != null)
    .sort((a, b) => a.timeSec - b.timeSec);
  interface Cluster {
    startSec: number;
    endSec: number;
    center: DirectorVec3;
    kills: DirectorEvent[];
  }
  const clusters: Cluster[] = [];
  for (const kill of kills) {
    const last = clusters[clusters.length - 1];
    if (
      last &&
      kill.timeSec - last.endSec <= DIRECTOR_CLUSTER_WINDOW_SEC &&
      dist(kill.pos!, last.center) <= DIRECTOR_CLUSTER_RADIUS
    ) {
      last.endSec = kill.timeSec;
      last.kills.push(kill);
      last.center = centroid(last.kills.map((k) => k.pos!));
    } else {
      clusters.push({
        startSec: kill.timeSec,
        endSec: kill.timeSec,
        center: kill.pos!,
        kills: [kill],
      });
    }
  }
  const nameToTarget = new Map(
    dataset.playerNames.map((p) => [p.name.toLowerCase(), p.targetId]),
  );
  const shots: Shot[] = [];
  const variety = newShotVariety();
  for (const cluster of clusters) {
    const startSec = Math.max(0, cluster.startSec - 4);
    const endSec = Math.min(dataset.durationSec, cluster.endSec + 3);
    // Dense brawls read best from a wide, near-stationary overhead —
    // a locked follow can't hold that many combatants in frame.
    if (cluster.kills.length >= DIRECTOR_CLUSTER_OVERHEAD_KILLS) {
      shots.push({
        kind: "fixedOrbit",
        center: cluster.center,
        radius: DIRECTOR_CROWD_ORBIT_RADIUS,
        angularSpeed: DIRECTOR_STAND_BATTLE_SPEED,
        heightFactor: DIRECTOR_CLUSTER_OVERHEAD_HEIGHT,
        startSec,
        endSec,
        transitionIn: "cut",
        reason: `Firefight overhead (${cluster.kills.length} kills)`,
      });
      continue;
    }
    // Hero-follow the cluster's busiest killer when identifiable.
    const killerCounts = new Map<string, number>();
    for (const kill of cluster.kills) {
      const killer = kill.killer?.toLowerCase();
      if (killer) {
        killerCounts.set(killer, (killerCounts.get(killer) ?? 0) + 1);
      }
    }
    const topKiller = [...killerCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    const targetId =
      topKiller != null ? nameToTarget.get(topKiller) : undefined;
    if (targetId != null) {
      const heroName = cluster.kills.find(
        (k) => k.killer?.toLowerCase() === topKiller,
      )?.killer;
      // Long sprees alternate onto the cinematic dolly.
      let useDolly = false;
      if (endSec - startSec >= DIRECTOR_DOLLY_MIN_SEC) {
        variety.dollyCount++;
        useDolly = variety.dollyCount % 2 === 0;
      }
      shots.push(
        useDolly
          ? {
              kind: "dolly",
              subject: { type: "player", targetId },
              distance: DIRECTOR_DOLLY_DISTANCE,
              height: DIRECTOR_DOLLY_HEIGHT,
              side: Math.floor(variety.dollyCount / 2) % 2 === 0 ? 1 : -1,
              startSec,
              endSec,
              transitionIn: "cut",
              reason: `Firefight — tracking ${heroName}`,
            }
          : {
              kind: "followPlayer",
              targetId,
              distance: DIRECTOR_DIST_HERO,
              pitch: DIRECTOR_PITCH_CHASE,
              // They're on a spree — sit behind them so the shots land
              // on screen.
              aim: { mode: "forward" },
              startSec,
              endSec,
              transitionIn: "cut",
              reason: `Firefight — following ${heroName}`,
            },
      );
    } else {
      shots.push({
        kind: "fixedOrbit",
        center: cluster.center,
        radius: 30,
        angularSpeed: DIRECTOR_BASE_ORBIT_SPEED,
        startSec,
        endSec,
        transitionIn: "cut",
        reason: `Firefight (${cluster.kills.length} kills)`,
      });
    }
  }
  return shots;
}

export function planLandmarks(dataset: DirectorDataset): Shot[] {
  return idleShots(0, dataset.durationSec, dataset, 1);
}

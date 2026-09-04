/**
 * The planners for game modes without an online switcher, plus the
 * graceful degradation between them.
 *
 * CTF is cast live by the switcher (see switcher.ts). These exist so
 * the director never fails on a recording it does not fully understand
 * — Rabbit chases the single flag, deathmatch orbits kill clusters, and
 * landmarks tours the map when there is nothing else to go on. They
 * plan the whole recording at once, which is fine: none of them is
 * streamed.
 */
import type {
  DirectorDataset,
  DirectorEvent,
  DirectorVec3,
  Shot,
} from "./types";
import {
  DIRECTOR_BASE_ORBIT_RADIUS,
  DIRECTOR_BASE_ORBIT_SPEED,
  DIRECTOR_CLUSTER_OVERHEAD_HEIGHT,
  DIRECTOR_CLUSTER_OVERHEAD_KILLS,
  DIRECTOR_CLUSTER_RADIUS,
  DIRECTOR_CLUSTER_WINDOW_SEC,
  DIRECTOR_CROWD_ORBIT_RADIUS,
  DIRECTOR_DIST_CHASE,
  DIRECTOR_DIST_HERO,
  DIRECTOR_DOLLY_DISTANCE,
  DIRECTOR_DOLLY_HEIGHT,
  DIRECTOR_DOLLY_MIN_SEC,
  DIRECTOR_PITCH_CHASE,
  DIRECTOR_STAND_BATTLE_SPEED,
  DIRECTOR_WIDE_ORBIT_RADIUS,
} from "./tunables";
import { centroid, dist } from "./geometry";
import { fixedFraming, newShotVariety } from "./framing";

/** How long each idle orbit holds before moving on. */
const IDLE_CHUNK_SEC = 20;

/**
 * Idle B-roll: wide orbits of the flag stands in turn, or — on a map
 * with none — of wherever the players are, re-anchored every chunk.
 * Fills the gaps in a non-CTF plan and is the whole landmark tour.
 */
export function idleShots(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
): Shot[] {
  const stands = dataset.flagStands;
  const shots: Shot[] = [];
  const variety = newShotVariety();
  const overall =
    stands.length === 0
      ? centroid(dataset.playerSamples.map((s) => s.pos))
      : null;
  let turn = 0;
  for (let t = startSec; t < endSec; t += IDLE_CHUNK_SEC) {
    const chunkEnd = Math.min(t + IDLE_CHUNK_SEC, endSec);
    const stand = stands.length > 0 ? stands[turn++ % stands.length] : null;
    let center: DirectorVec3;
    if (stand) {
      center = stand.pos;
    } else {
      const window = dataset.playerSamples.filter(
        (s) => s.timeSec >= t && s.timeSec < chunkEnd,
      );
      center =
        window.length > 0 ? centroid(window.map((s) => s.pos)) : overall!;
    }
    const framing = fixedFraming(center, dataset, variety);
    shots.push({
      kind: "fixedOrbit",
      center,
      radius: stand ? DIRECTOR_BASE_ORBIT_RADIUS : DIRECTOR_WIDE_ORBIT_RADIUS,
      startAngle: framing.startAngle,
      angularSpeed: stand ? DIRECTOR_BASE_ORBIT_SPEED : framing.angularSpeed,
      startSec: t,
      endSec: chunkEnd,
      transitionIn: "cut",
      reason: stand
        ? `Quiet moment — wide on the ${stand.name ?? "base"}`
        : "Quiet moment — wide view",
      topic: "lull",
    });
  }
  return shots;
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
      topic: "flag-run",
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
  // Every name a player has answered to, since a kill names whoever
  // they were at the time.
  const nameToTarget = new Map<string, number>();
  for (const p of dataset.playerNames) {
    for (const alias of [p.name, ...(p.aliases ?? [])]) {
      nameToTarget.set(alias.toLowerCase(), p.targetId);
    }
  }
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
        topic: "kill",
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
              topic: "kill",
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
              topic: "kill",
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
        topic: "kill",
      });
    }
  }
  return shots;
}

export function planLandmarks(dataset: DirectorDataset): Shot[] {
  return idleShots(0, dataset.durationSec, dataset);
}

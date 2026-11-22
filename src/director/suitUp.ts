import { dist } from "./geometry";
import { PLAYER_AIM_LIFT } from "./humanScale";
import { shotPoseAt, subjectInFrame } from "./shotPath";
import type { DirectorPlayerSample, Shot } from "./types";

/** Count the players this camera can actually show, including sightlines. */
export function visibleOpeningPlayers(
  shot: Shot,
  players: readonly DirectorPlayerSample[],
): number {
  if (shot.kind !== "fixedOrbit" || shot.doorwayOf) return 0;
  const pose = shotPoseAt(shot, 0)!;
  const range = Math.max(35, shot.radius * 2);
  return players.filter(
    ({ health, pos }) =>
      health !== 0 &&
      dist(pose.eye, pos) <= range &&
      subjectInFrame(pose, [pos[0], pos[1], pos[2] + PLAYER_AIM_LIFT]),
  ).length;
}

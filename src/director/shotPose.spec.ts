/**
 * The camera-position invariant, checked by the COMPILER.
 *
 * Grep guards catch the shape of a mistake already made; this catches
 * the mistake itself. `placeCamera` accepts only a `SolvedEye`, and
 * only `shotPoseAt` produces one — so re-deriving a camera position and
 * writing it fails `npm run typecheck`, not review.
 *
 * The `@ts-expect-error` lines below are the assertion: if the brand
 * ever weakens, they stop being errors and the typecheck fails.
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { aimCamera, placeCamera, shotPoseAt } from "./shotPath";
import type { DirectorVec3, Shot } from "./types";

const camera = { position: { set: () => {} }, lookAt: () => {} };
const scratch = new Vector3();

const shot = {
  kind: "fixedOrbit",
  center: [0, 0, 10],
  radius: 8,
  startAngle: 0,
  angularSpeed: 0,
  heightFactor: 0.2,
  startSec: 0,
  endSec: 6,
  transitionIn: "cut",
  reason: "test",
} as Shot;

describe("solved poses", () => {
  it("accepts a pose that came from shotPoseAt", () => {
    const pose = shotPoseAt(shot, 0);
    expect(pose).not.toBeNull();
    placeCamera(camera, pose!.eye);
  });

  it("rejects a hand-computed position", () => {
    const madeUp: DirectorVec3 = [1, 2, 3];
    // @ts-expect-error a raw vector is not a solved camera position
    placeCamera(camera, madeUp);
  });

  it("rejects a position derived from the shot's own numbers", () => {
    // The exact bug class: re-deriving the ring instead of asking for it.
    const angle = 0;
    const eye: DirectorVec3 = [
      shot.kind === "fixedOrbit" ? shot.center[0] + Math.sin(angle) * 8 : 0,
      shot.kind === "fixedOrbit" ? shot.center[1] + Math.cos(angle) * 8 : 0,
      10,
    ];
    // @ts-expect-error derived by hand, so it is not a SolvedEye
    placeCamera(camera, eye);
  });

  it("accepts an aim that came from shotPoseAt", () => {
    const pose = shotPoseAt(shot, 0)!;
    aimCamera(camera, pose.aim, scratch);
  });

  it("rejects a hand-computed aim", () => {
    // The exact bug: the rig aimed at the two-unit default while the
    // planner validated the shot's own lookLift.
    const guessed: DirectorVec3 = [0, 0, 12];
    // @ts-expect-error a raw vector is not a solved aim
    aimCamera(camera, guessed, scratch);
  });

  it("will not let an eye stand in for an aim", () => {
    const pose = shotPoseAt(shot, 0)!;
    // @ts-expect-error an eye is not an aim, however similar the shape
    aimCamera(camera, pose.eye, scratch);
    // @ts-expect-error ...and an aim is not an eye
    placeCamera(camera, pose.aim);
  });
});

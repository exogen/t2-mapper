/**
 * Player close-ups are shot at a person's eye level, from in front of
 * them. Both were wrong before: the free-space grid samples every 8
 * units, so its lowest cell above someone's feet already looks down on
 * them, and nothing consulted which way they were facing.
 */
import { describe, expect, it } from "vitest";
import {
  dollyInShotAt,
  flyThroughShot,
  holdShotAt,
  lateralPanAt,
  PAN_MAX_OFFSET,
  playerCloseUpSpots,
} from "./preMatch";
import { PLAYER_AIM_LIFT } from "./humanScale";
import { shotPoseAt } from "./shotPath";
import type { DirectorVec3, Shot } from "./types";

const FEET: DirectorVec3 = [100, 200, 50];

/** The orbit-yaw convention used for headings and camera bearings. */
function bearingTo(spot: DirectorVec3, from: DirectorVec3): number {
  return Math.atan2(spot[0] - from[0], spot[1] - from[1]);
}
function angleGap(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

describe("playerCloseUpSpots", () => {
  const facing = 1.1;

  it("keeps the lens between the knee and the chest", () => {
    for (const spot of playerCloseUpSpots({ pos: FEET, heading: facing }, 0)) {
      const lift = spot[2] - FEET[2];
      expect(lift).toBeGreaterThanOrEqual(0.5);
      expect(lift).toBeLessThanOrEqual(2);
    }
  });

  it("opens with a 30-degree window before widening", () => {
    const spots = playerCloseUpSpots({ pos: FEET, heading: facing }, 3);
    // The first tier is the portrait window; the later ones exist only
    // for someone backed into a corner.
    const early = spots.slice(0, 12);
    for (const spot of early) {
      expect(angleGap(bearingTo(spot, FEET), facing)).toBeLessThanOrEqual(
        (30 * Math.PI) / 180 + 1e-6,
      );
    }
  });

  it("never films them from behind, at any tier", () => {
    // The whole point. A trailing follow used to be the fallback here,
    // and every one of those shots was the back of a head.
    for (const spot of playerCloseUpSpots({ pos: FEET, heading: facing }, 3)) {
      expect(angleGap(bearingTo(spot, FEET), facing)).toBeLessThan(Math.PI / 2);
    }
  });

  it("honours a tighter window when asked", () => {
    const spots = playerCloseUpSpots({ pos: FEET, heading: facing }, 3, {
      maxOffset: PAN_MAX_OFFSET,
    });
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(angleGap(bearingTo(spot, FEET), facing)).toBeLessThanOrEqual(
        PAN_MAX_OFFSET + 1e-6,
      );
    }
  });

  it("offers the dead-ahead position first", () => {
    const first = playerCloseUpSpots({ pos: FEET, heading: facing }, 0)[0];
    expect(angleGap(bearingTo(first, FEET), facing)).toBeLessThan(1e-6);
  });

  it("still places a camera when the facing is unknown", () => {
    const spots = playerCloseUpSpots({ pos: FEET }, 2);
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(spot[2] - FEET[2]).toBeLessThanOrEqual(2);
    }
  });

  it("pans the subject ACROSS the frame, not away from it", () => {
    // A pan whose aim tracks the camera one-for-one keeps the subject
    // pinned where it started; the point is that it enters at one edge,
    // crosses the middle and leaves at the other.
    const spot: DirectorVec3 = [FEET[0], FEET[1] - 8, FEET[2] + 1.2];
    const pan = lateralPanAt(
      0,
      { name: "x", pos: FEET, radius: 8, indoor: false },
      spot,
      0,
    ) as Extract<Shot, { kind: "sweep" }>;
    const at = (f: number): number => {
      const cam = [
        pan.from[0] + (pan.to[0] - pan.from[0]) * f,
        pan.from[1] + (pan.to[1] - pan.from[1]) * f,
      ];
      const aim = [
        pan.target[0] + (pan.targetTo![0] - pan.target[0]) * f,
        pan.target[1] + (pan.targetTo![1] - pan.target[1]) * f,
      ];
      const ax = aim[0] - cam[0],
        ay = aim[1] - cam[1];
      const sx = FEET[0] - cam[0],
        sy = FEET[1] - cam[1];
      return Math.atan2(ax * sy - ay * sx, ax * sx + ay * sy);
    };
    const start = at(0),
      middle = at(0.5),
      end = at(1);
    // Centred half way, and on OPPOSITE sides at the two ends.
    expect(Math.abs(middle)).toBeLessThan(0.02);
    expect(Math.sign(start)).toBe(-Math.sign(end));
    // And far enough out to actually reach the edges of a frame.
    expect(Math.abs(start)).toBeGreaterThan((25 * Math.PI) / 180);
    expect(Math.abs(end)).toBeGreaterThan((25 * Math.PI) / 180);
  });

  it("works within a lens distance, not across the room", () => {
    for (const spot of playerCloseUpSpots({ pos: FEET, heading: facing }, 1)) {
      const d = Math.hypot(spot[0] - FEET[0], spot[1] - FEET[1]);
      expect(d).toBeGreaterThanOrEqual(5);
      expect(d).toBeLessThanOrEqual(14 + 1e-6);
    }
  });
});

describe("framing a person", () => {
  const player = {
    name: "pick-up",
    pos: FEET,
    radius: 9,
    indoor: false,
    aimLift: PLAYER_AIM_LIFT,
  };
  // Chest height, eight units out, roughly face-on.
  const spot: DirectorVec3 = [FEET[0], FEET[1] - 8, FEET[2] + 1.2];

  it("aims a held shot at the chest, not over their head", () => {
    // The rig's default look lift is two units — the top of a player's
    // head — which left them at the bottom of the frame.
    const shot = holdShotAt(0, player, spot, 0) as Extract<
      Shot,
      { kind: "fixedOrbit" }
    >;
    expect(shot.lookLift).toBe(PLAYER_AIM_LIFT);
    expect(shot.lookLift).toBeLessThan(2);
    expect(shot.lookLift).toBeGreaterThan(0.8);
  });

  it("aims a push-in at the chest too", () => {
    const shot = dollyInShotAt(0, player, spot, 0) as Extract<
      Shot,
      { kind: "sweep" }
    >;
    expect(shot.target[2] - FEET[2]).toBeCloseTo(PLAYER_AIM_LIFT, 5);
  });

  it("aims a lateral pan at the chest at both ends", () => {
    const shot = lateralPanAt(0, player, spot, 0) as Extract<
      Shot,
      { kind: "sweep" }
    >;
    expect(shot.target[2] - FEET[2]).toBeCloseTo(PLAYER_AIM_LIFT, 5);
    expect(shot.targetTo![2] - FEET[2]).toBeCloseTo(PLAYER_AIM_LIFT, 5);
  });

  it("actually pushes in, rather than twitching", () => {
    // A fixed seven-unit floor against an eight-unit standoff produced
    // a one-unit "push" — a stationary camera with a hitch in it.
    const shot = dollyInShotAt(0, player, spot, 0) as Extract<
      Shot,
      { kind: "sweep" }
    >;
    const travel = Math.hypot(
      shot.to[0] - shot.from[0],
      shot.to[1] - shot.from[1],
      shot.to[2] - shot.from[2],
    );
    expect(travel).toBeGreaterThan(3);
    // ...and it ends CLOSER than it began.
    const before = Math.hypot(shot.from[0] - FEET[0], shot.from[1] - FEET[1]);
    const after = Math.hypot(shot.to[0] - FEET[0], shot.to[1] - FEET[1]);
    expect(after).toBeLessThan(before);
  });
});

describe("framing an asset", () => {
  // Everything in this world is anchored at its FOOT, so a shot aimed
  // at the anchor frames the ground the thing stands on. Measured
  // against the collider boxes: an inventory station centres 1.5 above
  // its foot, a large pulse sensor 3.2.
  const sensor = {
    name: "Storm large pulse sensor",
    pos: [100, 200, 50] as DirectorVec3,
    radius: 18,
    indoor: false,
    aimLift: 3.2,
  };
  const spot: DirectorVec3 = [100, 182, 56];

  it("closes on the middle of the asset, not the dirt under it", () => {
    const shot = dollyInShotAt(0, sensor, spot, 0) as Extract<
      Shot,
      { kind: "sweep" }
    >;
    expect(shot.target[2] - sensor.pos[2]).toBeCloseTo(3.2, 5);
  });

  it("tracks across the middle of it too", () => {
    const shot = lateralPanAt(0, sensor, spot, 0) as Extract<
      Shot,
      { kind: "sweep" }
    >;
    expect(shot.target[2] - sensor.pos[2]).toBeCloseTo(3.2, 5);
    expect(shot.targetTo![2] - sensor.pos[2]).toBeCloseTo(3.2, 5);
  });

  it("holds on the middle of it", () => {
    const shot = holdShotAt(0, sensor, spot, 0) as Extract<
      Shot,
      { kind: "fixedOrbit" }
    >;
    expect(shot.lookLift).toBe(3.2);
  });

  it("leaves the rig default alone when nothing says otherwise", () => {
    const unknown = { ...sensor, aimLift: undefined };
    const shot = holdShotAt(0, unknown, spot, 0) as Extract<
      Shot,
      { kind: "fixedOrbit" }
    >;
    expect(shot.lookLift).toBeUndefined();
  });
});

describe("the establishing fly-by", () => {
  const stand = (name: string, pos: DirectorVec3) => ({
    name,
    pos,
    teamId: 1,
    kind: "stand" as const,
    radius: 34,
    indoor: false,
    aimLift: 3,
  });
  const asset = (name: string, pos: DirectorVec3) => ({
    ...stand(name, pos),
    kind: "generator" as const,
    radius: 20,
    indoor: true,
  });

  it("runs between the two flag stands", () => {
    const shot = flyThroughShot(
      0,
      stand("Storm flag stand", [0, 0, 100]),
      stand("Inferno flag stand", [600, 0, 100]),
    );
    expect(shot).not.toBeNull();
    expect(shot!.reason).toMatch(/Storm flag stand to Inferno flag stand/);
  });

  it("refuses anything that is not stand to stand", () => {
    // "Generator to flag stand" reads as the camera wandering: the
    // endpoints mean nothing to a viewer, and the line between them is
    // rarely the map's spine.
    expect(
      flyThroughShot(
        0,
        asset("Storm generator", [0, 0, 100]),
        stand("Inferno flag stand", [600, 0, 100]),
      ),
    ).toBeNull();
    expect(
      flyThroughShot(
        0,
        stand("Storm flag stand", [0, 0, 100]),
        asset("Inferno generator", [600, 0, 100]),
      ),
    ).toBeNull();
  });

  it("keeps the horizon up mid-route instead of staring at the ground", () => {
    const shot = flyThroughShot(
      0,
      stand("Storm flag stand", [0, 0, 100]),
      stand("Inferno flag stand", [600, 0, 100]),
    )!;
    const pitchAt = (f: number) => {
      const { eye, aim } = shotPoseAt(shot, f)!;
      return Math.atan2(
        aim[2] - eye[2],
        Math.hypot(aim[0] - eye[0], aim[1] - eye[1]),
      );
    };
    for (const f of [0.3, 0.5, 0.7]) {
      expect(pitchAt(f)).toBeGreaterThanOrEqual((-15 * Math.PI) / 180);
    }
    // But it does arrive ON the far flag, from above it.
    expect(shotPoseAt(shot, 1)!.aim.slice(0, 2)).toEqual([600, 0]);
    expect(pitchAt(1)).toBeLessThan((-10 * Math.PI) / 180);
  });

  it("refuses a run too short to establish anything", () => {
    expect(
      flyThroughShot(
        0,
        stand("Storm flag stand", [0, 0, 100]),
        stand("Inferno flag stand", [40, 0, 100]),
      ),
    ).toBeNull();
  });
});

describe("no randomness in shot construction", () => {
  // `jitter` stands in for Math.random so shots VARY between subjects
  // without varying between runs. Every builder that wants variety
  // draws from it, keyed on the shot index — so the same demo must
  // yield the same cast every time it is planned.
  const subject = {
    name: "Storm generator",
    pos: [100, 200, 50] as DirectorVec3,
    radius: 20,
    indoor: true,
    aimLift: 2,
  };
  const spot: DirectorVec3 = [112, 214, 56];

  it("builds the identical hold twice from identical inputs", () => {
    expect(holdShotAt(0, subject, spot, 7)).toEqual(
      holdShotAt(0, subject, spot, 7),
    );
  });

  it("builds the identical pan and push twice", () => {
    expect(lateralPanAt(0, subject, spot, 3)).toEqual(
      lateralPanAt(0, subject, spot, 3),
    );
    expect(dollyInShotAt(0, subject, spot, 3)).toEqual(
      dollyInShotAt(0, subject, spot, 3),
    );
  });

  it("still varies between shot indices", () => {
    // The control: identical output for DIFFERENT indices would mean
    // the variety is gone, which is its own bug.
    const a = lateralPanAt(0, subject, spot, 1);
    const b = lateralPanAt(0, subject, spot, 2);
    expect(a).not.toEqual(b);
  });

  it("places the identical player close-up twice", () => {
    const player = { pos: [10, 20, 30] as DirectorVec3, heading: 1.1 };
    expect(playerCloseUpSpots(player, 4)).toEqual(
      playerCloseUpSpots(player, 4),
    );
  });
});

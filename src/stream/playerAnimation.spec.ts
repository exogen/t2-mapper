import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  actionStartPosition,
  pickMoveAnimation,
  samplePlayerPose,
} from "./playerAnimation";
import { playerYawToQuaternion } from "./streamHelpers";

describe("movement animation direction", () => {
  // Build velocity from the rendered body's axes, independently of the
  // selector's world-to-object calculation. Three +X is forward, +Z right.
  it.each([0, 45, 90, 135, 180, 225, 270, 315, 360, -90])(
    "matches forward, backward and both strafes at heading %d°",
    (degrees) => {
      const rotation = playerYawToQuaternion((degrees * Math.PI) / 180);
      const quaternion = new Quaternion().fromArray(rotation);
      for (const [forward, right, animation, timeScale] of [
        [10, 0, "run", 1],
        [-10, 0, "back", 1],
        [0, -10, "side", 1],
        [0, 10, "side", -1],
      ] as const) {
        const v = new Vector3(forward, 0, right).applyQuaternion(quaternion);
        const velocity: [number, number, number] = [v.z, v.x, v.y];
        expect(pickMoveAnimation(velocity, rotation, 0)).toEqual({
          animation,
          timeScale,
        });
        // q and -q represent the same facing.
        expect(
          pickMoveAnimation(
            velocity,
            rotation.map((n) => -n) as typeof rotation,
            0,
          ),
        ).toEqual({ animation, timeScale });
      }
    },
  );

  it("uses the engine's strict movement threshold and forward/back priority on diagonal ties", () => {
    const rotation = playerYawToQuaternion(0);
    for (const velocity of [
      [0, 0.1, 0],
      [0, -0.1, 0],
      [0.1, 0, 0],
      [-0.1, 0, 0],
    ] as const) {
      expect(pickMoveAnimation([...velocity], rotation, 0).animation).toBe(
        "root",
      );
    }
    expect(pickMoveAnimation([5, 5, 0], rotation, 0).animation).toBe("run");
    expect(pickMoveAnimation([-5, -5, 0], rotation, 0).animation).toBe("back");
    expect(pickMoveAnimation([5, 4, 0], rotation, 0)).toEqual({
      animation: "side",
      timeScale: -1,
    });
  });
});

describe("movement animation contact timer", () => {
  const rotation = playerYawToQuaternion(0);

  it("keeps directional movement below 30 ticks, regardless of speed or slope", () => {
    for (const timer of [0, 1, 29]) {
      expect(
        pickMoveAnimation([0, 70, 20], rotation, timer, false, true),
      ).toEqual({
        animation: "run",
        timeScale: 1,
      });
    }
  });

  it("selects idle or jet at 30 ticks, even at zero velocity", () => {
    for (const timer of [30, 31, 100]) {
      for (const velocity of [
        [0, 0, 0],
        [0, 10, 0],
      ] as [number, number, number][]) {
        expect(
          pickMoveAnimation(velocity, rotation, timer, false, false).animation,
        ).toBe("root");
        expect(
          pickMoveAnimation(velocity, rotation, timer, false, true).animation,
        ).toBe("jet");
      }
    }
  });

  it("gives falling priority over contact and jetting", () => {
    for (const timer of [0, 30]) {
      expect(
        pickMoveAnimation([0, 10, -15], rotation, timer, true, true).animation,
      ).toBe("fall");
    }
  });
});

describe("actionStartPosition", () => {
  it("advances the packed position by the time since the update", () => {
    expect(
      actionStartPosition(
        { actionAnimPos: 0.25, actionTimeSec: 100 },
        100.5,
        2,
      ),
    ).toBeCloseTo(0.5);
  });

  it("saturates once the clip would have run out", () => {
    expect(actionStartPosition({ actionTimeSec: 100 }, 130, 2)).toBe(1);
  });

  it("is the packed position without an arrival time", () => {
    expect(actionStartPosition({ actionAnimPos: 0.4 }, 500, 2)).toBe(0.4);
  });
});

describe("samplePlayerPose", () => {
  const move = { animation: "run", timeScale: 1, timeSec: 0 };
  type Wired = Parameters<typeof samplePlayerPose<string>>[1];
  const sample = (time: number, wire: Wired = {}, mounted = false) =>
    samplePlayerPose(
      move,
      wire,
      mounted,
      time,
      0.25,
      () => "pda",
      (name) => ({ duration: 2, cyclic: name === "run" }),
    );

  it("returns to movement after a wired action, without another packet", () => {
    const wire = { actionAnim: 18, actionTimeSec: 10 };
    expect(sample(11, wire)[0]).toMatchObject({
      name: "pda",
      position: 0.5,
      weight: 1,
    });
    expect(sample(13, wire)[0]).toMatchObject({
      name: "run",
      position: 0.5,
      weight: 1,
    });
    expect(sample(101, wire)[0]).toMatchObject({
      name: "run",
      position: 0.5,
      weight: 1,
    });
  });

  it("restarts the same wired action from its new time anchor", () => {
    expect(sample(20.5, { actionAnim: 18, actionTimeSec: 10 })[0].name).toBe(
      "run",
    );
    expect(
      sample(20.5, { actionAnim: 18, actionTimeSec: 20 })[0],
    ).toMatchObject({
      name: "pda",
      position: 0.25,
      weight: 1,
    });
  });

  it("reconstructs mid-clip and held late starts", () => {
    const wire = { actionAnim: 18, actionTimeSec: 10, actionAnimPos: 0.6 };
    expect(sample(10, wire)[0]).toMatchObject({ name: "pda", position: 0.6 });
    expect(sample(100, wire)[0].name).toBe("run");
    expect(sample(100, { ...wire, actionHoldAtEnd: true })[0]).toMatchObject({
      name: "pda",
      position: 1,
    });
  });

  it("holds a seated action until unmounted, even without holdAtEnd", () => {
    const wire = { actionAnim: 18, actionTimeSec: 10, actionAtEnd: true };
    expect(sample(20, wire, true)[0]).toMatchObject({
      name: "pda",
      position: 1,
    });
    expect(sample(20, wire, false)[0].name).toBe("run");
  });

  it("starts movement at the arrival time of an already-finished action", () => {
    expect(
      sample(10.5, { actionAnim: 18, actionTimeSec: 10, actionAtEnd: true })[0],
    ).toMatchObject({
      name: "run",
      position: 0.25,
      weight: 1,
    });
  });

  it("clears an active wired action and samples movement on a backwards seek", () => {
    expect(sample(11, { actionAnim: 18, actionTimeSec: 10 })[0].name).toBe(
      "pda",
    );
    expect(sample(11)[0]).toMatchObject({ name: "run", position: 0.5 });
    expect(sample(9)[0]).toMatchObject({ name: "run", position: 0.5 });
  });

  it("holds the outgoing pose at the transition boundary while advancing the new clip", () => {
    const sampleTransition = (time: number) =>
      samplePlayerPose(
        {
          animation: "run",
          timeScale: 1,
          timeSec: 10.5,
          previous: { animation: "root", timeScale: 1, timeSec: 10 },
        },
        {},
        false,
        time,
        0.25,
        () => undefined,
        () => ({ duration: 1, cyclic: true }),
      );
    const first = sampleTransition(10.6),
      next = sampleTransition(10.7);
    expect(first[1]).toMatchObject({ name: "root", position: 0.5 });
    expect(next[1]).toMatchObject({ name: "root", position: 0.5 });
    expect(first[0].position).toBeCloseTo(0.1);
    expect(next[0].position).toBeCloseTo(0.2);
    expect(sampleTransition(11)).toHaveLength(1);
  });
});

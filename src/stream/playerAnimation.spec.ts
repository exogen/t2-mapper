import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { pickMoveAnimation, samplePlayerPose } from "./playerAnimation";
import type { ActionCall, ActionSlot } from "./actionSlot";
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

describe("samplePlayerPose", () => {
  const move = { animation: "run", timeScale: 1, timeSec: 0 };
  const slot = (
    action: number | string,
    ...calls: ActionCall[]
  ): { actionSlot: ActionSlot } => ({ actionSlot: { action, calls } });
  const sample = (time: number, player = {}) =>
    samplePlayerPose(
      move,
      player,
      time,
      0.25,
      () => "pda",
      (name) => ({ duration: 2, cyclic: name === "run" }),
    );

  it("returns to movement after a wired action, without another packet", () => {
    const pda = slot(18, { timeSec: 10 });
    expect(sample(11, pda)[0]).toMatchObject({
      name: "pda",
      position: 0.5,
      weight: 1,
    });
    expect(sample(13, pda)[0]).toMatchObject({
      name: "run",
      position: 0.5,
      weight: 1,
    });
    expect(sample(101, pda)[0]).toMatchObject({
      name: "run",
      position: 0.5,
      weight: 1,
    });
  });

  it("ignores a re-sent action while it plays, and restarts it once replaced", () => {
    // setActionThread keeps the action the slot holds: a taunt re-sent
    // mid-clip plays on. Once the movement pick replaced it, it starts over.
    const spam = slot(18, { timeSec: 10 }, { timeSec: 11 }, { timeSec: 20 });
    expect(sample(11.5, spam)[0]).toMatchObject({
      name: "pda",
      position: 0.75,
    });
    expect(sample(13, spam)[0].name).toBe("run");
    expect(sample(20.5, spam)[0]).toMatchObject({
      name: "pda",
      position: 0.25,
      weight: 1,
    });
    // A re-send the pick had not reached yet is not seen early.
    expect(sample(19, spam)[0].name).toBe("run");
  });

  it("snaps an at-end re-send to the clip's end, then lets movement pick", () => {
    const pda = slot(18, { timeSec: 10 }, { timeSec: 10.5, atEnd: true });
    expect(sample(10.5, pda)[0]).toMatchObject({ name: "run" });
    const [before] = sample(10.4, pda);
    expect(before.name).toBe("pda");
    expect(before.position).toBeCloseTo(0.2);
  });

  it("reconstructs mid-clip and held late starts", () => {
    const pda = { timeSec: 10, startPos: 0.6 };
    expect(sample(10, slot(18, pda))[0]).toMatchObject({
      name: "pda",
      position: 0.6,
    });
    expect(sample(100, slot(18, pda))[0].name).toBe("run");
    expect(sample(100, slot(18, { ...pda, hold: true }))[0]).toMatchObject({
      name: "pda",
      position: 1,
    });
  });

  it("holds an action set while mounted, or still held when the player mounts", () => {
    const seated = slot(18, { timeSec: 10, atEnd: true, parked: true });
    expect(sample(20, seated)[0]).toMatchObject({
      name: "pda",
      position: 1,
    });
    const before = { action: 18, calls: [{ timeSec: 10 }] };
    expect(
      sample(20, { actionSlot: { ...before, parkedSec: 11 } })[0],
    ).toMatchObject({ name: "pda", position: 1 });
    // Mounted after the movement pick replaced it: nothing to hold.
    expect(
      sample(20, { actionSlot: { ...before, parkedSec: 15 } })[0].name,
    ).toBe("run");
  });

  it("plays an action the client set itself by its engine alias", () => {
    const names: (number | string)[] = [];
    const poses = samplePlayerPose(
      move,
      slot("standjump", { timeSec: 10 }),
      11,
      0,
      (action) => (names.push(action), action),
      (name) => ({ duration: 2, cyclic: name === "run" }),
    );
    expect(names).toEqual(["standjump"]);
    expect(poses[0]).toMatchObject({ name: "standjump", position: 0.5 });
  });

  it("parks a finished action until pickActionAnimation may run again", () => {
    const ski = (...calls: ActionCall[]) => slot("ski", ...calls);
    const once = ski({ timeSec: 10, pickHeldUntilSec: 14 });
    expect(sample(13, once)[0]).toMatchObject({ name: "pda", position: 1 });
    // Movement starts when the hold ends, not when the clip ended.
    expect(sample(14.5, once)[0]).toMatchObject({
      name: "run",
      position: 0.25,
    });
    expect(sample(13, ski({ timeSec: 10 }))[0].name).toBe("run");
    // A ski jump after the hold lapsed but within the clip is ignored and
    // re-arms the hold; one after the pick replaced it starts over.
    const hops = ski(
      { timeSec: 10, pickHeldUntilSec: 10.5 },
      { timeSec: 11, pickHeldUntilSec: 13.5 },
      { timeSec: 14, pickHeldUntilSec: 14.5 },
    );
    expect(sample(13, hops)[0]).toMatchObject({ name: "pda", position: 1 });
    expect(sample(13.75, hops)[0].name).toBe("run");
    expect(sample(14.5, hops)[0]).toMatchObject({
      name: "pda",
      position: 0.25,
    });
  });

  it("starts movement at the arrival time of an already-finished action", () => {
    expect(
      sample(10.5, slot(18, { timeSec: 10, atEnd: true }))[0],
    ).toMatchObject({
      name: "run",
      position: 0.25,
      weight: 1,
    });
  });

  it("clears an active wired action and samples movement on a backwards seek", () => {
    expect(sample(11, slot(18, { timeSec: 10 }))[0].name).toBe("pda");
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

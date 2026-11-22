import { describe, expect, it } from "vitest";
import { CausalView } from "./causalView";
import { directorDataset } from "./directorTestFixtures";
import { createLooseFlagShot, createStandFightSweep } from "./flagCoverage";
import { newShotVariety, orbitShot } from "./framing";
import type {
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
} from "./types";

function looseFlagShot(xs: number[], pickupAt?: number) {
  const flagSamples: DirectorFlagSample[] = xs.map((x, timeSec) => ({
    timeSec,
    slot: 1,
    pos: [x, 0, 100],
    status: "field",
    carrierTargetId: null,
  }));
  const view = new CausalView(
    directorDataset({
      flagSamples,
      events:
        pickupAt == null
          ? []
          : [
              {
                type: "flag-grab",
                flagTeamName: "Storm",
                timeSec: pickupAt,
                description: "Runner picked up the Storm flag",
              },
            ],
    }),
    5,
  );
  view.advanceTo(1);
  return createLooseFlagShot(
    view,
    newShotVariety(),
    flagSamples[1],
    false,
    true,
  );
}

describe("flag coverage", () => {
  it("keeps a settling flag and its surroundings on screen after a fast throw", () => {
    expect(looseFlagShot([0, 30, 32, 33, 33, 33, 33])).toMatchObject({
      kind: "fixedOrbit",
      lookSubject: { type: "flag", slot: 1 },
      center: [31.5, 0, 100],
    });
  });

  it("sweeps alongside a local slide, and follows a throw that leaves the scene", () => {
    expect(looseFlagShot([0, 10, 15, 20, 24, 27, 29])).toMatchObject({
      kind: "sweep",
      subject: { type: "flag", slot: 1 },
      pathSolved: true,
    });
    expect(looseFlagShot([0, 40, 80, 120, 160, 200, 240]).kind).toBe(
      "followFlag",
    );
  });

  it("does not set up a sweep through a known pickup and new drop", () => {
    expect(looseFlagShot([0, 10, 13, 16, 200, 200, 200], 3.5)).toMatchObject({
      kind: "fixedOrbit",
      center: [11.5, 0, 100],
    });
  });

  it("sweeps across a stand only while both sides stay in frame", () => {
    const stand: DirectorVec3 = [0, 0, 100];
    const wide = orbitShot({
      center: stand,
      radius: 30,
      startSec: 0,
      endSec: 5,
      reason: "Contested stand",
      topic: "flag-stand",
    });
    const shot = (leaves: boolean, lookahead = 5) =>
      createStandFightSweep(
        new CausalView(
          directorDataset({
            playerSamples: Array.from(
              { length: 6 },
              (_, timeSec): DirectorPlayerSample[] => [
                { timeSec, targetId: 2, teamId: 1, pos: [1, 0, 100] },
                {
                  timeSec,
                  targetId: 3,
                  teamId: 2,
                  pos: [leaves && timeSec > 2 ? 60 : -2, 0, 100],
                },
              ],
            ).flat(),
          }),
          lookahead,
        ),
        wide,
        1,
        stand,
      );
    expect(shot(false)).toMatchObject({ kind: "sweep", pathSolved: true });
    expect(shot(true)).toBeUndefined();
    expect(shot(false, 3)).toBeUndefined();
  });
});

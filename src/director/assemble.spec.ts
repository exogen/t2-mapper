import { describe, expect, it } from "vitest";
import { framesTheSame, sameAim, sanitizeLookSubjects } from "./assemble";
import type { DirectorDataset, Shot } from "./types";

const follow = (over: Partial<Extract<Shot, { kind: "followFlag" }>>) =>
  ({
    kind: "followFlag",
    slot: 1,
    startSec: 0,
    endSec: 10,
    distance: 15,
    reason: "test",
    ...over,
  }) as Shot;

describe("sameAim", () => {
  it("treats absent aims as equal and a missing one as different", () => {
    expect(sameAim(undefined, undefined)).toBe(true);
    expect(sameAim({ mode: "forward" }, undefined)).toBe(false);
  });

  it("separates two toward-aims pointing at different places", () => {
    // The bug this guards: comparing only the MODE fused a shot aiming
    // at the carrier's own base with one aiming at a crowd across the
    // map, and the merged shot kept the earlier target — so the camera
    // spent the whole run pointed where nothing was happening.
    expect(
      sameAim(
        { mode: "toward", target: [0, 0, 100] },
        { mode: "toward", target: [800, 0, 100] },
      ),
    ).toBe(false);
    expect(
      sameAim(
        { mode: "toward", target: [0, 0, 100] },
        { mode: "toward", target: [8, 0, 100] },
      ),
    ).toBe(true);
  });

  it("separates held bearings that differ by more than a nudge", () => {
    expect(sameAim({ mode: "hold", yaw: 0 }, { mode: "hold", yaw: 0.1 })).toBe(
      true,
    );
    expect(sameAim({ mode: "hold", yaw: 0 }, { mode: "hold", yaw: 1.5 })).toBe(
      false,
    );
  });
});

describe("framesTheSame", () => {
  it("does not merge same-flag follows aimed at different places", () => {
    expect(
      framesTheSame(
        follow({ aim: { mode: "toward", target: [0, 0, 100] } }),
        follow({ aim: { mode: "toward", target: [800, 0, 100] } }),
      ),
    ).toBe(false);
  });

  it("merges same-flag follows framed the same way", () => {
    expect(
      framesTheSame(
        follow({ aim: { mode: "forward" } }),
        follow({ aim: { mode: "forward" }, distance: 17 }),
      ),
    ).toBe(true);
  });
});

describe("sanitizeLookSubjects", () => {
  const dataset = (flagPos: [number, number, number]): DirectorDataset => ({
    durationSec: 60,
    flagSampleStepSec: 0.5,
    playerSampleStepSec: 1,
    gameClassName: "CTFGame",
    teams: [{ teamId: 1, name: "Storm" }],
    flagStands: [{ slot: 1, teamId: 1, name: "Storm", pos: flagPos }],
    events: [],
    flagSamples: Array.from({ length: 121 }, (_, i) => ({
      timeSec: i * 0.5,
      slot: 1,
      pos: flagPos,
      carrierTargetId: null,
      status: "home" as const,
    })),
    playerSamples: [],
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [],
  });
  const battleShot = (): Shot => ({
    kind: "fixedOrbit",
    center: [0, 0, 100],
    radius: 55,
    angularSpeed: 0,
    lookSubject: { type: "flag", slot: 1 },
    startSec: 10,
    endSec: 20,
    transitionIn: "cut",
    reason: "battle overhead",
  });

  it("strips an aim subject that is never inside the frame", () => {
    // A camera over a battle naming a flag 600m away as its pan target
    // opens with a whip-pan toward empty distance — the claim is false.
    const shots = [battleShot()];
    sanitizeLookSubjects(shots, dataset([600, 0, 100]));
    expect((shots[0] as { lookSubject?: unknown }).lookSubject).toBeUndefined();
  });

  it("keeps an aim subject that the frame actually contains", () => {
    const shots = [battleShot()];
    sanitizeLookSubjects(shots, dataset([40, 20, 100]));
    expect((shots[0] as { lookSubject?: unknown }).lookSubject).toEqual({
      type: "flag",
      slot: 1,
    });
  });

  it("keeps a subject with no samples for the runtime to resolve live", () => {
    const shots = [battleShot()];
    const ds = dataset([600, 0, 100]);
    ds.flagSamples = [];
    sanitizeLookSubjects(shots, ds);
    expect((shots[0] as { lookSubject?: unknown }).lookSubject).toBeDefined();
  });
});

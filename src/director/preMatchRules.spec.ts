/**
 * The rule the whole pre-match director rests on: a shot ships only if
 * its ENTIRE flight was walked against real geometry first.
 *
 * Geometry is stubbed here on purpose. What is under test is not
 * whether a particular camera can see a particular wall — that is
 * `inspectShot`'s job, tested against real world geometry elsewhere —
 * but whether the selection loop actually consults it and honours the
 * answer. A mutation that skipped the check entirely survived the whole
 * suite before this existed.
 */
import { describe, expect, it, vi } from "vitest";
import type { DirectorVec3, Shot } from "./types";

/** Shots whose reason starts with "bad" fail their path check. */
vi.mock("./shotPath", () => ({
  inspectShot: (shot: Shot) => ({
    samples: 9,
    buried: 0,
    seen: 9,
    visibility: 1,
    ok: !shot.reason?.startsWith("bad"),
  }),
  plannerSolved: () => false,
  cameraBuried: () => false,
  subjectVisible: () => true,
  shotPoseAt: () => null,
  /** A shot whose reason mentions "low" flies at z=2; others are unknown. */
  shotCameraPath: (shot: Shot) =>
    /low/.test(shot.reason ?? "") ? [{ eye: [0, 0, 2], aim: [0, 0, 0] }] : null,
  placeCamera: () => {},
  aimCamera: () => {},
  CAMERA_CLEARANCE: 2,
  MIN_PATH_VISIBILITY: 0.7,
}));

/** A flat world for the grid: solid below z=0, open above. */
vi.mock("../collision/worldCollision", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../collision/worldCollision")>()),
  pointObstructed: (p: number[], radius: number) => p[2] - radius < 0,
}));

const { firstWatchable, settledSignings, sidesSettled, watchableWide } =
  await import("./switcher");
const { buildFreeSpace } = await import("./freeSpace");
const { DirectorTrackers } = await import("../stream/directorTrackers");

const shot = (reason: string): Shot =>
  ({
    kind: "fixedOrbit",
    center: [0, 0, 10],
    radius: 8,
    startSec: 0,
    endSec: 6,
    transitionIn: "cut",
    reason,
  }) as Shot;

const onePlace = (): DirectorVec3[] => [[0, 0, 0]];

describe("firstWatchable", () => {
  it("passes over a candidate that fails its path check", () => {
    const got = firstWatchable([
      { build: () => shot("bad one"), spots: onePlace },
      { build: () => shot("good one"), spots: onePlace },
    ]);
    expect(got?.reason).toBe("good one");
  });

  it("tries every position a candidate offers before moving on", () => {
    const got = firstWatchable([
      {
        build: (spot) => shot(spot[0] === 2 ? "good" : "bad"),
        spots: () => [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      },
    ]);
    expect(got?.reason).toBe("good");
  });

  it("returns null when nothing works, not the least bad option", () => {
    expect(
      firstWatchable([
        { build: () => shot("bad a"), spots: onePlace },
        { build: () => shot("bad b"), spots: onePlace },
      ]),
    ).toBeNull();
  });

  it("does not compute positions for a candidate it never reaches", () => {
    // `spots` is lazy: the chain usually stops at its first entry, and
    // the grid search behind a later one costs raycasts nobody needs.
    let asked = 0;
    firstWatchable([
      { build: () => shot("good"), spots: onePlace },
      {
        build: () => shot("also good"),
        spots: () => {
          asked++;
          return onePlace();
        },
      },
    ]);
    expect(asked).toBe(0);
  });
});

describe("watchableWide", () => {
  // Ground at z=0, one-unit cells: z=2 is a tight cell, z=3 a roomy one.
  const grid = buildFreeSpace(
    {
      flagStands: [
        { slot: 0, pos: [0, 0, 30] },
        { slot: 1, pos: [10, 0, 30] },
      ],
      structureInventory: [],
    } as never,
    0,
    { step: 1, assetRadius: 40 },
  );

  it("refuses a wide that fails its path check", () => {
    expect(watchableWide(shot("bad wide"), null)).toBeNull();
    expect(watchableWide(shot("good wide"), null)?.reason).toBe("good wide");
  });

  it("refuses a wide the grid finds cramped, even if the path check passes", () => {
    // z=2 clears the two-unit camera clearance and not the grid's three.
    expect(watchableWide(shot("low wide"), grid)).toBeNull();
    expect(watchableWide(shot("low wide"), null)?.reason).toBe("low wide");
  });

  it("lets a wide through where the grid has not looked", () => {
    // No path samples at all: nothing for the grid to judge.
    expect(watchableWide(shot("high wide"), grid)?.reason).toBe("high wide");
  });
});

describe("settledSignings", () => {
  const player = (targetId: number, teamId: number | null) => ({
    targetId,
    teamId,
  });

  it("does not film a pick-up the instant the team flag flips", () => {
    // At that moment the player is still in the observer spot, about to
    // be teleported to a spawn. Cutting there is what made the
    // pre-match jumpy.
    const known = new Map<number, number>();
    const signed = new Map<number, number>();
    expect(settledSignings([player(1, 2)], known, signed, 100)).toHaveLength(0);
    expect(settledSignings([player(1, 2)], known, signed, 103)).toHaveLength(0);
  });

  it("films them once they have settled", () => {
    const known = new Map<number, number>();
    const signed = new Map<number, number>();
    settledSignings([player(1, 2)], known, signed, 100);
    const ready = settledSignings([player(1, 2)], known, signed, 107);
    expect(ready.map((p) => p.targetId)).toEqual([1]);
  });

  it("ignores someone who was already on a team", () => {
    const known = new Map<number, number>([[1, 2]]);
    const signed = new Map<number, number>();
    expect(settledSignings([player(1, 2)], known, signed, 500)).toHaveLength(0);
  });

  it("queues a player who goes back to observer and re-joins", () => {
    const known = new Map<number, number>();
    const signed = new Map<number, number>();
    settledSignings([player(1, 2)], known, signed, 100);
    settledSignings([player(1, null)], known, signed, 110); // to observer
    signed.delete(1);
    settledSignings([player(1, 3)], known, signed, 120); // joins the other side
    expect(settledSignings([player(1, 3)], known, signed, 124)).toHaveLength(0);
    expect(settledSignings([player(1, 3)], known, signed, 128)).toHaveLength(1);
  });

  it("drops a pick-up that has gone stale in the queue", () => {
    // Held back long enough (the other side empty, say) it is no longer
    // news — and it is forgotten, not aired late.
    const known = new Map<number, number>();
    const signed = new Map<number, number>();
    settledSignings([player(1, 2)], known, signed, 100);
    expect(settledSignings([player(1, 2)], known, signed, 129)).toHaveLength(1);
    expect(settledSignings([player(1, 2)], known, signed, 131)).toHaveLength(0);
    expect(signed.has(1)).toBe(false);
    expect(settledSignings([player(1, 2)], known, signed, 140)).toHaveLength(0);
  });

  it("never lets the first pick-up on a side go stale", () => {
    // They wait through the establishing run and are announced after
    // it, however late. The second on the same side is not.
    const known = new Map<number, number>();
    const signed = new Map<number, number>();
    const first = new Map<number, number>();
    settledSignings([player(1, 2)], known, signed, 100, first);
    settledSignings([player(1, 2), player(2, 2)], known, signed, 101, first);
    expect(first.get(2)).toBe(1);
    const ready = settledSignings(
      [player(1, 2), player(2, 2)],
      known,
      signed,
      200,
      first,
    );
    expect(ready.map((p) => p.targetId)).toEqual([1]);
    expect(signed.has(2)).toBe(false);
  });

  it("hands the first slot on to the next queued when the first leaves", () => {
    const known = new Map<number, number>();
    const signed = new Map<number, number>();
    const first = new Map<number, number>();
    settledSignings([player(1, 2)], known, signed, 100, first);
    settledSignings([player(1, 2), player(2, 2)], known, signed, 110, first);
    // Player 1 is gone from the roster entirely.
    settledSignings([player(2, 2)], known, signed, 120, first);
    expect(first.get(2)).toBe(2);
    expect(
      settledSignings([player(2, 2)], known, signed, 200, first).map(
        (p) => p.targetId,
      ),
    ).toEqual([2]);
  });

  it("releases the queue oldest first, whatever order the roster is in", () => {
    const known = new Map<number, number>();
    const signed = new Map<number, number>();
    settledSignings([player(1, 2)], known, signed, 100);
    settledSignings([player(1, 2), player(2, 2)], known, signed, 103);
    const ready = settledSignings(
      [player(2, 2), player(1, 2)],
      known,
      signed,
      110,
    );
    expect(ready.map((p) => p.targetId)).toEqual([1, 2]);
  });
});

describe("sidesSettled", () => {
  const player = (teamId: number | null) => ({ teamId });

  it("is not settled while one side is empty, however long the other waits", () => {
    const since = new Map<number, number>();
    expect(sidesSettled([player(1), player(1)], since, 0)).toBe(false);
    expect(sidesSettled([player(1), player(1)], since, 600)).toBe(false);
  });

  it("waits for the newest side to have held a player for the settle time", () => {
    const since = new Map<number, number>();
    sidesSettled([player(1)], since, 0);
    expect(sidesSettled([player(1), player(2)], since, 100)).toBe(false);
    expect(sidesSettled([player(1), player(2)], since, 106)).toBe(false);
    expect(sidesSettled([player(1), player(2)], since, 107)).toBe(true);
  });

  it("forgets a side that empties again", () => {
    const since = new Map<number, number>();
    sidesSettled([player(1), player(2)], since, 0);
    expect(sidesSettled([player(1), player(2)], since, 10)).toBe(true);
    sidesSettled([player(1), player(null)], since, 20);
    expect(sidesSettled([player(1), player(2)], since, 21)).toBe(false);
    expect(sidesSettled([player(1), player(2)], since, 28)).toBe(true);
  });
});

describe("waiting for the world", () => {
  // The free-space grid describes where a camera fits around the MAP,
  // so it is worth nothing until the map has finished arriving. The
  // protocol says when: GhostingMessageEvent / GhostAlwaysDone, carried
  // through as `worldCompleteSec`.
  //
  // Two wrong answers this replaced. A fixed time is a demo-only trick
  // — a live stream cannot skip ahead to find out. And "once some base
  // hardware has shown up" never fires on a map whose only landmarks
  // are its flags, which would leave that map with no landmark shots at
  // all.
  //
  // SCOPE: these cover the trackers and everything downstream. That
  // StreamEngine sets `ghostAlwaysDoneSec` from the wire is verified
  // against a real recording (s5-damnation reports 3.2s) and not here —
  // no spec in this suite loads a .rec.
  const snapshot = (timeSec: number, ghostAlwaysDoneSec: number | null) =>
    ({
      timeSec,
      ghostAlwaysDoneSec,
      exhausted: false,
      camera: null,
      entities: [],
      chatMessages: [],
      serverEvents: [],
      audioEvents: [],
      teamScores: [],
      playerRoster: [],
    }) as never;

  it("records when the server said the world was complete", () => {
    const t = new DirectorTrackers();
    t.step(snapshot(1, null), 1);
    expect(t.worldCompleteSec).toBeNull();
    t.step(snapshot(3.2, 3.2), 3.2);
    expect(t.worldCompleteSec).toBe(3.2);
  });

  it("keeps the FIRST answer, not the latest", () => {
    // The message is re-sent on later packets; the world was complete
    // at the first one.
    const t = new DirectorTrackers();
    t.step(snapshot(3.2, 3.2), 3.2);
    t.step(snapshot(90, 3.2), 90);
    expect(t.worldCompleteSec).toBe(3.2);
  });

  it("stays null while the server has not said so", () => {
    const t = new DirectorTrackers();
    for (let s = 0; s < 30; s += 0.5) t.step(snapshot(s, null), s);
    expect(t.worldCompleteSec).toBeNull();
  });
});

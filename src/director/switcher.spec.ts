import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSwitcherStream, planShotsCausal, runSwitcher } from "./switcher";
import { createFreeSpaceBuild } from "./freeSpace";
import { CausalView } from "./causalView";
import { DIRECTOR_LOOKAHEAD_SEC, SCORE_CARRIED } from "./tunables";
import * as variety from "./variety";
import { directorDataset, STAND_1, STAND_2 } from "./directorTestFixtures";
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
} from "./types";

/** A carry: flag 2 grabbed at 30, skied home, capped at 90. */
function dataset(): DirectorDataset {
  const flagSamples: DirectorFlagSample[] = [];
  const playerSamples: DirectorPlayerSample[] = [];
  for (let t = 0; t <= 120; t += 0.5) {
    flagSamples.push({
      timeSec: t,
      slot: 1,
      pos: STAND_1,
      carrierTargetId: null,
      status: "home",
    });
    const carried = t >= 30 && t < 90;
    flagSamples.push({
      timeSec: t,
      slot: 2,
      pos: carried
        ? ([800 - ((t - 30) / 60) * 780, 0, 100] as DirectorVec3)
        : STAND_2,
      carrierTargetId: carried ? 5 : null,
      status: carried ? "held" : "home",
    });
  }
  for (let t = 0; t <= 120; t++) {
    if (t >= 30 && t < 90) {
      playerSamples.push({
        timeSec: t,
        targetId: 5,
        teamId: 1,
        pos: [800 - ((t - 30) / 60) * 780, 0, 100],
        armor: "light",
      });
    }
    playerSamples.push({
      timeSec: t,
      targetId: 9,
      teamId: 1,
      pos: [12, 8, 100],
      heading: 1.0,
      armor: "heavy",
    });
  }
  return directorDataset({
    events: [
      {
        timeSec: 2,
        type: "match-countdown",
        description: "Match starts in 18 seconds.",
        secondsUntil: 18,
      },
      {
        // Off the tick grid on purpose: the kickoff/capture set
        // pieces must reopen exactly where they end, and a fractional
        // seam here once escaped fillGaps and ended the broadcast.
        timeSec: 20.3,
        type: "match-start",
        description: "Match started",
      },
      {
        timeSec: 30,
        type: "flag-grab",
        description: "Slayer grabbed the Inferno flag",
        actor: "Slayer",
        flagTeamName: "Inferno",
      },
      {
        timeSec: 90,
        type: "flag-cap",
        description: "Slayer captured the Inferno flag",
        capturer: "Slayer",
        flagTeamName: "Inferno",
      },
    ],
    flagSamples,
    playerSamples,
    playerNames: [
      { targetId: 5, name: "slayer", displayName: "Slayer" },
      { targetId: 9, name: "guard", displayName: "Guard" },
    ],
  });
}

function concernsFlag(shot: Shot, slot: number): boolean {
  return (
    (shot.subject?.type === "flag" && shot.subject.slot === slot) ||
    (shot.kind === "followFlag" && shot.slot === slot) ||
    (shot.kind === "dolly" &&
      shot.subject.type === "flag" &&
      shot.subject.slot === slot) ||
    (shot.kind === "fixedOrbit" &&
      shot.lookSubject?.type === "flag" &&
      shot.lookSubject.slot === slot)
  );
}

describe("capture coverage", () => {
  afterEach(() => vi.restoreAllMocks());

  function fixture(capSec = 66.1): DirectorDataset {
    const ds = dataset();
    ds.durationSec = 80;
    ds.events = [
      { timeSec: 0, type: "match-start", description: "Match started" },
      {
        timeSec: capSec,
        type: "flag-cap",
        capturer: "Slayer",
        flagTeamName: "Inferno",
        description: "Slayer captured the Inferno flag",
      },
    ];
    // The carry wasn't observed. Both flags are home in the snapshots.
    ds.flagSamples = ds.flagSamples.map((s) => ({
      ...s,
      status: "home",
      carrierTargetId: null,
      pos: s.slot === 1 ? STAND_1 : STAND_2,
    }));
    ds.playerSamples = [];
    vi.spyOn(variety, "pickVarietyShot").mockImplementation((_view, t) =>
      t === 60
        ? {
            family: "destruction",
            shot: {
              kind: "fixedOrbit",
              center: [400, 400, 100],
              radius: 30,
              startSec: 60,
              endSec: 69,
              transitionIn: "cut",
              reason: "Raid cutaway",
            },
          }
        : null,
    );
    return ds;
  }

  function prefix(
    ds: DirectorDataset,
    through: number,
    availableAt: number,
  ): DirectorDataset {
    return {
      ...ds,
      durationSec: Math.min(through, ds.durationSec),
      events: ds.events.filter(
        (e) =>
          e.timeSec <= through &&
          (e.type !== "flag-cap" || through >= availableAt),
      ),
      flagSamples: ds.flagSamples.filter((s) => s.timeSec <= through),
      playerSamples: [],
    };
  }

  it("replaces a distant cutaway with one shot at the scoring stand", () => {
    const ds = fixture();
    const stream = createSwitcherStream(new CausalView(prefix(ds, 6, 66.1), 6));
    for (let t = 0.5; t <= 80; t += 0.5)
      stream.advanceTo(t, prefix(ds, t + 6, 66.1));
    stream.finish(80);
    const shot = stream.shots.find((s) => s.topic === "capture");
    expect(shot).toMatchObject({
      kind: "fixedOrbit",
      center: STAND_1,
      startSec: 63.5,
      endSec: 70.6,
    });
    expect(stream.shots.find((s) => s.reason === "Raid cutaway")?.endSec).toBe(
      shot?.startSec,
    );
    expect(stream.shots).toEqual(runSwitcher(new CausalView(ds, 6)));
  });

  it("keeps a live capture proposal a beat past the preferred lead-in", () => {
    const ds = fixture(20.55);
    const stream = createSwitcherStream(new CausalView(ds, 6), { live: true });
    stream.advanceTo(18, ds);
    const shot = stream.shots.at(-1)!;
    expect(stream.cutFor(shot).priority).toBe("capture");
    stream.advanceTo(19, ds);
    expect(stream.shots.at(-1)).toBe(shot);
    stream.advanceTo(19.5, ds);
    expect(stream.shots).not.toContain(shot);
  });

  it.each([
    { speed: 8, waiting: false, kind: "fixedOrbit" },
    { speed: 60, waiting: true, kind: "fixedOrbit" },
    { speed: 60, waiting: false, kind: "followPlayer" },
  ])(
    "covers a scoring approach at $speed m/s with players waiting=$waiting",
    ({ speed, waiting, kind }) => {
      const ds = fixture();
      for (const timeSec of [63, 64, 65, 66]) {
        ds.playerSamples.push({
          targetId: 5,
          teamId: 1,
          timeSec,
          pos: [(66 - timeSec) * speed, 0, 100],
        });
        if (waiting)
          ds.playerSamples.push(
            { timeSec, targetId: 6, teamId: 1, pos: [0, 6, 100] },
            { timeSec, targetId: 7, teamId: 1, pos: [0, -6, 100] },
          );
      }
      const view = new CausalView(ds, 6);
      const plan = runSwitcher(view);
      const shot = plan.find((s) => s.topic === "capture");
      expect(shot).toMatchObject({
        kind,
        startSec: 63.5,
        endSec: 70.6,
        subject: { type: "flag", slot: 2 },
      });
      if (kind === "fixedOrbit")
        expect(shot).toMatchObject({
          staged: { visibility: 1 },
        });
      expect(view.maxQueriedAhead).toBeLessThanOrEqual(6);
    },
  );

  it.each([
    { lookahead: 0, learnedAt: 66.1 },
    { lookahead: 2, learnedAt: 70 },
  ])(
    "keeps the current shot when a capture is learned after its setup window ($lookahead s lookahead)",
    ({ lookahead, learnedAt }) => {
      const ds = fixture();
      const view = new CausalView(prefix(ds, lookahead, learnedAt), lookahead);
      const stream = createSwitcherStream(view);
      for (let t = 0.5; t <= 80; t += 0.5)
        stream.advanceTo(t, prefix(ds, t + lookahead, learnedAt));
      stream.finish(80);
      expect(
        stream.shots.some(
          (s) =>
            s.topic === "aftermath" ||
            s.reason === "Inferno flag — scoring play",
        ),
      ).toBe(false);
      expect(
        stream.shots.find((s) => s.reason === "Raid cutaway")?.endSec,
      ).toBe(69);
      expect(view.maxQueriedAhead).toBeLessThanOrEqual(lookahead);
    },
  );
});

describe("planShotsCausal", () => {
  it("holds a contest across pickups and a return, then moves on from the empty frame", () => {
    const droppedAt: DirectorVec3 = [580, 0, 100];
    const changes = [
      [48, "flag-grab"],
      [50, "flag-drop"],
      [65, "flag-grab"],
      [67, "flag-drop"],
      [69, "flag-return"],
    ] as const;
    const ds = directorDataset({
      durationSec: 100,
      events: [
        { timeSec: 0, type: "match-start", description: "Match started" },
        ...changes.map(([timeSec, type]) => ({
          timeSec,
          type,
          flagTeamName: "Inferno",
          description: type,
        })),
      ],
    });
    for (let timeSec = 0; timeSec <= ds.durationSec; timeSec++) {
      const home = timeSec < 48 || timeSec >= 69;
      const held = !home && (timeSec < 50 || (timeSec >= 65 && timeSec < 67));
      ds.flagSamples.push(
        {
          timeSec,
          slot: 1,
          status: "home",
          pos: STAND_1,
          carrierTargetId: null,
        },
        {
          timeSec,
          slot: 2,
          status: home ? "home" : held ? "held" : "field",
          pos: home ? STAND_2 : droppedAt,
          carrierTargetId: held ? 1 : null,
        },
      );
      if (timeSec >= 49 && timeSec <= 70)
        ds.playerSamples.push(
          { timeSec, targetId: 1, teamId: 1, pos: [580, -4, 100] },
          { timeSec, targetId: 2, teamId: 2, pos: [580, 4, 100] },
        );
    }
    const shots = runSwitcher(new CausalView(ds));
    const at = (t: number) =>
      shots.find((s) => s.startSec <= t && s.endSec > t);
    const fight = at(64);
    expect(fight).toMatchObject({
      kind: "fixedOrbit",
      reason: "Inferno flag — contest for the loose flag",
      subject: { type: "flag", slot: 2 },
    });
    expect(at(65)).toBe(fight);
    expect(at(69.5)).toBe(fight);
    expect(at(76)).not.toBe(fight);
  });

  it.each(["quiet", "pressured", "can score", "looping"] as const)(
    "releases a stationary carry only during a lull (%s)",
    (context) => {
      const ds = dataset();
      const carrier: DirectorVec3 = [45, 0, 100];
      ds.events = ds.events.filter((event) => event.type !== "flag-cap");
      for (const sample of ds.flagSamples) {
        if (sample.timeSec < 45 || sample.timeSec >= 90) continue;
        if (sample.slot === 2)
          sample.pos =
            context === "looping" && sample.timeSec >= 57 && sample.timeSec < 60
              ? [120, 0, 100]
              : carrier;
        else if (context !== "can score") {
          sample.pos = [750, 0, 100];
          sample.status = "held";
          sample.carrierTargetId = 12;
        }
      }
      for (const player of ds.playerSamples) {
        if (player.timeSec >= 45 && player.targetId === 5) player.pos = carrier;
      }
      for (let t = 45; t <= 90; t++) {
        ds.playerSamples.push({
          timeSec: t,
          targetId: 12,
          teamId: 2,
          pos: [750, 0, 100],
        });
        if (context === "pressured" || (context === "quiet" && t >= 64))
          ds.playerSamples.push({
            timeSec: t,
            targetId: 13,
            teamId: 2,
            pos: [80, 0, 100],
          });
      }
      const pick = vi
        .spyOn(variety, "pickVarietyShot")
        .mockImplementation((_view, t, _mem, _ctx, _length, interest) =>
          t === 62 && interest < SCORE_CARRIED
            ? {
                family: "destruction",
                shot: {
                  kind: "fixedOrbit",
                  center: [400, 400, 100],
                  radius: 30,
                  startSec: t,
                  endSec: t + 9,
                  transitionIn: "cut",
                  reason: "Raid cutaway",
                },
              }
            : null,
        );
      try {
        const view = new CausalView(ds, 2);
        const shots = runSwitcher(view);
        const cutaway = shots.find((s) => s.reason === "Raid cutaway");
        if (context === "quiet") {
          expect(cutaway).toMatchObject({ startSec: 62, endSec: 64 });
          expect(concernsFlag(shots[shots.indexOf(cutaway!) + 1], 2)).toBe(
            true,
          );
        } else expect(cutaway).toBeUndefined();
        expect(view.maxQueriedAhead).toBeLessThanOrEqual(2);
      } finally {
        pick.mockRestore();
      }
    },
  );

  it.each(["manual", "automatic", "carrier far away", "capture"] as const)(
    "prioritizes a manual return that opens a scoring chance (%s)",
    (context) => {
      const ds = dataset();
      ds.events = ds.events.filter((event) => event.type !== "flag-cap");
      ds.events.push({
        timeSec: 65,
        type: "flag-return",
        description: "Storm flag returned",
        actor: context === "automatic" ? undefined : "Guard",
        flagTeamName: "Storm",
      });
      if (context === "capture")
        ds.events.push({
          timeSec: 65,
          type: "flag-cap",
          description: "Slayer captured the Inferno flag",
          capturer: "Slayer",
          flagTeamName: "Inferno",
        });
      for (const sample of ds.flagSamples) {
        if (sample.slot === 1 && sample.timeSec >= 59 && sample.timeSec < 65) {
          sample.status = "field";
          sample.pos = [400, 0, 100];
        }
        if (sample.slot === 2 && sample.timeSec >= 60 && sample.timeSec < 90)
          sample.pos = [context === "carrier far away" ? 250 : 60, 0, 100];
      }
      const view = new CausalView(ds, 2);
      const shots = runSwitcher(view);
      const at = (time: number) =>
        shots.find((shot) => shot.startSec <= time && time < shot.endSec)!;
      expect(concernsFlag(at(62.5), 2)).toBe(true);
      expect(concernsFlag(at(63), context === "manual" ? 1 : 2)).toBe(true);
      if (context === "manual")
        expect(at(63)).toMatchObject({
          kind: "fixedOrbit",
          center: [400, 0, 100],
        });
      expect(view.maxQueriedAhead).toBeLessThanOrEqual(2);
    },
  );

  it.each([
    { eventType: "flag-grab" as const, lookahead: 0 },
    { eventType: "flag-grab" as const, lookahead: 2 },
    { eventType: "flag-cap" as const, lookahead: 2 },
  ])(
    "leaves a cutaway for $eventType on the previous flag at $lookahead seconds lookahead",
    ({ eventType, lookahead }) => {
      // The director was watching flag 2, then took a 9-second raid cutaway.
      // Its remembered scoring subject is still flag 2, but that is not the
      // picture. A major event there must end the raid. Grabs also react
      // without lookahead, on the first tick after the server message.
      const ds = dataset();
      ds.durationSec = 90;
      ds.events = [
        { timeSec: 0, type: "match-start", description: "Match started" },
        {
          timeSec: 66.1,
          type: eventType,
          actor: "Slayer",
          capturer: "Slayer",
          flagTeamName: "Inferno",
          description: "Slayer's flag play",
        },
      ];
      ds.flagSamples = [];
      ds.playerSamples = [];
      for (let t = 0; t <= 90; t += 0.5) {
        const held = eventType === "flag-grab" ? t >= 66 : t >= 65 && t < 66.1;
        const carriedPos: DirectorVec3 =
          eventType === "flag-grab"
            ? [800 - (t - 66) * 20, 0, 100]
            : [Math.max(0, 800 - (t - 65) * 725), 0, 100];
        ds.flagSamples.push({
          timeSec: t,
          slot: 1,
          pos: STAND_1,
          status: "home",
          carrierTargetId: null,
        });
        ds.flagSamples.push({
          timeSec: t,
          slot: 2,
          pos: held ? carriedPos : STAND_2,
          status: held ? "held" : "home",
          carrierTargetId: held ? 5 : null,
        });
        if (Number.isInteger(t))
          ds.playerSamples.push({
            timeSec: t,
            targetId: 5,
            teamId: 1,
            pos: held ? carriedPos : [750, 0, 100],
            armor: "light",
          });
      }
      const pick = vi
        .spyOn(variety, "pickVarietyShot")
        .mockImplementation((_view, t) =>
          t === 60
            ? {
                family: "destruction",
                shot: {
                  kind: "fixedOrbit",
                  center: [400, 400, 100],
                  radius: 30,
                  startSec: 60,
                  endSec: 69,
                  transitionIn: "cut",
                  reason: "Raid cutaway",
                },
              }
            : null,
        );
      try {
        const view = new CausalView(ds, lookahead);
        const shots = runSwitcher(view);
        const raid = shots.find((s) => s.reason === "Raid cutaway");
        expect(raid).toBeDefined();
        const before = shots[shots.indexOf(raid!) - 1];
        expect(concernsFlag(before, 2)).toBe(true);
        // Observed flag state can now reclaim the camera even before the
        // corresponding message. The capture is still anticipated before
        // the observed carry starts, exercising message-based preemption.
        const reaction = Math.min(
          eventType === "flag-grab" ? 66 : 65,
          Math.ceil((66.1 - lookahead) * 2) / 2,
        );
        expect(raid!.endSec).toBe(reaction);
        const after = shots[shots.indexOf(raid!) + 1];
        expect(after.startSec).toBe(reaction);
        expect(concernsFlag(after, 2)).toBe(true);
        expect(view.maxQueriedAhead).toBeLessThanOrEqual(lookahead);
        if (eventType === "flag-cap") {
          expect(after.endSec).toBe(70.6);
        }

        // Feed the same play dynamically, with the unseen suffix genuinely
        // absent. The fix must make the same decisions in browser/live use.
        const prefix = (through: number): DirectorDataset => ({
          ...ds,
          durationSec: Math.min(through, ds.durationSec),
          flagSamples: ds.flagSamples.filter((s) => s.timeSec <= through),
          playerSamples: ds.playerSamples.filter((s) => s.timeSec <= through),
          events: ds.events.filter((e) => e.timeSec <= through),
        });
        const liveView = new CausalView(prefix(lookahead), lookahead);
        const live = createSwitcherStream(liveView);
        for (let t = 0.5; t <= ds.durationSec; t += 0.5) {
          live.advanceTo(t, prefix(t + lookahead));
        }
        live.finish(ds.durationSec);
        expect(live.shots).toEqual(shots);
        expect(liveView.maxQueriedAhead).toBeLessThanOrEqual(lookahead);
      } finally {
        pick.mockRestore();
      }
    },
  );

  it.each([0, 2])(
    "revalidates cutaways with %s seconds lookahead and no flag messages",
    (lookahead) => {
      for (const outcome of [
        "held",
        "field",
        "parked",
        "contest",
        "dead",
        "early-death",
        "stopped",
        "missing",
        "valid",
      ] as const) {
        const ds = dataset();
        ds.events = [
          { timeSec: 0, type: "match-start", description: "Match started" },
        ];
        ds.flagSamples = [];
        ds.playerSamples = [];
        for (let t = 0; t <= ds.durationSec; t += 0.5) {
          for (const slot of [1, 2]) {
            const status =
              slot === 2 &&
              (outcome === "parked" || outcome === "contest") &&
              t >= 10
                ? "field"
                : slot === 2 &&
                    t >= 64 &&
                    (outcome === "held" || outcome === "field")
                  ? outcome
                  : "home";
            ds.flagSamples.push({
              timeSec: t,
              slot,
              status,
              carrierTargetId: status === "held" ? 5 : null,
              pos:
                status === "home"
                  ? slot === 1
                    ? STAND_1
                    : STAND_2
                  : [400, 0, 100],
            });
          }
          if (Number.isInteger(t) && !(outcome === "missing" && t >= 62)) {
            ds.playerSamples.push({
              timeSec: t,
              targetId: 5,
              teamId: 1,
              pos:
                outcome === "contest" && t >= 64
                  ? [400, 0, 100]
                  : [
                      -2000 +
                        Math.min(t, outcome === "stopped" ? 61 : Infinity) * 40,
                      1000,
                      100,
                    ],
            });
          }
        }
        if (outcome === "dead" || outcome === "early-death")
          ds.deaths = [
            {
              timeSec: outcome === "early-death" ? 61 : 64,
              targetId: 5,
              teamId: 1,
              pos: [300, 1000, 100],
              killerTargetId: null,
            },
          ];
        const pick = vi
          .spyOn(variety, "pickVarietyShot")
          .mockImplementation((_view, t) =>
            t === 60
              ? {
                  family: "capperSetup",
                  continuation: {
                    kind: "capperSetup",
                    targetId: 5,
                    flagSlot: 2,
                  },
                  shot: {
                    kind: "followPlayer",
                    targetId: 5,
                    distance: 20,
                    pitch: 0.2,
                    startSec: 60,
                    endSec: 69,
                    transitionIn: "cut",
                    reason: "Route cutaway",
                  },
                }
              : null,
          );
        // Parked flags concern the generic filler policy; they are not a valid
        // stand-grab setup, so use an aftermath cutaway without that dependency.
        if (outcome === "parked" || outcome === "contest")
          pick.mockImplementation((_view, t) =>
            t === 60
              ? {
                  family: "destruction",
                  shot: {
                    kind: "fixedOrbit",
                    center: [400, 1000, 100],
                    radius: 30,
                    startSec: 60,
                    endSec: 69,
                    transitionIn: "cut",
                    reason: "Route cutaway",
                  },
                }
              : null,
          );
        try {
          const shots = runSwitcher(new CausalView(ds, lookahead));
          const cutaway = shots.find((s) => s.reason === "Route cutaway");
          expect(cutaway, outcome).toBeDefined();
          const interrupted = [
            "held",
            "field",
            "contest",
            "dead",
            "stopped",
          ].includes(outcome);
          // Stopping at 61 is established by a complete three-second window
          // below the continuation speed at 63. A death holds the shot for
          // two more seconds, and other state changes still act at 64.
          const end =
            outcome === "early-death"
              ? 63
              : outcome === "dead"
                ? 66
                : outcome === "stopped"
                  ? 63
                  : interrupted
                    ? 64
                    : 69;
          expect(cutaway!.endSec, outcome).toBe(end);
          if (
            outcome === "held" ||
            outcome === "field" ||
            outcome === "contest"
          ) {
            expect(concernsFlag(shots[shots.indexOf(cutaway!) + 1], 2)).toBe(
              true,
            );
          }
          const prefix = (through: number): DirectorDataset => ({
            ...ds,
            durationSec: Math.min(through, ds.durationSec),
            flagSamples: ds.flagSamples.filter((s) => s.timeSec <= through),
            playerSamples: ds.playerSamples.filter((s) => s.timeSec <= through),
            deaths: ds.deaths.filter((s) => s.timeSec <= through),
          });
          const view = new CausalView(prefix(lookahead), lookahead);
          const stream = createSwitcherStream(view);
          for (let t = 0.5; t <= ds.durationSec; t += 0.5)
            stream.advanceTo(t, prefix(t + lookahead));
          stream.finish(ds.durationSec);
          expect(stream.shots, outcome).toEqual(shots);
          expect(view.maxQueriedAhead).toBeLessThanOrEqual(lookahead);
        } finally {
          pick.mockRestore();
        }
      }
    },
  );

  it.each([
    { type: "flag-grab", lookahead: 0, end: 64 },
    { type: "flag-cap", lookahead: 0, end: 65.5 },
    { type: "flag-cap", lookahead: 2, end: 61 },
  ] as const)(
    "holds the kill reaction unless a capture can be established in time ($type, $lookahead s lookahead)",
    ({ type, lookahead, end }) => {
      const ds = directorDataset({
        durationSec: 80,
        events: [
          { timeSec: 0, type: "match-start", description: "Match started" },
          {
            timeSec: 63,
            type,
            flagTeamName: "Inferno",
            description: "Flag play",
          },
        ],
        deaths: [
          {
            timeSec: 62,
            targetId: 9,
            teamId: 1,
            pos: [400, 0, 100],
            killerTargetId: null,
          },
        ],
        flagSamples: [1, 2].map((slot) => ({
          timeSec: 60,
          slot,
          status: "home",
          pos: slot === 1 ? STAND_1 : STAND_2,
          carrierTargetId: null,
        })),
      });
      const pick = vi
        .spyOn(variety, "pickVarietyShot")
        .mockImplementation((_view, t) =>
          t === 60
            ? {
                family: "killCutIn",
                shot: {
                  kind: "fixedOrbit",
                  center: [400, 0, 100],
                  radius: 30,
                  lookSubject: { type: "player", targetId: 9 },
                  startSec: 60,
                  endSec: 65.5,
                  transitionIn: "cut",
                  reason: "Kill cutaway",
                },
              }
            : null,
        );
      try {
        const shots = runSwitcher(new CausalView(ds, lookahead));
        const kill = shots.find((shot) => shot.reason === "Kill cutaway");
        expect(kill?.endSec).toBe(end);
      } finally {
        pick.mockRestore();
      }
    },
  );

  it("produces a contiguous, ordered plan covering the whole demo", () => {
    const plan = planShotsCausal(dataset());
    expect(plan.gameMode).toBe("ctf");
    expect(plan.shots.length).toBeGreaterThan(3);
    expect(plan.shots[0].startSec).toBe(0);
    expect(plan.shots[plan.shots.length - 1].endSec).toBe(120);
    for (let i = 1; i < plan.shots.length; i++) {
      expect(plan.shots[i].startSec).toBeCloseTo(plan.shots[i - 1].endSec, 6);
      expect(plan.shots[i].endSec).toBeGreaterThan(plan.shots[i].startSec);
    }
  });

  it("follows the scorer through the capture and reaction", () => {
    const plan = planShotsCausal(dataset());
    // Mid-carry the camera is on flag 2 in some framing.
    const midCarry = plan.shots.filter(
      (s) => s.startSec < 80 && s.endSec > 45 && concernsFlag(s, 2),
    );
    expect(midCarry.length).toBeGreaterThan(0);
    const atCap = plan.shots.find((s) => s.startSec <= 90 && s.endSec > 90);
    expect(atCap).toMatchObject({
      kind: "followPlayer",
      targetId: 5,
      startSec: 88,
      subject: { type: "flag", slot: 2 },
    });
    expect(atCap?.endSec).toBeGreaterThanOrEqual(94);
    const approach = plan.shots.filter((shot) =>
      shot.reason.includes("closing on the cap"),
    );
    expect(approach.length).toBeGreaterThan(0);
    for (const shot of approach) {
      expect(shot.kind).toBe("followFlag");
      if (shot.kind === "followFlag")
        expect(shot.distance).toBeLessThanOrEqual(30);
    }
  });

  it("runs roster line-up sweeps off the countdown announcement", () => {
    const plan = planShotsCausal(dataset());
    // Filter on START time: with a singleton fixture squad the wide is
    // the only pass, and the seal-extend semantics legitimately stretch
    // it until the first flag story claims the screen.
    const sweeps = plan.shots.filter(
      (s) =>
        s.kind === "sweep" && s.startSec < 20.3 && /Pre-match/.test(s.reason),
    );
    expect(sweeps.length).toBeGreaterThanOrEqual(1);
  });

  it("uses a hydrated countdown for the line-up even when the announcement is missing", () => {
    const ds = dataset();
    ds.events = [];
    ds.matchPhases = [
      { timeSec: 2, phase: { kind: "countdown", startSec: 20.3 } },
      { timeSec: 20.3, phase: { kind: "running", startSec: 20.3 } },
    ];
    const stream = createSwitcherStream(new CausalView(ds), { startSec: 5 });
    stream.advanceTo(30, ds);
    expect(
      stream.shots.some(
        (s) => s.role === "rosterWide" && s.startSec >= 5 && s.startSec < 20.3,
      ),
    ).toBe(true);
    expect(
      stream.shots.some((s) => s.role === "rosterWide" && s.startSec > 20.3),
    ).toBe(false);
  });

  it("widens an ongoing flag chase to show a nearby mortar salvo", () => {
    const ds = dataset();
    const timeSec = 74;
    const flag = ds.flagSamples.find(
      (sample) => sample.slot === 2 && sample.timeSec === timeSec,
    )!;
    ds.deaths = [0, 24].map((offset, i) => ({
      timeSec,
      targetId: i + 10,
      teamId: 2,
      pos: [flag.pos[0], flag.pos[1] + offset, flag.pos[2]],
      killerTargetId: null,
      weapon: "mortar",
    }));
    const shots = runSwitcher(new CausalView(ds));
    expect(
      shots.find((shot) => shot.reason === "Mortar fire around the flag"),
    ).toMatchObject({ kind: "fixedOrbit", startSec: 73, endSec: 78 });
    expect(
      shots.some((shot) => shot.topic === "capture" && shot.startSec === 88),
    ).toBe(true);
  });

  it("covers the next round's countdown after joining the previous round in play", () => {
    const ds = dataset();
    ds.events = [];
    ds.matchPhases = [
      { timeSec: 0, phase: { kind: "running", startSec: -200 } },
      { timeSec: 12, phase: { kind: "countdown", startSec: 35 } },
      { timeSec: 35, phase: { kind: "running", startSec: 35 } },
    ];
    const stream = createSwitcherStream(new CausalView(ds));
    stream.advanceTo(45, ds);
    const lineups = stream.shots.filter((shot) => shot.role === "rosterWide");
    expect(lineups.length).toBeGreaterThan(0);
    expect(
      lineups.every((shot) => shot.startSec >= 12 && shot.startSec < 35),
    ).toBe(true);
  });

  it("opens a full roster intro once team-picking settles", () => {
    // 6v6 standing still from t=0, kickoff at 60 with no countdown
    // message: the stability trigger alone must produce both teams'
    // wides and at least one close-up per side before the whistle.
    const ds = dataset();
    ds.events = [
      { timeSec: 75, type: "match-start", description: "Match started" },
    ];
    for (let t = 0; t <= 74; t++) {
      for (let n = 0; n < 6; n++) {
        ds.playerSamples.push({
          timeSec: t,
          targetId: 100 + n,
          teamId: 1,
          pos: [20 + n * 4, 30, 100],
          heading: 0.5,
          armor: "light",
        });
        ds.playerSamples.push({
          timeSec: t,
          targetId: 200 + n,
          teamId: 2,
          pos: [760 - n * 4, 30, 100],
          heading: 2.5,
          armor: "light",
        });
      }
    }
    const plan = planShotsCausal(ds);
    // Selected by ROLE, not by parsing `reason` — the reason text is
    // descriptive and reworded freely.
    const roster = plan.shots.filter(
      (s) =>
        s.endSec <= 76 &&
        (s.role === "rosterWide" || s.role === "rosterCloseUp"),
    );
    const wides = roster.filter((s) => s.role === "rosterWide");
    const closeUps = roster.filter((s) => s.role === "rosterCloseUp");
    expect(wides.length).toBeGreaterThanOrEqual(2);
    expect(closeUps.length).toBeGreaterThanOrEqual(2);
    // Both teams appear in the wides.
    expect(new Set(wides.map((s) => /Storm/.test(s.reason))).size).toBe(2);
    // The demo skip never jumps the roster block.
    expect(plan.skipToSec ?? 0).toBeLessThanOrEqual(
      Math.min(...roster.map((s) => s.startSec)),
    );
  });

  it("lets the running pass finish when a countdown moves the deadline, and lines up to the whistle", () => {
    // 5v5 settled from t=0, so the intro block is on air when the
    // 30-second countdown comes into view at 40. That used to re-emit
    // a pass on the spot — a sweep cut off two seconds in — and once
    // each side's close-up budget was spent the block ended early,
    // handing the last stretch before the whistle back to the tour.
    const ds = dataset();
    ds.events = [
      {
        timeSec: 40,
        type: "match-countdown",
        description: "Match starts in 30 seconds",
        secondsUntil: 30,
      },
      { timeSec: 70, type: "match-start", description: "Match started" },
    ];
    for (let t = 0; t <= 69; t++) {
      for (let n = 0; n < 5; n++) {
        ds.playerSamples.push({
          timeSec: t,
          targetId: 100 + n,
          teamId: 1,
          pos: [20 + n * 4, 30, 100],
          heading: 0.5,
          armor: "light",
        });
        ds.playerSamples.push({
          timeSec: t,
          targetId: 200 + n,
          teamId: 2,
          pos: [760 - n * 4, 30, 100],
          heading: 2.5,
          armor: "light",
        });
      }
    }
    const plan = planShotsCausal(ds);
    const roster = plan.shots.filter(
      (s) =>
        s.startSec < 70 &&
        (s.role === "rosterWide" || s.role === "rosterCloseUp"),
    );
    expect(roster.length).toBeGreaterThanOrEqual(4);
    for (const s of roster) {
      expect(
        s.endSec - s.startSec,
        `${s.startSec} ${s.reason}`,
      ).toBeGreaterThanOrEqual(3);
    }
    // Line-ups carry through to the whistle (a pass shorter than four
    // seconds is not started, so the last one may end a beat early).
    expect(Math.max(...roster.map((s) => s.endSec))).toBeGreaterThanOrEqual(66);
  });

  it("films no pick-up until both sides have held a player for 7s", () => {
    // Storm fills first — two joiners, nobody opposite them for a
    // minute. Neither is a pick-up: there is no other side to be picked
    // against, and by the time Inferno's first player settles they are
    // old news. That first Inferno player IS the first pick-up, seven
    // seconds after joining.
    const ds = dataset();
    ds.events = [
      { timeSec: 110, type: "match-start", description: "Match started" },
    ];
    ds.playerSamples = [];
    const stand = (id: number, from: number, teamId: number, x: number) => {
      for (let t = from; t <= 110; t++) {
        ds.playerSamples.push({
          timeSec: t,
          targetId: id,
          teamId,
          pos: [x, 30, 100],
          heading: 0.5,
          armor: "light",
        });
      }
    };
    stand(101, 0, 1, 20);
    stand(102, 20, 1, 40);
    stand(201, 60, 2, 760);
    ds.playerNames = [
      { targetId: 101, name: "a", displayName: "A" },
      { targetId: 102, name: "b", displayName: "B" },
      { targetId: 201, name: "c", displayName: "C" },
    ];
    const signings = planShotsCausal(ds).shots.filter(
      (s) => s.role === "signing",
    );
    expect(signings.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...signings.map((s) => s.startSec))).toBeGreaterThanOrEqual(
      67,
    );
    // The first player on EACH side is announced once the broadcast is
    // on air — A's pick-up is a minute old by then and is announced
    // anyway; B, who joined later, is not (stale by the time the run
    // and the two first-player pick-ups have gone out).
    expect(signings.some((s) => / A$/.test(s.reason))).toBe(true);
    expect(signings.some((s) => / C$/.test(s.reason))).toBe(true);
  });

  it("notices a signing during a long shot, not when the shot ends", () => {
    // A player who picks a side five seconds into the opening shot has
    // settled by twelve, and must be filmed the moment that shot ends —
    // not seven seconds after that because the switcher only looked at
    // the roster when it came to choose.
    const ds = dataset();
    ds.events = [
      { timeSec: 110, type: "match-start", description: "Match started" },
    ];
    ds.playerSamples = [];
    for (let t = 0; t <= 110; t++) {
      ds.playerSamples.push({
        timeSec: t,
        targetId: 101,
        teamId: 1,
        pos: [20, 30, 100],
        heading: 0.5,
        armor: "light",
      });
      if (t >= 5) {
        ds.playerSamples.push({
          timeSec: t,
          targetId: 201,
          teamId: 2,
          pos: [760, 30, 100],
          heading: 2.5,
          armor: "light",
        });
      }
    }
    ds.playerNames = [
      { targetId: 101, name: "a", displayName: "A" },
      { targetId: 201, name: "b", displayName: "B" },
    ];
    const plan = planShotsCausal(ds);
    // The opening wide runs a dozen seconds; B joins five seconds in.
    const opening = plan.shots[0];
    expect(opening.endSec).toBeGreaterThanOrEqual(12);
    // Both sides were seen to settle DURING that shot, so the broadcast
    // opens the moment it ends: the establishing run first...
    const run = plan.shots.find((s) => s.role === "establishing")!;
    expect(run).toBeDefined();
    expect(run.startSec).toBeLessThanOrEqual(opening.endSec + 0.5);
    // ...then the two first players straight after it, in the order
    // they joined — B not stamped "just joined" when the wide ended and
    // made to wait, and neither dropped as stale during the run.
    const signings = plan.shots.filter((s) => s.role === "signing");
    expect(signings[0]?.startSec).toBeLessThanOrEqual(run.endSec + 0.5);
    expect(signings[0].reason).toMatch(/ A$/);
    const b = signings.find((s) => / B$/.test(s.reason))!;
    expect(b).toBeDefined();
    expect(b.startSec).toBeLessThanOrEqual(signings[0].endSec + 0.5);
  });

  it("saves the flag-to-flag run for the moment both sides have a player", () => {
    // The establishing run is the shot the broadcast opens over, so it
    // waits for the teams to settle (Inferno's first player joins at
    // 5s, settled at 12s) instead of firing in the first seconds, and
    // it goes out BEFORE the queued pick-ups.
    const ds = dataset();
    ds.events = [
      { timeSec: 110, type: "match-start", description: "Match started" },
    ];
    ds.playerSamples = [];
    for (let t = 0; t <= 110; t++) {
      ds.playerSamples.push({
        timeSec: t,
        targetId: 101,
        teamId: 1,
        pos: [20, 30, 100],
        heading: 0.5,
        armor: "light",
      });
      if (t >= 5) {
        ds.playerSamples.push({
          timeSec: t,
          targetId: 201,
          teamId: 2,
          pos: [760, 30, 100],
          heading: 2.5,
          armor: "light",
        });
      }
    }
    const plan = planShotsCausal(ds);
    const runs = plan.shots.filter((s) => s.role === "establishing");
    expect(runs).toHaveLength(1);
    expect(runs[0].startSec).toBeGreaterThanOrEqual(12);
    const firstSigning = plan.shots.find((s) => s.role === "signing")!;
    expect(firstSigning.startSec).toBeGreaterThanOrEqual(runs[0].endSec);
    // And nothing flew before it.
    expect(
      plan.shots.some(
        (s) => s.startSec < runs[0].startSec && /across the map/.test(s.reason),
      ),
    ).toBe(false);
  });

  it("cuts to the stand BEFORE the first grab, ending the suit-up", () => {
    // The grab lands at 30, ten seconds into the post-whistle suit-up
    // ceremony. The peek sees it two seconds out — the camera must be
    // on flag 2 before the grab, not chasing the carrier after it.
    const plan = planShotsCausal(dataset());
    const atGrab = plan.shots.find((s) => s.startSec <= 29 && s.endSec > 29.5);
    expect(atGrab && concernsFlag(atGrab, 2)).toBeTruthy();
  });

  it("falls back to quick portrait cuts when no group can be panned", () => {
    // The base fixture's pre-match squad is a single defender: no pair
    // to pan across, so the close-up slots become 2-3s portraits that
    // must survive assembly (quickCut exempts the 4s minimum hold).
    // A second defender far from the first (no group at any radius),
    // so the montage alternates subjects instead of merging.
    const ds = dataset();
    for (let t = 0; t <= 29; t++) {
      ds.playerSamples.push({
        timeSec: t,
        targetId: 10,
        teamId: 1,
        pos: [200, 8, 100],
        heading: 1.0,
        armor: "light",
      });
    }
    ds.playerNames.push({ targetId: 10, name: "loner", displayName: "Loner" });
    const plan = planShotsCausal(ds);
    const portraits = plan.shots.filter((s) => /^Roster — /.test(s.reason));
    expect(portraits.length).toBeGreaterThanOrEqual(1);
    // Shots still FLAGGED as quick cuts honour the 2-3s rhythm; one
    // sealed into following dead air legitimately loses the flag and
    // becomes an ordinary hold.
    const quick = portraits.filter((p) => p.quickCut);
    expect(quick.length).toBeGreaterThanOrEqual(1);
    for (const p of quick) {
      expect(p.endSec - p.startSec).toBeLessThanOrEqual(3.2);
      expect(p.endSec - p.startSec).toBeGreaterThanOrEqual(2);
    }
  });

  it("lets a parked, unthreatened flag go stale and only checks in", () => {
    // Flag 2 is thrown deep into its own team's ground at t=30 and
    // simply left there — nobody from the other side comes near it.
    // Teams do this on purpose; the camera must not sit on a prop.
    const ds = dataset();
    ds.durationSec = 260;
    ds.events = [
      { timeSec: 5, type: "match-start", description: "Match started" },
    ];
    const PARKED: DirectorVec3 = [700, 300, 100];
    ds.flagSamples = [];
    ds.playerSamples = [];
    for (let t = 0; t <= 260; t += 0.5) {
      ds.flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: STAND_1,
        carrierTargetId: null,
        status: "home",
      });
      ds.flagSamples.push({
        timeSec: t,
        slot: 2,
        pos: t < 30 ? STAND_2 : PARKED,
        carrierTargetId: null,
        status: t < 30 ? "home" : "field",
      });
    }
    for (let t = 0; t <= 260; t++) {
      // Owners loiter near their parked flag; the enemy stays home,
      // far outside DIRECTOR_FIELD_QUIET_RANGE of it.
      for (let n = 0; n < 3; n++) {
        ds.playerSamples.push({
          timeSec: t,
          targetId: 30 + n,
          teamId: 2,
          pos: [PARKED[0] + n * 5, PARKED[1] + 5, 100],
          heading: 1,
          armor: "medium",
        });
        ds.playerSamples.push({
          timeSec: t,
          targetId: 40 + n,
          teamId: 1,
          pos: [STAND_1[0] + n * 6, STAND_1[1] + 4, 100],
          heading: 2,
          armor: "light",
        });
      }
    }
    const plan = planShotsCausal(ds);
    const onParked = (s: Shot) =>
      (s.kind === "followFlag" && s.slot === 2) ||
      (s.kind === "fixedOrbit" &&
        s.lookSubject?.type === "flag" &&
        s.lookSubject.slot === 2);
    const airtime = (from: number, to: number) =>
      plan.shots
        .filter((s) => onParked(s) && s.endSec > from && s.startSec < to)
        .reduce(
          (acc, s) =>
            acc + (Math.min(s.endSec, to) - Math.max(s.startSec, from)),
          0,
        ) /
      (to - from);
    // Fresh drop: worth watching. Long after: mostly other pictures.
    expect(airtime(30, 60)).toBeGreaterThan(0.3);
    expect(airtime(120, 260)).toBeLessThan(0.35);
    // …but never forgotten entirely.
    expect(plan.shots.some((s) => /still parked/.test(s.reason))).toBe(true);
  });

  it("never reads past the information horizon", () => {
    const view = new CausalView(dataset());
    runSwitcher(view);
    expect(view.maxQueriedAhead).toBeLessThanOrEqual(
      DIRECTOR_LOOKAHEAD_SEC + 1e-9,
    );
  });

  it("keeps chase framings rotating instead of one endless shot", () => {
    const plan = planShotsCausal(dataset());
    const carryShots = plan.shots.filter(
      (s) => s.startSec >= 30 && s.endSec <= 92 && concernsFlag(s, 2),
    );
    expect(carryShots.length).toBeGreaterThanOrEqual(2);
  });
});

describe("shot roles", () => {
  /**
   * Behaviour must key on `role`, never on `reason`. Parsing the
   * description silently broke three separate things: a `/Pre-match/`
   * test meant for roster passes also caught map fly-throughs and
   * skipped their clearance check; a `/close-up/` test gated the
   * path-trim rescue so tour pans were converted instead of trimmed;
   * and rewording a reason changed behaviour with no type error.
   */
  it("drives no staging or switching decision from reason text", () => {
    const sources = [
      "src/director/stage.ts",
      "src/director/switcher.ts",
      "src/director/framing.ts",
    ];
    const offenders: string[] = [];
    for (const file of sources) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        // A regex/substring test APPLIED TO a reason. Assignments and
        // `.replace` on a reason are fine — those produce text.
        const touchesReason = /\breason\b/.test(line);
        const branches = /\.(test|match|includes|startsWith|search)\s*\(/.test(
          line,
        );
        // `.replace` on a reason is fine — it produces text, it does not
        // decide anything.
        const rewrites = /\.replace\s*\(/.test(line);
        if (touchesReason && branches && !rewrites) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("createSwitcherStream", () => {
  it("makes in-match decisions after an explicit kickoff without a match-start message", () => {
    const ds = directorDataset({
      events: [],
      matchPhases: [{ timeSec: 60, phase: { kind: "running", startSec: 10 } }],
    });
    const pick = vi.spyOn(variety, "pickVarietyShot");
    try {
      const stream = createSwitcherStream(new CausalView(ds, 0), {
        startSec: 60,
      });
      stream.advanceTo(60.5, ds);
      expect(pick).toHaveBeenCalled();
    } finally {
      pick.mockRestore();
    }
  });

  /** A shot's full identity, so a comparison cannot pass on timing alone. */
  const key = (s: Shot): string =>
    `${s.startSec.toFixed(2)}-${s.endSec.toFixed(2)} ${s.kind} ${s.reason}`;

  /**
   * The dataset as a stream would have it at `sec`: everything after
   * the horizon simply does not exist yet. Feeding the whole thing
   * every slice would test nothing — the point is that the switcher
   * decides the same way WITHOUT the future.
   */
  function truncated(ds: DirectorDataset, sec: number): DirectorDataset {
    const upTo = <T extends { timeSec: number }>(rows: T[]): T[] =>
      rows.filter((r) => r.timeSec <= sec);
    return {
      ...ds,
      durationSec: Math.min(sec, ds.durationSec),
      flagSamples: upTo(ds.flagSamples),
      playerSamples: upTo(ds.playerSamples),
      events: upTo(ds.events),
      deaths: ds.deaths ? upTo(ds.deaths) : ds.deaths,
    };
  }

  function streamed(ds: DirectorDataset, slice: number): string[] {
    // Seeded with the FIRST slice only — the view must be given the
    // rest as it arrives, or it is quietly reading the whole demo.
    const view = new CausalView(truncated(ds, DIRECTOR_LOOKAHEAD_SEC));
    const s = createSwitcherStream(view);
    for (let t = slice; s.plannedToSec < ds.durationSec; t += slice) {
      const to = Math.min(t, ds.durationSec);
      // A slice is planned only once the scan is a lookahead past it.
      s.advanceTo(to, truncated(ds, to + DIRECTOR_LOOKAHEAD_SEC));
    }
    s.finish(ds.durationSec);
    return s.shots.map(key);
  }

  it("decides the same shots without ever seeing the future", () => {
    // The claim behind streaming a cast: the switcher never queries
    // past `now + lookahead`, so being fed the timeline in pieces —
    // with everything beyond the horizon genuinely absent — cannot
    // change a single decision.
    const ds = dataset();
    const batch = runSwitcher(new CausalView(ds)).map(key);
    expect(streamed(ds, 10)).toEqual(batch);
  });

  it("is unaffected by the slice size", () => {
    const ds = dataset();
    expect(streamed(ds, 3)).toEqual(streamed(ds, 37));
  });

  it("adopts the flags once the world has loaded, not only at creation", () => {
    // A real stream plans its first slice before the mission has
    // loaded: no flag stands, no flag samples. Built once from that,
    // the subject list held only the idle filler and a whole match
    // came out as "Lull — watching 2 players" with both flags carried.
    const ds = dataset();
    const late: DirectorDataset = {
      ...ds,
      flagSamples: ds.flagSamples.filter((s) => s.timeSec >= 6),
    };
    const view = new CausalView({
      ...truncated(late, DIRECTOR_LOOKAHEAD_SEC),
      flagStands: [],
    });
    const s = createSwitcherStream(view);
    for (let t = 10; t <= late.durationSec; t += 10) {
      const to = Math.min(t, late.durationSec);
      s.advanceTo(to, truncated(late, to + DIRECTOR_LOOKAHEAD_SEC));
    }
    s.finish(late.durationSec);
    const streamed = s.shots.map(key);
    expect(streamed.some((k) => k.includes("followFlag"))).toBe(true);
    expect(streamed).toEqual(runSwitcher(new CausalView(late)).map(key));
  });

  it("closes every shot but the last one it is still framing", () => {
    const ds = dataset();
    const s = createSwitcherStream(new CausalView(ds));
    s.advanceTo(30, truncated(ds, 30 + DIRECTOR_LOOKAHEAD_SEC));
    expect(s.shots.length).toBeGreaterThan(0);
    for (const shot of s.shots.slice(0, -1)) {
      expect(shot.endSec).toBeGreaterThan(shot.startSec);
    }
    expect(s.plannedToSec).toBe(30);
  });
});

describe("determinism", () => {
  const key = (s: Shot): string =>
    `${s.startSec.toFixed(3)}-${s.endSec.toFixed(3)} ${s.kind} ${s.reason} ` +
    `${JSON.stringify((s as { staged?: unknown }).staged ?? null)}`;

  it("plans the same cast twice from the same recording", () => {
    // No PRNG anywhere in the director: `jitter` is a hash of a shot
    // index, so the same demo yields the same cast every time. If this
    // ever fails, something started reading a clock or a random source.
    const ds = dataset();
    expect(planShotsCausal(ds).shots.map(key)).toEqual(
      planShotsCausal(dataset()).shots.map(key),
    );
  });

  it("does not depend on how the cast was watched", () => {
    // The streamed plan is extended a slice at a time as the viewer
    // plays; the SIZE of those slices depends on wall-clock polling, so
    // it must not change a single decision.
    const ds = dataset();
    const run = (slice: number): string[] => {
      const s = createSwitcherStream(new CausalView(ds));
      for (let t = slice; t <= ds.durationSec; t += slice) {
        s.advanceTo(Math.min(t, ds.durationSec), ds);
      }
      s.finish(ds.durationSec);
      return s.shots.map(key);
    };
    expect(run(4)).toEqual(run(29));
  });
});

describe("live pacing", () => {
  it("plans no further than the caller asks for", () => {
    // The director is causal, so there is nothing to gain from planning
    // ahead of the playhead — and plenty to lose. A version that
    // planned in slices did the same work in bursts and stalled the
    // frame loop for up to 3.3 seconds at a time.
    const ds = dataset();
    const s = createSwitcherStream(new CausalView(ds));
    s.advanceTo(20, ds);
    expect(s.plannedToSec).toBeLessThanOrEqual(20);
    // Nothing decided beyond where it was driven.
    for (const shot of s.shots) {
      expect(shot.startSec).toBeLessThanOrEqual(20);
    }
  });

  it("picks up exactly where it left off", () => {
    const ds = dataset();
    const s = createSwitcherStream(new CausalView(ds));
    s.advanceTo(20, ds);
    const before = s.shots.length;
    s.advanceTo(20, ds); // same time again: no work, no new shots
    expect(s.shots.length).toBe(before);
    s.advanceTo(40, ds);
    expect(s.plannedToSec).toBeLessThanOrEqual(40);
    expect(s.shots.length).toBeGreaterThanOrEqual(before);
  });
});

describe("the grid build is deterministic", () => {
  it("finishes after the same number of steps every time", () => {
    // It is budgeted in WORK, not wall-clock. A time budget makes the
    // number of ticks depend on the machine, and since the director
    // cannot plan landmark shots until the build finishes, that makes
    // the CAST depend on the machine: the same demo produced 219, 223
    // and 219 shots on three consecutive runs before this.
    const ds = dataset();
    const steps = (): number => {
      const build = createFreeSpaceBuild(ds, 0);
      if (!build) return 0;
      let n = 0;
      while (!build.step(3)) n++;
      return n;
    };
    const a = steps();
    expect(a).toBeGreaterThan(0);
    expect(steps()).toBe(a);
    expect(steps()).toBe(a);
  });
});

describe("the shot on screen", () => {
  const key = (s: Shot) => `${s.startSec}-${s.endSec}`;

  it("always has a shot covering the playhead", () => {
    // A live cast is watched while it is planned, so at every instant
    // the plan must contain the moment being rendered. The shot still
    // rolling used to end at the dataset's duration — which, streaming,
    // is only the horizon it was opened under — so once the viewer got
    // past that there was nothing on screen.
    const ds = dataset();
    const view = new CausalView(ds);
    const s = createSwitcherStream(view);
    for (let t = 1; t <= 60; t += 1) {
      s.advanceTo(t, ds);
      const covering = s.shots.find((x) => x.startSec <= t && t < x.endSec);
      expect(
        covering,
        `nothing covers t=${t}: ${s.shots.map(key).join(" ")}`,
      ).toBeDefined();
    }
  });

  it("has a shot from the very first step", () => {
    // The plan is not empty at two seconds — the opening shot is
    // already open. Reading an empty plan as "no cast for this
    // recording" refused every demo.
    const ds = dataset();
    const s = createSwitcherStream(new CausalView(ds));
    expect(s.shots.length).toBeGreaterThan(0);
    s.advanceTo(2, ds);
    expect(s.shots.length).toBeGreaterThan(0);
  });
});

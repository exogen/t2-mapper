import { describe, expect, it } from "vitest";
import { planShots } from "./planner";
import { buildFlagTracks, buildPlayersAtSec } from "./dataset";
import { buildSubjects, interestContext, scoreSubjects } from "./interest";
import { radiusForSpread } from "./framing";
import {
  DIRECTOR_CLUSTER_CAM_RADIUS,
  DIRECTOR_DIST_CROWD,
  DIRECTOR_PITCH_CHASE,
  DIRECTOR_PITCH_CROWD,
  DIRECTOR_FAIR_SHARE_SEC,
  DIRECTOR_MIN_SHOT_HOLD_SEC,
} from "./tunables";
import type {
  DirectorDataset,
  DirectorEvent,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
} from "./types";

const STAND_1: DirectorVec3 = [0, 0, 100];
const STAND_2: DirectorVec3 = [800, 0, 100];

function lerp(a: DirectorVec3, b: DirectorVec3, t: number): DirectorVec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Synthetic 120s CTF demo: quiet until t=30, then the Inferno flag is
 * grabbed and run toward Storm's base, dropped at 55, re-grabbed at 70,
 * and capped at 90.
 */
function ctfDataset(
  extraEvents: DirectorEvent[] = [],
  extraPlayerSamples: DirectorPlayerSample[] = [],
): DirectorDataset {
  const durationSec = 120;
  const flagSamples: DirectorFlagSample[] = [];
  for (let t = 0; t <= durationSec; t += 0.5) {
    flagSamples.push({
      timeSec: t,
      slot: 1,
      pos: STAND_1,
      carrierTargetId: null,
      status: "home",
    });
    let status: DirectorFlagSample["status"];
    let pos: DirectorVec3;
    let carrierTargetId: number | null = null;
    if (t < 30 || t >= 90) {
      status = "home";
      pos = STAND_2;
    } else if (t < 55) {
      status = "held";
      carrierTargetId = 5;
      pos = lerp(STAND_2, STAND_1, (t - 30) / 60);
    } else if (t < 70) {
      status = "field";
      pos = lerp(STAND_2, STAND_1, 25 / 60);
    } else {
      status = "held";
      carrierTargetId = 5;
      pos = lerp(STAND_2, STAND_1, (t - 45) / 60);
    }
    flagSamples.push({ timeSec: t, slot: 2, pos, carrierTargetId, status });
  }
  const events: DirectorEvent[] = [
    { timeSec: 5, type: "match-start", description: "Match started" },
    {
      timeSec: 30,
      type: "flag-grab",
      description: "Slayer grabbed the Inferno flag",
      actor: "Slayer",
      flagTeamName: "Inferno",
    },
    {
      timeSec: 55,
      type: "flag-drop",
      description: "Slayer dropped the Inferno flag",
      actor: "Slayer",
      flagTeamName: "Inferno",
    },
    {
      timeSec: 70,
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
    { timeSec: 118, type: "match-end", description: "Match ended" },
    ...extraEvents,
  ];
  return {
    durationSec,
    flagSampleStepSec: 0.5,
    playerSampleStepSec: 1,
    gameClassName: "CTFGame",
    teams: [
      { teamId: 1, name: "Storm" },
      { teamId: 2, name: "Inferno" },
    ],
    flagStands: [
      { slot: 1, teamId: 1, name: "Storm", pos: STAND_1 },
      { slot: 2, teamId: 2, name: "Inferno", pos: STAND_2 },
    ],
    events,
    flagSamples,
    playerSamples: [
      { timeSec: 40, targetId: 5, teamId: 1, pos: lerp(STAND_2, STAND_1, 0.2) },
      // A lone defender loitering by the flag while it lies on the
      // ground (55–70), so the drop counts as contested — an
      // uncontested flag in an empty field deliberately gets no camera.
      ...Array.from({ length: 16 }, (_, i) => ({
        timeSec: 55 + i,
        targetId: 9,
        teamId: 2,
        pos: lerp(STAND_2, STAND_1, 25 / 60),
      })),
      ...extraPlayerSamples,
    ],
    structures: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [{ targetId: 5, name: "slayer" }],
  };
}

/** Rapid-fire grabs on BOTH flags at the same instants: the camera can
 *  only be at one, so the other's grabs need spliced cut-ins — the case
 *  that produces the most splices, and so the most chances to leave a
 *  sliver or a cut storm. */
const MANY_GRABS: DirectorEvent[] = Array.from({ length: 14 }, (_, i) => ({
  timeSec: 20 + Math.floor(i / 2) * 6.2,
  type: "flag-grab" as const,
  description: `rapid grab ${i}`,
  actor: "Slayer",
  flagTeamName: i % 2 === 0 ? "Storm" : "Inferno",
}));

/**
 * Both flags carried at once from t=20 to t=100 — two simultaneous
 * drives, each scoring as a carry, so neither can ever out-score the
 * other by enough to earn a cut.
 */
function bothFlagsOutDataset(cappingSlot?: number): DirectorDataset {
  const base = ctfDataset();
  const flagSamples: DirectorFlagSample[] = [];
  for (let t = 0; t <= base.durationSec; t += 0.5) {
    const out = t >= 20 && t < 100;
    const progress = (t - 20) / 160;
    flagSamples.push({
      timeSec: t,
      slot: 1,
      pos: out ? lerp(STAND_1, STAND_2, progress) : STAND_1,
      carrierTargetId: out ? 11 : null,
      status: out ? "held" : "home",
    });
    flagSamples.push({
      timeSec: t,
      slot: 2,
      pos: out ? lerp(STAND_2, STAND_1, progress) : STAND_2,
      carrierTargetId: out ? 5 : null,
      status: out ? "held" : "home",
    });
  }
  return {
    ...base,
    flagSamples,
    events: [
      { timeSec: 5, type: "match-start", description: "Match started" },
      {
        timeSec: 20,
        type: "flag-grab",
        description: "Slayer grabbed the Inferno flag",
        actor: "Slayer",
        flagTeamName: "Inferno",
      },
      {
        timeSec: 20,
        type: "flag-grab",
        description: "Rival grabbed the Storm flag",
        actor: "Rival",
        flagTeamName: "Storm",
      },
      // One drive ending in a capture earns the outcome bonus for its
      // WHOLE possession, which is what makes fair alternation hard.
      ...(cappingSlot != null
        ? [
            {
              timeSec: 100,
              type: "flag-cap" as const,
              description: "capture",
              capturer: cappingSlot === 1 ? "Rival" : "Slayer",
              flagTeamName: cappingSlot === 1 ? "Storm" : "Inferno",
            },
          ]
        : []),
    ],
    playerNames: [
      { targetId: 5, name: "slayer" },
      { targetId: 11, name: "rival" },
    ],
  };
}

/** Which flag slot a shot is about, if any. */
function shotSlot(shot: Shot): number | null {
  if (shot.kind === "followFlag") return shot.slot;
  if (shot.kind === "dolly" && shot.subject.type === "flag") {
    return shot.subject.slot;
  }
  if (shot.kind === "fixedOrbit" && shot.lookSubject?.type === "flag") {
    return shot.lookSubject.slot;
  }
  return null;
}

function shotAt(shots: Shot[], t: number): Shot | undefined {
  return shots.find((s) => t >= s.startSec && t < s.endSec);
}

function expectContiguous(shots: Shot[], durationSec: number): void {
  expect(shots.length).toBeGreaterThan(0);
  expect(shots[0].startSec).toBe(0);
  expect(shots[shots.length - 1].endSec).toBeCloseTo(durationSec, 5);
  for (let i = 1; i < shots.length; i++) {
    expect(shots[i].startSec).toBeCloseTo(shots[i - 1].endSec, 5);
    expect(shots[i].endSec).toBeGreaterThan(shots[i].startSec);
  }
}

describe("planShots (CTF)", () => {
  const plan = planShots(ctfDataset());

  it("detects the mode and produces a contiguous plan", () => {
    expect(plan.gameMode).toBe("ctf");
    expectContiguous(plan.shots, 120);
  });

  it("never emits a shot shorter than the minimum hold", () => {
    // Slivers read as a jump cut, not a shot. Checked here and on the
    // splice-heavy plan, since guarantee cut-ins are what create them:
    // a cut-in used to trim its neighbour to a 1.6s fragment.
    for (const p of [plan, planShots(ctfDataset(MANY_GRABS))]) {
      for (const shot of p.shots) {
        expect(
          shot.endSec - shot.startSec,
          `${shot.reason} @${shot.startSec.toFixed(1)}`,
        ).toBeGreaterThanOrEqual(DIRECTOR_MIN_SHOT_HOLD_SEC);
      }
    }
  });

  it("chases the carried flag", () => {
    const shot = shotAt(plan.shots, 40);
    expect(shot?.kind).toBe("followFlag");
    expect(shot).toMatchObject({ slot: 2 });
  });

  it("frames tighter on a slow carrier and wider on a fast one", () => {
    // Same run, different pace: shot width tracks speed the way an
    // operator zooms out as play breaks open.
    const widthAtPace = (unitsPerSecond: number) => {
      const base = ctfDataset();
      const flagSamples = base.flagSamples.map((s) => {
        if (s.slot !== 2 || s.status !== "held" || s.timeSec >= 55) return s;
        const elapsed = s.timeSec - 30;
        return {
          ...s,
          pos: lerp(
            STAND_2,
            STAND_1,
            Math.min(1, (elapsed * unitsPerSecond) / 800),
          ),
        };
      });
      const shot = shotAt(planShots({ ...base, flagSamples }).shots, 40);
      return shot?.kind === "followFlag" ? (shot.distance ?? 0) : 0;
    };
    const slow = widthAtPace(5);
    const fast = widthAtPace(70);
    expect(fast).toBeGreaterThan(slow + 5);
  });

  it("parks at the flag before the grab (anticipation)", () => {
    const shot = shotAt(plan.shots, 25);
    expect(shot?.kind).toBe("followFlag");
    expect(shot).toMatchObject({ slot: 2 });
    expect(shot!.startSec).toBeLessThanOrEqual(28);
  });

  it("watches the dropped flag from a stationary wide camera", () => {
    const shot = shotAt(plan.shots, 60);
    expect(shot?.kind).toBe("fixedOrbit");
    if (shot?.kind === "fixedOrbit") {
      expect(shot.angularSpeed).toBe(0);
      // Centered on where the flag fell.
      const dropPos = lerp(STAND_2, STAND_1, 25 / 60);
      expect(shot.center[0]).toBeCloseTo(dropPos[0], 0);
      expect(shot.center[1]).toBeCloseTo(dropPos[1], 0);
    }
  });

  it("rides the cinematic dolly on alternating long chases", () => {
    // First qualifying chase (30–55) stays a locked orbit; the second
    // (70–85, before the ceremony) alternates onto the dolly.
    const shot = shotAt(plan.shots, 78);
    expect(shot?.kind).toBe("dolly");
    if (shot?.kind === "dolly") {
      expect(shot.subject).toEqual({ type: "flag", slot: 2 });
    }
  });

  it("widens into ceremony framing before the cap", () => {
    const shot = shotAt(plan.shots, 88);
    expect(shot?.kind).toBe("followFlag");
    expect(shot).toMatchObject({ slot: 2, distance: 16 });
  });

  it("covers every tier-1 event", () => {
    // match-start, 2 grabs, cap, match-end (the drop is not tier-1).
    expect(plan.coverage.length).toBe(5);
    for (const row of plan.coverage) {
      expect(row.covered, row.description).toBe(true);
    }
  });
});

describe("planShots balance", () => {
  const shots = planShots(bothFlagsOutDataset()).shots.filter(
    (s) => s.startSec >= 20 && s.endSec <= 100,
  );

  it("alternates between two simultaneous flag drives", () => {
    const slots = new Set(shots.map(shotSlot).filter((s) => s != null));
    expect(slots).toEqual(new Set([1, 2]));
  });

  it("gives both drives comparable screen time", () => {
    const held = new Map<number, number>();
    for (const shot of shots) {
      const slot = shotSlot(shot);
      if (slot == null) continue;
      held.set(slot, (held.get(slot) ?? 0) + (shot.endSec - shot.startSec));
    }
    const [a, b] = [held.get(1) ?? 0, held.get(2) ?? 0];
    expect(Math.min(a, b) / Math.max(a, b)).toBeGreaterThan(0.5);
  });

  it("still alternates when one drive ends in a capture", () => {
    // The outcome bonus makes the capping flag decisively higher-scoring
    // for its whole possession, so every fairness cut away from it was
    // undone by the pre-empt rule within a couple of seconds.
    const capped = planShots(bothFlagsOutDataset(1)).shots.filter(
      (s) => s.startSec >= 20 && s.endSec <= 100,
    );
    const held = new Map<number, number>();
    for (const shot of capped) {
      const slot = shotSlot(shot);
      if (slot == null) continue;
      held.set(slot, (held.get(slot) ?? 0) + (shot.endSec - shot.startSec));
    }
    expect(held.get(2) ?? 0).toBeGreaterThan(DIRECTOR_FAIR_SHARE_SEC);
  });

  it("never leaves one drive off camera for long", () => {
    // The quantity that matters is the gap, not per-shot duration: the
    // segmentation splits a chase into status runs, so shot lengths
    // would hide one flag owning the camera for a whole possession.
    for (const slot of [1, 2]) {
      let last = 20;
      let longestGap = 0;
      for (const shot of shots) {
        if (shotSlot(shot) !== slot) continue;
        longestGap = Math.max(longestGap, shot.startSec - last);
        last = shot.endSec;
      }
      longestGap = Math.max(longestGap, 100 - last);
      // A literal bound, deliberately not DIRECTOR_MAX_CHASE_SEC: a test
      // whose threshold is the tunable it guards cannot fail when that
      // tunable is the thing that is wrong.
      expect(longestGap, `slot ${slot} off camera`).toBeLessThan(45);
    }
  });
});

describe("radiusForSpread fog cap", () => {
  const dataset = ctfDataset();
  const wide = 400;

  it("caps a wide camera at the map's fog range", () => {
    // 40m fog, 160m vanishing point: 40 + (160-40)*0.25 = 70 — between
    // the cluster-radius floor and the overview ceiling, so the fog is
    // what binds.
    expect(
      radiusForSpread(wide, {
        ...dataset,
        visibility: { fogDistance: 40, visibleDistance: 160 },
      }),
    ).toBeCloseTo(70, 5);
  });

  it("lets clear air use the full width", () => {
    const clear = radiusForSpread(wide, {
      ...dataset,
      visibility: { fogDistance: 900, visibleDistance: 1200 },
    });
    const soup = radiusForSpread(wide, {
      ...dataset,
      visibility: { fogDistance: 40, visibleDistance: 120 },
    });
    expect(clear).toBeGreaterThan(soup);
    // Clear air is limited by the field fraction, not the fog.
    expect(clear).toBeCloseTo(
      radiusForSpread(wide, { ...dataset, visibility: undefined }),
      5,
    );
  });

  it("never shrinks below a usable cluster radius", () => {
    expect(
      radiusForSpread(wide, {
        ...dataset,
        visibility: { fogDistance: 5, visibleDistance: 20 },
      }),
    ).toBeGreaterThanOrEqual(DIRECTOR_CLUSTER_CAM_RADIUS);
  });
});

describe("planShots visibility", () => {
  it("follows a fast carrier instead of parking a camera on them", () => {
    // 800m in 20s is 40u/s — a camera on their start point is aimed at
    // an empty hillside seconds later.
    const base = ctfDataset();
    const flagSamples = base.flagSamples.map((s) => {
      if (s.slot !== 2 || s.timeSec < 30 || s.timeSec >= 55) return s;
      const progress = Math.min(1, (s.timeSec - 30) / 20);
      return { ...s, pos: lerp(STAND_2, STAND_1, progress) };
    });
    for (const shot of planShots({ ...base, flagSamples }).shots) {
      if (shot.startSec < 32 || shot.endSec > 50) continue;
      if (shot.kind !== "fixedOrbit") continue;
      expect(
        shot.lookSubject,
        `fixed camera on a 40u/s carrier @${shot.startSec.toFixed(1)}`,
      ).not.toMatchObject({ type: "flag", slot: 2 });
    }
  });
});

describe("planShots grab anticipation", () => {
  it("is at the stand watching the approach before a grab, even when busy elsewhere", () => {
    // Thaen's first grab of the WoodyMyrk demo: the camera sat on mortar
    // filler at the OTHER base (scoring 60) because grab-soon (70) can
    // never beat 60 plus the switch penalty, and arrived a tenth of a
    // second AFTER the grab. The imminent tier must pre-empt filler so
    // the approach and setup are on camera.
    const mortars = Array.from({ length: 40 }, (_, i) => ({
      timeSec: 10 + i * 0.7,
      from: [100, 100, 100] as DirectorVec3,
      to: [10, 10, 100] as DirectorVec3,
    }));
    const plan = planShots({ ...ctfDataset(), mortarShots: mortars });
    // The grab is at t=30 on slot 2. For the seconds leading up to it the
    // camera must be a shot ABOUT slot 2, not the barrage.
    for (const t of [26, 28, 29.5]) {
      const shot = shotAt(plan.shots, t);
      expect(shot, `no shot at ${t}`).toBeDefined();
      expect(
        shotSlot(shot!),
        `at t=${t} camera was on "${shot!.reason}" instead of the flag about to be grabbed`,
      ).toBe(2);
    }
  });
});

describe("planShots camera grammar", () => {
  it("never has a fixed camera claim an aim subject outside its frame", () => {
    // A shot anchored on a battle that names a flag 600m away as its pan
    // target opens with a slow whip-pan toward empty distance and then
    // cuts — a camera move that means nothing.
    for (const dataset of [ctfDataset(), ctfDataset(MANY_GRABS)]) {
      const plan = planShots(dataset);
      for (const shot of plan.shots) {
        if (shot.kind !== "fixedOrbit" || shot.lookSubject?.type !== "flag") {
          continue;
        }
        const slot = shot.lookSubject.slot;
        const reach = shot.radius * 1.5 + 30;
        const mid = (shot.startSec + shot.endSec) / 2;
        const everInFrame = [shot.startSec, mid, shot.endSec].some((t) => {
          const sample = dataset.flagSamples
            .filter((f) => f.slot === slot && f.timeSec <= t + 0.5)
            .pop();
          if (!sample) return true;
          return (
            Math.hypot(
              sample.pos[0] - shot.center[0],
              sample.pos[1] - shot.center[1],
              sample.pos[2] - shot.center[2],
            ) <= reach
          );
        });
        expect(
          everInFrame,
          `"${shot.reason}" @${shot.startSec.toFixed(1)} aims at flag ${slot} never inside its frame`,
        ).toBe(true);
      }
    }
  });
});

describe("planShots kickoff", () => {
  it("opens on a wide of the spawn rush at the whistle", () => {
    // The first seconds after the countdown: everyone pouring out of
    // the bases is the only action anywhere.
    const rush: DirectorPlayerSample[] = [];
    for (let t = 5; t <= 20; t++) {
      for (let n = 0; n < 5; n++) {
        rush.push({
          timeSec: t,
          targetId: 30 + n,
          teamId: 1,
          pos: [t * 10, n * 8, 100],
        });
        rush.push({
          timeSec: t,
          targetId: 50 + n,
          teamId: 2,
          pos: [800 - t * 10, n * 8, 100],
        });
      }
    }
    const plan = planShots(ctfDataset([], rush));
    const kickoff = plan.shots.find((s) => s.reason?.startsWith("Kickoff"));
    expect(kickoff, "no kickoff wide emitted").toBeDefined();
    expect(kickoff!.startSec).toBeCloseTo(5, 1);
    expect(kickoff!.endSec).toBeGreaterThanOrEqual(13);
    // Framed on the busiest knot of the rush, never the map midpoint —
    // on a sparse foggy server the midpoint camera stares at an empty
    // hill with every player beyond the fog.
    if (kickoff!.kind === "fixedOrbit") {
      const c = kickoff!.center;
      const nearMidfield =
        Math.hypot(c[0] - 400, c[1]) < 80 && Math.abs(c[0] - 400) < 80;
      expect(
        nearMidfield,
        `kickoff centred at [${c.map((v) => v.toFixed(0))}]`,
      ).toBe(false);
    }
    if (kickoff!.kind === "fixedOrbit") {
      // Clearly elevated — the rush reads as streams, not a wall of legs.
      expect(kickoff!.heightFactor ?? 0).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe("scoreSubjects dropped-flag interest", () => {
  function fieldDataset(dropPos: DirectorVec3): DirectorDataset {
    const base = ctfDataset();
    const flagSamples: DirectorFlagSample[] = [];
    for (let t = 0; t <= 120; t += 0.5) {
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: STAND_1,
        carrierTargetId: null,
        status: "home",
      });
      flagSamples.push({
        timeSec: t,
        slot: 2,
        pos: dropPos,
        carrierTargetId: null,
        status: "field",
      });
    }
    return { ...base, flagSamples, playerSamples: [], events: [] };
  }
  function flagScoreAt(dataset: DirectorDataset, t: number): number {
    const tracks = buildFlagTracks(dataset);
    const playersAtSec = buildPlayersAtSec(dataset);
    const ctx = interestContext(dataset, tracks, playersAtSec);
    const subjects = buildSubjects(dataset, [1, 2]);
    const scores = scoreSubjects(subjects, ctx);
    const flag2 = subjects.findIndex((s) => s.kind === "flag" && s.slot === 2);
    return scores[flag2][Math.round(t / 0.5)];
  }

  it("scores a near-home uncontested drop like a quiet stand", () => {
    // 15u from its own stand, nobody around: it will be trivially
    // returned — as dull as a flag AT the stand.
    const near = fieldDataset([STAND_2[0] - 15, STAND_2[1], STAND_2[2]]);
    expect(flagScoreAt(near, 50)).toBeLessThanOrEqual(15);
  });

  it("scores a deep drop as a live grenade", () => {
    const deep = fieldDataset(lerp(STAND_2, STAND_1, 0.6));
    expect(flagScoreAt(deep, 50)).toBeGreaterThanOrEqual(75);
  });

  it("holds a near-home drop when its return is imminent", () => {
    // Same dull near-home drop — but this one goes home at t=54. The
    // camera used to cut away to a quiet stand seconds before the
    // touch; with the return lookahead the resolving story outranks it.
    const near = fieldDataset([STAND_2[0] - 15, STAND_2[1], STAND_2[2]]);
    near.flagSamples = near.flagSamples.map((f) =>
      f.slot === 2 && f.timeSec >= 54
        ? { ...f, pos: STAND_2, status: "home" as const }
        : f,
    );
    // The returner closing in — an ATTENDED return (a timer expiry in
    // an empty field earns no boost).
    const returner: DirectorPlayerSample[] = [];
    for (let t = 40; t <= 56; t++) {
      returner.push({
        timeSec: t,
        targetId: 77,
        teamId: 2,
        pos: [STAND_2[0] - 20, STAND_2[1], STAND_2[2]],
      });
    }
    near.playerSamples = returner;
    expect(flagScoreAt(near, 50)).toBeGreaterThanOrEqual(80);
    expect(flagScoreAt(near, 46)).toBeGreaterThanOrEqual(55);
    // Long before the return, the drop stays as dull as it looks.
    expect(flagScoreAt(near, 20)).toBeLessThanOrEqual(15);
  });

  it("makes any contested drop a story", () => {
    const near = fieldDataset([STAND_2[0] - 15, STAND_2[1], STAND_2[2]]);
    const enemies: DirectorPlayerSample[] = [];
    for (let t = 40; t <= 60; t++) {
      enemies.push({
        timeSec: t,
        targetId: 60,
        teamId: 1,
        pos: [STAND_2[0] - 20, STAND_2[1] + 5, STAND_2[2]],
      });
    }
    near.playerSamples = enemies;
    expect(flagScoreAt(near, 50)).toBeGreaterThanOrEqual(50);
  });
});

describe("planShots capture priority", () => {
  it("always shows the cap, even right after a return on the other flag", () => {
    // The missed-cap bug: flag 1 is returned, its aftermath hold camps
    // the returned area, and flag 2 caps 4 seconds later — inside the
    // guarantee pass's min-gap window, so the cap was "skipped —
    // staying with the play". A capture is always the most valuable
    // thing on the map; no rule may hold the camera elsewhere.
    const base = ctfDataset();
    const flagSamples: DirectorFlagSample[] = [];
    for (let t = 0; t <= 120; t += 0.5) {
      // Flag 1: out from 30, returned at 60.
      const out1 = t >= 30 && t < 60;
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: out1 ? lerp(STAND_1, STAND_2, 0.3) : STAND_1,
        carrierTargetId: out1 ? 11 : null,
        status: out1 ? "held" : "home",
      });
      // Flag 2: carried from 40, capped at 64 — right after the return.
      const out2 = t >= 40 && t < 64;
      flagSamples.push({
        timeSec: t,
        slot: 2,
        pos: out2 ? lerp(STAND_2, STAND_1, (t - 40) / 24) : STAND_2,
        carrierTargetId: out2 ? 5 : null,
        status: out2 ? "held" : "home",
      });
    }
    const plan = planShots({
      ...base,
      flagSamples,
      events: [
        { timeSec: 5, type: "match-start", description: "Match started" },
        {
          timeSec: 30,
          type: "flag-grab",
          description: "Rival grabbed the Storm flag",
          actor: "Rival",
          flagTeamName: "Storm",
        },
        {
          timeSec: 40,
          type: "flag-grab",
          description: "Slayer grabbed the Inferno flag",
          actor: "Slayer",
          flagTeamName: "Inferno",
        },
        {
          timeSec: 60,
          type: "flag-return",
          description: "Guard returned the Storm flag",
          actor: "Guard",
          flagTeamName: "Storm",
        },
        {
          timeSec: 64,
          type: "flag-cap",
          description: "Slayer captured the Inferno flag",
          capturer: "Slayer",
          flagTeamName: "Inferno",
        },
      ],
    });
    // The cap must be reported covered…
    const capRow = plan.coverage.find((r) => r.timeSec === 64);
    expect(capRow?.covered, `cap coverage: ${capRow?.by}`).toBe(true);
    // …and the shot on screen at the cap must be ABOUT flag 2.
    const atCap = shotAt(plan.shots, 63.5);
    expect(atCap, "no shot at the cap").toBeDefined();
    expect(
      shotSlot(atCap!) === 2 || atCap!.reason?.toLowerCase().includes("captur"),
      `at the cap the camera was on "${atCap!.reason}"`,
    ).toBe(true);
  });
});

describe("return guarantee anchoring", () => {
  it("covers a return at the flag's stand, not the touch spot", () => {
    // The flag lies in a dead corner far from home when it is touched;
    // it teleports to the stand the same instant. A cut-in parked at
    // the corner frames an empty corridor (the r×0.17 wall portrait) —
    // the story concludes at the stand.
    const dataset = ctfDataset();
    // Flag 1 out at a far corner, returned at t=40.
    // The return MESSAGE precedes the state flip by a beat (as in real
    // demos), so the sampled position at the event time is the corner.
    dataset.flagSamples = dataset.flagSamples.filter(
      (f) => f.slot !== 1 || f.timeSec < 20 || f.timeSec >= 42,
    );
    for (let t = 20; t < 42; t += 0.5) {
      dataset.flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: [700, 900, 80],
        carrierTargetId: null,
        status: "field",
      });
    }
    dataset.flagSamples.sort((a, b) => a.timeSec - b.timeSec);
    dataset.events = [
      {
        timeSec: 40,
        type: "flag-return",
        description: "Guard returned the Storm flag",
        actor: "Guard",
        flagTeamName: "Storm",
      },
    ];
    const plan = planShots(dataset);
    const guarantee = plan.shots.find(
      (s) => s.reason?.startsWith("Guarantee") && s.kind === "fixedOrbit",
    );
    expect(guarantee, "no guarantee cut-in spliced").toBeDefined();
    if (guarantee!.kind === "fixedOrbit") {
      const stand = dataset.flagStands.find((st) => st.slot === 1)!;
      expect(
        Math.hypot(
          guarantee!.center[0] - stand.pos[0],
          guarantee!.center[1] - stand.pos[1],
        ),
        `anchored at [${guarantee!.center.map((v) => v.toFixed(0))}]`,
      ).toBeLessThanOrEqual(5);
    }
  });
});

describe("planShots scramble handling", () => {
  it("spaces guarantee cut-ins instead of cutting on every touch", () => {
    // MANY_GRABS is a scramble: the flag changes hands every ~3s.
    // Covering each one meant four to six cuts across the map in half a
    // minute, which reads as a slideshow rather than coverage.
    const shots = planShots(ctfDataset(MANY_GRABS)).shots.filter((s) =>
      s.reason?.startsWith("Guarantee"),
    );
    // One splice plus skipped repeats is a valid outcome (the companion
    // test asserts the skips); bunched cut-ins are what must never occur.
    expect(shots.length).toBeGreaterThan(0);
    for (let i = 1; i < shots.length; i++) {
      // A literal bound, not DIRECTOR_GUARANTEE_MIN_GAP_SEC: a test whose
      // threshold is the tunable it guards cannot fail when that tunable
      // is the thing that is wrong.
      expect(
        shots[i].startSec - shots[i - 1].startSec,
        `cut-ins at ${shots[i - 1].startSec.toFixed(1)} and ${shots[i].startSec.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(20);
    }
  });

  it("reports skipped touches rather than claiming them covered", () => {
    const plan = planShots(ctfDataset(MANY_GRABS));
    const skipped = plan.coverage.filter((c) => c.by?.startsWith("skipped"));
    expect(skipped.length).toBeGreaterThan(0);
    for (const row of skipped) expect(row.covered).toBe(false);
  });
});

describe("planShots station shots", () => {
  it("frames the inventory station, not the generator beside it", () => {
    // Generators share the rooms inventories are in. A generator with
    // players milling past it is a shot of a machine; it earns the
    // camera when it is being attacked, which arrives as a structure
    // transition instead.
    const gen: DirectorVec3 = [400, 0, 100];
    const inv: DirectorVec3 = [410, 0, 100];
    const players: DirectorPlayerSample[] = [];
    for (let t = 6; t < 20; t++) {
      for (let i = 0; i < 5; i++) {
        players.push({
          timeSec: t,
          targetId: 40 + i,
          teamId: 1,
          pos: [405 + i, i, 100] as DirectorVec3,
        });
      }
    }
    const base = ctfDataset([], players);
    const plan = planShots({
      ...base,
      stations: [
        { pos: gen, kind: "generator", deployed: false, activations: [] },
        { pos: inv, kind: "inventory", deployed: false, activations: [] },
      ],
    });
    const suitUps = plan.shots.filter((s) => s.reason?.includes("suiting up"));
    expect(suitUps.length).toBeGreaterThan(0);
    for (const shot of suitUps) {
      if (shot.kind !== "fixedOrbit") continue;
      const toGen = Math.hypot(
        shot.center[0] - gen[0],
        shot.center[1] - gen[1],
      );
      const toInv = Math.hypot(
        shot.center[0] - inv[0],
        shot.center[1] - inv[1],
      );
      expect(
        toInv,
        "framed the generator instead of the inventory",
      ).toBeLessThan(toGen);
    }
  });
});

describe("planShots aim", () => {
  it("aims a chase across the carrier at where the run is going", () => {
    // Not along their instantaneous heading (which on a weaving skier
    // just shows terrain) but toward their own stand — the cap point,
    // with the defenders in between.
    const plan = planShots(ctfDataset());
    const shot = shotAt(plan.shots, 40);
    expect(shot?.kind).toBe("followFlag");
    expect(shot).toMatchObject({
      aim: { mode: "toward", target: STAND_1 },
    });
  });

  it("aims the pre-grab stand shot toward the grabber's approach", () => {
    // Slayer (targetId 5) is at [850, 100] four seconds before the t=30
    // grab; the stand shot should hold the bearing from STAND_2 there.
    const plan = planShots(
      ctfDataset(
        [],
        [{ timeSec: 26, targetId: 5, teamId: 1, pos: [850, 100, 100] }],
      ),
    );
    const shot = shotAt(plan.shots, 25);
    expect(shot?.kind).toBe("followFlag");
    const aim = shot?.kind === "followFlag" ? shot.aim : undefined;
    expect(aim?.mode).toBe("hold");
    if (aim?.mode === "hold") {
      expect(aim.yaw).toBeCloseTo(Math.atan2(50, 100), 3);
    }
  });

  it("looks back at pursuers when the carrier is chased and not shooting", () => {
    // A defender (flag's team) glued to the carrier the whole first run.
    const chasers: DirectorPlayerSample[] = [];
    for (let t = 31; t <= 54; t++) {
      chasers.push({
        timeSec: t,
        targetId: 60,
        teamId: 2,
        pos: lerp(STAND_2, STAND_1, (t - 30) / 60),
      });
    }
    const plan = planShots(ctfDataset([], chasers));
    const shot = shotAt(plan.shots, 40);
    expect(shot?.kind).toBe("followFlag");
    expect(shot).toMatchObject({ aim: { mode: "backward" } });
  });

  it("widens and steepens when the fight around the carrier is dense", () => {
    // Six teammates riding along — crowded, but not chasers.
    const crowd: DirectorPlayerSample[] = [];
    for (let t = 31; t <= 54; t++) {
      for (let n = 0; n < 6; n++) {
        crowd.push({
          timeSec: t,
          targetId: 70 + n,
          teamId: 1,
          pos: lerp(STAND_2, STAND_1, (t - 30) / 60),
        });
      }
    }
    const plan = planShots(ctfDataset([], crowd));
    const shot = shotAt(plan.shots, 40);
    expect(shot?.kind).toBe("followFlag");
    // The crowd framing: wider than a lone chase and steeper, so the
    // scrum reads — but shallow enough that the frame is still players
    // and horizon rather than mostly dirt (a 0.85 pitch on a carrier
    // was, in the user's words, "mostly aimed at the ground").
    expect(shot).toMatchObject({
      distance: DIRECTOR_DIST_CROWD,
      pitch: DIRECTOR_PITCH_CROWD,
    });
    expect(DIRECTOR_PITCH_CROWD).toBeGreaterThan(DIRECTOR_PITCH_CHASE);
    expect(DIRECTOR_PITCH_CROWD).toBeLessThanOrEqual(0.5);
    expect(shot!.reason).toContain("heavy fighting");
  });
});

describe("planShots situational coverage", () => {
  const preMatchDataset = (): DirectorDataset => {
    const base = ctfDataset();
    const roster: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 45; t++) {
      for (let i = 0; i < 4; i++) {
        // Ranks a few metres apart, all facing the same way, so a
        // close-up can stand in front of them.
        roster.push({
          timeSec: t,
          targetId: 200 + i,
          teamId: 1,
          pos: [STAND_1[0] + i * 4, STAND_1[1] + 10, STAND_1[2]],
          heading: 0,
        });
        roster.push({
          timeSec: t,
          targetId: 210 + i,
          teamId: 2,
          pos: [STAND_2[0] - i * 4, STAND_2[1] + 10, STAND_2[2]],
          heading: Math.PI,
        });
      }
    }
    return {
      ...base,
      // Whistle at t=40: long enough for two rounds of passes, so each
      // team gets a wide pass AND a close-up.
      events: base.events.map((e) =>
        e.type === "match-start" ? { ...e, timeSec: 40 } : e,
      ),
      playerSamples: [...base.playerSamples, ...roster],
    };
  };

  it("sweeps the line-ups before the whistle instead of orbiting flags", () => {
    // Nothing moves pre-match, so an orbit reveals nothing; the teams
    // standing assembled are the shot.
    const plan = planShots(preMatchDataset());
    const sweeps = plan.shots.filter((s) => s.kind === "sweep");
    expect(sweeps.length).toBeGreaterThanOrEqual(2);
    // The passes actually travel — a wide establishing pass covers real
    // ground; a close-up only needs to slide past a few faces.
    for (const sweep of sweeps) {
      if (sweep.kind !== "sweep") continue;
      const travelled = Math.hypot(
        sweep.to[0] - sweep.from[0],
        sweep.to[1] - sweep.from[1],
      );
      const minimum = /roster close-up/.test(sweep.reason) ? 6 : 20;
      expect(travelled, sweep.reason).toBeGreaterThan(minimum);
    }
    // And nothing before the whistle ORBITS A FLAG — the point of the
    // line-up. (A guarantee cut-in may still cover a tier-1 event that
    // happens to land in the window.)
    const preMatch = plan.shots.filter((s) => s.endSec <= 40);
    expect(preMatch.some((s) => s.kind === "sweep")).toBe(true);
    expect(preMatch.every((s) => s.kind !== "followFlag")).toBe(true);
  });

  it("splits pre-match time evenly between the teams", () => {
    // Neither side may get more screen time before the whistle — there
    // is no action yet to justify favouring one.
    const plan = planShots(preMatchDataset());
    const time = { Storm: 0, Inferno: 0 };
    for (const shot of plan.shots) {
      if (shot.kind !== "sweep") continue;
      for (const team of ["Storm", "Inferno"] as const) {
        if (shot.reason.includes(team)) {
          time[team] += shot.endSec - shot.startSec;
        }
      }
    }
    expect(time.Storm).toBeGreaterThan(0);
    expect(Math.abs(time.Storm - time.Inferno)).toBeLessThanOrEqual(1);
  });

  it("mixes wide line-up passes with close-ups on faces", () => {
    const plan = planShots(preMatchDataset());
    const reasons = plan.shots.map((s) => s.reason).join(" | ");
    expect(reasons).toContain("line-up");
    expect(reasons).toContain("roster close-up");
    // A close-up stands a few metres off the rank, not tens.
    const closeUp = plan.shots.find(
      (s) => s.kind === "sweep" && /roster close-up/.test(s.reason),
    );
    expect(closeUp?.kind).toBe("sweep");
    if (closeUp?.kind === "sweep") {
      const standoff = Math.hypot(
        closeUp.from[0] - closeUp.target[0],
        closeUp.from[1] - closeUp.target[1],
      );
      expect(standoff).toBeLessThan(20);
    }
  });

  it("covers a turtling carrier inside the base and the doors outside", () => {
    // A carrier parked next to an inventory station, barely moving:
    // turtling, which needs the inside/doorway pair rather than a
    // static orbit on a body that is not going anywhere.
    const base = ctfDataset();
    const hold: DirectorVec3 = [120, 40, 100];
    const flagSamples = base.flagSamples.map((s) =>
      s.slot === 2 && s.status === "held" && s.timeSec < 55
        ? { ...s, pos: hold }
        : s,
    );
    const attackers: DirectorPlayerSample[] = [];
    for (let t = 30; t < 55; t++) {
      for (let i = 0; i < 3; i++) {
        attackers.push({
          timeSec: t,
          targetId: 300 + i,
          teamId: 2,
          // Massing outside the doors — beyond the "on top of them"
          // radius, so coverage alternates inside / doorway.
          pos: [hold[0] + 48 + i * 4, hold[1] + 8, hold[2]],
        });
      }
    }
    const plan = planShots({
      ...base,
      flagSamples,
      stations: [
        {
          pos: [125, 44, 100],
          kind: "inventory",
          deployed: false,
          activations: [],
        },
      ],
      playerSamples: [...base.playerSamples, ...attackers],
    });
    const reasons = plan.shots.map((s) => s.reason).join(" | ");
    expect(reasons).toContain("held inside the base");
    expect(reasons).toContain("watching the doors");
  });
});

describe("planShots broadcast side (180-degree rule)", () => {
  it("keeps every fixed camera on one side of the axis of action", () => {
    // Play runs along the STAND_1 ↔ STAND_2 axis. Every camera must sit
    // on the same side of that line, so a team always attacks the same
    // way across the screen; crossing it flips left and right.
    const plans = [planShots(ctfDataset()), planShots(ctfDataset(MANY_GRABS))];
    const axisX = STAND_2[1] - STAND_1[1];
    const axisZ = STAND_2[0] - STAND_1[0];
    const length = Math.hypot(axisX, axisZ);
    const ax = axisX / length;
    const az = axisZ / length;
    const sides: number[] = [];
    for (const plan of plans) {
      for (const shot of plan.shots) {
        if (shot.kind !== "fixedOrbit" || shot.startAngle == null) continue;
        // Camera offset direction from the shot centre, in Three (x, z).
        const dx = Math.cos(shot.startAngle);
        const dz = Math.sin(shot.startAngle);
        const side = -az * dx + ax * dz;
        // A shot looking straight down the axis (end-on, like the
        // cap camera) is neutral — it favours neither side.
        if (Math.abs(side) > 1e-6) sides.push(Math.sign(side));
      }
    }
    expect(sides.length).toBeGreaterThanOrEqual(3);
    expect(new Set(sides).size).toBe(1);
  });
});

describe("planShots framing", () => {
  it("centers the dropped-flag shot where the flag settles, not where it fell", () => {
    // Dropped flags are physics objects: they keep sliding downhill
    // after the drop (measured at 30–120u on real demos), so the
    // position right after the drop is the wrong thing to frame.
    const base = ctfDataset();
    const fell: DirectorVec3 = [400, 400, 100];
    const settled: DirectorVec3 = [400, 300, 60];
    const flagSamples = base.flagSamples.map((s) => {
      if (s.slot !== 2 || s.status !== "field") return s;
      // Slides over the first 4s of the 55–70s field run, then rests.
      const t = Math.min(1, (s.timeSec - 55) / 4);
      return {
        ...s,
        pos: lerp(fell, settled, t),
      };
    });
    // Someone contesting it where it lands, so the flag gets a camera.
    const contesting: DirectorPlayerSample[] = Array.from(
      { length: 16 },
      (_, i) => ({
        timeSec: 55 + i,
        targetId: 11,
        teamId: 2,
        pos: settled,
      }),
    );
    const plan = planShots({
      ...base,
      flagSamples,
      playerSamples: [...base.playerSamples, ...contesting],
    });
    const shot = shotAt(plan.shots, 65);
    expect(shot?.kind).toBe("fixedOrbit");
    if (shot?.kind === "fixedOrbit") {
      expect(shot.center[1]).toBeCloseTo(settled[1], 0);
      expect(shot.center[2]).toBeCloseTo(settled[2], 0);
      // And it pans onto the live flag so a late slide stays framed.
      expect(shot.lookSubject).toEqual({ type: "flag", slot: 2 });
    }
  });

  it("abandons an uncontested dropped flag rather than filming a field", () => {
    // Same drop, but nobody within range of it: an object lying alone
    // is as dull as an idle flagstand, so the shot must not be anchored
    // on the flag.
    const base = ctfDataset();
    const plan = planShots({
      ...base,
      playerSamples: base.playerSamples.filter((s) => s.targetId !== 9),
    });
    const shot = shotAt(plan.shots, 62);
    const anchoredOnFlag =
      shot?.kind === "fixedOrbit" && shot.lookSubject?.type === "flag";
    expect(anchoredOnFlag).toBe(false);
    expect(shot!.reason).not.toContain("on the ground — wide view");
  });

  it("goes wide on the base when a stand shot is long and quiet", () => {
    // Slot 1's flag sits home and uncontested for the whole demo.
    const plan = planShots(ctfDataset());
    const shot = shotAt(plan.shots, 5);
    expect(shot?.kind).toBe("fixedOrbit");
    expect(shot!.reason).toContain("quiet, wide on the base");
  });
});

describe("planShots guarantee pass", () => {
  it("splices a cut-in for an event the segmentation missed", () => {
    // A Storm-flag grab with no track support (both flags busy at t=50
    // elsewhere in the interest grid) forces the repair path.
    const plan = planShots(
      ctfDataset([
        {
          timeSec: 50,
          type: "flag-grab",
          description: "Phantom grabbed the Storm flag",
          actor: "Phantom",
          flagTeamName: "Storm",
        },
      ]),
    );
    const shot = shotAt(plan.shots, 50);
    // Covered from a fixed angle anchored on that flag (house style),
    // not by locking onto it.
    expect(shot?.kind).toBe("fixedOrbit");
    if (shot?.kind === "fixedOrbit") {
      expect(shot.lookSubject).toEqual({ type: "flag", slot: 1 });
      expect(shot.angularSpeed).toBe(0);
    }
    expect(shot!.reason).toMatch(/^Guarantee:/);
    expectContiguous(plan.shots, 120);
    // The report is computed from the FINAL shot list, so it credits the
    // shot that actually covers the event rather than asserting that a
    // splice happened.
    const row = plan.coverage.find((r) => r.timeSec === 50);
    expect(row?.covered).toBe(true);
    expect(row?.by).toMatch(/^Guarantee:/);
  });
});

describe("planShots coverage report", () => {
  it("only ever credits shots that are actually in the plan", () => {
    // The report used to be computed before the merge and minimum-hold
    // passes ran, so a row could credit a shot those passes had since
    // absorbed — and counted an event as covered merely because a splice
    // was attempted.
    for (const dataset of [ctfDataset(), ctfDataset(MANY_GRABS)]) {
      const plan = planShots(dataset);
      const reasons = new Set(plan.shots.map((s) => s.reason ?? ""));
      for (const row of plan.coverage) {
        if (!row.covered) continue;
        expect(
          reasons.has(row.by ?? ""),
          `${row.description} credited "${row.by}"`,
        ).toBe(true);
      }
    }
  });

  it("marks an event uncovered when the camera is on the other flag", () => {
    const plan = planShots(ctfDataset(MANY_GRABS));
    const uncovered = plan.coverage.filter((r) => !r.covered);
    expect(uncovered.length).toBeGreaterThan(0);
    for (const row of uncovered) expect(row.by).toMatch(/^skipped/);
  });
});

describe("planShots (degradation)", () => {
  it("plans a single chase for Rabbit", () => {
    const dataset: DirectorDataset = {
      ...ctfDataset(),
      gameClassName: "RabbitGame",
      teams: [],
      flagStands: [{ slot: 1, teamId: null, name: null, pos: STAND_1 }],
      flagSamples: [
        {
          timeSec: 0,
          slot: 1,
          pos: STAND_1,
          carrierTargetId: null,
          status: "home",
        },
      ],
      events: [],
    };
    const plan = planShots(dataset);
    expect(plan.gameMode).toBe("rabbit");
    expect(plan.shots).toHaveLength(1);
    expect(plan.shots[0]).toMatchObject({
      kind: "followFlag",
      slot: 1,
      startSec: 0,
      endSec: 120,
      // The pack chasing the rabbit is always behind them.
      aim: { mode: "backward" },
    });
  });

  it("orbits kill clusters in flagless modes", () => {
    const dataset: DirectorDataset = {
      ...ctfDataset(),
      gameClassName: "DMGame",
      flagStands: [],
      flagSamples: [],
      events: [
        {
          timeSec: 40,
          type: "kill",
          description: "a kill",
          killer: "Slayer",
          victim: "Someone",
          pos: [100, 100, 50],
        },
        {
          timeSec: 43,
          type: "kill",
          description: "another kill",
          killer: "Slayer",
          victim: "SomeoneElse",
          pos: [110, 105, 50],
        },
      ],
    };
    const plan = planShots(dataset);
    expect(plan.gameMode).toBe("deathmatch");
    const shot = shotAt(plan.shots, 40);
    // The cluster's busiest killer resolves to a target id → hero-follow,
    // camera behind the shooter.
    expect(shot?.kind).toBe("followPlayer");
    expect(shot).toMatchObject({ targetId: 5, aim: { mode: "forward" } });
    expectContiguous(plan.shots, 120);
  });
});

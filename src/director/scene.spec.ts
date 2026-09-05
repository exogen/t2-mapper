import { describe, expect, it } from "vitest";
import { planShotsCausal } from "./switcher";
import { describeScenes } from "./scene";
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
  ShotPlan,
} from "./types";

const STAND_1: DirectorVec3 = [0, 0, 100];
const STAND_2: DirectorVec3 = [800, 0, 100];

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
    // Flag 2 carried from its stand toward stand 1 during 30..90,
    // capped at 90.
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
    // The carrier.
    if (t >= 30 && t < 90) {
      playerSamples.push({
        timeSec: t,
        targetId: 5,
        teamId: 1,
        pos: [800 - ((t - 30) / 60) * 780, 0, 100],
        armor: "light",
      });
    }
    // A defender parked at stand 1.
    playerSamples.push({
      timeSec: t,
      targetId: 9,
      teamId: 1,
      pos: [12, 8, 100],
      armor: "heavy",
      pack: "shield pack",
    });
  }
  return {
    durationSec: 120,
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
    events: [
      // The whistle, so the switcher leaves the pre-match line-ups and
      // covers the run.
      {
        timeSec: 2,
        type: "match-countdown",
        description: "Match starts in 18 seconds.",
        secondsUntil: 18,
      },
      { timeSec: 20, type: "match-start", description: "Match started" },
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
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [
      {
        timeSec: 50,
        targetId: 20,
        teamId: 2,
        pos: [400, 40, 130],
        killerTargetId: 21,
        killerPos: [430, 40, 100],
        weapon: "disc",
        airborne: true,
        midair: true,
        speed: 55,
      },
    ],
    // The defender's spot doubles as an invo visit, so loadout tells
    // are readable for them (armor/pack are omitted until a player has
    // suited up this life).
    stations: [{ pos: [12, 8, 100], kind: "inventory", deployed: false }],
    playerNames: [
      { targetId: 5, name: "slayer", displayName: "Slayer", skin: "USA" },
      { targetId: 9, name: "guard", displayName: "Guard" },
      { targetId: 20, name: "victim", displayName: "Victim" },
      { targetId: 21, name: "shooter", displayName: "Shooter" },
    ],
    scoreSamples: [{ timeSec: 31, teamId: 1, score: 1 }],
  };
}

/** A one-shot plan, for describing a single synthetic shot. */
function shotPlanOf(shot: Shot): ShotPlan {
  return { contractVersion: 1, gameMode: "ctf", coverage: [], shots: [shot] };
}

/**
 * A dataset where player 7 (Inferno) runs at Storm's stand during
 * 100..110s at 180 kph, and — when `grabbedBefore` — took Storm's flag
 * off the stand at 22s and lost it at 26s.
 */
function datasetWithRunner(grabbedBefore: boolean): DirectorDataset {
  const ds = dataset();
  ds.flagSamples = ds.flagSamples.map((f) =>
    f.slot === 1 && grabbedBefore && f.timeSec >= 22 && f.timeSec < 26
      ? { ...f, carrierTargetId: 7, status: "held" as const }
      : f,
  );
  for (let t = 100; t <= 110; t++) {
    ds.playerSamples.push({
      timeSec: t,
      targetId: 7,
      teamId: 2,
      pos: [500 - (t - 100) * 50, 0, 100],
      armor: "heavy",
    });
  }
  ds.playerNames.push({ targetId: 7, name: "runner", displayName: "Runner" });
  return ds;
}

function standShot(
  startSec: number,
  endSec: number,
  center: DirectorVec3 = STAND_1,
): Shot {
  return {
    kind: "fixedOrbit",
    center,
    radius: 20,
    startAngle: 0,
    angularSpeed: 0,
    startSec,
    endSec,
    transitionIn: "cut",
    reason: "Storm stand",
  } as Shot;
}

describe("inbound", () => {
  it("is not called for a runner who has never grabbed off the stand", () => {
    const plan = shotPlanOf(standShot(100, 104));
    describeScenes(plan, datasetWithRunner(false));
    expect(plan.shots[0].scene!.inbound).toBeUndefined();
    // On camera at 102s: 400 m out at 50 m/s, closing — but a stranger.
    const close = shotPlanOf(standShot(101, 103, [400, 0, 100]));
    describeScenes(close, datasetWithRunner(false));
    const runner = close.shots[0].scene!.players.find(
      (p) => p.name === "Runner",
    );
    expect(runner).toBeDefined();
    expect(runner?.doing).not.toBe("inbound");
    expect(runner?.etaSec).toBeUndefined();
    expect(runner?.standGrabs).toBeUndefined();
  });

  it("is called for a runner with a stand grab behind them, with their tally", () => {
    const plan = shotPlanOf(standShot(100, 104));
    describeScenes(plan, datasetWithRunner(true));
    const scene = plan.shots[0].scene!;
    expect(scene.inbound?.map((r) => r.name)).toEqual(["Runner"]);
    expect(scene.inbound?.[0].team).toBe("Inferno");
    const close = shotPlanOf(standShot(101, 103, [400, 0, 100]));
    describeScenes(close, datasetWithRunner(true));
    const runner = close.shots[0].scene!.players.find(
      (p) => p.name === "Runner",
    );
    expect(runner?.doing).toBe("inbound");
    expect(runner?.etaSec).toBe(8);
    expect(runner?.standGrabs).toBe(1);
  });

  it("counts only grabs before the shot", () => {
    // The runner's grab is at 22s; a shot before it sees no history.
    const plan = shotPlanOf(standShot(10, 14));
    describeScenes(plan, datasetWithRunner(true));
    expect(plan.shots[0].scene!.inbound).toBeUndefined();
  });

  it("credits the capper with a cap", () => {
    // Player 5 carries flag 2 from 30s and caps at 90s.
    const late = shotPlanOf({
      ...standShot(95, 99),
      center: [12, 8, 100],
    } as Shot);
    describeScenes(late, dataset());
    const players = late.shots[0].scene!.players;
    // The carrier is gone by then; the defender never grabbed or capped.
    expect(players.find((p) => p.name === "Guard")?.caps).toBeUndefined();
    const mid = shotPlanOf({
      ...standShot(60, 62),
      center: [410, 0, 100],
    } as Shot);
    describeScenes(mid, dataset());
    const carrier = mid.shots[0].scene!.players.find(
      (p) => p.name === "Slayer",
    );
    expect(carrier?.standGrabs).toBe(1);
    expect(carrier?.caps).toBeUndefined();
  });
});

describe("chatter", () => {
  it("lists voice binds fired during the shot, with team and spoken name", () => {
    const ds = dataset();
    ds.voiceBinds = [
      {
        timeSec: 61,
        targetId: 9,
        name: "guard",
        kind: "taunt",
        keys: "VGTA",
        text: "Aww, that's too bad!",
      },
      // A speaker whose name never resolved to a target id.
      {
        timeSec: 62,
        targetId: null,
        name: "s p a c e y",
        kind: "cheer",
        keys: "VGW",
        text: "Woohoo!",
      },
      // Outside the shot.
      {
        timeSec: 70,
        targetId: 9,
        name: "guard",
        kind: "compliment",
        keys: "VGCG",
        text: "Good game!",
      },
    ];
    const plan = shotPlanOf(standShot(60, 64));
    describeScenes(plan, ds);
    expect(plan.shots[0].scene!.chatter).toEqual([
      {
        timeSec: 61,
        kind: "taunt",
        name: "Guard",
        team: "Storm",
        text: "Aww, that's too bad!",
      },
      { timeSec: 62, kind: "cheer", name: "spacey", text: "Woohoo!" },
    ]);
  });

  it("leaves the field off when nobody spoke", () => {
    const plan = shotPlanOf(standShot(60, 64));
    describeScenes(plan, dataset());
    expect(plan.shots[0].scene!.chatter).toBeUndefined();
  });
});

describe("describeScenes", () => {
  const plan = planShotsCausal(dataset());

  it("attaches a scene with topic and sequence to every shot", () => {
    expect(plan.shots.length).toBeGreaterThan(0);
    for (const shot of plan.shots) {
      expect(shot.scene, shot.reason).toBeDefined();
      expect(shot.scene!.topic).toBeTruthy();
      expect(shot.scene!.sequenceId).toBeTruthy();
    }
  });

  it("gives pre-match shots the topic their role says, not 'lineup' for all", () => {
    // Every pre-match reason used to match one pattern and come out as
    // "lineup" — so a pick-up, a fly-by and a generator all read to the
    // booth as a rank of players to be named.
    const byRole: Record<string, string> = {
      rosterWide: "lineup",
      rosterCloseUp: "lineup",
      signing: "pick-up",
      tourHold: "base",
      tourMove: "base",
      quiet: "lull",
    };
    const roles = Object.keys(byRole) as NonNullable<Shot["role"]>[];
    const staged: ShotPlan = {
      contractVersion: 1,
      gameMode: "ctf",
      coverage: [],
      shots: roles.map((role, i) => ({
        kind: "fixedOrbit",
        center: [12, 8, 100],
        radius: 20,
        startAngle: 0,
        angularSpeed: 0,
        startSec: i * 2,
        endSec: i * 2 + 2,
        transitionIn: "cut",
        // Reasons that the old pattern table would ALL have read as a
        // line-up.
        reason: `Pre-match — ${role}`,
        role,
      })),
    };
    describeScenes(staged, dataset());
    for (const shot of staged.shots) {
      expect(shot.scene!.topic, shot.role).toBe(byRole[shot.role!]);
    }
  });

  it("takes the topic from the shot itself, never from its reason", () => {
    // The live builders say what a shot is about. A pattern table over
    // `reason`, tuned to the oracle planner's wording, read a kill
    // cut-in and a cap approach as plain "action".
    const shot = (i: number, reason: string, extra: Partial<Shot>): Shot =>
      ({
        kind: "fixedOrbit",
        center: [12, 8, 100],
        radius: 20,
        startAngle: 0,
        angularSpeed: 0,
        startSec: i * 2,
        endSec: i * 2 + 2,
        transitionIn: "cut",
        reason,
        ...extra,
      }) as Shot;
    const staged: ShotPlan = {
      contractVersion: 1,
      gameMode: "ctf",
      coverage: [],
      shots: [
        shot(0, "disc kill — Slayer down", { topic: "kill" }),
        shot(1, "Inferno flag closing on the cap — Slayer", {
          topic: "capture",
        }),
        // A topic outranks the role's default.
        shot(2, "Pre-match — a wide", { role: "rosterWide", topic: "base" }),
        // Neither: the booth gets the neutral word, whatever the reason
        // happens to say.
        shot(3, "Aftermath — Inferno flag captured", {}),
      ],
    };
    describeScenes(staged, dataset());
    expect(staged.shots.map((s) => s.scene!.topic)).toEqual([
      "kill",
      "capture",
      "base",
      "action",
    ]);
  });

  it("weighs events by what they mean, not by what they are", () => {
    // The cap is the game; a mid-air kill away from the flags is worth
    // a mention; the booth reads the number, not the type.
    const cap = plan.shots
      .flatMap((s) => s.scene!.events)
      .find((e) => e.type === "cap")!;
    expect(cap.weight).toBe(3);
    const kill = plan.shots
      .flatMap((s) => s.scene!.events)
      .find((e) => e.type === "kill" && e.midair)!;
    expect(kill.weight).toBe(2);
  });

  it("rolls deployables into one raid per team; base hardware stays itself", () => {
    // A clamp farm being traded produced 257 events in one match and
    // the booth narrated a turret ledger. Three clamps and a sensor
    // down are ONE raid; the generator is its own event; a deployable
    // coming back is nothing.
    const ds = dataset();
    const at = (timeSec: number, name: string, destroyed = true) => ({
      timeSec,
      teamId: 2,
      name,
      className: "",
      pos: [800, 0, 100] as DirectorVec3,
      from: destroyed ? 0 : 1,
      to: destroyed ? 1 : 0,
    });
    ds.structures = [
      at(40, "spider clamp turret"),
      at(41, "spider clamp turret"),
      at(42, "generator"),
      at(43, "pulse sensor"),
      at(44, "pulse sensor", false),
    ];
    const staged = shotPlanOf({
      kind: "fixedOrbit",
      center: [800, 0, 100],
      radius: 30,
      startAngle: 0,
      angularSpeed: 0,
      startSec: 35,
      endSec: 45,
      transitionIn: "cut",
      reason: "test",
    });
    describeScenes(staged, ds);
    const events = staged.shots[0].scene!.events.filter(
      (e) => e.type !== "kill",
    );
    const raid = events.find((e) => e.type === "raid")!;
    expect(raid).toMatchObject({ count: 3, weight: 2, team: "Inferno" });
    expect(raid.detail).toContain("2 × spider clamp turret");
    expect(events.filter((e) => e.type === "structure-destroyed")).toEqual([
      expect.objectContaining({ detail: "generator", weight: 2 }),
    ]);
    expect(events.some((e) => e.type === "structure-repaired")).toBe(false);
  });

  it("describes the match as a shot begins: clock, momentum, scorers", () => {
    const ds = dataset();
    ds.matchFacts = {
      missionName: null,
      missionDisplayName: null,
      gameType: null,
      serverDisplayName: null,
      durationSec: 120,
      matchStartSec: 0,
      matchEndSec: null,
      teams: ds.teams,
      scores: [],
      // Ten minutes on the clock, sampled at 30s; counting down.
      clock: [{ timeSec: 30, clockMs: -600000 }],
      roster: [
        {
          timeSec: 0,
          count: 10,
          assigned: 8,
          observers: 2,
          scorers: [{ name: "Slayer", teamId: 1, score: 100 }],
        },
      ],
      matchSeenRunningSec: 0,
    };
    const staged = shotPlanOf({
      kind: "fixedOrbit",
      center: [0, 0, 100],
      radius: 30,
      startAngle: 0,
      angularSpeed: 0,
      startSec: 100,
      endSec: 110,
      transitionIn: "cut",
      reason: "test",
    });
    describeScenes(staged, ds);
    const scene = staged.shots[0].scene!;
    // 600s on the clock at 30s → 530s left at 100s.
    expect(scene.clockRemainingSec).toBeCloseTo(530, 6);
    // Storm capped the Inferno flag at 90: momentum is theirs.
    expect(scene.recentCaps).toEqual([
      { team: "Storm", caps: 1 },
      { team: "Inferno", caps: 0 },
    ]);
    expect(scene.topScorers).toEqual([
      { name: "Slayer", team: "Storm", score: 100 },
    ]);
  });

  it("does not read the pre-whistle countdown as the match clock", () => {
    // The clock counts down to the START before the whistle. A shot
    // just after kickoff, before the first in-match sample, must not
    // report "under a minute left".
    const ds = dataset();
    ds.matchFacts = {
      missionName: null,
      missionDisplayName: null,
      gameType: null,
      serverDisplayName: null,
      durationSec: 120,
      matchStartSec: 40,
      matchEndSec: null,
      teams: ds.teams,
      scores: [],
      clock: [
        { timeSec: 20, clockMs: -20000 },
        { timeSec: 60, clockMs: -1800000 },
      ],
      roster: [],
      matchSeenRunningSec: 40,
    };
    const shotAt = (startSec: number) =>
      shotPlanOf({
        kind: "fixedOrbit",
        center: [0, 0, 100],
        radius: 30,
        startAngle: 0,
        angularSpeed: 0,
        startSec,
        endSec: startSec + 5,
        transitionIn: "cut",
        reason: "test",
      });
    // Before the whistle there is no match clock at all — a shot that
    // spans the kickoff included.
    const before = shotAt(35);
    describeScenes(before, ds);
    expect(before.shots[0].scene!.clockRemainingSec).toBeNull();
    const early = shotAt(45);
    describeScenes(early, ds);
    expect(early.shots[0].scene!.clockRemainingSec).toBeNull();
    const later = shotAt(70);
    describeScenes(later, ds);
    expect(later.shots[0].scene!.clockRemainingSec).toBeCloseTo(1790, 6);
  });

  it("marks the picked player as a pick-up's focus", () => {
    // The camera sits on a position, not on a tracked player, so the
    // shot has to SAY who it is of — or the booth announced whoever
    // happened to be first in frame.
    const staged: ShotPlan = {
      contractVersion: 1,
      gameMode: "ctf",
      coverage: [],
      shots: [
        {
          kind: "fixedOrbit",
          center: [12, 8, 100],
          radius: 8,
          startAngle: 0,
          angularSpeed: 0,
          startSec: 0,
          endSec: 6,
          transitionIn: "cut",
          reason: "Pre-match — Storm pick up Guard",
          role: "signing",
          subject: { type: "player", targetId: 9 },
        },
      ],
    };
    describeScenes(staged, dataset());
    const focus = staged.shots[0].scene!.players.filter((p) => p.focus);
    expect(focus.map((p) => p.targetId)).toEqual([9]);
  });

  it("shots covering one flag run share a sequence", () => {
    // Only the shots ABOUT flag 2's run — the home flag's stand shots
    // interleave and rightly belong to their own story.
    const runShots = plan.shots.filter(
      (s) =>
        s.startSec >= 32 &&
        s.endSec <= 88 &&
        ((s.kind === "followFlag" && s.slot === 2) ||
          (s.kind === "fixedOrbit" &&
            s.lookSubject?.type === "flag" &&
            s.lookSubject.slot === 2) ||
          (s.kind === "dolly" &&
            s.subject.type === "flag" &&
            s.subject.slot === 2)),
    );
    const ids = new Set(runShots.map((s) => s.scene!.sequenceId));
    expect(runShots.length).toBeGreaterThan(1);
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^flag-2-out-/);
  });

  it("reports the carried flag's distances and quarantines the outcome", () => {
    const mid = plan.shots.find((s) => s.startSec <= 60 && s.endSec > 60);
    const carried = mid!.scene!.flags.find((f) => f.status === "carried");
    expect(carried).toBeDefined();
    expect(carried!.carrier).toBe("Slayer");
    expect(carried!.distFromHome).toBeGreaterThan(200);
    expect(carried!.distToCapture).toBeLessThan(600);
    // Future knowledge present but clearly fenced off.
    expect(carried!.future?.outcome).toBe("cap");
  });

  it("describes players with display name, armor, skin and role", () => {
    const standShot = plan.shots.find(
      (s) => s.scene!.players.some((p) => p.targetId === 9) && s.startSec < 30,
    );
    const guard = standShot?.scene!.players.find((p) => p.targetId === 9);
    expect(guard?.name).toBe("Guard");
    expect(guard?.armor).toBe("heavy");
    expect(guard?.doing).toBe("posted on defense");
    expect(guard?.pack).toBe("shield pack");
    // The pack is a FIELD, not a phrase buried in a sentence. Whoever
    // is speaking decides how to say it.
    expect(standShot!.scene!.players.map((p) => p.pack)).toContain(
      "shield pack",
    );
  });

  it("records kills as ordered events with mid-air detail", () => {
    const killShot = plan.shots.find((s) =>
      s.scene!.events.some((e) => e.type === "kill"),
    );
    const kill = killShot!.scene!.events.find((e) => e.type === "kill")!;
    expect(kill.actors[0].name).toBe("Shooter");
    expect(kill.actors[1].name).toBe("Victim");
    expect(kill.midair).toBe(true);
    expect(kill.detail).toContain("disc");
  });

  it("flags a teamkill on a carrier and marks the kill detail", () => {
    const ds = dataset();
    // Teammate 6 (Storm, same team as carrier 5) guns the carrier down
    // mid-run — a critical teamkill the booth must react to.
    for (let t = 0; t <= 120; t++) {
      ds.playerSamples.push({
        timeSec: t,
        targetId: 6,
        teamId: 1,
        pos: [420, 10, 100],
      });
    }
    ds.playerNames.push({ targetId: 6, name: "oops", displayName: "Oops" });
    ds.deaths.push({
      timeSec: 60,
      targetId: 5,
      teamId: 1,
      pos: [410, 0, 100],
      killerTargetId: 6,
      killerPos: [420, 10, 100],
      weapon: "disc",
    });
    const p = planShotsCausal(ds);
    const withTk = p.shots.find((s) =>
      s.scene!.events.some((e) => e.type === "teamkill"),
    );
    expect(withTk, "no teamkill event emitted").toBeDefined();
    const tk = withTk!.scene!.events.find((e) => e.type === "teamkill")!;
    expect(tk.detail).toContain("OWN teammate carrying the flag");
    expect(tk.actors[0].name).toBe("Oops");
    const kill = withTk!.scene!.events.find(
      (e) => e.type === "kill" && e.actors[0].name === "Oops",
    )!;
    expect(kill.detail).toContain("TEAMKILL");
  });

  it("does not call a teammate's automated turret a teamkill", () => {
    // The game credits a deployed turret's kills to its owner, so a
    // teammate walking into it reads as a same-side kill — but the
    // game itself files that as an accident, not a TEAMKILL.
    const ds = dataset();
    for (let t = 0; t <= 120; t++) {
      ds.playerSamples.push({
        timeSec: t,
        targetId: 6,
        teamId: 1,
        pos: [420, 10, 100],
      });
    }
    ds.playerNames.push({ targetId: 6, name: "oops", displayName: "Oops" });
    ds.deaths.push({
      timeSec: 60,
      targetId: 5,
      teamId: 1,
      pos: [410, 0, 100],
      killerTargetId: 6,
      killerPos: [420, 10, 100],
      weapon: "spike turret",
    });
    const p = planShotsCausal(ds);
    expect(
      p.shots.some((s) => s.scene!.events.some((e) => e.type === "teamkill")),
    ).toBe(false);
    const kill = p.shots
      .flatMap((s) => s.scene!.events)
      .find((e) => e.type === "kill" && e.actors[0].name === "Oops")!;
    expect(kill, "the kill itself is still reported").toBeDefined();
    expect(kill.detail).not.toContain("TEAMKILL");
    expect(kill.detail).toContain(
      "got in the way of a teammate's spike turret",
    );
  });

  it("marks a player closing on the enemy stand as inbound, with an ETA", () => {
    // Storm's 30 skis at 50 m/s from midfield straight at Inferno's
    // stand. Doc opened a two-sentence read on exactly this once, and
    // the grab call had to cut across him — the ETA is what lets the
    // booth size its line.
    const ds = dataset();
    // After the cap at 90 the Inferno flag is home again — nothing to
    // run at while it is out.
    for (let t = 100; t <= 107; t++) {
      ds.playerSamples.push({
        timeSec: t,
        targetId: 30,
        teamId: 1,
        pos: [400 + 50 * (t - 100), 0, 100],
      });
    }
    ds.playerNames.push({
      targetId: 30,
      name: "capper",
      displayName: "Capper",
    });
    // A run only reads as inbound from a player with a stand grab on
    // record: the Capper took Inferno's flag at 20s and lost it at 24s.
    ds.flagSamples = ds.flagSamples.map((f) =>
      f.slot === 2 && f.timeSec >= 20 && f.timeSec < 24
        ? { ...f, carrierTargetId: 30, status: "held" as const }
        : f,
    );
    const staged = shotPlanOf({
      kind: "fixedOrbit",
      center: [720, 0, 100],
      radius: 30,
      startAngle: 0,
      angularSpeed: 0,
      startSec: 105,
      endSec: 106,
      transitionIn: "cut",
      reason: "test",
    });
    describeScenes(staged, ds);
    const capper = staged.shots[0].scene!.players.find(
      (p) => p.name === "Capper",
    )!;
    expect(capper.doing).toBe("inbound");
    // 100 m from the stand at 50 m/s.
    expect(capper.etaSec).toBe(2);
    // And on the map-wide list as the shot begins (t=105: 150 m out).
    expect(staged.shots[0].scene!.inbound).toEqual([
      { name: "Capper", team: "Storm", etaSec: 3 },
    ]);
  });

  it("lists an inbound runner the camera does not have", () => {
    // The shot is on the far stand; the runner is closing on the other
    // one. The booth still needs to know a grab is seconds away.
    const ds = dataset();
    // After the cap at 90 the Inferno flag is home again — nothing to
    // run at while it is out.
    for (let t = 100; t <= 107; t++) {
      ds.playerSamples.push({
        timeSec: t,
        targetId: 30,
        teamId: 1,
        pos: [400 + 50 * (t - 100), 0, 100],
      });
    }
    ds.playerNames.push({
      targetId: 30,
      name: "capper",
      displayName: "Capper",
    });
    // A run only reads as inbound from a player with a stand grab on
    // record: the Capper took Inferno's flag at 20s and lost it at 24s.
    ds.flagSamples = ds.flagSamples.map((f) =>
      f.slot === 2 && f.timeSec >= 20 && f.timeSec < 24
        ? { ...f, carrierTargetId: 30, status: "held" as const }
        : f,
    );
    const staged = shotPlanOf({
      kind: "fixedOrbit",
      center: [0, 0, 100],
      radius: 30,
      startAngle: 0,
      angularSpeed: 0,
      startSec: 104,
      endSec: 106,
      transitionIn: "cut",
      reason: "test",
    });
    describeScenes(staged, ds);
    const scene = staged.shots[0].scene!;
    expect(scene.players.some((p) => p.name === "Capper")).toBe(false);
    // t=104: 200 m out at 50 m/s.
    expect(scene.inbound).toEqual([
      { name: "Capper", team: "Storm", etaSec: 4 },
    ]);
  });

  it("marks grabs taken off the stand and speaks distances in meters", () => {
    const ds = dataset();
    ds.events.push({
      timeSec: 30,
      type: "flag-grab",
      description: "Slayer grabbed the Inferno flag",
      actor: "Slayer",
      flagTeamName: "Inferno",
    });
    const p = planShotsCausal(ds);
    const withGrab = p.shots.find((s) =>
      s.scene!.events.some((e) => e.type === "grab"),
    );
    expect(withGrab, "no grab event emitted").toBeDefined();
    const grab = withGrab!.scene!.events.find((e) => e.type === "grab")!;
    expect(grab.detail).toContain("off the stand");
    // detail says WHAT happened, never WHO: the player is carried in
    // `actors` alone, so a consumer only ever sees one spelling.
    expect(grab.detail).not.toContain("Slayer");
    expect(grab.actors).toEqual([{ name: "Slayer", role: "actor" }]);
    // Kill distances carry units now ("~30 meters"), never a bare "~30m".
    const withKill = p.shots.find((s) =>
      s.scene!.events.some((e) => e.type === "kill"),
    );
    const kill = withKill!.scene!.events.find((e) => e.type === "kill")!;
    expect(kill.detail).not.toMatch(/~\d+m\b/);
  });

  it("says WHOSE base a structure was, and WHICH flag a drop was", () => {
    // Without these a consumer cannot tell whose defence just fell, or
    // which flag was passed when both are in play — so it invents one.
    const ds = dataset();
    ds.structures.push({
      timeSec: 40,
      name: "base turret",
      className: "TurretData",
      // Ownership comes from the ghost's own team, NOT from where it
      // sits: this turret is parked next to Storm's stand but belongs
      // to Inferno, and the game knows that.
      teamId: 2,
      pos: [10, 10, 100],
      from: 0,
      to: 2,
    });
    ds.events.push({
      timeSec: 45,
      type: "flag-drop",
      description: "Slayer dropped the Inferno flag",
      actor: "Slayer",
      flagTeamName: "Inferno",
      dropKind: "pass",
    });
    const p = planShotsCausal(ds);
    const events = p.shots.flatMap((s) => s.scene?.events ?? []);

    const struct = events.find((e) => e.type === "structure-destroyed");
    expect(struct, "no structure event emitted").toBeDefined();
    expect(struct!.team).toBe("Inferno");

    const drop = events.find((e) => e.type === "drop");
    expect(drop, "no drop event emitted").toBeDefined();
    expect(drop!.flagTeam).toBe("Inferno");
    // A pass must name the flag: two carriers can be running opposite
    // flags at once, and "a pass" alone is ambiguous.
    expect(drop!.detail).toContain("Inferno flag");
  });

  it("exposes flag state on a change-driven timeline, not just per shot", () => {
    // Scene flag state is one snapshot per shot, and shots run long —
    // a live consumer reading between cuts was describing state up to
    // 12s stale. The timeline is independent of the camera.
    const ds = dataset();
    const p = planShotsCausal(ds);
    expect(p.flagTimeline, "no flag timeline emitted").toBeDefined();
    const tl = p.flagTimeline!;
    expect(tl.length).toBeGreaterThan(0);
    // Strictly ordered, and finer-grained than the shot list.
    for (let i = 1; i < tl.length; i++) {
      expect(tl[i].timeSec).toBeGreaterThan(tl[i - 1].timeSec);
    }
    // Future knowledge is quarantined out of the timeline: a live
    // consumer must not be handed the outcome of a run in progress.
    for (const entry of tl) {
      for (const f of entry.flags) {
        expect(f).not.toHaveProperty("future");
      }
    }
  });

  it("keeps player names out of flag-event detail, and decodes hold time", () => {
    // The game's chat text spells names its own way ("b l a k e",
    // "^i^Irvin") — a spelling that does NOT survive spokenName. If it
    // leaks into `detail`, a consumer sees two spellings of one player
    // in the same payload and loses track of who did what.
    const ds = dataset();
    // The roster knows the real split; chat messages spell the same
    // players with whatever decoration the client sent.
    ds.playerNames.push(
      {
        targetId: 30,
        name: "blake",
        displayName: "b l a k e",
        baseName: "blake",
      },
      {
        targetId: 31,
        name: "Irvin",
        displayName: "^i^Irvin",
        baseName: "Irvin",
        clan: "i",
      },
    );
    ds.events.push(
      {
        timeSec: 30,
        type: "flag-return",
        description: "b l a k e returned the Inferno flag",
        actor: "b l a k e",
        flagTeamName: "Inferno",
      },
      {
        timeSec: 34,
        type: "flag-cap",
        description: "^i^Irvin captured the Storm flag! (Held: 00:04.70)",
        capturer: "^i^Irvin",
        flagTeamName: "Storm",
      },
    );
    const p = planShotsCausal(ds);
    const events = p.shots.flatMap((s) => s.scene?.events ?? []);

    const ret = events.find((e) => e.type === "return");
    expect(ret, "no return event emitted").toBeDefined();
    expect(ret!.detail).toBe("returned the Inferno flag");
    expect(ret!.actors).toEqual([{ name: "blake", role: "actor" }]);

    const cap = events.find((e) => e.type === "cap");
    expect(cap, "no cap event emitted").toBeDefined();
    expect(cap!.detail).toBe("captured the Storm flag");
    // Chat spelled it "^i^Irvin"; the roster says the base name is
    // "Irvin" with an official tag of "i". `actors` must carry the
    // same canonical name a scene's `players` list would use — one
    // spelling per player, everywhere.
    expect(cap!.actors).toEqual([{ name: "Irvin", role: "capturer" }]);
    // Hold time travels as a number, never baked into prose.
    expect(cap!.detail).not.toMatch(/Held/i);

    for (const e of events) {
      expect(e.detail, `name leaked into ${e.type} detail`).not.toMatch(
        /b l a k e|\^i\^Irvin/,
      );
    }
  });

  it("labels rough frame positions from the planned camera", () => {
    // A fixedOrbit whose camera geometry we control exactly: angle 0 →
    // camera at center + (sin 0, cos 0)·r = 60 north of the anchor (in
    // Torque y), looking south at it.
    const ds = dataset();
    ds.playerSamples = [];
    for (let t = 0; t <= 120; t++) {
      // At the anchor: mid center. West of the sightline: one side.
      ds.playerSamples.push(
        { timeSec: t, targetId: 40, teamId: 1, pos: [0, 0, 100] },
        { timeSec: t, targetId: 41, teamId: 1, pos: [-25, 5, 100] },
        { timeSec: t, targetId: 42, teamId: 1, pos: [25, 5, 100] },
        // Behind the camera.
        { timeSec: t, targetId: 43, teamId: 1, pos: [0, 90, 100] },
      );
    }
    ds.playerNames = [
      { targetId: 40, name: "mid", displayName: "Mid" },
      { targetId: 41, name: "west", displayName: "West" },
      { targetId: 42, name: "east", displayName: "East" },
      { targetId: 43, name: "behind", displayName: "Behind" },
    ];
    const p = planShotsCausal(ds);
    const shot = p.shots.find(
      (s) =>
        s.kind === "fixedOrbit" &&
        s.startAngle != null &&
        s.scene!.players.some((pl) => pl.targetId === 40),
    );
    expect(shot, "no framed fixedOrbit found").toBeDefined();
    const by = (id: number) =>
      shot!.scene!.players.find((pl) => pl.targetId === id);
    expect(by(40)?.frame).toMatch(/center/);
    // The two flankers land on opposite sides of the frame.
    const sides = [by(41)?.frame, by(42)?.frame];
    expect(sides.join(" ")).toMatch(/left/);
    expect(sides.join(" ")).toMatch(/right/);
  });

  it("carries the running score", () => {
    const late = plan.shots.find((s) => s.startSec > 40);
    expect(late!.scene!.score).toEqual([{ team: "Storm", score: 1 }]);
  });
});

describe("the shot's own subject", () => {
  const plan = planShotsCausal(dataset());
  it("marks the carrier a flag shot is following", () => {
    // A follow shot names its subject outright, so the scene should
    // never leave the booth guessing from proximity — and when the
    // subject's position sample is missing (dead, mid-respawn, a flag
    // between hand-offs) they were dropped from the scene entirely: a
    // shot of a named person described as showing nobody, with forty
    // players alive around it.
    const carried = plan.shots.filter(
      (s) =>
        s.kind === "followFlag" &&
        s.scene!.flags.some((f) => f.status === "carried"),
    );
    expect(carried.length).toBeGreaterThan(0);
    for (const shot of carried) {
      const focus = shot.scene!.players.filter((p) => p.focus);
      expect(focus, `no focus on ${shot.reason}`).toHaveLength(1);
      // ...and it is the carrier, not merely whoever stood nearest.
      const carrier = shot.scene!.flags.find((f) => f.status === "carried");
      expect(focus[0].name).toBe(carrier!.carrier);
    }
  });

  it("marks nobody as focus on a shot with no named subject", () => {
    // A landmark hold is of a place, not a person; everyone in it is
    // incidental.
    const landmark = plan.shots.find(
      (s) => s.kind === "fixedOrbit" && !s.lookSubject,
    );
    if (!landmark) return;
    expect(landmark.scene!.players.some((p) => p.focus)).toBe(false);
  });

  it("ships facts, not a rendered sentence", () => {
    // `summary` was formatted from these same fields plus the shot's
    // reason, and was written from the shot's MIDPOINT — so it knew the
    // shot's future and the live booth could never use it.
    for (const shot of plan.shots) {
      expect(shot.scene).toBeDefined();
      expect(shot.scene as unknown as { summary?: string }).not.toHaveProperty(
        "summary",
      );
    }
  });
});

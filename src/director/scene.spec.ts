import { describe, expect, it } from "vitest";
import { planShots } from "./planner";
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
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

describe("describeScenes", () => {
  const plan = planShots(dataset());

  it("attaches a scene with topic and sequence to every shot", () => {
    expect(plan.shots.length).toBeGreaterThan(0);
    for (const shot of plan.shots) {
      expect(shot.scene, shot.reason).toBeDefined();
      expect(shot.scene!.topic).toBeTruthy();
      expect(shot.scene!.sequenceId).toBeTruthy();
    }
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
    expect(standShot!.scene!.summary).toContain("with a shield pack");
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
    const p = planShots(ds);
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

  it("marks grabs taken off the stand and speaks distances in meters", () => {
    const ds = dataset();
    ds.events.push({
      timeSec: 30,
      type: "flag-grab",
      description: "Slayer grabbed the Inferno flag",
      actor: "Slayer",
      flagTeamName: "Inferno",
    });
    const p = planShots(ds);
    const withGrab = p.shots.find((s) =>
      s.scene!.events.some((e) => e.type === "grab"),
    );
    expect(withGrab, "no grab event emitted").toBeDefined();
    const grab = withGrab!.scene!.events.find((e) => e.type === "grab")!;
    expect(grab.detail).toContain("a stand grab — the flag was home");
    // Kill distances carry units now ("~30 meters"), never a bare "~30m".
    const withKill = p.shots.find((s) =>
      s.scene!.events.some((e) => e.type === "kill"),
    );
    const kill = withKill!.scene!.events.find((e) => e.type === "kill")!;
    expect(kill.detail).not.toMatch(/~\d+m\b/);
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
    const p = planShots(ds);
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

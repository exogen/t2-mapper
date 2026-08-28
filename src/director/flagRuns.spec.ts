import { describe, expect, it } from "vitest";
import { flagSegmentShots } from "./flagRuns";
import {
  pushReachingBack,
  situationalShot,
  watchPlayersShots,
} from "./shotBuilders";
import { buildFlagTracks, buildPlayersAtSec } from "./dataset";
import {
  bombardment,
  vehicleMoment,
  highlightKill,
  bestHero,
  likelyTarget,
  incomingAttacker,
  stableCluster,
  suitUp,
  travelDestination,
} from "./analysis";
import { newShotVariety, pathAwareAngle } from "./framing";
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
} from "./types";

const STAND: DirectorVec3 = [0, 0, 100];
const FAR_BASE: DirectorVec3 = [800, 0, 100];

/** A flag sitting home for 60s, with whatever players the test wants. */
function homeDataset(playerSamples: DirectorPlayerSample[]): DirectorDataset {
  const flagSamples: DirectorFlagSample[] = [];
  for (let t = 0; t <= 60; t += 0.5) {
    flagSamples.push({
      timeSec: t,
      slot: 1,
      pos: STAND,
      carrierTargetId: null,
      status: "home",
    });
  }
  return {
    durationSec: 60,
    flagSampleStepSec: 0.5,
    playerSampleStepSec: 1,
    gameClassName: "CTFGame",
    teams: [
      { teamId: 1, name: "Storm" },
      { teamId: 2, name: "Inferno" },
    ],
    flagStands: [
      { slot: 1, teamId: 1, name: "Storm", pos: STAND },
      { slot: 2, teamId: 2, name: "Inferno", pos: FAR_BASE },
    ],
    events: [],
    flagSamples,
    playerSamples,
    structures: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [],
  };
}

function players(
  teamId: number,
  base: DirectorVec3,
  count: number,
  firstId: number,
): DirectorPlayerSample[] {
  const out: DirectorPlayerSample[] = [];
  for (let t = 0; t <= 60; t++) {
    for (let n = 0; n < count; n++) {
      out.push({
        timeSec: t,
        targetId: firstId + n,
        teamId,
        pos: [base[0] + n * 4, base[1] + n * 3, base[2]],
      });
    }
  }
  return out;
}

function homeShots(dataset: DirectorDataset, variety = newShotVariety()) {
  return flagSegmentShots(0, 60, 1, {
    dataset,
    track: buildFlagTracks(dataset).get(1)!,
    previous: undefined,
    playersAtSec: buildPlayersAtSec(dataset),
    variety,
    crowdMin: 2,
  });
}

describe("flagSegmentShots stand battles", () => {
  it("does not call a crowd of teammates a battle", () => {
    // Early game: five teammates milling at their own spawn, the other
    // team doing the same across the map. Nobody is fighting anybody.
    const dataset = homeDataset([
      ...players(1, STAND, 5, 30),
      ...players(2, FAR_BASE, 8, 50),
    ]);
    for (const shot of homeShots(dataset)) {
      expect(shot.reason, shot.reason).not.toContain("battle overhead");
    }
  });

  it("frames a real battle at the stand it names", () => {
    // Enemies on the stand: now it IS a battle — and even though the
    // biggest cluster on the map is the far team's spawn crowd, the shot
    // must be centred here.
    const dataset = homeDataset([
      ...players(1, STAND, 4, 30),
      ...players(2, [20, 10, 100], 4, 70),
      ...players(2, FAR_BASE, 10, 50),
    ]);
    const battles = homeShots(dataset).filter((s) =>
      s.reason?.includes("battle overhead"),
    );
    expect(battles.length).toBeGreaterThan(0);
    for (const shot of battles) {
      if (shot.kind !== "fixedOrbit") continue;
      expect(
        Math.hypot(shot.center[0] - STAND[0], shot.center[1] - STAND[1]),
        `centred at [${shot.center.map((v) => v.toFixed(0))}]`,
      ).toBeLessThanOrEqual(120);
    }
  });
});

describe("situationalShot kill highlights", () => {
  it("brackets the kill instead of spanning the whole window", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [
      {
        timeSec: 22,
        targetId: 9,
        teamId: 2,
        pos: [400, 300, 100],
        killerTargetId: 8,
        killerPos: [430, 300, 100],
        weapon: "disc",
      },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("disc kill");
    // Rolling before the kill lands, done shortly after — not a 30s
    // window that happens to contain it.
    expect(shot!.startSec).toBeCloseTo(22 - 4, 1);
    expect(shot!.endSec).toBeCloseTo(22 + 4, 1);
  });

  it("reaches back past the window start for full pre-kill footage", () => {
    // The kill sits at the leading edge of its window. Clamping the
    // shot to the window would open ON the death — the viewer needs
    // the seconds BEFORE it to establish what is happening.
    const dataset = homeDataset([]);
    dataset.deaths = [
      {
        timeSec: 11,
        targetId: 9,
        teamId: 2,
        pos: [400, 300, 100],
        killerTargetId: 8,
        killerPos: [430, 300, 100],
        weapon: "disc",
      },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("disc kill");
    expect(shot!.startSec).toBeCloseTo(11 - 4, 1);
  });
});

describe("highlightKill weapon tiers", () => {
  const death = (weapon: string | undefined, victimId = 9) => ({
    timeSec: 22,
    targetId: victimId,
    teamId: 2,
    pos: [400, 300, 100] as DirectorVec3,
    killerTargetId: 8,
    killerPos: [430, 300, 100] as DirectorVec3,
    weapon,
  });

  it("skips a chaingun kill between non-carriers", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [death("chaingun")];
    expect(highlightKill(10, 40, dataset)).toBeNull();
  });

  it("skips an unclassified kill between non-carriers", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [death(undefined)];
    expect(highlightKill(10, 40, dataset)).toBeNull();
  });

  it.each(["shocklance", "disc", "mortar", "missile", "plasma", "laser"])(
    "highlights a %s kill on its own",
    (weapon) => {
      const dataset = homeDataset([]);
      dataset.deaths = [death(weapon)];
      expect(highlightKill(10, 40, dataset)?.weapon).toBe(weapon);
    },
  );

  it("does not highlight automated turret kills", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [death("plasma turret")];
    expect(highlightKill(10, 40, dataset)).toBeNull();
  });

  it("highlights vehicle ordnance variants by substring", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [death("tank mortar")];
    expect(highlightKill(10, 40, dataset)).not.toBeNull();
  });

  it("keeps a chaingun kill when the victim was carrying a flag", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [death("chaingun")];
    for (const sample of dataset.flagSamples) {
      if (Math.abs(sample.timeSec - 22) <= 1) sample.carrierTargetId = 9;
    }
    expect(highlightKill(10, 40, dataset)).not.toBeNull();
  });

  it("keeps a chaingun kill BY a flag carrier", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [death("chaingun")];
    for (const sample of dataset.flagSamples) {
      if (Math.abs(sample.timeSec - 22) <= 1) sample.carrierTargetId = 8;
    }
    expect(highlightKill(10, 40, dataset)).not.toBeNull();
  });

  it("ranks the carrier fight above a plain ordnance kill", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [
      death("disc", 9),
      { ...death("chaingun", 11), pos: [500, 300, 100] as DirectorVec3 },
    ];
    for (const sample of dataset.flagSamples) {
      if (Math.abs(sample.timeSec - 22) <= 1) sample.carrierTargetId = 11;
    }
    expect(highlightKill(10, 40, dataset)?.weapon).toBe("chaingun");
  });
});

describe("guarded stand hip view", () => {
  it("covers the wait from the defender's hip, aim shot for the finale", () => {
    // A defender posted by the stand for a 12s quiet stretch, a grab at
    // the end: the wait is a tight low shot from the defender, and the
    // approach-aimed flag shot still owns the last seconds.
    const dataset = homeDataset([
      ...players(1, [12, 8, 100], 1, 30),
      ...players(2, [400, 300, 100], 5, 50),
    ]);
    dataset.flagSamples = dataset.flagSamples.filter((f) => f.timeSec <= 12);
    for (let t = 12.5; t <= 60; t += 0.5) {
      dataset.flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: [t * 5, 0, 100],
        carrierTargetId: 70,
        status: "held",
      });
    }
    const shots = homeShots(dataset);
    const hip = shots.find((s) => s.reason.includes("hip"));
    expect(hip, shots.map((s) => s.reason).join("; ")).toBeDefined();
    expect(hip!.kind).toBe("followPlayer");
    if (hip!.kind === "followPlayer") {
      expect(hip!.targetId).toBe(30);
      expect(hip!.aim).toEqual({ mode: "toward", target: STAND });
    }
    // The grab-approach flag shot still follows it.
    const after = shots.find(
      (s) => s.kind === "followFlag" && s.startSec >= hip!.endSec - 0.01,
    );
    expect(after).toBeDefined();
  });

  it("alternates: the next fitting stand takes the two-shot instead", () => {
    const dataset = homeDataset([
      ...players(1, [12, 8, 100], 1, 30),
      ...players(2, [400, 300, 100], 5, 50),
    ]);
    dataset.flagSamples = dataset.flagSamples.filter((f) => f.timeSec <= 12);
    for (let t = 12.5; t <= 60; t += 0.5) {
      dataset.flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: [t * 5, 0, 100],
        carrierTargetId: 70,
        status: "held",
      });
    }
    // A hip view already aired on an earlier stand: this one keeps the
    // classic widened flag-and-defender frame.
    const variety = newShotVariety();
    variety.standViews = 1;
    const shots = homeShots(dataset, variety);
    expect(shots.some((s) => s.reason.includes("hip"))).toBe(false);
    expect(shots.some((s) => s.reason.includes("with its defender"))).toBe(
      true,
    );
  });
});

describe("vehicleMoment", () => {
  const sample = (
    timeSec: number,
    key: string,
    kind: "shrike" | "bomber" | "havoc",
    pos: DirectorVec3,
    passengers = 0,
    teamId: number | null = 1,
  ) => ({ timeSec, key, kind, teamId, pos, passengers });

  it("spots a loaded transport under way", () => {
    const dataset = homeDataset([]);
    dataset.vehicles = [
      sample(20, "h1", "havoc", [100, 100, 120], 4),
      sample(25, "h1", "havoc", [200, 150, 120], 4),
      sample(30, "h1", "havoc", [300, 200, 120], 4),
    ];
    const m = vehicleMoment(15, 35, dataset, buildPlayersAtSec(dataset));
    expect(m?.kind).toBe("transport");
    expect(m?.crew).toBe(4);
  });

  it("a full transport idling on the pad is not a raid", () => {
    const dataset = homeDataset([]);
    dataset.vehicles = [
      sample(20, "h1", "havoc", [100, 100, 90], 4),
      sample(30, "h1", "havoc", [102, 101, 90], 4),
    ];
    expect(
      vehicleMoment(15, 35, dataset, buildPlayersAtSec(dataset)),
    ).toBeNull();
  });

  it("opposing flyers tangling are a dogfight", () => {
    const dataset = homeDataset([]);
    dataset.vehicles = [];
    for (let t = 20; t <= 26; t += 2) {
      dataset.vehicles.push(
        sample(t, "s1", "shrike", [100 + t, 100, 150], 1, 1),
        sample(t, "s2", "shrike", [110 + t, 120, 155], 1, 2),
      );
    }
    expect(
      vehicleMoment(15, 35, dataset, buildPlayersAtSec(dataset))?.kind,
    ).toBe("dogfight");
  });

  it("same-team formation flying is not", () => {
    const dataset = homeDataset([]);
    dataset.vehicles = [];
    for (let t = 20; t <= 26; t += 2) {
      dataset.vehicles.push(
        sample(t, "s1", "shrike", [100 + t, 100, 150], 1, 1),
        sample(t, "s2", "shrike", [110 + t, 120, 155], 1, 1),
      );
    }
    expect(
      vehicleMoment(15, 35, dataset, buildPlayersAtSec(dataset)),
    ).toBeNull();
  });
});

describe("bombardment shooter attribution", () => {
  it("names the dominant packet-attributed shooter, never a bystander", () => {
    const dataset = homeDataset([]);
    dataset.mortarShots = [];
    for (let t = 20; t <= 28; t += 2) {
      dataset.mortarShots.push({
        timeSec: t,
        from: [300, 300, 100] as DirectorVec3,
        to: [STAND[0] + 5, STAND[1], STAND[2]] as DirectorVec3,
        // Three shells from 39, one unattributed (turret/out of scope).
        shooterTargetId: t < 26 ? 39 : null,
      });
    }
    const barrage = bombardment(15, 35, dataset);
    expect(barrage?.shooterTargetId).toBe(39);
  });

  it("names nobody when the shells carry no shooter", () => {
    const dataset = homeDataset([]);
    dataset.mortarShots = [];
    for (let t = 20; t <= 26; t += 2) {
      dataset.mortarShots.push({
        timeSec: t,
        from: [300, 300, 100] as DirectorVec3,
        to: [STAND[0] + 5, STAND[1], STAND[2]] as DirectorVec3,
        shooterTargetId: null,
      });
    }
    const barrage = bombardment(15, 35, dataset);
    expect(barrage).not.toBeNull();
    expect(barrage?.shooterTargetId).toBeNull();
  });
});

describe("long-range kill follows the killer", () => {
  it("rides with the killer instead of a wide two-dot frame", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [
      {
        timeSec: 22,
        targetId: 9,
        teamId: 2,
        pos: [400, 300, 100],
        killerTargetId: 8,
        killerPos: [520, 300, 100],
        weapon: "laser",
      },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.kind).toBe("followPlayer");
    if (shot?.kind === "followPlayer") {
      expect(shot.targetId).toBe(8);
      expect(shot.aim).toEqual({ mode: "toward", target: [400, 300, 100] });
    }
  });
});

describe("suit-up context gating", () => {
  function suitingDataset(): DirectorDataset {
    const dataset = homeDataset([...players(1, [402, 301, 100], 3, 30)]);
    dataset.stations = [
      { pos: [400, 300, 100], kind: "inventory", deployed: false },
    ];
    return dataset;
  }

  it("mid-match suit-ups are background noise", () => {
    const dataset = suitingDataset();
    dataset.events = [
      { timeSec: -300, type: "match-start", description: "Match started" },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason ?? "").not.toContain("suiting up");
  });

  it("the opening re-arm rush is a story", () => {
    const dataset = suitingDataset();
    dataset.events = [
      { timeSec: 5, type: "match-start", description: "Match started" },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("suiting up");
  });

  it("so is re-arming after a repair brings the base back", () => {
    const dataset = suitingDataset();
    dataset.events = [
      { timeSec: -300, type: "match-start", description: "Match started" },
    ];
    dataset.structures = [
      {
        timeSec: 2,
        name: "GeneratorLarge",
        className: "StaticShape",
        pos: [395, 300, 95],
        from: 2,
        to: 0,
      },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("suiting up");
  });

  it("a turret patched up across the map explains nothing here", () => {
    const dataset = suitingDataset();
    dataset.events = [
      { timeSec: -300, type: "match-start", description: "Match started" },
    ];
    dataset.structures = [
      {
        timeSec: 2,
        name: "TurretBaseLarge",
        className: "StaticShape",
        pos: [-600, -700, 95],
        from: 2,
        to: 0,
      },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason ?? "").not.toContain("suiting up");
  });
});

describe("strafing runs", () => {
  it("a lone shrike hounding enemies is a vehicle moment", () => {
    const dataset = homeDataset([...players(2, [200, 100, 100], 2, 50)]);
    dataset.vehicles = [];
    for (let t = 20; t <= 28; t += 2) {
      dataset.vehicles.push({
        timeSec: t,
        key: "s1",
        kind: "shrike",
        teamId: 1,
        pos: [190 + (t - 20) * 15, 105, 120],
        passengers: 1,
      });
    }
    const m = vehicleMoment(15, 35, dataset, buildPlayersAtSec(dataset));
    expect(m?.kind).toBe("strafe");
  });

  it("flying past teammates is not", () => {
    const dataset = homeDataset([...players(1, [200, 100, 100], 2, 50)]);
    dataset.vehicles = [];
    for (let t = 20; t <= 28; t += 2) {
      dataset.vehicles.push({
        timeSec: t,
        key: "s1",
        kind: "shrike",
        teamId: 1,
        pos: [190 + (t - 20) * 15, 105, 120],
        passengers: 1,
      });
    }
    expect(
      vehicleMoment(15, 35, dataset, buildPlayersAtSec(dataset)),
    ).toBeNull();
  });
});

describe("situationalShot story priority", () => {
  it("a MID-AIR kill outranks a routine barrage in the same window", () => {
    const dataset = homeDataset([]);
    // A qualifying barrage onto the stand...
    dataset.mortarShots = [];
    for (let t = 20; t <= 30; t += 2) {
      dataset.mortarShots.push({
        timeSec: t,
        from: [300, 300, 100] as DirectorVec3,
        to: [STAND[0] + 5, STAND[1], STAND[2]] as DirectorVec3,
      });
    }
    // ...and an MA in the same stretch.
    dataset.deaths = [
      {
        timeSec: 24,
        targetId: 9,
        teamId: 2,
        pos: [400, 300, 130] as DirectorVec3,
        killerTargetId: 8,
        killerPos: [430, 300, 100] as DirectorVec3,
        weapon: "disc",
        airborne: true,
        speed: 50,
      },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("MID-AIR");
  });

  it("a plain duel still defers to the barrage", () => {
    const dataset = homeDataset([]);
    dataset.mortarShots = [];
    for (let t = 20; t <= 30; t += 2) {
      dataset.mortarShots.push({
        timeSec: t,
        from: [300, 300, 100] as DirectorVec3,
        to: [STAND[0] + 5, STAND[1], STAND[2]] as DirectorVec3,
      });
    }
    dataset.deaths = [
      {
        timeSec: 24,
        targetId: 9,
        teamId: 2,
        pos: [400, 300, 100] as DirectorVec3,
        killerTargetId: 8,
        killerPos: [430, 300, 100] as DirectorVec3,
        weapon: "disc",
      },
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("mortars hitting");
  });
});

describe("situationalShot asset raids", () => {
  const gen = (
    timeSec: number,
    pos: DirectorVec3,
    name = "GeneratorLarge",
  ) => ({
    timeSec,
    name,
    className: "StaticShape",
    pos,
    from: 0,
    to: 2,
  });

  it("covers a generator kill as a raid", () => {
    const dataset = homeDataset([]);
    dataset.structures = [gen(25, [400, 300, 80])];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("raid");
    expect(shot!.startSec).toBeCloseTo(21, 1);
  });

  it("one deployable popping is not a raid", () => {
    const dataset = homeDataset([]);
    dataset.structures = [gen(25, [400, 300, 80], "TurretDeployedFloorIndoor")];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason ?? "").not.toContain("raid");
  });

  it("two clustered asset kills are", () => {
    const dataset = homeDataset([]);
    dataset.structures = [
      gen(25, [400, 300, 80], "TurretBaseLarge"),
      gen(28, [415, 305, 80], "StationInventory"),
    ];
    const shot = situationalShot(
      10,
      40,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("raid in progress");
  });
});

describe("highlightKill mid-air ranking", () => {
  const base = {
    timeSec: 22,
    teamId: 2,
    killerTargetId: 8,
    killerPos: [430, 300, 100] as DirectorVec3,
    weapon: "disc",
  };

  it("prefers the MA over a plain disc kill", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [
      { ...base, targetId: 9, pos: [400, 300, 100] as DirectorVec3 },
      {
        ...base,
        targetId: 11,
        pos: [400, 340, 120] as DirectorVec3,
        airborne: true,
        speed: 60,
      },
    ];
    const hit = highlightKill(10, 40, dataset);
    expect(hit?.midair).toBe(true);
    expect(hit?.center[2]).toBeGreaterThan(105);
  });

  it("a hovering victim is not an MA", () => {
    const dataset = homeDataset([]);
    dataset.deaths = [
      {
        ...base,
        targetId: 9,
        pos: [400, 300, 120] as DirectorVec3,
        airborne: true,
        speed: 3,
      },
    ];
    expect(highlightKill(10, 40, dataset)?.midair).toBe(false);
  });
});

describe("pushReachingBack", () => {
  const orbit = (startSec: number, endSec: number): Shot => ({
    kind: "fixedOrbit",
    center: [0, 0, 0],
    radius: 40,
    startSec,
    endSec,
    transitionIn: "cut",
    reason: "test",
  });

  it("trims the previous shot's tail to make room", () => {
    const shots = [orbit(0, 12)];
    pushReachingBack(shots, orbit(9, 18), 0);
    expect(shots[0].endSec).toBe(9);
    expect(shots[1].startSec).toBe(9);
  });

  it("never trims the previous shot below a legible hold", () => {
    const shots = [orbit(0, 5)];
    pushReachingBack(shots, orbit(2, 12), 0);
    expect(shots[0].endSec).toBe(4);
    expect(shots[1].startSec).toBe(4);
    expect(shots[1].endSec).toBe(12);
  });

  it("clamps to the window start when there is nothing local to trim", () => {
    const shots: Shot[] = [];
    pushReachingBack(shots, orbit(6, 18), 10);
    expect(shots[0].startSec).toBe(10);
  });

  it("leaves non-overlapping pushes alone", () => {
    const shots = [orbit(0, 8)];
    pushReachingBack(shots, orbit(8, 16), 0);
    expect(shots[0].endSec).toBe(8);
    expect(shots[1].startSec).toBe(8);
  });
});

describe("stableCluster floors", () => {
  it("anchors on the dominant floor, not between floors", () => {
    // 7 players indoors at z=84, 10 in the courtyard above at z=100 —
    // XY-near, so a naive 3D cluster mixes them and its centroid lands
    // at z≈96: inside the slab between the room and the terrain. A
    // camera anchored there is buried in geometry and stares at dirt
    // (the user's screenshot at 17:48).
    const dataset = homeDataset([]);
    const samples = [];
    for (let t = 0; t <= 60; t++) {
      for (let n = 0; n < 7; n++) {
        samples.push({
          timeSec: t,
          targetId: 30 + n,
          teamId: 1,
          pos: [n * 3, 5, 84] as DirectorVec3,
        });
      }
      for (let n = 0; n < 10; n++) {
        samples.push({
          timeSec: t,
          targetId: 50 + n,
          teamId: 1,
          pos: [n * 3, 12, 100] as DirectorVec3,
        });
      }
    }
    dataset.playerSamples = samples;
    const cluster = stableCluster(10, 20, buildPlayersAtSec(dataset), 160);
    expect(cluster).not.toBeNull();
    // The bigger band (courtyard, z=100) wins, and the anchor sits ON
    // that floor.
    expect(cluster!.count).toBe(10);
    expect(cluster!.center[2]).toBeCloseTo(100, 1);
  });
});

describe("suitUp station selection", () => {
  const stations = (aAct: number[], bAct: number[]) => [
    {
      pos: [0, 0, 100] as DirectorVec3,
      kind: "inventory" as const,
      deployed: false,
      activations: aAct,
    },
    {
      pos: [40, 0, 100] as DirectorVec3,
      kind: "inventory" as const,
      deployed: false,
      activations: bAct,
    },
  ];
  const crowdAtBoth = (): DirectorPlayerSample[] => {
    const out: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 60; t++) {
      for (let n = 0; n < 4; n++) {
        out.push({
          timeSec: t,
          targetId: 30 + n,
          teamId: 1,
          pos: [n * 3, 4, 100],
        });
        out.push({
          timeSec: t,
          targetId: 40 + n,
          teamId: 1,
          pos: [40 + n * 3, 4, 100],
        });
      }
    }
    return out;
  };
  const withKickoff = (ds: DirectorDataset): DirectorDataset => ({
    ...ds,
    events: [{ timeSec: 8, type: "match-start", description: "Match started" }],
  });

  it("picks the station whose activate animation played in the window", () => {
    // Station A has the bigger queue nearby but its only use was long
    // ago (a finished activate thread used to read as "active" forever);
    // station B is the one actually being used now.
    const dataset = withKickoff(homeDataset(crowdAtBoth()));
    dataset.stations = stations([2], [12, 14, 16]);
    const pick = suitUp(10, 20, dataset, buildPlayersAtSec(dataset));
    expect(pick).not.toBeNull();
    expect(pick!.center[0]).toBe(40);
  });

  it("declines the shot when no station was used in the window", () => {
    const dataset = withKickoff(homeDataset(crowdAtBoth()));
    dataset.stations = stations([2], [3]);
    expect(suitUp(30, 40, dataset, buildPlayersAtSec(dataset))).toBeNull();
  });

  it("still trusts proximity for datasets without activation data", () => {
    const dataset = withKickoff(homeDataset(crowdAtBoth()));
    dataset.stations = stations([], []);
    expect(suitUp(10, 20, dataset, buildPlayersAtSec(dataset))).not.toBeNull();
  });
});

describe("situationalShot near-station action", () => {
  it("shows the mortar being fired beside the inventory, not the queue", () => {
    const dataset = homeDataset([]);
    dataset.events = [
      { timeSec: 8, type: "match-start", description: "Match started" },
    ];
    const samples: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 60; t++) {
      for (let n = 0; n < 4; n++) {
        samples.push({
          timeSec: t,
          targetId: 30 + n,
          teamId: 1,
          pos: [n * 3, 4, 100],
        });
      }
      // The shooter standing just off the station.
      samples.push({ timeSec: t, targetId: 60, teamId: 1, pos: [12, 10, 100] });
    }
    dataset.playerSamples = samples;
    dataset.stations = [
      {
        pos: [0, 0, 100],
        kind: "inventory",
        deployed: false,
        activations: [12, 15],
      },
    ];
    dataset.mortarShots = [
      // The packet names the shooter — no proximity inference.
      {
        timeSec: 14,
        from: [12, 10, 100],
        to: [500, 400, 100],
        shooterTargetId: 60,
      },
      {
        timeSec: 17,
        from: [12, 10, 100],
        to: [510, 390, 100],
        shooterTargetId: 60,
      },
    ];
    const shot = situationalShot(
      10,
      20,
      dataset,
      buildPlayersAtSec(dataset),
      newShotVariety(),
    );
    expect(shot?.reason).toContain("Mortar fire beside the inventory");
    if (shot?.kind === "fixedOrbit") {
      expect(shot.lookSubject).toEqual({ type: "player", targetId: 60 });
    }
  });
});

describe("dolly framing", () => {
  it("scales tracking distance with pace and rides outside the midfield", () => {
    // A fast cross-map carry long enough to earn the dolly style.
    const dataset = homeDataset([]);
    const flagSamples = [];
    for (let t = 0; t <= 60; t += 0.5) {
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: [t * 45, 0, 100] as DirectorVec3,
        carrierTargetId: 5,
        status: "held" as const,
      });
    }
    dataset.flagSamples = flagSamples;
    const shots = flagSegmentShots(0, 60, 1, {
      dataset,
      track: buildFlagTracks(dataset).get(1)!,
      previous: undefined,
      playersAtSec: buildPlayersAtSec(dataset),
      variety: newShotVariety(),
      crowdMin: 99,
    });
    const dolly = shots.find((s) => s.kind === "dolly");
    expect(dolly, "no dolly emitted for a long fast carry").toBeDefined();
    if (dolly?.kind === "dolly") {
      // 45 u/s is deep into ski speed: wider than the 12m default.
      expect(dolly.distance ?? 0).toBeGreaterThan(12);
      // Profile framing: keeps the map midpoint at its back.
      expect(dolly.awayFrom).toBeDefined();
      expect(dolly.awayFrom![0]).toBeCloseTo(400, 0);
    }
  });
});

/** A flag track: held run carried toward the enemy base, capped at T. */
function capDataset(): DirectorDataset {
  const dataset = homeDataset([]);
  const flagSamples = [];
  for (let t = 0; t <= 60; t += 0.5) {
    let pos: DirectorVec3;
    let status: "held" | "home" = "home";
    let carrier: number | null = null;
    if (t >= 10 && t < 40) {
      status = "held";
      carrier = 5;
      pos = [((t - 10) / 30) * 700, 0, 100];
    } else if (t >= 40) {
      pos = STAND; // teleported home after the cap
    } else {
      pos = STAND;
    }
    flagSamples.push({
      timeSec: t,
      slot: 1,
      pos,
      carrierTargetId: carrier,
      status,
    });
  }
  dataset.flagSamples = flagSamples;
  dataset.events = [
    {
      timeSec: 40,
      type: "flag-cap",
      description: "Slayer captured the Storm flag",
      capturer: "Slayer",
      flagTeamName: "Storm",
    },
  ];
  dataset.playerNames = [{ targetId: 5, name: "slayer" }];
  return dataset;
}

describe("flagSegmentShots aftermath", () => {
  it("holds the capture spot instead of following the flag home", () => {
    const dataset = capDataset();
    const shots = flagSegmentShots(0, 60, 1, {
      dataset,
      track: buildFlagTracks(dataset).get(1)!,
      previous: undefined,
      playersAtSec: buildPlayersAtSec(dataset),
      variety: newShotVariety(),
      crowdMin: 99,
    });
    const after = shots.find((s) => s.reason?.startsWith("Aftermath"));
    expect(after, "no aftermath hold after the cap").toBeDefined();
    if (after?.kind === "fixedOrbit") {
      // Anchored where the cap HAPPENED (x≈700), not at the home stand.
      expect(after.center[0]).toBeGreaterThan(500);
      expect(after.lookSubject).toBeUndefined();
      expect(after.startSec).toBeCloseTo(40, 0);
    }
  });
});

describe("timer-return aftermath suppression", () => {
  function returnDataset(): DirectorDataset {
    const dataset = homeDataset([]);
    const flagSamples = [];
    for (let t = 0; t <= 60; t += 0.5) {
      // Dropped far afield until it goes home at t=40 (a return).
      const returned = t >= 40;
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: returned ? STAND : ([400, 300, 100] as DirectorVec3),
        carrierTargetId: null,
        status: returned ? ("home" as const) : ("field" as const),
      });
    }
    dataset.flagSamples = flagSamples;
    dataset.events = [
      {
        timeSec: 40,
        type: "flag-return",
        description: "The Storm flag was returned",
        flagTeamName: "Storm",
      },
    ];
    return dataset;
  }

  it("skips the aftermath when the return timer expired in an empty field", () => {
    const shots = homeShots(returnDataset());
    expect(shots.some((s) => s.reason?.startsWith("Aftermath"))).toBe(false);
  });

  it("keeps the aftermath when a real scene (2+ players) is there", () => {
    const dataset = returnDataset();
    dataset.playerSamples = [];
    for (let t = 30; t <= 45; t++) {
      for (const targetId of [30, 31]) {
        dataset.playerSamples.push({
          timeSec: t,
          targetId,
          teamId: targetId === 30 ? 1 : 2,
          pos: [405 + (targetId - 30) * 6, 295, 100],
        });
      }
    }
    const shots = homeShots(dataset);
    expect(shots.some((s) => s.reason?.startsWith("Aftermath"))).toBe(true);
  });

  it("a lone returner in an empty field earns no lingering hold", () => {
    const dataset = returnDataset();
    dataset.playerSamples = [];
    for (let t = 30; t <= 45; t++) {
      dataset.playerSamples.push({
        timeSec: t,
        targetId: 30,
        teamId: 1,
        pos: [405, 295, 100],
      });
    }
    const shots = homeShots(dataset);
    expect(shots.some((s) => s.reason?.startsWith("Aftermath"))).toBe(false);
  });
});

describe("flagSegmentShots scrambles", () => {
  it("holds one slow overhead through a grab-drop scramble", () => {
    // Six alternating short possessions, all within 40u of one spot.
    const dataset = homeDataset([]);
    const flagSamples = [];
    for (let t = 0; t <= 60; t += 0.5) {
      const phase = Math.floor(t / 5);
      const held = phase >= 2 && phase < 8 && phase % 2 === 0;
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: [200 + (phase % 3) * 15, 10, 100] as DirectorVec3,
        carrierTargetId: held ? 5 + phase : null,
        status:
          phase < 2
            ? ("home" as const)
            : held
              ? ("held" as const)
              : ("field" as const),
      });
    }
    dataset.flagSamples = flagSamples;
    const shots = flagSegmentShots(10, 50, 1, {
      dataset,
      track: buildFlagTracks(dataset).get(1)!,
      previous: undefined,
      playersAtSec: buildPlayersAtSec(dataset),
      variety: newShotVariety(),
      crowdMin: 99,
    });
    const scramble = shots.filter((s) => s.reason?.startsWith("Scramble"));
    expect(scramble.length, "no scramble consolidation").toBeGreaterThan(0);
    // The consolidated stretch replaces a pile of per-run cuts.
    const inWindow = shots.filter((s) => s.startSec >= 10 && s.endSec <= 50);
    expect(inWindow.length).toBeLessThanOrEqual(3);
    if (scramble[0].kind === "fixedOrbit") {
      expect(Math.abs(scramble[0].angularSpeed ?? 0)).toBeLessThanOrEqual(0.06);
    }
  });
});

describe("incomingAttacker", () => {
  const BASE: DirectorVec3 = [0, 0, 100];
  it("finds the midfield attacker closing fast, ranking shellers up", () => {
    const dataset = homeDataset([]);
    const samples: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 20; t++) {
      // Fastest approacher (17 u/s) — would win on approach alone.
      samples.push({
        timeSec: t,
        targetId: 60,
        teamId: 1,
        pos: [440 - t * 17, 0, 100],
      });
      // Slower approacher (15.5 u/s vs 17) who is SHELLING — must outrank.
      samples.push({
        timeSec: t,
        targetId: 61,
        teamId: 1,
        pos: [420 - t * 15.5, 30, 100],
      });
      // Loiterer near the base (out of band).
      samples.push({ timeSec: t, targetId: 62, teamId: 1, pos: [30, 0, 100] });
      // Enemy team member approaching (wrong team).
      samples.push({
        timeSec: t,
        targetId: 63,
        teamId: 2,
        pos: [400 - t * 20, -30, 100],
      });
    }
    dataset.playerSamples = samples;
    dataset.mortarShots = [
      { timeSec: 6, from: [420 - 6 * 15.5, 30, 100], to: [10, 0, 100] },
    ];
    // Both arrive to a payoff (kills at the base) — the shelling bonus
    // is what separates them.
    dataset.deaths = [
      {
        timeSec: 18,
        targetId: 90,
        teamId: 2,
        pos: [20, 0, 100],
        killerTargetId: 60,
        killerPos: [30, 0, 100],
      },
      {
        timeSec: 18,
        targetId: 91,
        teamId: 2,
        pos: [25, 5, 100],
        killerTargetId: 61,
        killerPos: [30, 10, 100],
      },
    ];
    const pick = incomingAttacker(
      0,
      20,
      BASE,
      1,
      dataset,
      buildPlayersAtSec(dataset),
    );
    expect(pick?.targetId).toBe(61);
  });
});

describe("flagSegmentShots turtle variety", () => {
  it("cuts away to the inbound attacker during a long stalemate", () => {
    const dataset = homeDataset([]);
    // Enemy carrier parked next to an inventory (turtle conditions),
    // holding OUR flag (slot 1) for a long stretch.
    const HOLD: DirectorVec3 = [600, 50, 100];
    dataset.stations = [
      {
        pos: [602, 52, 100],
        kind: "inventory",
        deployed: false,
        activations: [],
      },
    ];
    const flagSamples = [];
    for (let t = 0; t <= 60; t += 0.5) {
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: HOLD,
        carrierTargetId: 44,
        status: "held" as const,
      });
    }
    dataset.flagSamples = flagSamples;
    // A retriever (flag's own team) skiing in from midfield at 20 u/s,
    // looping back out and in so a midfield approach exists in every
    // 8-second chunk of the hold.
    const samples: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 60; t++) {
      const phase = t % 15;
      samples.push({
        timeSec: t,
        targetId: 80,
        teamId: 1,
        pos: [Math.max(150, 500 - phase * 20), 50, 100],
      });
    }
    dataset.playerSamples = samples;
    // The payoff the scan verifies: 80 gets a kill at the base.
    dataset.deaths = [
      {
        timeSec: 26,
        targetId: 44,
        teamId: 2,
        pos: [595, 48, 100],
        killerTargetId: 80,
        killerPos: [590, 50, 100],
      },
    ];
    const shots = flagSegmentShots(0, 60, 1, {
      dataset,
      track: buildFlagTracks(dataset).get(1)!,
      previous: undefined,
      playersAtSec: buildPlayersAtSec(dataset),
      variety: newShotVariety(),
      crowdMin: 99,
    });
    expect(
      shots.some((s) => s.reason?.includes("inbound on the turtled")),
      shots.map((s) => s.reason).join(" | "),
    ).toBe(true);
  });
});

describe("flagSegmentShots pass continuity", () => {
  it("rides through a drop-and-regrab instead of cutting to the flag", () => {
    // Carried for 12s, on the ground for 3s, carried again — a pass.
    // Cutting to a "dropped flag" framing and back for a 3s grounding is
    // the churn the camera must NOT do.
    const dataset = homeDataset([]);
    const flagSamples = [];
    for (let t = 0; t <= 60; t += 0.5) {
      let status: "held" | "field" = "held";
      let carrier: number | null = 5;
      if (t >= 12 && t < 15) {
        status = "field";
        carrier = null;
      } else if (t >= 15) {
        carrier = 6;
      }
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: [200 + t * 6, 10, 100] as DirectorVec3,
        carrierTargetId: carrier,
        status,
      });
    }
    dataset.flagSamples = flagSamples;
    const shots = flagSegmentShots(0, 32, 1, {
      dataset,
      track: buildFlagTracks(dataset).get(1)!,
      previous: undefined,
      playersAtSec: buildPlayersAtSec(dataset),
      variety: newShotVariety(),
      crowdMin: 99,
    });
    // No dropped-flag framing for the 3s grounding…
    expect(shots.some((s) => s.reason?.includes("on the ground"))).toBe(false);
    // …and the shot covering the drop also covers the re-grab: one
    // continuous ride through the pass.
    const atDrop = shots.find((s) => 13 >= s.startSec && 13 < s.endSec);
    expect(atDrop).toBeDefined();
    expect(atDrop!.startSec).toBeLessThanOrEqual(12);
    expect(atDrop!.endSec).toBeGreaterThanOrEqual(15.5);
  });
});

describe("flagSegmentShots stand guard", () => {
  it("widens the stand shot to include the posted defender", () => {
    // Flag home until a grab at t=20; a defender stands 25u off the
    // stand the whole time. The shot should hold flag AND guard, not a
    // lone flag filling the lens.
    const dataset = homeDataset([]);
    const flagSamples = [];
    for (let t = 0; t <= 60; t += 0.5) {
      const held = t >= 20;
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: held ? ([t * 8, 0, 100] as DirectorVec3) : STAND,
        carrierTargetId: held ? 5 : null,
        status: held ? ("held" as const) : ("home" as const),
      });
    }
    dataset.flagSamples = flagSamples;
    const samples: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 60; t++) {
      samples.push({
        timeSec: t,
        targetId: 40,
        teamId: 1,
        pos: [STAND[0] + 25, STAND[1], STAND[2]],
      });
    }
    dataset.playerSamples = samples;
    // standViews = 1: the hip view took the previous guarded stand, so
    // this one is the widened two-shot's turn in the rotation.
    const variety = newShotVariety();
    variety.standViews = 1;
    const shots = flagSegmentShots(0, 20, 1, {
      dataset,
      track: buildFlagTracks(dataset).get(1)!,
      previous: undefined,
      playersAtSec: buildPlayersAtSec(dataset),
      variety,
      crowdMin: 99,
    });
    const stand = shots.find((s) => s.reason?.includes("at the stand"));
    expect(stand, "no stand shot emitted").toBeDefined();
    expect(stand!.reason).toContain("with its defender");
    if (stand!.kind === "followFlag") {
      expect(stand!.distance ?? 0).toBeGreaterThanOrEqual(25);
    }
  });
});

describe("flagSegmentShots grab variety", () => {
  function grabDataset(): DirectorDataset {
    const dataset = homeDataset([]);
    const flagSamples = [];
    for (let t = 0; t <= 60; t += 0.5) {
      const held = t >= 20;
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: held ? ([t * 8, 0, 100] as DirectorVec3) : STAND,
        carrierTargetId: held ? 5 : null,
        status: held ? ("held" as const) : ("home" as const),
      });
    }
    dataset.flagSamples = flagSamples;
    return dataset;
  }
  function standShotsFor(variety: ReturnType<typeof newShotVariety>) {
    const dataset = grabDataset();
    return flagSegmentShots(0, 20, 1, {
      dataset,
      track: buildFlagTracks(dataset).get(1)!,
      previous: undefined,
      playersAtSec: buildPlayersAtSec(dataset),
      variety,
      crowdMin: 99,
    });
  }

  it("alternates the stand camera with an over-the-shoulder ride-in", () => {
    // First grab: classic stand view. Second (odd counter): ride the
    // grabber in — the stand camera must not be the only grab look.
    const variety = newShotVariety();
    const first = standShotsFor(variety);
    expect(first.some((s) => s.reason?.includes("going in for"))).toBe(false);
    const second = standShotsFor(variety);
    const ots = second.find((s) => s.reason?.includes("going in for"));
    expect(ots, "no over-the-shoulder grab view on the 2nd grab").toBeDefined();
    if (ots?.kind === "followPlayer") {
      expect(ots.targetId).toBe(5);
      expect(ots.endSec).toBeCloseTo(20, 0);
    }
  });
});

describe("flagSegmentShots inbound payoff", () => {
  const HOLD: DirectorVec3 = [600, 50, 100];
  /** Turtled hold with one retriever skiing in from midfield. */
  function inboundDataset(): DirectorDataset {
    const dataset = homeDataset([]);
    dataset.stations = [
      {
        pos: [602, 52, 100],
        kind: "inventory",
        deployed: false,
        activations: [],
      },
    ];
    const flagSamples = [];
    for (let t = 0; t <= 60; t += 0.5) {
      flagSamples.push({
        timeSec: t,
        slot: 1,
        pos: HOLD,
        carrierTargetId: 44,
        status: "held" as const,
      });
    }
    dataset.flagSamples = flagSamples;
    // 420u out at t=0, closing at 20 u/s: reaches 40u of the hold at
    // t≈19 — well past the first 8s chunk where the follow starts.
    const samples: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 60; t++) {
      samples.push({
        timeSec: t,
        targetId: 80,
        teamId: 1,
        pos: [600 - Math.max(20, 420 - t * 20), 50, 100],
      });
    }
    dataset.playerSamples = samples;
    return dataset;
  }
  function shotsFor(dataset: DirectorDataset) {
    return flagSegmentShots(0, 60, 1, {
      dataset,
      track: buildFlagTracks(dataset).get(1)!,
      previous: undefined,
      playersAtSec: buildPlayersAtSec(dataset),
      variety: newShotVariety(),
      crowdMin: 99,
    });
  }

  it("rides the attacker through their payoff, not to a chunk cut", () => {
    // Cutting at the 8s chunk boundary means we watched them ski over
    // and cut away right before their hero moment — the payoff (here a
    // kill at the base at t=20) is the reason the shot exists.
    const dataset = inboundDataset();
    dataset.deaths = [
      {
        timeSec: 20,
        targetId: 44,
        teamId: 2,
        pos: [590, 50, 100],
        killerTargetId: 80,
        killerPos: [585, 50, 100],
      },
    ];
    const shots = shotsFor(dataset);
    const follow = shots.find((s) =>
      s.reason?.includes("inbound on the turtled"),
    );
    expect(follow, "no inbound follow emitted").toBeDefined();
    expect(follow!.reason).toContain("gets a kill");
    // Kill at 20 + beat: well past the 8s chunk.
    expect(follow!.endSec).toBeGreaterThanOrEqual(20);
    expect(follow!.endSec).toBeLessThanOrEqual(23.5);
  });

  it("declines the shot entirely when nothing happens on arrival", () => {
    // Travel with no payoff is somebody commuting — the disc-jump-only
    // follows. The scan knows; don't take the shot.
    const shots = shotsFor(inboundDataset());
    expect(
      shots.some((s) => s.reason?.includes("inbound on the turtled")),
    ).toBe(false);
  });

  it("ends the follow shortly after the attacker dies on the way", () => {
    const dataset = inboundDataset();
    dataset.deaths = [
      {
        timeSec: 13,
        targetId: 80,
        teamId: 1,
        pos: [600 - (420 - 13 * 20), 50, 100],
        killerTargetId: 44,
        killerPos: HOLD,
      },
    ];
    const shots = shotsFor(dataset);
    const follow = shots.find((s) =>
      s.reason?.includes("inbound on the turtled"),
    );
    expect(follow, "no inbound follow emitted").toBeDefined();
    expect(follow!.endSec).toBeLessThanOrEqual(13 + 2.5);
  });
});

describe("travelDestination", () => {
  const put = (dataset: DirectorDataset, mk: (t: number) => DirectorVec3) => {
    const out: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 20; t++) {
      out.push({ timeSec: t, targetId: 90, teamId: 1, pos: mk(t) });
    }
    dataset.playerSamples = out;
    return dataset;
  };

  it("snaps the aim to the base the player is heading for", () => {
    // Skiing from midfield straight at FAR_BASE [800, 0].
    const dataset = put(homeDataset([]), (t) => [300 + t * 18, 5, 100]);
    expect(
      travelDestination(90, 0, 20, dataset, buildPlayersAtSec(dataset)),
    ).toEqual(FAR_BASE);
  });

  it("projects ahead along the path when no base lies that way", () => {
    // Heading due +y: no stand in that direction.
    const dataset = put(homeDataset([]), (t) => [400, t * 18, 100]);
    const dest = travelDestination(
      90,
      0,
      20,
      dataset,
      buildPlayersAtSec(dataset),
    );
    expect(dest).not.toBeNull();
    expect(dest![0]).toBeCloseTo(400, 0);
    expect(dest![1]).toBeGreaterThan(400);
  });

  it("returns null for a loiterer", () => {
    const dataset = put(homeDataset([]), () => [400, 100, 100]);
    expect(
      travelDestination(90, 0, 20, dataset, buildPlayersAtSec(dataset)),
    ).toBeNull();
  });
});

describe("watchPlayersShots hero aim", () => {
  it("aims the hero follow at where they are heading, not at their own cluster", () => {
    // Three players skiing together from midfield toward FAR_BASE: the
    // cluster centroid is themselves, which degenerates the aim into a
    // drifting orbit.
    const dataset = homeDataset([]);
    const samples: DirectorPlayerSample[] = [];
    // Fast enough that the group is NOT a stable cluster over a chunk
    // (spread > the fixed-hold radius), forcing the follow branch.
    for (let t = 0; t <= 16; t++) {
      for (let n = 0; n < 3; n++) {
        samples.push({
          timeSec: t,
          targetId: 90 + n,
          teamId: 1,
          pos: [t * 55, n * 8, 100],
        });
      }
    }
    dataset.playerSamples = samples;
    const shots = watchPlayersShots(
      0,
      16,
      "Lull",
      dataset,
      buildPlayersAtSec(dataset),
      null,
      1,
      newShotVariety(),
    );
    const follow = shots.find((s) => s.kind === "followPlayer");
    expect(follow, "no hero follow emitted").toBeDefined();
    if (follow?.kind === "followPlayer" && follow.aim?.mode === "toward") {
      expect(follow.aim.target).toEqual(FAR_BASE);
    } else {
      throw new Error(`unexpected aim: ${JSON.stringify(follow)}`);
    }
  });
});

describe("pathAwareAngle", () => {
  const CENTER: DirectorVec3 = [0, 0, 100];
  /** A path skiing straight through the preferred camera spot. */
  const pathToward = (angle: number, radius: number): DirectorVec3[] => {
    const out: DirectorVec3[] = [];
    for (let i = 0; i <= 20; i++) {
      const f = i / 20;
      out.push([
        Math.sin(angle) * radius * 1.4 * f,
        Math.cos(angle) * radius * 1.4 * f,
        100,
      ]);
    }
    return out;
  };

  it("keeps the preferred bearing when the path stays clear of it", () => {
    // Path runs the OPPOSITE way from the camera.
    expect(pathAwareAngle(CENTER, 55, pathToward(Math.PI, 55), 0)).toBe(0);
  });

  it("steers off a bearing the subject is about to run over", () => {
    // The carrier skis straight at the preferred camera spot and drops
    // the flag at its feet — the user's shot #39. The chosen bearing's
    // camera must keep its distance from the WHOLE path.
    const path = pathToward(0, 55);
    const chosen = pathAwareAngle(CENTER, 55, path, 0);
    expect(chosen).not.toBe(0);
    const camX = Math.sin(chosen) * 55;
    const camY = Math.cos(chosen) * 55;
    const worst = Math.min(
      ...path.map((p) => Math.hypot(p[0] - camX, p[1] - camY)),
    );
    expect(worst).toBeGreaterThanOrEqual(55 * 0.55);
  });

  it("takes the least-bad bearing when every one is crowded", () => {
    // The flag visits every bearing's camera spot; the maximin choice
    // still returns SOME angle rather than failing.
    const path: DirectorVec3[] = [];
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      path.push([Math.sin(a) * 55, Math.cos(a) * 55, 100]);
    }
    expect(Number.isFinite(pathAwareAngle(CENTER, 55, path, 0))).toBe(true);
  });
});

describe("likelyTarget", () => {
  it("finds the enemies a stationary fighter is engaging", () => {
    const samples: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 10; t++) {
      samples.push({ timeSec: t, targetId: 70, teamId: 1, pos: [200, 0, 100] });
      samples.push({
        timeSec: t,
        targetId: 80,
        teamId: 2,
        pos: [240, 10, 100],
      });
      samples.push({
        timeSec: t,
        targetId: 81,
        teamId: 2,
        pos: [244, -10, 100],
      });
      // A distant enemy who is not part of this fight.
      samples.push({ timeSec: t, targetId: 82, teamId: 2, pos: [600, 0, 100] });
    }
    const dataset = homeDataset(samples);
    const target = likelyTarget(70, 0, 10, buildPlayersAtSec(dataset));
    expect(target).not.toBeNull();
    expect(target![0]).toBeCloseTo(242, 0);
  });

  it("returns null when nobody is near", () => {
    const samples: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 10; t++) {
      samples.push({ timeSec: t, targetId: 70, teamId: 1, pos: [200, 0, 100] });
    }
    const dataset = homeDataset(samples);
    expect(likelyTarget(70, 0, 10, buildPlayersAtSec(dataset))).toBeNull();
  });
});

describe("bestHero", () => {
  it("prefers the player about to do something over the nearest body", () => {
    const dataset = homeDataset([]);
    const samples: DirectorPlayerSample[] = [];
    for (let t = 0; t <= 10; t++) {
      samples.push({ timeSec: t, targetId: 70, teamId: 1, pos: [200, 0, 100] });
      samples.push({ timeSec: t, targetId: 71, teamId: 1, pos: [205, 5, 100] });
    }
    dataset.playerSamples = samples;
    dataset.deaths = [
      {
        timeSec: 6,
        targetId: 99,
        teamId: 2,
        pos: [210, 0, 100],
        killerTargetId: 71,
        killerPos: [205, 5, 100],
      },
    ];
    expect(
      bestHero(0, 10, [200, 0, 100], dataset, buildPlayersAtSec(dataset)),
    ).toBe(71);
  });
});

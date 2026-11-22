import { afterEach, describe, expect, it, vi } from "vitest";
import { CausalView } from "./causalView";
import { createSwitcherStream, runSwitcher } from "./switcher";
import * as predictors from "./predictors";
import * as variety from "./variety";
import * as framing from "./framing";
import { reportCoverage } from "./assemble";
import { directorDataset } from "./directorTestFixtures";
import type { DirectorDataset, Shot } from "./types";

function fixture(message: boolean, brief: boolean): DirectorDataset {
  const ds = directorDataset({
    durationSec: 75,
    events: [
      { timeSec: 0, type: "match-start", description: "Match started" },
      ...(message
        ? [
            {
              timeSec: 60.4,
              type: "flag-grab" as const,
              flagTeamName: "Inferno",
              actor: "Actual",
              description: "Actual grabbed Inferno",
            },
          ]
        : []),
    ],
    playerNames: [
      { targetId: 5, name: "actual", displayName: "Actual" },
      { targetId: 9, name: "predicted", displayName: "Predicted" },
    ],
  });
  for (let t = 0; t <= 75; t += 0.5) {
    ds.flagSamples.push({
      timeSec: t,
      slot: 1,
      status: brief && t >= 61 ? "held" : "home",
      carrierTargetId: brief && t >= 61 ? 12 : null,
      pos: [100, 0, 100],
    });
    const held = t >= 60.5 && t < (brief ? 61 : 70);
    ds.flagSamples.push({
      timeSec: t,
      slot: 2,
      status: held ? "held" : brief && t >= 61 ? "field" : "home",
      carrierTargetId: held ? 5 : null,
      pos: [held ? 780 : 800, 0, 100],
    });
  }
  const memory = framing.newShotVariety();
  vi.spyOn(framing, "newShotVariety").mockImplementation(() => ({
    ...memory,
    grabViews: 1,
  }));
  vi.spyOn(predictors, "inboundAttacker").mockImplementation((view, slot) =>
    slot === 2 && view.now >= 56 && view.flagAt(slot)?.status === "home"
      ? { targetId: 9, eta: 1, speed: 100, likelihood: 1 }
      : null,
  );
  vi.spyOn(predictors, "approachEta").mockImplementation((view, slot) =>
    slot === 2 && view.now >= 56 && view.flagAt(slot)?.status === "home"
      ? 1
      : null,
  );
  vi.spyOn(variety, "pickVarietyShot").mockReturnValue(null);
  return ds;
}

function target(shot: Shot | undefined): number | null {
  return shot?.kind === "followPlayer"
    ? shot.targetId
    : shot?.kind === "dolly" && shot.subject.type === "player"
      ? shot.subject.targetId
      : null;
}

function flagSlot(shot: Shot | undefined): number | null {
  return shot?.kind === "followFlag"
    ? shot.slot
    : shot?.kind === "dolly" && shot.subject.type === "flag"
      ? shot.subject.slot
      : shot?.kind === "fixedOrbit" && shot.lookSubject?.type === "flag"
        ? shot.lookSubject.slot
        : null;
}

describe("first-person grab coverage", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([Math.PI / 2, -Math.PI / 2])(
    "only cuts into the confirmed capper's eye view when they face the stand (%s)",
    (heading) => {
      const ds = fixture(true, false);
      ds.events.find((e) => e.type === "flag-grab")!.actor = "Predicted";
      ds.flagSamples.forEach((s) => {
        if (s.slot === 2 && s.status === "held") s.carrierTargetId = 9;
      });
      for (let t = 55; t <= 61; t++) {
        ds.playerSamples.push({
          timeSec: t,
          targetId: 9,
          teamId: 1,
          heading,
          pos: [600 + (t - 55) * 25, 0, 100],
        });
      }
      const shots = runSwitcher(new CausalView(ds, 6));
      const pov = shots.find((s) => s.kind === "followPlayer" && s.firstPerson);
      if (heading < 0) {
        expect(pov).toBeUndefined();
      } else {
        expect(pov).toMatchObject({ targetId: 9, topic: "flag-stand" });
        expect(pov!.startSec).toBeLessThan(60.4);
        expect(pov!.endSec - pov!.startSec).toBeLessThanOrEqual(3.5);
      }
    },
  );
});

function fastPickupFixture(status: "home" | "field") {
  const ds = fixture(true, false);
  for (const sample of ds.flagSamples) {
    if (sample.slot !== 2) continue;
    if (sample.status === "held") {
      sample.pos = [800 - (sample.timeSec - 60.5) * 90, 0, 100];
    } else if (sample.timeSec >= 52 && sample.timeSec < 60.5) {
      sample.status = status;
    }
  }
  for (let timeSec = 55; timeSec <= 69; timeSec++) {
    ds.playerSamples.push({
      timeSec,
      targetId: 5,
      teamId: 1,
      heading: Math.PI / 2,
      pos: [800 - Math.abs(timeSec - 60.4) * 90, 0, 100],
    });
    for (let targetId = 20; targetId < 24; targetId++) {
      ds.playerSamples.push({
        timeSec,
        targetId,
        teamId: 2,
        pos: [800, targetId, 100],
      });
    }
  }
  return ds;
}

describe("fast pickups", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["home", "field"] as const)(
    "follows the known runner before a fast pickup from %s and through the exit",
    (status) => {
      const ds = fastPickupFixture(status);
      const view = new CausalView(ds, 5);
      const stream = createSwitcherStream(view);
      stream.advanceTo(64, ds);
      const at = (t: number) =>
        stream.shots.find((shot) => shot.startSec <= t && shot.endSec > t);
      const approach = at(59);
      expect(approach).toMatchObject({
        kind: "followPlayer",
        targetId: 5,
        subject: { type: "flag", slot: 2 },
      });
      expect(stream.cutFor(approach!)).toMatchObject({
        priority: "flagPlay",
      });
      expect(approach!.startSec).toBeLessThanOrEqual(56);
      expect(at(62)).toBe(approach);
      expect(reportCoverage([approach!], ds)).toContainEqual(
        expect.objectContaining({ timeSec: 60.4, covered: true }),
      );
    },
  );

  it("keeps the confirmed pickup and exit together when the other flag draws interest", () => {
    const ds = fastPickupFixture("home");
    ds.events.push({
      timeSec: 64.15,
      type: "flag-grab",
      flagTeamName: "Storm",
      description: "Storm flag was grabbed",
    });
    for (const sample of ds.flagSamples) {
      if (sample.slot === 1 && sample.timeSec >= 64.5) {
        sample.status = "held";
        sample.carrierTargetId = 12;
        sample.pos = [(sample.timeSec - 64.5) * 50, 0, 100];
      }
    }

    const shots = runSwitcher(new CausalView(ds, 4));
    const at = (timeSec: number) =>
      shots.find((shot) => shot.startSec <= timeSec && shot.endSec > timeSec);
    const approach = at(59);
    expect(approach).toMatchObject({ kind: "followPlayer", targetId: 5 });
    expect(at(60.4)).toBe(approach);
    expect(at(63)).toBe(approach);
  });
});

describe.each([0, 2])(
  "approach supersession at %s seconds lookahead",
  (lookahead) => {
    afterEach(() => vi.restoreAllMocks());
    it.each([true, false])(
      "replaces the predicted runner using available evidence (message=%s)",
      (message) => {
        const ds = fixture(message, false);
        const shots = runSwitcher(new CausalView(ds, lookahead));
        const at = (t: number) =>
          shots.find((s) => s.startSec <= t && s.endSec > t);
        expect(target(at(57))).toBe(9);
        if (message && lookahead) expect(flagSlot(at(58.5))).toBe(2);
        else expect(target(at(58.5))).toBe(9);
        expect(flagSlot(at(60.5))).toBe(2);
        const prefix = (t: number): DirectorDataset => ({
          ...ds,
          durationSec: Math.min(t, 75),
          events: ds.events.filter((e) => e.timeSec <= t),
          flagSamples: ds.flagSamples.filter((s) => s.timeSec <= t),
        });
        const view = new CausalView(prefix(lookahead), lookahead),
          stream = createSwitcherStream(view);
        for (let t = 0.5; t <= 75; t += 0.5)
          stream.advanceTo(t, prefix(t + lookahead));
        stream.finish(75);
        expect(stream.shots).toEqual(shots);
        expect(view.maxQueriedAhead).toBeLessThanOrEqual(lookahead);
      },
    );
    it("keeps the grab and immediate drop in the same view", () => {
      const ds = fixture(false, true);
      const shots = runSwitcher(new CausalView(ds, lookahead));
      const shot = shots.find((s) => s.startSec <= 60.5 && s.endSec > 60.5);
      expect(flagSlot(shot)).toBe(2);
      expect(shot?.startSec).toBe(60.5);
      expect(shot?.endSec).toBeGreaterThan(61.5);
    });
    it("keeps the correction moving with the flag when a crowd reaches the stand", () => {
      const ds = fixture(true, false);
      for (let t = 58; t <= 75; t++) {
        for (let id = 20; id < 28; id++)
          ds.playerSamples.push({
            timeSec: t,
            targetId: id,
            teamId: 2,
            pos: [800, id, 100],
          });
      }
      const shots = runSwitcher(new CausalView(ds, lookahead));
      const at = (t: number) =>
        shots.find((s) => s.startSec <= t && s.endSec > t);
      expect(target(at(57))).toBe(9);
      const correction = at(lookahead ? 58.5 : 60.5);
      expect(correction?.kind).toBe("followFlag");
      expect(flagSlot(correction)).toBe(2);
    });
    it("keeps the approach beat when the predicted player really takes the flag", () => {
      const ds = fixture(true, false);
      ds.events.find((e) => e.type === "flag-grab")!.actor = "Predicted";
      ds.flagSamples.forEach((s) => {
        if (s.slot === 2 && s.status === "held") s.carrierTargetId = 9;
      });
      const shots = runSwitcher(new CausalView(ds, lookahead));
      for (const t of [58.5, 60.5, 61.5])
        expect(target(shots.find((s) => s.startSec <= t && s.endSec > t))).toBe(
          9,
        );
    });
    it("does not treat an unresolved message identity as a contradiction", () => {
      const ds = fixture(true, false);
      ds.events.find((e) => e.type === "flag-grab")!.actor = "Unknown";
      const shots = runSwitcher(new CausalView(ds, lookahead));
      expect(
        target(shots.find((s) => s.startSec <= 58.5 && s.endSec > 58.5)),
      ).toBe(9);
      expect(
        flagSlot(shots.find((s) => s.startSec <= 60.5 && s.endSec > 60.5)),
      ).toBe(2);
    });
  },
);

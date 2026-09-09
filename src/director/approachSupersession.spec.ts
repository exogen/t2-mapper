import { afterEach, describe, expect, it, vi } from "vitest";
import { CausalView } from "./causalView";
import { createSwitcherStream, runSwitcher } from "./switcher";
import * as predictors from "./predictors";
import * as variety from "./variety";
import * as framing from "./framing";
import type { DirectorDataset, Shot } from "./types";

function fixture(message: boolean, brief: boolean): DirectorDataset {
  const ds: DirectorDataset = {
    durationSec: 75,
    flagSampleStepSec: 0.5,
    playerSampleStepSec: 1,
    gameClassName: "CTFGame",
    teams: [
      { teamId: 1, name: "Storm" },
      { teamId: 2, name: "Inferno" },
    ],
    flagStands: [
      { slot: 1, teamId: 1, name: "Storm", pos: [0, 0, 100] },
      { slot: 2, teamId: 2, name: "Inferno", pos: [800, 0, 100] },
    ],
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
    flagSamples: [],
    playerSamples: [],
    playerNames: [
      { targetId: 5, name: "actual", displayName: "Actual" },
      { targetId: 9, name: "predicted", displayName: "Predicted" },
    ],
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    scoreSamples: [],
  };
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
    it("keeps a brief confirmed carry when the flag is dropped immediately", () => {
      const ds = fixture(false, true);
      const shots = runSwitcher(new CausalView(ds, lookahead));
      const shot = shots.find((s) => s.startSec <= 60.5 && s.endSec > 60.5);
      expect(flagSlot(shot)).toBe(2);
      expect(shot?.startSec).toBe(60.5);
      expect(shot?.endSec).toBe(61.5);
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

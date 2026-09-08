import { describe, expect, it } from "vitest";
import { CausalView } from "./causalView";
import { createSwitcherStream, runSwitcher } from "./switcher";
import type {
  DirectorDataset,
  DirectorEvent,
  DirectorFlagSample,
  Shot,
} from "./types";

type Scenario =
  | "return"
  | "repeated"
  | "resolved-opponent"
  | "dropped-opponent"
  | "capture"
  | "new-carrier"
  | "unchanged"
  | "remote-exchange"
  | "no-messages";

function fixture(scenario: Scenario): DirectorDataset {
  const grabSec =
    scenario === "new-carrier" || scenario === "unchanged" ? 65 : 61;
  const event = (
    timeSec: number,
    type: DirectorEvent["type"],
    flagTeamName: string,
  ): DirectorEvent => ({
    timeSec,
    type,
    flagTeamName,
    description: `${flagTeamName} ${type}`,
  });
  const events: DirectorEvent[] = [
    { timeSec: 0, type: "match-start", description: "Match started" },
    event(55, "flag-grab", "Inferno"),
  ];
  if (scenario !== "no-messages")
    events.push(event(grabSec, "flag-grab", "Storm"));
  if (scenario === "remote-exchange")
    events.push(
      event(60, "flag-drop", "Inferno"),
      event(65, "flag-return", "Inferno"),
    );
  if (scenario === "return")
    events.push(
      event(60, "flag-drop", "Inferno"),
      event(62, "flag-grab", "Inferno"),
      event(63, "flag-drop", "Inferno"),
      event(65, "flag-return", "Inferno"),
    );
  if (scenario === "resolved-opponent")
    events.push(event(63, "flag-return", "Storm"));
  if (scenario === "capture") events.push(event(63.1, "flag-cap", "Storm"));
  if (
    ["repeated", "resolved-opponent", "dropped-opponent", "capture"].includes(
      scenario,
    )
  ) {
    for (let t = 60; t <= 80; t++)
      events.push(event(t, t % 2 ? "flag-grab" : "flag-drop", "Inferno"));
  }
  const flagSamples: DirectorFlagSample[] = [];
  for (let t = 0; t <= 90; t += 0.5) {
    const opponentHome =
      t < grabSec ||
      (scenario === "resolved-opponent" && t >= 63) ||
      (scenario === "capture" && t >= 63.5);
    flagSamples.push({
      timeSec: t,
      slot: 1,
      status: opponentHome
        ? "home"
        : scenario === "dropped-opponent" && t >= 63
          ? "field"
          : "held",
      carrierTargetId:
        opponentHome || (scenario === "dropped-opponent" && t >= 63) ? null : 9,
      pos: opponentHome
        ? [0, 0, 100]
        : [Math.min(780, (t - grabSec) * 40), 0, 100],
    });
    let status: DirectorFlagSample["status"] = t < 55 ? "home" : "held";
    if (scenario === "return" || scenario === "no-messages") {
      if (t >= 60) status = t < 62 || t >= 63 ? "field" : "held";
      if (t >= 65) status = "home";
    } else if (scenario === "remote-exchange" && t >= 60) {
      status = t >= 65 ? "home" : "field";
    } else if (
      ["repeated", "resolved-opponent", "dropped-opponent", "capture"].includes(
        scenario,
      ) &&
      t >= 60
    ) {
      status = Math.floor(t) % 2 ? "held" : "field";
    }
    flagSamples.push({
      timeSec: t,
      slot: 2,
      status,
      carrierTargetId:
        status === "held"
          ? scenario === "new-carrier" && t >= 62
            ? 6
            : 5
          : null,
      pos:
        status === "home"
          ? [800, 0, 100]
          : [
              (scenario === "remote-exchange" ? 500 : 70) - (t - 55) * 2,
              40,
              100,
            ],
    });
  }
  return {
    durationSec: 90,
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
    flagSamples,
    events,
    playerSamples: [],
    playerNames: [],
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    scoreSamples: [],
  };
}

function concerns(shot: Shot | undefined, slot: number): boolean {
  return (
    shot != null &&
    ((shot.kind === "followFlag" && shot.slot === slot) ||
      (shot.kind === "fixedOrbit" &&
        shot.lookSubject?.type === "flag" &&
        shot.lookSubject.slot === slot) ||
      (shot.kind === "dolly" &&
        shot.subject.type === "flag" &&
        shot.subject.slot === slot))
  );
}

describe.each([0, 2])(
  "possession continuity with %s seconds lookahead",
  (lookahead) => {
    it.each([
      "return",
      "repeated",
      "resolved-opponent",
      "dropped-opponent",
      "capture",
      "new-carrier",
      "unchanged",
      "remote-exchange",
      "no-messages",
    ] as const)(
      "arbitrates %s using current state and matches incremental input",
      (scenario) => {
        const ds = fixture(scenario);
        const shots = runSwitcher(new CausalView(ds, lookahead));
        const at = (t: number) =>
          shots.find((s) => s.startSec <= t && s.endSec > t);
        expect(concerns(at(59), 2)).toBe(true);
        if (scenario === "return" || scenario === "no-messages") {
          for (const t of [60, 62, 64.5])
            expect(concerns(at(t), 2), `at ${t}`).toBe(true);
          expect(concerns(at(65), 1)).toBe(true);
        } else if (scenario === "repeated") {
          // Each pickup/drop renews local interest, but never resets the maximum
          // delay counted from the first request for the competing flag.
          const deadline = Math.max(60, 61 - lookahead) + 6;
          expect(concerns(at(deadline - 0.5), 2)).toBe(true);
          expect(concerns(at(deadline), 1)).toBe(true);
          expect(concerns(at(deadline + 2), 1)).toBe(true);
        } else if (
          scenario === "resolved-opponent" ||
          scenario === "dropped-opponent"
        ) {
          for (let t = 59; t <= 72; t += 0.5)
            expect(concerns(at(t), 2), `at ${t}`).toBe(true);
        } else if (scenario === "capture") {
          const reaction = Math.ceil((63.1 - lookahead) * 2) / 2;
          if (lookahead) expect(concerns(at(reaction), 1)).toBe(true);
          expect(at(Math.max(63.1, reaction))?.topic).toBe("aftermath");
        } else if (scenario === "new-carrier") {
          expect(concerns(at(64), 2)).toBe(true);
          expect(concerns(at(lookahead ? 64.5 : 65), 1)).toBe(true);
        } else if (scenario === "remote-exchange") {
          expect(concerns(at(lookahead ? 60 : 61), 1)).toBe(true);
        } else {
          // An unchanged carry is not permanently protected from a fresh grab.
          expect(concerns(at(65 - lookahead), 1)).toBe(true);
        }
        const prefix = (through: number): DirectorDataset => ({
          ...ds,
          durationSec: Math.min(through, 90),
          events: ds.events.filter((e) => e.timeSec <= through),
          flagSamples: ds.flagSamples.filter((s) => s.timeSec <= through),
        });
        const view = new CausalView(prefix(lookahead), lookahead);
        const stream = createSwitcherStream(view);
        for (let t = 0.5; t <= 90; t += 0.5)
          stream.advanceTo(t, prefix(t + lookahead));
        stream.finish(90);
        expect(stream.shots).toEqual(shots);
        expect(view.maxQueriedAhead).toBeLessThanOrEqual(lookahead);
        for (let i = 1; i < shots.length; i++)
          expect(shots[i].startSec).toBe(shots[i - 1].endSec);
      },
    );
  },
);

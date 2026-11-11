import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../state/demoTimelineStore";
import {
  TIMELINE_ANYONE,
  TIMELINE_CATEGORIES,
  TIMELINE_RECORDER,
  involvesTimelinePlayer,
  matchesTimelineCategory,
  timelinePlayerValue,
  type TimelineCategory,
} from "./demoTimelineFilters";

const event = (fields: Partial<TimelineEvent> = {}): TimelineEvent => ({
  timeSec: 1,
  type: "kill",
  description: "An event",
  ...fields,
});

function matchesCategory(
  value: TimelineEvent,
  category: TimelineCategory,
  player: string,
  playerRawNames: Readonly<Record<string, string>> = {},
) {
  return matchesTimelineCategory(
    value,
    TIMELINE_CATEGORIES.find((item) => item.value === category)!,
    player,
    playerRawNames,
  );
}

describe("timeline player identity", () => {
  it("normalizes markup, spacing and case without colliding with special choices", () => {
    expect(timelinePlayerValue(" \x07ALICE\x08 ")).toBe("player:alice");
    expect(timelinePlayerValue("anyone")).not.toBe(TIMELINE_ANYONE);
    expect(timelinePlayerValue("recorder")).not.toBe(TIMELINE_RECORDER);
    expect(
      involvesTimelinePlayer(
        event({ killer: "anyone", victim: "recorder" }),
        timelinePlayerValue("recorder"),
      ),
    ).toBe(true);
  });

  it("uses event-time recorder flags across renames and anonymous own actions", () => {
    for (const value of [
      event({ killer: "NewName", isRecorder: true }),
      event({ victim: "NewName", victimIsRecorder: true }),
      event({ type: "flag-return", isRecorder: true }),
    ]) {
      expect(involvesTimelinePlayer(value, TIMELINE_RECORDER)).toBe(true);
    }
    const reusedName = event({ killer: "OldName", isRecorder: false });
    expect(involvesTimelinePlayer(reusedName, TIMELINE_RECORDER)).toBe(false);
    expect(
      involvesTimelinePlayer(reusedName, timelinePlayerValue("OldName")),
    ).toBe(true);
  });

  it("matches stripped event names and keeps raw display fields out of identity", () => {
    const value = event({
      killer: " Alice ",
      raw: { killer: "SomeoneElse" },
    });
    expect(involvesTimelinePlayer(value, timelinePlayerValue("ALICE"))).toBe(
      true,
    );
    expect(
      involvesTimelinePlayer(value, timelinePlayerValue("SomeoneElse")),
    ).toBe(false);
  });

  it("keeps recorder history out of another player using the same name", () => {
    const player = timelinePlayerValue("OldName");
    for (const value of [
      event({ killer: "OldName", isRecorder: true }),
      event({ victim: "OldName", victimIsRecorder: true }),
      event({ type: "death", victim: "OldName", isRecorder: true }),
      event({
        type: "rename",
        previousName: "OldName",
        actor: "NewName",
        isRecorder: true,
      }),
      event({ type: "flag-grab", actor: "OldName", isRecorder: true }),
    ]) {
      expect(involvesTimelinePlayer(value, player)).toBe(false);
      expect(
        TIMELINE_CATEGORIES.some((category) =>
          matchesTimelineCategory(value, category, player),
        ),
      ).toBe(false);
    }
    const collision = event({
      killer: "OldName",
      isRecorder: true,
      victim: "OldName",
      victimIsRecorder: false,
    });
    expect(involvesTimelinePlayer(collision, player)).toBe(true);
    expect(matchesCategory(collision, "kill", player)).toBe(false);
    expect(matchesCategory(collision, "death", player)).toBe(true);
  });

  it.each([
    ["[OLD]Alice", "\x10\x0b[OLD]\x08Alice\x11"],
    ["ALICE[NEW]", "\x10\x08ALICE\x0b[NEW]\x11"],
    ["Alice", undefined],
  ])("groups the official tag variant %s by base name", (name, rawName) => {
    expect(timelinePlayerValue(name, rawName)).toBe("player:alice");
  });

  it("preserves typed tags and different base names", () => {
    expect(timelinePlayerValue("[Typed]Alice")).toBe("player:[typed]alice");
    expect(timelinePlayerValue("Alice[Typed]")).toBe("player:alice[typed]");
    expect(timelinePlayerValue("Malice")).toBe("player:malice");
    expect(timelinePlayerValue("OnlyTag", "\x0bOnlyTag")).toBe(
      "player:onlytag",
    );
  });

  it("uses marked event names before the roster fallback and ignores inherited entries", () => {
    const value = event({
      killer: "[OLD]Alice",
      raw: { killer: "\x10\x0b[OLD]\x08Alice\x11" },
    });
    const rawNames = { "[old]alice": "\x10\x0b[OLD]\x08Bob\x11" };
    expect(
      involvesTimelinePlayer(value, timelinePlayerValue("Alice"), rawNames),
    ).toBe(true);
    expect(
      involvesTimelinePlayer(value, timelinePlayerValue("Bob"), rawNames),
    ).toBe(false);

    const inherited = Object.create({
      "[old]alice": "\x10\x0b[OLD]\x08Alice\x11",
    }) as Record<string, string>;
    expect(
      involvesTimelinePlayer(
        event({ killer: "[OLD]Alice" }),
        timelinePlayerValue("Alice"),
        inherited,
      ),
    ).toBe(false);
    expect(
      involvesTimelinePlayer(
        event({ killer: "constructor" }),
        timelinePlayerValue("constructor"),
        {},
      ),
    ).toBe(true);
  });
});

describe("timeline base-name grouping", () => {
  const prefixName = "[OLD]Alice";
  const prefixRaw = "\x10\x0b[OLD]\x08Alice\x11";
  const suffixName = "ALICE[NEW]";
  const suffixRaw = "\x10\x08ALICE\x0b[NEW]\x11";
  const alice = timelinePlayerValue("Alice");
  const rawNames = {
    "[old]alice": prefixRaw,
    "alice[new]": suffixRaw,
  };

  it.each([
    ["kill", "killer", "kill"],
    ["kill", "victim", "death"],
    ["death", "victim", "death"],
    ["flag-grab", "actor", "flag-grab"],
    ["flag-cap", "capturer", "flag-cap"],
    ["generator-offline", "actor", "gens"],
    ["generator-online", "actor", "gens"],
    ["rename", "actor", "rename"],
    ["rename", "previousName", "rename"],
  ] as const)(
    "combines %s variants from the %s field under one selection",
    (type, role, category) => {
      for (const [name, rawName] of [
        [prefixName, prefixRaw],
        [suffixName, suffixRaw],
      ]) {
        const value = event({ type, [role]: name, raw: { [role]: rawName } });
        expect(involvesTimelinePlayer(value, alice)).toBe(true);
        expect(matchesCategory(value, category, alice)).toBe(true);
        const withoutMarkup = event({ type, [role]: name });
        expect(involvesTimelinePlayer(withoutMarkup, alice, rawNames)).toBe(
          true,
        );
        expect(matchesCategory(withoutMarkup, category, alice, rawNames)).toBe(
          true,
        );
        for (const plainRaw of [name, `\x10\x08${name}\x11`]) {
          const unmarkedRaw = event({
            type,
            [role]: name,
            raw: { [role]: plainRaw },
          });
          expect(involvesTimelinePlayer(unmarkedRaw, alice, rawNames)).toBe(
            true,
          );
          expect(matchesCategory(unmarkedRaw, category, alice, rawNames)).toBe(
            true,
          );
        }
        expect(
          involvesTimelinePlayer(
            withoutMarkup,
            timelinePlayerValue("Bob"),
            rawNames,
          ),
        ).toBe(false);
      }
    },
  );

  it("uses known official markup when a combat message sends only the full label", () => {
    const name = "WarChilde-|BA-74";
    const rawNames = {
      "warchilde-|ba-74": "\x10\x08WarChilde\x0b-|BA-74\x11",
    };
    const value = event({ killer: name, raw: { killer: name } });
    const player = timelinePlayerValue("WarChilde");
    expect(involvesTimelinePlayer(value, player, rawNames)).toBe(true);
    expect(matchesCategory(value, "kill", player, rawNames)).toBe(true);
    expect(matchesCategory(value, "death", player, rawNames)).toBe(false);
  });

  it("does not strip punctuation from an unmarked event name", () => {
    const value = event({ killer: "[Typed]Alice" });
    expect(involvesTimelinePlayer(value, alice, rawNames)).toBe(false);
    expect(matchesCategory(value, "kill", alice, rawNames)).toBe(false);
    expect(
      matchesCategory(
        value,
        "kill",
        timelinePlayerValue("[Typed]Alice"),
        rawNames,
      ),
    ).toBe(true);
  });

  it("keeps recorder variants excluded from another player's base-name group", () => {
    const value = event({
      killer: prefixName,
      victim: suffixName,
      raw: { killer: prefixRaw, victim: suffixRaw },
      isRecorder: true,
      victimIsRecorder: false,
    });
    expect(involvesTimelinePlayer(value, alice, rawNames)).toBe(true);
    expect(matchesCategory(value, "kill", alice, rawNames)).toBe(false);
    expect(matchesCategory(value, "death", alice, rawNames)).toBe(true);
    expect(matchesCategory(value, "kill", TIMELINE_RECORDER, rawNames)).toBe(
      true,
    );
    expect(matchesCategory(value, "death", TIMELINE_RECORDER, rawNames)).toBe(
      false,
    );
  });
});

describe("timeline category ownership", () => {
  it("separates selected-player kills from deaths without duplicating the incident", () => {
    const alice = timelinePlayerValue("Alice");
    const bob = timelinePlayerValue("Bob");
    const value = event({ killer: "Alice", victim: "Bob" });
    expect(involvesTimelinePlayer(value, alice)).toBe(true);
    expect(involvesTimelinePlayer(value, bob)).toBe(true);
    expect(matchesCategory(value, "kill", alice)).toBe(true);
    expect(matchesCategory(value, "death", alice)).toBe(false);
    expect(matchesCategory(value, "kill", bob)).toBe(false);
    expect(matchesCategory(value, "death", bob)).toBe(true);
    expect(matchesCategory(value, "kill", TIMELINE_ANYONE)).toBe(true);
    expect(matchesCategory(value, "death", TIMELINE_ANYONE)).toBe(true);
    const selected = new Set<TimelineCategory>(["kill", "death"]);
    expect(
      [value].filter((entry) =>
        TIMELINE_CATEGORIES.some(
          (category) =>
            selected.has(category.value) &&
            matchesTimelineCategory(entry, category, bob),
        ),
      ),
    ).toEqual([value]);
  });

  it("keeps recorder kill and death ownership independent", () => {
    const killing = event({ isRecorder: true, victimIsRecorder: false });
    const dying = event({ isRecorder: false, victimIsRecorder: true });
    expect(matchesCategory(killing, "kill", TIMELINE_RECORDER)).toBe(true);
    expect(matchesCategory(killing, "death", TIMELINE_RECORDER)).toBe(false);
    expect(matchesCategory(dying, "kill", TIMELINE_RECORDER)).toBe(false);
    expect(matchesCategory(dying, "death", TIMELINE_RECORDER)).toBe(true);
  });

  it("counts standalone environmental deaths and suicides only under deaths", () => {
    const player = timelinePlayerValue("Alice");
    for (const deathMessage of ["msgsuicide", "msgcratered"]) {
      const value = event({ type: "death", victim: "Alice", deathMessage });
      expect(involvesTimelinePlayer(value, player)).toBe(true);
      expect(matchesCategory(value, "kill", player)).toBe(false);
      expect(matchesCategory(value, "death", player)).toBe(true);
      expect(matchesCategory(value, "death", timelinePlayerValue("Bob"))).toBe(
        false,
      );
    }
  });

  it.each([
    ["flag-grab", "flag-grab"],
    ["flag-drop", "flag-drop"],
    ["flag-return", "flag-return"],
    ["generator-offline", "gens"],
    ["generator-online", "gens"],
  ] as const)("filters %s by its actor", (type, category) => {
    const value = event({ type, actor: "Alice" });
    const player = timelinePlayerValue("alice");
    expect(involvesTimelinePlayer(value, player)).toBe(true);
    expect(matchesCategory(value, category, player)).toBe(true);
    expect(matchesCategory(value, category, timelinePlayerValue("Bob"))).toBe(
      false,
    );
  });

  it("uses the capturer rather than a flag team or another participant", () => {
    const value = event({
      type: "flag-cap",
      capturer: "Alice",
      flagTeamName: "Bob",
    });
    expect(
      matchesCategory(value, "flag-cap", timelinePlayerValue("Alice")),
    ).toBe(true);
    expect(involvesTimelinePlayer(value, timelinePlayerValue("Bob"))).toBe(
      false,
    );
  });

  it("finds the rename event by both its old and new names", () => {
    const value = event({
      type: "rename",
      previousName: "OldName",
      actor: "NewName",
    });
    for (const name of ["OldName", "NewName"]) {
      const player = timelinePlayerValue(name);
      expect(involvesTimelinePlayer(value, player)).toBe(true);
      expect(matchesCategory(value, "rename", player)).toBe(true);
    }
    expect(
      matchesCategory(value, "rename", timelinePlayerValue("Unrelated")),
    ).toBe(false);
  });

  it("keeps unattributed actions only when anyone is selected", () => {
    for (const [type, category] of [
      ["flag-return", "flag-return"],
      ["generator-online", "gens"],
    ] as const) {
      const value = event({ type });
      expect(involvesTimelinePlayer(value, TIMELINE_ANYONE)).toBe(true);
      expect(matchesCategory(value, category, TIMELINE_ANYONE)).toBe(true);
      for (const player of [TIMELINE_RECORDER, timelinePlayerValue("Alice")]) {
        expect(involvesTimelinePlayer(value, player)).toBe(false);
        expect(matchesCategory(value, category, player)).toBe(false);
      }
    }
  });

  it.each(["match-start", "match-countdown", "match-end"] as const)(
    "keeps %s visible for every player without counting it in a category",
    (type) => {
      const value = event({ type });
      for (const player of [
        TIMELINE_ANYONE,
        TIMELINE_RECORDER,
        timelinePlayerValue("Alice"),
      ]) {
        expect(involvesTimelinePlayer(value, player)).toBe(true);
        expect(
          TIMELINE_CATEGORIES.some((category) =>
            matchesTimelineCategory(value, category, player),
          ),
        ).toBe(false);
      }
    },
  );
});

import { expect, it } from "vitest";
import { timelinePlayerOptions } from "./demoTimelinePlayers";
import {
  involvesTimelinePlayer,
  TIMELINE_ANYONE,
  TIMELINE_RECORDER,
  timelinePlayerValue,
} from "./demoTimelineFilters";
import type { TimelineEvent } from "../state/demoTimelineStore";

it("places anyone, the named recorder, and the complete sorted roster between separators", () => {
  expect(
    timelinePlayerOptions(
      ["Zebra", "Recorder", "alice", "BOB", "ALICE"],
      [],
      "Recorder",
    ),
  ).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: TIMELINE_RECORDER, label: "Recorder" },
    { separator: true },
    { value: timelinePlayerValue("alice"), label: "alice" },
    { value: timelinePlayerValue("BOB"), label: "BOB" },
    { value: timelinePlayerValue("Zebra"), label: "Zebra" },
  ]);
});

it("uses event participants as a fallback and keeps recorder aliases out of the other players", () => {
  expect(
    timelinePlayerOptions(
      ["TAG|Recorder", "NewName"],
      [
        {
          type: "rename",
          timeSec: 1,
          description: "Rename",
          previousName: "TAG|Recorder",
          actor: "NewName",
          isRecorder: true,
        },
        {
          type: "kill",
          timeSec: 2,
          description: "Kill",
          killer: "Opponent",
          victim: "NewName",
          victimIsRecorder: true,
        },
      ],
      "\x10\bRecorder\x11",
    ),
  ).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: TIMELINE_RECORDER, label: "Recorder" },
    { separator: true },
    { value: timelinePlayerValue("Opponent"), label: "Opponent" },
  ]);
});

it("keeps a separate player using the recorder's former name selectable", () => {
  const options = timelinePlayerOptions(
    [],
    [
      {
        type: "rename",
        timeSec: 1,
        description: "Rename",
        previousName: "Old",
        actor: "New",
        isRecorder: true,
      },
      {
        type: "flag-grab",
        timeSec: 2,
        description: "Grab",
        actor: "Old",
        isRecorder: false,
      },
    ],
    "Old",
  );
  expect(options).toContainEqual({ value: TIMELINE_RECORDER, label: "Old" });
  expect(options).toContainEqual({
    value: timelinePlayerValue("Old"),
    label: "Old",
  });
  expect(options).not.toContainEqual({
    value: timelinePlayerValue("New"),
    label: "New",
  });
});

it("omits empty sections when no recorder or other names are available", () => {
  expect(timelinePlayerOptions([], [], null)).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
  ]);
  expect(timelinePlayerOptions(["Recorder"], [], "Recorder")).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: TIMELINE_RECORDER, label: "Recorder" },
  ]);
});

it("shows the recorder's full roster name even without any events", () => {
  expect(
    timelinePlayerOptions(["TAG|Recorder", "Other"], [], "Recorder", [
      "TAG|Recorder",
    ]),
  ).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: TIMELINE_RECORDER, label: "TAG|Recorder" },
    { separator: true },
    { value: timelinePlayerValue("Other"), label: "Other" },
  ]);
});

it("keeps an idle player who shares only the recorder's tagless base name", () => {
  expect(
    timelinePlayerOptions(["TAG|Recorder", "Recorder"], [], "Recorder", [
      "TAG|Recorder",
    ]),
  ).toContainEqual({
    value: timelinePlayerValue("Recorder"),
    label: "Recorder",
  });
});

it("groups official tag variants under one player and sorts by base name", () => {
  const options = timelinePlayerOptions(
    ["Z|Alice", "WarChilde-", "WarChilde-|BA-74", "WarChilde-|Other", "Bob"],
    [],
    null,
    [],
    {
      "z|alice": "\x10\x0bZ|\x08Alice\x11",
      "warchilde-|ba-74": "\x10\x08WarChilde-\x0b|BA-74\x11",
      "warchilde-|other": "\x10\x08WarChilde-\x0b|Other\x11",
    },
  );
  expect(options).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: timelinePlayerValue("Alice"), label: "Alice" },
    { value: timelinePlayerValue("Bob"), label: "Bob" },
    { value: timelinePlayerValue("WarChilde-"), label: "WarChilde-" },
  ]);
});

it("groups the recorder's tagged and tagless forms into the recorder option", () => {
  expect(
    timelinePlayerOptions(
      ["Recorder", "TAG|Recorder", "Other"],
      [],
      "Recorder",
      ["TAG|Recorder"],
      { "tag|recorder": "\x10\x0bTAG|\x08Recorder\x11" },
    ),
  ).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: TIMELINE_RECORDER, label: "Recorder" },
    { separator: true },
    { value: timelinePlayerValue("Other"), label: "Other" },
  ]);
});

it("keeps every event-time base name selectable when the same full label changes tag structure", () => {
  const name = "TAG|Alice";
  const originalRaw = "\x10\x0bTAG|\x08Alice\x11";
  const changedRaw = "\x10\x08TAG\x0b|Alice\x11";
  const events: TimelineEvent[] = [originalRaw, changedRaw].map((raw, i) => ({
    type: "kill",
    timeSec: i,
    description: "Kill",
    killer: name,
    raw: { killer: raw },
  }));
  const rawNames = { "tag|alice": originalRaw };
  const options = timelinePlayerOptions([name], events, null, [], rawNames);
  expect(options).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: timelinePlayerValue("Alice"), label: "Alice" },
    { value: timelinePlayerValue("TAG"), label: "TAG" },
  ]);
  for (const [i, baseName] of ["Alice", "TAG"].entries()) {
    const selected = options.find(
      (option) => "label" in option && option.label === baseName,
    )!;
    expect(
      "value" in selected &&
        events.filter((event) =>
          involvesTimelinePlayer(event, selected.value, rawNames),
        ),
    ).toEqual([events[i]]);
  }
});

it("uses roster tag structure for plain event names without creating a second full-name choice", () => {
  const name = "TAG|Alice";
  const rawNames = { "tag|alice": "\x10\x0bTAG|\x08Alice\x11" };
  const event: TimelineEvent = {
    type: "kill",
    timeSec: 1,
    description: "Kill",
    killer: name,
    raw: { killer: name },
  };
  expect(timelinePlayerOptions([name], [event], null, [], rawNames)).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: timelinePlayerValue("Alice"), label: "Alice" },
  ]);
  expect(
    involvesTimelinePlayer(event, timelinePlayerValue("Alice"), rawNames),
  ).toBe(true);
});

it("groups event-only tag variants even when no roster metadata is available", () => {
  const events: TimelineEvent[] = [
    {
      type: "kill",
      timeSec: 1,
      description: "Kill",
      killer: "OLD|Alice",
      raw: { killer: "\x10\x0bOLD|\x08Alice\x11" },
    },
    {
      type: "kill",
      timeSec: 2,
      description: "Kill",
      killer: "Alice|NEW",
      raw: { killer: "\x10\x08Alice\x0b|NEW\x11" },
    },
  ];
  expect(timelinePlayerOptions([], events, null)).toEqual([
    { value: TIMELINE_ANYONE, label: "anyone" },
    { separator: true },
    { value: timelinePlayerValue("Alice"), label: "Alice" },
  ]);
  expect(
    events.every((event) =>
      involvesTimelinePlayer(event, timelinePlayerValue("Alice")),
    ),
  ).toBe(true);
});

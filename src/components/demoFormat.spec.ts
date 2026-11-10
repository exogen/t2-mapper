import { expect, it } from "vitest";
import {
  demoSummary,
  demoTitle,
  formatRecordedTime,
  recordedDayLabel,
} from "./demoFormat";
import type { DemoIndexEntry } from "../stream/demoIndex";

const demo = (games: DemoIndexEntry["games"]) => ({ games }) as DemoIndexEntry;
const game = {
  mission: "UnknownMap",
  gameType: "CTF",
  startMs: 0,
  tournament: false,
};

it("keeps timezone-free retail header dates and times as recorded", () => {
  const iso = "2026-11-08T00:05:00.000Z";
  const date = new Date(iso);
  expect(formatRecordedTime(iso, "unknown")).toBe(
    date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }),
  );
  expect(recordedDayLabel(iso, "unknown")).toBe(
    date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
  expect(formatRecordedTime(iso)).toBe(
    date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  );
});

it("uses map names for demo labels and keeps saved matchup details", () => {
  const saved = demo([
    {
      ...game,
      title: "Grand Final",
      teamNames: { 2: "Dragons", 0: "Observers", 1: "Knights" },
    },
  ]);
  expect(demoTitle(saved)).toBe("UnknownMap");
  expect(demoSummary(saved)).toEqual({
    matchups: [
      [
        ["1", "Knights"],
        ["2", "Dragons"],
      ],
    ],
    matchTitle: "Grand Final",
    gameTypes: ["CTF"],
    tournament: false,
  });
});

it("omits matchups that only repeat the default team names", () => {
  const defaults = demo([
    { ...game, teamNames: { 1: "Storm", 2: "Inferno" }, tournament: true },
  ]);
  expect(demoSummary(defaults)).toMatchObject({
    matchups: [],
    tournament: true,
  });
});

it("keeps untitled and older demos readable and retains each game's labels", () => {
  expect(demoTitle(demo([game]))).toBe("UnknownMap");
  expect(demoSummary(demo([game]))).toMatchObject({
    matchups: [],
    matchTitle: "",
  });
  expect(demoTitle(demo([]))).toBe("Unknown map");
  const multi = demo([
    { ...game, title: "First", teamNames: { 1: "One", 2: "Two" } },
    {
      ...game,
      mission: "OtherMap",
      startMs: 1000,
      teamNames: { 1: "Three", 2: "Four" },
    },
  ]);
  expect(demoTitle(multi)).toBe("UnknownMap → OtherMap");
  expect(demoSummary(multi)).toMatchObject({
    matchups: [
      [
        ["1", "One"],
        ["2", "Two"],
      ],
      [
        ["1", "Three"],
        ["2", "Four"],
      ],
    ],
    matchTitle: "First",
  });
});

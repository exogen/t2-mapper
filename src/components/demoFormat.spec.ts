import { expect, it } from "vitest";
import { demoGameDetails, demoTitle } from "./demoFormat";
import type { DemoIndexEntry } from "../stream/demoIndex";

const demo = (games: DemoIndexEntry["games"]) => ({ games }) as DemoIndexEntry;
const game = {
  mission: "UnknownMap",
  gameType: "CTF",
  startMs: 0,
  tournament: false,
};

it("uses map names for demo labels and keeps saved matchup details", () => {
  const saved = demo([
    {
      ...game,
      title: "Grand Final",
      teamNames: { 2: "Dragons", 0: "Observers", 1: "Knights" },
    },
  ]);
  expect(demoTitle(saved)).toBe("UnknownMap");
  expect(demoGameDetails(saved)).toBe("Knights vs Dragons");
});

it("keeps untitled and older demos readable and retains each game's labels", () => {
  expect(demoTitle(demo([game]))).toBe("UnknownMap");
  expect(demoGameDetails(demo([game]))).toBe("");
  expect(demoTitle(demo([]))).toBe("Warmup only");
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
  expect(demoGameDetails(multi)).toBe("One vs Two → Three vs Four");
});

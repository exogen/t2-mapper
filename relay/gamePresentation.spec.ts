import { expect, it } from "vitest";
import {
  isPublishedDemoFilename,
  readGamePresentationUpdate,
} from "./gamePresentation.js";

const legacyTarget = {
  filename: "Community Final (2002).rec",
  gameIndex: 0,
  mission: "Katabatic",
  startMs: 0,
};
const presentation = {
  title: "  Final  ",
  teamNames: { 1: " Storm ", 2: "Inferno" },
};

it("accepts historical filenames and legacy game fingerprints without requiring a recent ID", () => {
  expect(isPublishedDemoFilename(legacyTarget.filename)).toBe(true);
  expect(
    readGamePresentationUpdate({
      demo: legacyTarget,
      expectedRevision: 0,
      presentation,
    }),
  ).toEqual({
    demo: legacyTarget,
    expectedRevision: 0,
    presentation: { title: "Final", teamNames: { 1: "Storm", 2: "Inferno" } },
  });
  const demo = { ...legacyTarget, gameId: "recorded-game", missionSequence: 3 };
  expect(
    readGamePresentationUpdate({ demo, expectedRevision: 7, presentation: {} }),
  ).toEqual({
    demo,
    expectedRevision: 7,
    presentation: {},
  });
});

it.each([
  "../old.rec",
  "/old.rec",
  "folder/old.rec",
  "folder\\old.rec",
  "https://attacker.example/old.rec",
  "external:old.rec",
  "old.rec\0",
  "old\n.rec",
  "old.json",
  ".rec",
  "",
])("rejects a non-published filename %j", (filename) => {
  expect(isPublishedDemoFilename(filename)).toBe(false);
  expect(
    readGamePresentationUpdate({
      demo: { ...legacyTarget, filename },
      expectedRevision: 0,
      presentation: {},
    }),
  ).toBeNull();
});

it("does not decode malformed or mixed live/demo formats as a valid save", () => {
  const valid = { demo: legacyTarget, expectedRevision: 0, presentation: {} };
  for (const input of [
    null,
    [],
    true,
    { ...valid, gameId: "live-game" },
    { ...valid, expectedRevision: -1 },
    { ...valid, expectedRevision: "0" },
    { ...valid, expectedRevision: 0.5 },
    { ...valid, demo: [] },
    { ...valid, demo: { ...legacyTarget, gameIndex: -1 } },
    {
      ...valid,
      demo: { ...legacyTarget, gameIndex: Number.MAX_SAFE_INTEGER + 1 },
    },
    { ...valid, demo: { ...legacyTarget, startMs: Infinity } },
    { ...valid, demo: { ...legacyTarget, gameId: "" } },
    { ...valid, demo: { ...legacyTarget, missionSequence: -1 } },
    {
      ...valid,
      demo: { ...legacyTarget, sourceUrl: "https://attacker.example/" },
    },
  ])
    expect(readGamePresentationUpdate(input)).toBeNull();
});

import { expect, it } from "vitest";
import type { DemoGame, DemoMetadata } from "./demoMetadata.js";
import type { DemoGameTarget } from "./gamePresentation.js";
import {
  publishedDemoRecord,
  targetDemoGame,
} from "./publishedDemoPresentation.js";

const filename = "community-final-2002.rec";
const first: DemoGame = {
  mission: "Katabatic",
  startMs: 0,
  gameType: "CTF",
  tournament: false,
};
const second: DemoGame = {
  mission: "Sanctuary",
  startMs: 600_000,
  gameType: "CTF",
  tournament: true,
  gameId: "game-two",
  missionSequence: 7,
};

function record(games: DemoGame[] = [first, second]): DemoMetadata {
  return {
    filename,
    games,
    bytes: 2048,
    recordedAt: "2002-03-01T12:00:00Z",
    server: "Historical server",
    address: "old.example:28000",
    mod: "base",
    recorder: "Old player",
    durationMs: 1_200_000,
    players: [],
  };
}

const target: DemoGameTarget = {
  filename,
  gameIndex: 1,
  mission: second.mission,
  startMs: second.startMs,
  gameId: second.gameId,
  missionSequence: second.missionSequence,
};

it("normalizes pre-games sidecars without a game ID or age restriction", () => {
  const { games: _games, ...base } = record();
  const legacy = {
    ...base,
    mission: "Katabatic",
    gameType: "CTF",
    hasCommentary: true,
    custom: { preserved: true },
  };
  const normalized = publishedDemoRecord(legacy, filename, true);
  expect(normalized).toEqual({ ...legacy, games: [first] });
  expect(
    targetDemoGame(normalized, {
      filename,
      gameIndex: 0,
      mission: "Katabatic",
      startMs: 0,
    }),
  ).toEqual(first);
});

it("preserves untouched raw game metadata for writes while sanitizing the editor's read view", () => {
  const malformed = {
    ...second,
    title: "Authored title",
    teamNames: { bad: "Malformed legacy name" },
    gameId: "x".repeat(129),
    presentationRevision: "invalid",
    custom: { untouched: true },
  };
  const source = { ...record(), games: [first, malformed], custom: "preserve" };
  const editor = publishedDemoRecord(source, filename);
  expect(editor.games[1].title).toBeUndefined();
  expect(editor.games[1].gameId).toBeUndefined();
  const writable = publishedDemoRecord(source, filename, true);
  expect(writable).toEqual(source);
  expect(writable.games[1]).toEqual(malformed);
  expect(source.games[1]).toEqual(malformed);
});

it.each([
  null,
  [],
  { ...record(), filename: "other.rec" },
  { ...record(), games: [] },
  { ...record(), games: [null, second] },
  { ...record(), games: [first, { ...second, startMs: -1 }] },
])(
  "rejects malformed records without compacting or guessing game indexes (%j)",
  (value) => {
    expect(() => publishedDemoRecord(value, filename)).toThrow();
    expect(() => publishedDemoRecord(value, filename, true)).toThrow();
  },
);

it("selects exactly the requested game in a multi-game recording", () => {
  const source = record();
  expect(targetDemoGame(source, target)).toBe(source.games[1]);
});

it.each([
  { ...target, gameIndex: -1 },
  { ...target, gameIndex: 0 },
  { ...target, gameIndex: 1.5 },
  { ...target, gameIndex: 2 },
  { ...target, mission: "Other map" },
  { ...target, startMs: 0 },
  { ...target, gameId: undefined },
  { ...target, gameId: "wrong-game" },
  { ...target, missionSequence: undefined },
  { ...target, missionSequence: 8 },
])(
  "rejects stale or incomplete identity rather than reaching another game (%j)",
  (value) => {
    expect(() => targetDemoGame(record(), value)).toThrowError(
      expect.objectContaining({ status: 409 }),
    );
  },
);

it("rejects an old ID-less target after another editor assigns the game's ID", () => {
  const source = record([{ ...first, gameId: "assigned-game" }]);
  expect(() =>
    targetDemoGame(source, {
      filename,
      gameIndex: 0,
      mission: first.mission,
      startMs: 0,
    }),
  ).toThrowError(expect.objectContaining({ status: 409 }));
});

it("refuses ambiguous legacy game fingerprints", () => {
  const source = record([first, { ...first, gameType: "Other game type" }]);
  expect(() =>
    targetDemoGame(source, {
      filename,
      gameIndex: 0,
      mission: first.mission,
      startMs: 0,
    }),
  ).toThrowError(expect.objectContaining({ status: 409 }));
});

it("refuses duplicated recorded game IDs before updating multiple index games", () => {
  const source = record([{ ...first, gameId: second.gameId }, second]);
  expect(() => targetDemoGame(source, target)).toThrowError(
    expect.objectContaining({ status: 409 }),
  );
});

import { expect, it, vi } from "vitest";
import {
  editableDemoEntry,
  editableDemoGame,
  publishedDemoFilename,
  sameEditableGame,
} from "./editableGame";

vi.mock("../stream/demoIndex", () => ({
  DEMOS_BASE_URL: "https://demos.example.com/demos",
}));

it("recognizes only supported recordings inside the configured published-demo directory", () => {
  expect(
    publishedDemoFilename("https://demos.example.com/demos/old%202002.rec"),
  ).toBe("old 2002.rec");
  const userKey = `users/126767979894407168/server_20260901T2000_katabatic_aaaaaa.rec`;
  expect(
    publishedDemoFilename(`https://demos.example.com/demos/${userKey}`),
  ).toBe(userKey);
  for (const source of [
    null,
    "https://other.example.com/demos/old.rec",
    "https://user:secret@demos.example.com/demos/old.rec",
    "https://demos.example.com/elsewhere/old.rec",
    "https://demos.example.com/demos/sources/old.rec",
    "https://demos.example.com/demos/foo%2fbar.rec",
    "https://demos.example.com/demos/old.rec?token=secret",
    "https://demos.example.com/demos/external%3Aid.rec",
  ])
    expect(publishedDemoFilename(source)).toBeNull();
});

it("keeps a recording context available before optional public metadata arrives", () => {
  expect(editableDemoGame("old.rec", [], 42).demo).toEqual({
    filename: "old.rec",
  });
});

it("identifies listed games at the displayed mission boundary, including backward seeks", () => {
  const games = [
    { mission: "Katabatic", startMs: 0, tournament: false, gameType: "CTF" },
    {
      mission: "Raindance",
      startMs: 120000,
      tournament: false,
      gameType: "CTF",
    },
  ];
  expect(editableDemoGame("multi.rec", games, 10).demo?.target?.gameIndex).toBe(
    0,
  );
  expect(
    editableDemoGame("multi.rec", games, 125).demo?.target?.gameIndex,
  ).toBe(1);
  expect(editableDemoGame("multi.rec", games, 10).demo?.target?.gameIndex).toBe(
    0,
  );
});

it("keeps historical edits recording-scoped so another listed game can be selected", () => {
  const game = {
    mission: "Katabatic",
    startMs: 0,
    tournament: false,
    gameType: "CTF",
  };
  const first = editableDemoEntry("multi.rec", game, 0);
  const second = editableDemoEntry(
    "multi.rec",
    { ...game, startMs: 10000, gameId: "new-id" },
    1,
  );
  expect(sameEditableGame(first, second)).toBe(true);
  expect(sameEditableGame(first, editableDemoEntry("other.rec", game, 0))).toBe(
    false,
  );
  expect(
    sameEditableGame(
      { id: "live-one", revision: 0, presentation: {} },
      { id: "live-two", revision: 0, presentation: {} },
    ),
  ).toBe(false);
});

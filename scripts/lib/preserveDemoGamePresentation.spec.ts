import { expect, it } from "vitest";
import type { DemoGame, DemoMetadata } from "../../relay/demoMetadata";
import { preserveDemoGamePresentation } from "./preserveDemoGamePresentation";

const game: DemoGame = {
  mission: "Katabatic",
  gameType: "CTF",
  startMs: 0,
  tournament: false,
};
const record = (games: DemoGame[], filename = "match.rec") =>
  ({ filename, games }) as DemoMetadata;
const saved: DemoGame = {
  ...game,
  gameId: "game",
  presentationRevision: 2,
  title: "Final",
  teamNames: { 1: "Storm", 2: "Dragons" },
};

it("preserves authored labels and identity while refreshing recovered protocol facts", () => {
  const analyzed = record([
    { ...game, gameType: "Capture the Flag", tournament: true },
  ]);
  expect(preserveDemoGamePresentation(analyzed, record([saved]))).toEqual(
    record([{ ...saved, gameType: "Capture the Flag", tournament: true }]),
  );
});

it("retains recording provenance and extra metadata while analyzed facts win", () => {
  const analyzed = {
    ...record([{ ...game, gameType: "Capture the Flag", tournament: true }]),
    bytes: 2000,
    server: "Current server",
    reason: "backfilled: 20 players, 1 game",
    playerCount: 20,
  };
  const original = {
    ...record([saved]),
    bytes: 1000,
    server: "Old server",
    reason: "patrol: retained tournament match",
    playerCount: 19,
    attribution: { event: "Community final" },
    extensionVersion: 1,
  };
  const merged = preserveDemoGamePresentation(analyzed, original);
  expect(merged).toEqual({
    ...original,
    ...analyzed,
    reason: original.reason,
    games: [{ ...saved, gameType: "Capture the Flag", tournament: true }],
  });
  expect(original.server).toBe("Old server");
  expect(analyzed.reason).toBe("backfilled: 20 players, 1 game");
});

it("retains extra game fields without restoring obsolete protocol fields or older labels", () => {
  const originalGame = {
    ...saved,
    missionSequence: 7,
    credit: { author: "Operator" },
    analysisHint: "old",
  };
  const analyzedGame = {
    ...game,
    gameId: saved.gameId,
    presentationRevision: 3,
    gameType: "Capture the Flag",
    analysisHint: "new",
  };
  expect(
    preserveDemoGamePresentation(record([analyzedGame]), record([originalGame]))
      .games,
  ).toEqual([
    {
      ...analyzedGame,
      credit: originalGame.credit,
    },
  ]);
});

it("preserves extensions on games without saved labels", () => {
  const original = record([{ ...game, referee: "Operator" } as DemoGame]);
  expect(preserveDemoGamePresentation(record([saved]), original).games).toEqual(
    [{ ...saved, referee: "Operator" }],
  );
});

it("upgrades legacy top-level mission fields without losing provenance or extensions", () => {
  const original = {
    filename: "match.rec",
    mission: "Katabatic",
    gameType: "CTF",
    reason: "original keep reason",
    attribution: "Community",
  } as unknown as DemoMetadata;
  const analyzed = {
    ...record([game]),
    reason: "backfilled: 2 players, 1 game",
  };
  expect(preserveDemoGamePresentation(analyzed, original)).toEqual({
    ...analyzed,
    reason: original.reason,
    attribution: "Community",
  });
});

it("uses canonical sidecar fields at equal index revisions but keeps newer indexed labels", () => {
  const current = {
    ...record([saved]),
    reason: "original keep reason",
  };
  const indexed = {
    ...record([{ ...saved, title: "Stale index title" }]),
    reason: "outdated index reason",
  };
  expect(preserveDemoGamePresentation(current, indexed, "index")).toEqual(
    current,
  );
  indexed.games[0].presentationRevision = 3;
  expect(preserveDemoGamePresentation(current, indexed, "index")).toEqual({
    ...current,
    games: indexed.games,
  });
});

it("retains explicit label clears from either authoritative source", () => {
  const cleared = { ...game, gameId: "game", presentationRevision: 3 };
  const current = record([cleared]);
  const indexed = record([{ ...cleared, title: "Stale label" }]);
  expect(preserveDemoGamePresentation(current, indexed, "index")).toEqual(
    current,
  );
  expect(preserveDemoGamePresentation(record([saved]), current)).toEqual(
    current,
  );
  const newerClear = record([{ ...cleared, presentationRevision: 4 }]);
  expect(preserveDemoGamePresentation(indexed, newerClear, "index")).toEqual(
    newerClear,
  );
});

it("matches mission sequences despite harmless path and clock differences", () => {
  const analyzed = record([
    {
      ...game,
      mission: "missions/katabatic.mis",
      missionSequence: 7,
      startMs: 1000,
    },
  ]);
  const merged = preserveDemoGamePresentation(
    analyzed,
    record([{ ...saved, missionSequence: 7 }]),
  );
  expect(merged.games[0]).toMatchObject({
    mission: "missions/katabatic.mis",
    startMs: 1000,
    gameId: "game",
    title: "Final",
    presentationRevision: 2,
  });
  expect(() =>
    preserveDemoGamePresentation(
      analyzed,
      record([{ ...saved, missionSequence: 8 }]),
    ),
  ).toThrow("Cannot uniquely match saved game details");
});

it("keeps repeated maps distinct when an old sidecar has no mission sequences", () => {
  const analyzed = record([game, { ...game, startMs: 90_000 }]);
  const merged = preserveDemoGamePresentation(
    analyzed,
    record([
      saved,
      { ...saved, gameId: "rematch", title: "Rematch", startMs: 90_000 },
    ]),
  );
  expect(merged.games.map(({ gameId, title }) => [gameId, title])).toEqual([
    ["game", "Final"],
    ["rematch", "Rematch"],
  ]);
});

it.each(["mission sequence", "game ID"])(
  "refuses to assign one saved game's labels to multiple analyzed games matched by %s",
  (identity) => {
    const analyzedGame = {
      ...game,
      missionSequence: 7,
      ...(identity === "game ID" && { gameId: "game" }),
    };
    const analyzed = record([
      analyzedGame,
      { ...analyzedGame, startMs: 90_000 },
    ]);
    const original = record([{ ...saved, missionSequence: 7 }]);

    expect(() => preserveDemoGamePresentation(analyzed, original)).toThrow(
      "Cannot uniquely match saved game details",
    );
    expect(analyzed.games).toEqual([
      analyzedGame,
      { ...analyzedGame, startMs: 90_000 },
    ]);
    expect(original.games).toEqual([{ ...saved, missionSequence: 7 }]);
  },
);

it("honors newer revisions, including explicit removal of all saved labels", () => {
  const current = record([saved]);
  const cleared = { ...game, gameId: "game", presentationRevision: 3 };
  expect(preserveDemoGamePresentation(current, record([cleared]))).toEqual(
    record([cleared]),
  );
  expect(preserveDemoGamePresentation(record([cleared]), current)).toEqual(
    record([cleared]),
  );
});

it("does not copy across files and refuses to discard unmatched or ambiguous saved labels", () => {
  const analyzed = record([game]);
  expect(
    preserveDemoGamePresentation(analyzed, record([saved], "other.rec")),
  ).toBe(analyzed);
  expect(() =>
    preserveDemoGamePresentation(
      record([{ ...game, gameId: "other" }]),
      record([saved]),
    ),
  ).toThrow("Cannot uniquely match");
  expect(() =>
    preserveDemoGamePresentation(
      analyzed,
      record([saved, { ...saved, gameId: "other" }]),
    ),
  ).toThrow("Cannot uniquely match");
  expect(() =>
    preserveDemoGamePresentation(record([]), record([saved])),
  ).toThrow("Cannot uniquely match");
});

it("refuses to discard or ambiguously assign extra authored game fields", () => {
  const original = record([
    { ...game, missionSequence: 7, referee: "Operator" } as DemoGame,
  ]);
  expect(() => preserveDemoGamePresentation(record([]), original)).toThrow(
    "Cannot uniquely match",
  );
  expect(() =>
    preserveDemoGamePresentation(
      record([
        { ...game, missionSequence: 7 },
        { ...game, missionSequence: 7, startMs: 90_000 },
      ]),
      original,
    ),
  ).toThrow("Cannot uniquely match");
});

it("leaves ordinary and pre-games metadata usable", () => {
  const analyzed = record([saved]);
  expect(preserveDemoGamePresentation(analyzed, record([game]))).toEqual(
    analyzed,
  );
  expect(preserveDemoGamePresentation(analyzed)).toBe(analyzed);
  expect(
    preserveDemoGamePresentation(analyzed, {
      filename: "match.rec",
    } as DemoMetadata),
  ).toEqual(analyzed);
});

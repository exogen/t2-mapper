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

it("preserves an existing sidecar's exact timestamp instead of the recording header's minute precision", () => {
  const analyzed = {
    ...record([game]),
    recordedAt: "2026-10-13T05:20:00.000Z",
  };
  const original = {
    ...record([game]),
    recordedAt: "2026-10-13T05:20:01.237Z",
  };
  expect(preserveDemoGamePresentation(analyzed, original).recordedAt).toBe(
    original.recordedAt,
  );
});

it("uses the recording timestamp only when there is no previous sidecar", () => {
  const analyzed = {
    ...record([game]),
    recordedAt: "2026-10-13T05:20:00.000Z",
  };
  expect(preserveDemoGamePresentation(analyzed).recordedAt).toBe(
    analyzed.recordedAt,
  );
  for (const recordedAt of [undefined, "", "unrecognized timestamp"]) {
    const original = { ...record([game]), recordedAt } as DemoMetadata;
    expect(preserveDemoGamePresentation(analyzed, original).recordedAt).toBe(
      recordedAt,
    );
  }
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
    recordedAt: "2026-10-13T05:20:01.237Z",
  } as unknown as DemoMetadata;
  const analyzed = {
    ...record([game]),
    reason: "backfilled: 2 players, 1 game",
    recordedAt: "2026-10-13T05:20:00.000Z",
  };
  expect(preserveDemoGamePresentation(analyzed, original)).toEqual({
    ...analyzed,
    reason: original.reason,
    attribution: "Community",
    recordedAt: original.recordedAt,
  });
});

it("uses canonical sidecar fields at equal index revisions but keeps newer indexed labels", () => {
  const current = {
    ...record([saved]),
    reason: "original keep reason",
    recordedAt: "2026-10-13T05:20:01.237Z",
  };
  const indexed = {
    ...record([{ ...saved, title: "Stale index title" }]),
    reason: "outdated index reason",
    recordedAt: "2026-10-13T05:20:00.000Z",
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

const uploadIdentity = {
  discordHandleAtUploadTime: "original_handle",
  discordDisplayNameAtUploadTime: "Original Display Name",
};

it("keeps upload-time identity snapshots when fresh analysis contains different names", () => {
  const original = { ...record([game]), ...uploadIdentity };
  const analyzed = {
    ...record([game]),
    discordHandleAtUploadTime: "current_handle",
    discordDisplayNameAtUploadTime: "Current Display Name",
  };
  expect(preserveDemoGamePresentation(analyzed, original)).toMatchObject(
    uploadIdentity,
  );
  expect(original).toMatchObject(uploadIdentity);
  expect(analyzed.discordHandleAtUploadTime).toBe("current_handle");
});

it("does not discard saved upload snapshots when analyzed optional fields are undefined", () => {
  const analyzed = {
    ...record([game]),
    discordHandleAtUploadTime: undefined,
    discordDisplayNameAtUploadTime: undefined,
  };
  expect(
    preserveDemoGamePresentation(analyzed, {
      ...record([game]),
      ...uploadIdentity,
    }),
  ).toMatchObject(uploadIdentity);
});

it("prefers canonical upload snapshots over a conflicting index copy", () => {
  const current = { ...record([game]), ...uploadIdentity };
  const index = {
    ...record([game]),
    discordHandleAtUploadTime: "different_handle",
    discordDisplayNameAtUploadTime: "Different Display Name",
  };
  expect(preserveDemoGamePresentation(current, index, "index")).toMatchObject(
    uploadIdentity,
  );
});

it("can recover historical snapshot fields present only in an existing index record", () => {
  expect(
    preserveDemoGamePresentation(
      record([game]),
      { ...record([game]), ...uploadIdentity },
      "index",
    ),
  ).toMatchObject(uploadIdentity);
});

it("does not invent Discord attribution for legacy recordings", () => {
  const merged = preserveDemoGamePresentation(record([game]), record([game]));
  expect(merged).not.toHaveProperty("discordHandleAtUploadTime");
  expect(merged).not.toHaveProperty("discordDisplayNameAtUploadTime");
});

it("does not copy snapshots between owners whose recordings share a basename", () => {
  const basename = "server_20260901T2000_katabatic_aaaaaa.rec";
  const analyzed = record([game], `users/123456789012345678/${basename}`);
  const other = {
    ...record([game], `users/223456789012345678/${basename}`),
    ...uploadIdentity,
  };
  expect(preserveDemoGamePresentation(analyzed, other)).toBe(analyzed);
  expect(analyzed).not.toHaveProperty("discordHandleAtUploadTime");
});

it("does not copy malformed snapshot values from saved JSON metadata", () => {
  const original = JSON.parse(
    JSON.stringify({
      ...record([game]),
      discordHandleAtUploadTime: { current: "not a string" },
      discordDisplayNameAtUploadTime: 123,
    }),
  ) as DemoMetadata;
  const merged = preserveDemoGamePresentation(record([game]), original);
  expect(merged).not.toHaveProperty("discordHandleAtUploadTime");
  expect(merged).not.toHaveProperty("discordDisplayNameAtUploadTime");
});

it("recovers valid historical fields when a preferred copy has malformed values", () => {
  const current = JSON.parse(
    JSON.stringify({
      ...record([game]),
      discordHandleAtUploadTime: false,
      discordDisplayNameAtUploadTime: [],
    }),
  ) as DemoMetadata;
  expect(
    preserveDemoGamePresentation(
      current,
      { ...record([game]), ...uploadIdentity },
      "index",
    ),
  ).toMatchObject(uploadIdentity);
});

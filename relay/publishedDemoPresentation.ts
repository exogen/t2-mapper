import {
  type DemoGame,
  type DemoMetadata,
  readDemoGames,
} from "./demoMetadata.js";

import {
  GamePresentationError,
  type DemoGameTarget,
} from "./gamePresentation.js";

/** Upgrade old single-game records while retaining unrelated authored fields. */
export function publishedDemoRecord(
  value: unknown,
  filename: string,
  forWrite = false,
): DemoMetadata {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as DemoMetadata).filename !== filename
  )
    throw new Error(`Invalid demo metadata: ${filename}`);
  const record = value as DemoMetadata;
  const games = readDemoGames(value);
  if (
    !games.length ||
    (Array.isArray(record.games) && games.length !== record.games.length)
  )
    throw new Error(`Invalid demo game metadata: ${filename}`);
  if (forWrite) return { ...record, games: record.games ?? games };
  return {
    ...record,
    games: games.map((game, index) => {
      const original = record.games?.[index];
      if (!original) return game;
      const {
        title: _title,
        teamNames: _names,
        gameId: _id,
        presentationRevision: _revision,
        ...fields
      } = original;
      return { ...fields, ...game };
    }),
  };
}

export function sameDemoGame(
  a: Pick<DemoGame, "mission" | "startMs" | "missionSequence">,
  b: Pick<DemoGame, "mission" | "startMs" | "missionSequence">,
): boolean {
  return (
    a.mission === b.mission &&
    a.startMs === b.startMs &&
    a.missionSequence === b.missionSequence
  );
}

/** The displayed index and identity must still describe the exact same game. */
export function targetDemoGame(
  record: DemoMetadata,
  target: DemoGameTarget,
): DemoGame {
  const game = record.games[target.gameIndex];
  if (
    !Number.isSafeInteger(target.gameIndex) ||
    target.gameIndex < 0 ||
    !game ||
    game.mission !== target.mission ||
    game.startMs !== target.startMs ||
    game.gameId !== target.gameId ||
    game.missionSequence !== target.missionSequence
  )
    throw new GamePresentationError(
      409,
      "This demo's games changed. Close and reopen the editor.",
    );
  if (
    !game.gameId &&
    record.games.filter((candidate) => sameDemoGame(candidate, game)).length !==
      1
  )
    throw new GamePresentationError(
      409,
      "This demo's games cannot be identified uniquely.",
    );
  if (
    game.gameId &&
    record.games.filter((candidate) => candidate.gameId === game.gameId)
      .length !== 1
  )
    throw new GamePresentationError(
      409,
      "This demo's games cannot be identified uniquely.",
    );
  return game;
}

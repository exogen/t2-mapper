import type { DemoGame, DemoMetadata } from "../../relay/demoMetadata.js";

function missionKey(mission: string): string {
  return mission
    .replaceAll("\\", "/")
    .split("/")
    .pop()!
    .replace(/\.mis$/i, "")
    .toLowerCase();
}

function sameGame(game: DemoGame, saved: DemoGame): boolean {
  if (game.gameId && saved.gameId) return game.gameId === saved.gameId;
  if (
    typeof saved?.mission !== "string" ||
    missionKey(game.mission) !== missionKey(saved.mission)
  )
    return false;
  return game.missionSequence !== undefined &&
    saved.missionSequence !== undefined
    ? game.missionSequence === saved.missionSequence
    : game.startMs === saved.startMs;
}

function hasSavedDetails(game: DemoGame): boolean {
  return (
    game.gameId !== undefined ||
    game.presentationRevision !== undefined ||
    game.title !== undefined ||
    game.teamNames !== undefined
  );
}

const GAME_FIELDS = new Set([
  "mission",
  "missionSequence",
  "gameType",
  "startMs",
  "tournament",
  "gameId",
  "presentationRevision",
  "title",
  "teamNames",
]);

function extraGameFields(game: DemoGame): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(game).filter(([key]) => !GAME_FIELDS.has(key)),
  );
}

function hasAuthoredFields(game: DemoGame): boolean {
  return hasSavedDetails(game) || Object.keys(extraGameFields(game)).length > 0;
}

/** Analysis recovers protocol facts, but not authored fields or recording provenance. */
export function preserveDemoGamePresentation(
  record: DemoMetadata,
  saved?: DemoMetadata,
  savedSource: "sidecar" | "index" = "sidecar",
): DemoMetadata {
  if (!saved || saved.filename !== record.filename) return record;
  const savedGames = Array.isArray(saved.games) ? saved.games : [];
  const matched = new Set<DemoGame>();
  const games = record.games.map((game) => {
    const matches = savedGames.filter(
      (candidate) => candidate && sameGame(game, candidate),
    );
    if (matches.length !== 1) return game;
    const source = matches[0];
    if (matched.has(source) && hasAuthoredFields(source))
      throw new Error(
        `Cannot uniquely match saved game details in ${record.filename}; reconcile its game metadata before rewriting`,
      );
    matched.add(source);
    const merged = { ...extraGameFields(source), ...game };
    const savedRevision = source.presentationRevision ?? 0;
    const currentRevision = game.presentationRevision ?? 0;
    if (
      savedRevision < currentRevision ||
      (savedSource === "index" && savedRevision === currentRevision) ||
      !hasSavedDetails(source)
    )
      return merged;
    // Omitting a label at a newer revision is an intentional removal.
    const {
      gameId: _id,
      presentationRevision: _revision,
      title: _title,
      teamNames: _names,
      ...protocol
    } = merged;
    return {
      ...protocol,
      ...(source.gameId !== undefined && { gameId: source.gameId }),
      ...(source.presentationRevision !== undefined && {
        presentationRevision: source.presentationRevision,
      }),
      ...(source.title !== undefined && { title: source.title }),
      ...(source.teamNames !== undefined && { teamNames: source.teamNames }),
    };
  });
  if (
    savedGames.some(
      (game) => game && hasAuthoredFields(game) && !matched.has(game),
    )
  )
    throw new Error(
      `Cannot uniquely match saved game details in ${record.filename}; reconcile its game metadata before rewriting`,
    );
  // Old sidecars used top-level mission fields before the games array existed.
  const {
    mission: _mission,
    gameType: _gameType,
    ...metadata
  } = { ...saved, ...record, games } as DemoMetadata & {
    mission?: unknown;
    gameType?: unknown;
  };
  const reason =
    savedSource === "sidecar"
      ? (saved.reason ?? record.reason)
      : (record.reason ?? saved.reason);
  return { ...metadata, ...(reason !== undefined && { reason }) };
}

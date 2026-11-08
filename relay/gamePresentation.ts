/** Public, per-game labels, separate from protocol names and personal overrides. */
export interface GamePresentation {
  title?: string;
  teamNames?: Record<number, string>;
}

export interface PublishedGame {
  id: string;
  revision: number;
  presentation: GamePresentation;
}

export interface LiveGamePresentationUpdate {
  gameId: string;
  expectedRevision: number;
  presentation: GamePresentation;
}

/** Identity from the sidecar, checked again before editing an indexed game. */
export interface DemoGameTarget {
  filename: string;
  gameIndex: number;
  mission: string;
  startMs: number;
  gameId?: string;
  missionSequence?: number;
}

export interface DemoGamePresentationUpdate {
  demo: DemoGameTarget;
  expectedRevision: number;
  presentation: GamePresentation;
}

export type GamePresentationUpdate =
  LiveGamePresentationUpdate | DemoGamePresentationUpdate;

/** A bucket filename, never a URL, path, or qualified external-source reference. */
export function isPublishedDemoFilename(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 4 &&
    value.length <= 512 &&
    /\.rec$/i.test(value) &&
    !/[/\\:\u0000-\u001f\u007f]/.test(value)
  );
}

export const MAX_GAME_TITLE_LENGTH = 128;
export const MAX_TEAM_NAME_LENGTH = 64;
export const GAME_PRESENTATION_PATH = "/api/admin/game-presentation";

export class GamePresentationError extends Error {
  readonly status: 404 | 409 | 503;
  constructor(status: 404 | 409 | 503, message: string) {
    super(message);
    this.status = status;
  }
}

export function readGamePresentationUpdate(
  value: unknown,
): GamePresentationUpdate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const presentation = readGamePresentation(input.presentation);
  if (
    !presentation ||
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0
  )
    return null;
  const expectedRevision = input.expectedRevision as number;
  if ("gameId" in input) {
    return typeof input.gameId === "string" &&
      input.gameId.length > 0 &&
      input.gameId.length <= 128 &&
      Object.keys(input).every((key) =>
        ["gameId", "expectedRevision", "presentation"].includes(key),
      )
      ? { gameId: input.gameId, expectedRevision, presentation }
      : null;
  }
  if (
    !input.demo ||
    typeof input.demo !== "object" ||
    Array.isArray(input.demo) ||
    Object.keys(input).some(
      (key) => !["demo", "expectedRevision", "presentation"].includes(key),
    )
  )
    return null;
  const target = input.demo as Record<string, unknown>;
  if (
    !isPublishedDemoFilename(target.filename) ||
    !Number.isSafeInteger(target.gameIndex) ||
    Number(target.gameIndex) < 0 ||
    typeof target.mission !== "string" ||
    target.mission.length > 512 ||
    typeof target.startMs !== "number" ||
    !Number.isFinite(target.startMs) ||
    target.startMs < 0 ||
    (target.gameId !== undefined &&
      (typeof target.gameId !== "string" ||
        !target.gameId ||
        target.gameId.length > 128)) ||
    (target.missionSequence !== undefined &&
      (!Number.isSafeInteger(target.missionSequence) ||
        Number(target.missionSequence) < 0)) ||
    Object.keys(target).some(
      (key) =>
        ![
          "filename",
          "gameIndex",
          "mission",
          "startMs",
          "gameId",
          "missionSequence",
        ].includes(key),
    )
  )
    return null;
  return {
    demo: {
      filename: target.filename,
      gameIndex: target.gameIndex as number,
      mission: target.mission,
      startMs: target.startMs,
      ...(target.gameId !== undefined && { gameId: target.gameId as string }),
      ...(target.missionSequence !== undefined && {
        missionSequence: target.missionSequence as number,
      }),
    },
    expectedRevision,
    presentation,
  };
}

/** Validate external JSON; blank fields remove a saved label. */
export function readGamePresentation(value: unknown): GamePresentation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "title" && key !== "teamNames"))
    return null;
  const clean = (text: unknown, limit: number): string | null =>
    typeof text === "string" &&
    text.length <= limit &&
    !/[\u0000-\u001f\u007f]/.test(text)
      ? text.trim()
      : null;
  const result: GamePresentation = {};
  if (input.title !== undefined) {
    const title = clean(input.title, MAX_GAME_TITLE_LENGTH);
    if (title === null) return null;
    if (title) result.title = title;
  }
  if (input.teamNames !== undefined) {
    if (
      !input.teamNames ||
      typeof input.teamNames !== "object" ||
      Array.isArray(input.teamNames)
    )
      return null;
    const entries = Object.entries(input.teamNames);
    if (entries.length > 32) return null;
    const names: Record<number, string> = {};
    for (const [id, value] of entries) {
      const name = clean(value, MAX_TEAM_NAME_LENGTH);
      if (
        !/^(0|[1-9]\d*)$/.test(id) ||
        !Number.isSafeInteger(Number(id)) ||
        name === null
      )
        return null;
      if (name) names[Number(id)] = name;
    }
    if (Object.keys(names).length) result.teamNames = names;
  }
  return result;
}

export function readPublishedGame(value: unknown): PublishedGame | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const game = value as PublishedGame;
  if (
    typeof game.id !== "string" ||
    !game.id ||
    game.id.length > 128 ||
    !Number.isSafeInteger(game.revision) ||
    game.revision < 0
  )
    return null;
  const presentation = readGamePresentation(game.presentation);
  return presentation
    ? { id: game.id, revision: game.revision, presentation }
    : null;
}

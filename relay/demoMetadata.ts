import {
  readGamePresentation,
  type GamePresentation,
  type PublishedGame,
} from "./gamePresentation.js";

/**
 * One match within a demo. Only missions whose match actually started
 * are listed — warmup-only tails (e.g. a recording ending moments into
 * the next rotation) are excluded.
 */
export interface DemoGame extends GamePresentation {
  /** Relay-generated identity shared with the live watch session. */
  gameId?: string;
  presentationRevision?: number;
  mission: string;
  /** Server mission counter; group with address + mission, not globally unique.
   *  Absent when the recording never observed the mission handshake. */
  missionSequence?: number;
  gameType: string;
  /**
   * Offset into the demo on the move-tick clock.
   */
  startMs: number;
  /** This mission ran in tournament mode. A demo can mix tournament and
   *  non-tournament missions, so it's per-game, not per-demo. */
  tournament: boolean;
}

/**
 * Sidecar record written next to each kept `.rec` — also the exact
 * per-demo record shape in the R2 `index.json` aggregation.
 */
export interface DemoMetadata {
  filename: string;
  bytes: number;
  recordedAt: string;
  server: string;
  address: string;
  /**
   * In demo order. A demo is one connection, so `server`/`address` are
   * constant, but multi-mission demos (imports; future in-place cycle
   * recording) list each started match here.
   */
  games: DemoGame[];
  mod: string;
  recorder: string;
  durationMs: number;
  /**
   * Unique names observed at any point, observers included. A player can
   * have several aliases; this is the search list, not the player count.
   */
  players: string[];
  /** Unique tag-less names seen, excluding the recorder. Missing on legacy
   *  or salvaged records whose roster has not been analyzed yet. */
  playerCount?: number;
  /**
   * Why this recording was kept — the trigger (patrol pin / watchers)
   * plus the keep-gate facts (peak players, match started). For debugging
   * why a demo exists at all.
   */
  reason?: string;
  /**
   * A `.commentary.m4a` (or legacy `.mp3`) sidecar exists for this demo. Maintained by
   * the CastGenius repo's upload script and reconciled by
   * backfill-demo-index from the bucket listing; drives the demo
   * browser's indicator.
   */
  hasCommentary?: boolean;
}

/** Select the latest mission whose ready boundary has been reached. */
export function demoGameIndexAt(
  games: readonly Pick<DemoGame, "startMs">[],
  missionReadyMs: number,
): number {
  let selected = -1;
  for (let index = 0; index < games.length; index++) {
    if (
      games[index].startMs <= missionReadyMs &&
      (selected < 0 || games[index].startMs > games[selected].startMs)
    )
      selected = index;
  }
  return selected;
}

/** Select the displayed mission and give legacy labels a recording-scoped ID. */
export function publishedGameAt(
  games: readonly DemoGame[],
  missionReadyMs: number,
  fallbackId: (game: DemoGame) => string,
): PublishedGame | null {
  const game = games[demoGameIndexAt(games, missionReadyMs)];
  return game && (game.title || game.teamNames)
    ? {
        id: game.gameId ?? fallbackId(game),
        revision: game.presentationRevision ?? 0,
        presentation: {
          ...(game.title && { title: game.title }),
          ...(game.teamNames && { teamNames: structuredClone(game.teamNames) }),
        },
      }
    : null;
}

/**
 * Tolerate records written by older relay versions: pre-`games` entries
 * carried top-level {mission, gameType} instead (such demos always
 * described a single started match). Validate optional labels without dropping
 * a valid boundary when its labels are malformed.
 */
export function readDemoGames(raw: unknown): DemoGame[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const entry = raw as Record<string, unknown>;
  if (!Array.isArray(entry.games)) {
    return typeof entry.mission === "string"
      ? [
          {
            mission: entry.mission,
            gameType: typeof entry.gameType === "string" ? entry.gameType : "",
            startMs: 0,
            tournament: false,
          },
        ]
      : [];
  }
  return entry.games.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const game = value as Record<string, unknown>;
    if (
      typeof game.mission !== "string" ||
      typeof game.startMs !== "number" ||
      !Number.isFinite(game.startMs) ||
      game.startMs < 0
    )
      return [];
    const presentation =
      readGamePresentation({ title: game.title, teamNames: game.teamNames }) ??
      {};
    return [
      {
        mission: game.mission,
        gameType: typeof game.gameType === "string" ? game.gameType : "",
        startMs: game.startMs,
        tournament: game.tournament === true,
        ...(typeof game.missionSequence === "number" &&
          Number.isSafeInteger(game.missionSequence) &&
          game.missionSequence >= 0 && {
            missionSequence: game.missionSequence,
          }),
        ...(typeof game.gameId === "string" &&
          game.gameId.length > 0 &&
          game.gameId.length <= 128 && { gameId: game.gameId }),
        ...(typeof game.presentationRevision === "number" &&
          Number.isSafeInteger(game.presentationRevision) &&
          game.presentationRevision >= 0 && {
            presentationRevision: game.presentationRevision,
          }),
        ...presentation,
      },
    ];
  });
}

/** Replace saved labels, including clearing them, without changing protocol data. */
export function withGamePresentation(
  game: DemoGame,
  saved: PublishedGame,
): DemoGame {
  const { title: _title, teamNames: _teamNames, ...rest } = game;
  return {
    ...rest,
    gameId: saved.id,
    presentationRevision: saved.revision,
    ...saved.presentation,
  };
}

import { demoGameIndexAt, type DemoGame } from "../../relay/demoMetadata";
import {
  isPublishedDemoFilename,
  type DemoGameTarget,
  type PublishedGame,
} from "../../relay/gamePresentation";
import { DEMOS_BASE_URL } from "../stream/demoIndex";

export interface EditableGame extends PublishedGame {
  /** The loaded recording; a target is resolved from fresh metadata before saving. */
  demo?: { filename: string; target?: DemoGameTarget };
}

/** Only filenames directly under our configured published-demo directory are editable. */
export function publishedDemoFilename(sourceUrl: string | null): string | null {
  if (!sourceUrl || !DEMOS_BASE_URL) return null;
  try {
    const origin =
      typeof location === "undefined" ? "http://localhost/" : location.href;
    const base = new URL(`${DEMOS_BASE_URL}/`, origin);
    const source = new URL(sourceUrl, origin);
    if (
      source.origin !== base.origin ||
      source.username ||
      source.password ||
      source.search ||
      source.hash ||
      !source.pathname.startsWith(base.pathname)
    )
      return null;
    const filename = decodeURIComponent(
      source.pathname.slice(base.pathname.length),
    );
    return isPublishedDemoFilename(filename) ? filename : null;
  } catch {
    return null;
  }
}

export function editableDemoGame(
  filename: string,
  games: readonly DemoGame[],
  missionReadySec: number,
): EditableGame {
  const gameIndex = demoGameIndexAt(games, missionReadySec * 1000);
  if (gameIndex < 0)
    return {
      id: `demo:${filename}`,
      revision: 0,
      presentation: {},
      demo: { filename },
    };
  return editableDemoEntry(filename, games[gameIndex], gameIndex);
}

export function editableDemoEntry(
  filename: string,
  game: DemoGame,
  gameIndex: number,
): EditableGame {
  return {
    id:
      game.gameId ??
      `demo:${JSON.stringify([filename, gameIndex, game.startMs])}`,
    revision: game.presentationRevision ?? 0,
    presentation: {
      ...(game.title && { title: game.title }),
      ...(game.teamNames && { teamNames: game.teamNames }),
    },
    demo: {
      filename,
      target: {
        filename,
        gameIndex,
        mission: game.mission,
        startMs: game.startMs,
        ...(game.gameId && { gameId: game.gameId }),
        ...(game.missionSequence !== undefined && {
          missionSequence: game.missionSequence,
        }),
      },
    },
  };
}

export function sameEditableGame(
  left: EditableGame | null,
  right: EditableGame,
): boolean {
  if (!left) return false;
  if (!left.demo || !right.demo)
    return !left.demo && !right.demo && left.id === right.id;
  return left.demo.filename === right.demo.filename;
}

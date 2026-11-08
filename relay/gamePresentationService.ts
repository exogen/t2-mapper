import type { DemoCoordinator } from "./demoCoordinator.js";
import type { WatchSessionManager } from "./watchSession.js";
import type { DemoUploader } from "./demoUpload.js";
import {
  GamePresentationError,
  type GamePresentationUpdate,
  type PublishedGame,
} from "./gamePresentation.js";

/** Serialize each game's read/check/save/push, including saves racing a map cycle. */
export function createGamePresentationUpdater(
  sessions: Pick<WatchSessionManager, "getGameTarget" | "updateGame">,
  recordings: Pick<DemoCoordinator, "saveGamePresentation">,
  demos?: Pick<DemoUploader, "savePublishedGamePresentation">,
): (update: GamePresentationUpdate) => Promise<PublishedGame> {
  const pending = new Map<string, Promise<PublishedGame>>();
  return async (update) => {
    const key =
      "gameId" in update
        ? update.gameId
        : (update.demo.gameId ??
          `demo:${JSON.stringify([update.demo.filename, update.demo.gameIndex])}`);
    const previous = pending.get(key);
    const save = (previous?.catch(() => {}) ?? Promise.resolve()).then(
      async () => {
        if ("demo" in update) {
          if (!demos)
            throw new GamePresentationError(
              503,
              "Editing demo details is unavailable",
            );
          const game = await demos.savePublishedGamePresentation(
            update.demo,
            update.expectedRevision,
            update.presentation,
          );
          sessions.updateGame(game);
          return game;
        }
        const target = sessions.getGameTarget(update.gameId);
        if (!target)
          throw new GamePresentationError(
            404,
            "This game is no longer available to edit",
          );
        if (target.game.revision !== update.expectedRevision)
          throw new GamePresentationError(
            409,
            "Game details changed. Close and reopen the editor to get the latest version.",
          );
        const game: PublishedGame = {
          id: target.game.id,
          revision: target.game.revision + 1,
          presentation: update.presentation,
        };
        if (target.recorder)
          await recordings.saveGamePresentation(target.recorder, game);
        // The viewer may have disconnected while its already-authorized save
        // reached disk. Keep that successful save even if nobody remains to push to.
        sessions.updateGame(game);
        return game;
      },
    );
    pending.set(key, save);
    try {
      return await save;
    } finally {
      if (pending.get(key) === save) pending.delete(key);
    }
  };
}

import type { StreamRecording } from "../stream/types";
import { casterStore } from "./casterStore";
import { randomId } from "../randomId";
import { type DemoGame, publishedGameAt } from "../../relay/demoMetadata";
import type { PublishedGame } from "../../relay/gamePresentation";

const NO_GAMES: readonly DemoGame[] = [];

const scopes = new WeakMap<
  StreamRecording,
  {
    id: string;
    missionReadySec: number;
    server: string;
    games: readonly DemoGame[];
    publishedGame: PublishedGame | null;
  }
>();

/** A demo's client-ready time distinguishes missions, including repeat maps. */
export function syncDemoCaster(
  recording: StreamRecording,
  missionReadySec: number,
  sourceUrl: string | null,
  games: readonly DemoGame[] = NO_GAMES,
): void {
  if (recording.source !== "demo") return;
  let scope = scopes.get(recording);
  if (
    !scope ||
    scope.missionReadySec !== missionReadySec ||
    scope.games !== games
  ) {
    const id = scope?.id ?? sourceUrl ?? randomId();
    scope = {
      id,
      missionReadySec,
      server: `demo:${JSON.stringify([id, missionReadySec])}`,
      games,
      publishedGame: publishedGameAt(
        games,
        missionReadySec * 1000,
        (game) => `demo:${JSON.stringify([id, game.startMs])}`,
      ),
    };
    scopes.set(recording, scope);
  }
  const state = casterStore.getState();
  if (state.context?.server !== scope.server) {
    state.activate(scope.server, "demo", "");
  }
  state.setPublishedGame(scope.publishedGame);
}

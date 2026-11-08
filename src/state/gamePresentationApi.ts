import {
  GAME_PRESENTATION_PATH,
  readPublishedGame,
  type GamePresentation,
  type PublishedGame,
} from "../../relay/gamePresentation";
import { appApiBaseUrl, refreshAccount } from "./appAccountStore";
import { casterStore } from "./casterStore";
import { demoLoadStore } from "./demoLoadStore";
import { engineStore } from "./engineStore";
import {
  readDemoGames,
  withGamePresentation,
  type DemoMetadata,
} from "../../relay/demoMetadata";

import {
  editableDemoGame,
  publishedDemoFilename,
  type EditableGame,
} from "./editableGame";
import { streamSnapshotStore } from "./streamSnapshotStore";

async function responseBody(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      void refreshAccount();
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Could not save game details. Please try again.",
    );
  }
  return body;
}

/** Re-read authoritative metadata before opening a historical game's editor. */
export async function readPublishedDemoPresentation(
  filename: string,
  signal?: AbortSignal,
): Promise<Pick<DemoMetadata, "filename" | "games">> {
  const url = new URL(GAME_PRESENTATION_PATH, appApiBaseUrl);
  url.searchParams.set("filename", filename);
  const sourceUrl = demoLoadStore.getState().sourceUrl;
  const recording = engineStore.getState().playback.recording;
  const body = await responseBody(
    await fetch(url, { credentials: "include", cache: "no-store", signal }),
  );
  if (!body || body.filename !== filename)
    throw new Error("Invalid demo metadata response");
  const games = readDemoGames(body);
  if (
    publishedDemoFilename(sourceUrl) === filename &&
    demoLoadStore.getState().sourceUrl === sourceUrl &&
    engineStore.getState().playback.recording === recording
  )
    demoLoadStore.setState({ publishedGames: games });
  return { filename, games };
}

export async function publishGamePresentation(
  game: EditableGame,
  presentation: GamePresentation,
): Promise<PublishedGame> {
  const target = game.demo?.target;
  if (game.demo && !target) throw new Error("Choose a game to edit");
  const context = casterStore.getState().context;
  const sourceUrl = demoLoadStore.getState().sourceUrl;
  const recording = engineStore.getState().playback.recording;
  const response = await fetch(new URL(GAME_PRESENTATION_PATH, appApiBaseUrl), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(target ? { demo: target } : { gameId: game.id }),
      expectedRevision: game.revision,
      presentation,
    }),
  });
  const body = await responseBody(response);
  const saved = readPublishedGame(body);
  const expectedId = game.demo ? target?.gameId : game.id;
  if (
    !saved ||
    (expectedId && saved.id !== expectedId) ||
    saved.revision <= game.revision
  )
    throw new Error("Invalid game details response");
  if (
    target &&
    publishedDemoFilename(sourceUrl) === target.filename &&
    demoLoadStore.getState().sourceUrl === sourceUrl &&
    engineStore.getState().playback.recording === recording
  ) {
    demoLoadStore.setState((state) => ({
      publishedGames:
        state.publishedGames?.map((entry, index) =>
          index === target.gameIndex &&
          entry.mission === target.mission &&
          entry.startMs === target.startMs &&
          (!entry.gameId || entry.gameId === saved.id) &&
          (entry.presentationRevision ?? 0) < saved.revision
            ? withGamePresentation(entry, saved)
            : entry,
        ) ?? null,
    }));
    const active = editableDemoGame(
      target.filename,
      demoLoadStore.getState().publishedGames ?? [],
      streamSnapshotStore.getState().snapshot?.missionReadySec ?? 0,
    );
    if (
      casterStore.getState().context === context &&
      active.demo?.target?.gameIndex === target.gameIndex &&
      active.demo.target.gameId === saved.id
    )
      casterStore.getState().setPublishedGame(saved);
  } else if (
    !game.demo &&
    casterStore.getState().publishedGame?.id === saved.id
  )
    casterStore.getState().setPublishedGame(saved);
  return saved;
}

/** Blank personal fields inherit saved labels; nonblank entries explicitly replace them. */
export function publishTeamNames(
  game: EditableGame,
  drafts: Record<number, string>,
): Promise<PublishedGame> {
  const teamNames = { ...game.presentation.teamNames };
  for (const [teamId, draft] of Object.entries(drafts)) {
    const name = draft.trim();
    if (name) teamNames[Number(teamId)] = name;
  }
  return publishGamePresentation(game, { ...game.presentation, teamNames });
}

import { expect, it, vi } from "vitest";
import type { DemoRecorder } from "./demoRecorder.js";
import {
  GamePresentationError,
  type DemoGameTarget,
  type GamePresentation,
  type PublishedGame,
} from "./gamePresentation.js";
import { createGamePresentationUpdater } from "./gamePresentationService.js";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const recorder = {} as DemoRecorder;
  const game: PublishedGame = { id: "game-one", revision: 0, presentation: {} };
  const targets = new Map<
    string,
    { game: PublishedGame; recorder: DemoRecorder | null }
  >([[game.id, { game, recorder }]]);
  const sessions = {
    getGameTarget: vi.fn((id: string) => targets.get(id)),
    updateGame: vi.fn((updated: PublishedGame) => {
      const target = targets.get(updated.id);
      if (!target) return false;
      targets.set(updated.id, { ...target, game: updated });
      return true;
    }),
  };
  const recordings = {
    saveGamePresentation: vi.fn(
      async (_recorder: DemoRecorder, _game: PublishedGame) => {},
    ),
  };
  const demos = {
    savePublishedGamePresentation: vi.fn(
      async (
        target: DemoGameTarget,
        expectedRevision: number,
        presentation: GamePresentation,
      ): Promise<PublishedGame> => ({
        id: target.gameId ?? "assigned-historical-game",
        revision: expectedRevision + 1,
        presentation,
      }),
    ),
  };
  const update = createGamePresentationUpdater(sessions, recordings, demos);
  return { recorder, game, targets, sessions, recordings, demos, update };
}

const request = {
  gameId: "game-one",
  expectedRevision: 0,
  presentation: { title: "Final", teamNames: { 1: "Storm", 2: "Inferno" } },
};

it("waits for a durable recording save before changing or broadcasting the game", async () => {
  const f = fixture();
  const disk = deferred();
  f.recordings.saveGamePresentation.mockReturnValueOnce(disk.promise);
  const saved = {
    id: f.game.id,
    revision: 1,
    presentation: request.presentation,
  };
  const result = f.update(request);
  await vi.waitFor(() =>
    expect(f.recordings.saveGamePresentation).toHaveBeenCalledExactlyOnceWith(
      f.recorder,
      saved,
    ),
  );
  expect(f.sessions.updateGame).not.toHaveBeenCalled();
  expect(f.targets.get(f.game.id)?.game).toEqual(f.game);

  disk.resolve();
  await expect(result).resolves.toEqual(saved);
  expect(f.sessions.updateGame).toHaveBeenCalledExactlyOnceWith(saved);
  expect(
    f.recordings.saveGamePresentation.mock.invocationCallOrder[0],
  ).toBeLessThan(f.sessions.updateGame.mock.invocationCallOrder[0]);
});

it("lets only one concurrent request with the same expected revision commit", async () => {
  const f = fixture();
  const disk = deferred();
  f.recordings.saveGamePresentation.mockReturnValueOnce(disk.promise);
  const first = f.update(request);
  const second = expect(
    f.update({ ...request, presentation: { title: "Other admin" } }),
  ).rejects.toMatchObject({ status: 409 });
  await vi.waitFor(() =>
    expect(f.recordings.saveGamePresentation).toHaveBeenCalledOnce(),
  );
  expect(f.sessions.getGameTarget).toHaveBeenCalledOnce();
  disk.resolve();
  await first;
  await second;
  expect(f.recordings.saveGamePresentation).toHaveBeenCalledOnce();
  expect(f.sessions.updateGame).toHaveBeenCalledOnce();
  expect(f.targets.get(f.game.id)?.game.presentation).toEqual(
    request.presentation,
  );
});

it("does not push a failed save and allows a queued retry at the same revision", async () => {
  const f = fixture();
  const disk = deferred();
  f.recordings.saveGamePresentation.mockReturnValueOnce(disk.promise);
  const first = expect(f.update(request)).rejects.toThrow("Disk full");
  const retry = f.update(request);
  await vi.waitFor(() =>
    expect(f.recordings.saveGamePresentation).toHaveBeenCalledOnce(),
  );
  expect(f.sessions.updateGame).not.toHaveBeenCalled();
  disk.reject(new Error("Disk full"));
  await first;
  await expect(retry).resolves.toMatchObject({ id: f.game.id, revision: 1 });
  expect(f.recordings.saveGamePresentation).toHaveBeenCalledTimes(2);
  expect(f.sessions.updateGame).toHaveBeenCalledOnce();
});

it("rejects missing games and stale IDs without reaching another game's recorder", async () => {
  const f = fixture();
  const next = {
    game: { ...f.game, id: "game-two" },
    recorder: {} as DemoRecorder,
  };
  f.targets.delete(f.game.id);
  f.targets.set(next.game.id, next);
  await expect(f.update(request)).rejects.toMatchObject({ status: 404 });
  expect(f.recordings.saveGamePresentation).not.toHaveBeenCalled();
  expect(f.sessions.updateGame).not.toHaveBeenCalled();
  expect(f.targets.get(next.game.id)).toEqual(next);
});

it("keeps a committed recording edit when its live target expires during the save", async () => {
  const f = fixture();
  const disk = deferred();
  f.recordings.saveGamePresentation.mockReturnValueOnce(disk.promise);
  const result = f.update(request);
  await vi.waitFor(() =>
    expect(f.recordings.saveGamePresentation).toHaveBeenCalledOnce(),
  );
  f.targets.delete(f.game.id);
  const next = {
    game: { ...f.game, id: "game-two" },
    recorder: {} as DemoRecorder,
  };
  f.targets.set(next.game.id, next);
  disk.resolve();
  await expect(result).resolves.toMatchObject({ id: f.game.id, revision: 1 });
  expect(f.recordings.saveGamePresentation.mock.calls[0][0]).toBe(f.recorder);
  expect(f.sessions.updateGame).toHaveBeenCalledExactlyOnceWith({
    id: f.game.id,
    revision: 1,
    presentation: request.presentation,
  });
  expect(f.targets.get(next.game.id)).toEqual(next);
});

it("does not block a different game's updates behind a slow recording save", async () => {
  const f = fixture();
  const disk = deferred();
  f.targets.set("game-two", {
    game: { ...f.game, id: "game-two" },
    recorder: {} as DemoRecorder,
  });
  f.recordings.saveGamePresentation.mockImplementation(
    async (_recorder, game) => {
      if (game.id === f.game.id) await disk.promise;
    },
  );
  const first = f.update(request);
  await expect(
    f.update({ ...request, gameId: "game-two" }),
  ).resolves.toMatchObject({ id: "game-two", revision: 1 });
  expect(f.targets.get(f.game.id)?.game.revision).toBe(0);
  expect(f.targets.get("game-two")?.game.revision).toBe(1);
  disk.resolve();
  await first;
});

it("can publish live-only details without inventing a recording", async () => {
  const f = fixture();
  f.targets.set(f.game.id, { game: f.game, recorder: null });
  await expect(f.update(request)).resolves.toMatchObject({
    id: f.game.id,
    revision: 1,
  });
  expect(f.recordings.saveGamePresentation).not.toHaveBeenCalled();
  expect(f.sessions.updateGame).toHaveBeenCalledOnce();
});

const historicalRequest = {
  demo: {
    filename: "final-2002.rec",
    gameIndex: 1,
    mission: "Sanctuary",
    startMs: 600_000,
    gameId: "game-one",
    missionSequence: 7,
  },
  expectedRevision: 0,
  presentation: {
    title: "Historical final",
    teamNames: { 1: "Storm", 2: "Inferno" },
  },
};

it("edits an old published demo without an active session or recorder, including a legacy game without an ID", async () => {
  const f = fixture();
  f.targets.clear();
  const legacy = {
    ...historicalRequest,
    demo: {
      filename: "final-2002.rec",
      gameIndex: 1,
      mission: "Sanctuary",
      startMs: 600_000,
    },
  };
  const saved = {
    id: "assigned-historical-game",
    revision: 1,
    presentation: legacy.presentation,
  };
  await expect(f.update(legacy)).resolves.toEqual(saved);
  expect(f.demos.savePublishedGamePresentation).toHaveBeenCalledExactlyOnceWith(
    legacy.demo,
    0,
    legacy.presentation,
  );
  expect(f.sessions.getGameTarget).not.toHaveBeenCalled();
  expect(f.recordings.saveGamePresentation).not.toHaveBeenCalled();
  expect(f.sessions.updateGame).toHaveBeenCalledExactlyOnceWith(saved);
});

it("waits for a historical save before allowing an active session edit of the same game", async () => {
  const f = fixture();
  const disk = deferred();
  f.demos.savePublishedGamePresentation.mockImplementationOnce(
    async (_target, expectedRevision, presentation) => {
      await disk.promise;
      return { id: f.game.id, revision: expectedRevision + 1, presentation };
    },
  );
  const first = f.update(historicalRequest);
  const second = expect(f.update(request)).rejects.toMatchObject({
    status: 409,
  });
  await vi.waitFor(() =>
    expect(f.demos.savePublishedGamePresentation).toHaveBeenCalledOnce(),
  );
  expect(f.sessions.getGameTarget).not.toHaveBeenCalled();
  expect(f.sessions.updateGame).not.toHaveBeenCalled();
  disk.resolve();
  await first;
  await second;
  expect(f.recordings.saveGamePresentation).not.toHaveBeenCalled();
  expect(f.sessions.updateGame).toHaveBeenCalledExactlyOnceWith({
    id: f.game.id,
    revision: 1,
    presentation: historicalRequest.presentation,
  });
});

it("waits for an active session save before checking the historical sidecar revision", async () => {
  const f = fixture();
  const disk = deferred();
  f.recordings.saveGamePresentation.mockReturnValueOnce(disk.promise);
  f.demos.savePublishedGamePresentation.mockImplementation(
    async (_target, expectedRevision, presentation) => {
      if (f.targets.get(f.game.id)?.game.revision !== expectedRevision)
        throw new GamePresentationError(409, "Game details changed");
      return { id: f.game.id, revision: expectedRevision + 1, presentation };
    },
  );
  const first = f.update(request);
  const second = expect(f.update(historicalRequest)).rejects.toMatchObject({
    status: 409,
  });
  await vi.waitFor(() =>
    expect(f.recordings.saveGamePresentation).toHaveBeenCalledOnce(),
  );
  expect(f.demos.savePublishedGamePresentation).not.toHaveBeenCalled();
  disk.resolve();
  await first;
  await second;
  expect(f.sessions.updateGame).toHaveBeenCalledOnce();
  expect(f.targets.get(f.game.id)?.game.presentation).toEqual(
    request.presentation,
  );
});

it("does not push a failed historical save and permits a retry", async () => {
  const f = fixture();
  f.targets.clear();
  f.demos.savePublishedGamePresentation.mockRejectedValueOnce(
    new Error("Storage unavailable"),
  );
  await expect(f.update(historicalRequest)).rejects.toThrow(
    "Storage unavailable",
  );
  expect(f.sessions.updateGame).not.toHaveBeenCalled();
  await expect(f.update(historicalRequest)).resolves.toMatchObject({
    id: "game-one",
    revision: 1,
  });
  expect(f.demos.savePublishedGamePresentation).toHaveBeenCalledTimes(2);
  expect(f.sessions.updateGame).toHaveBeenCalledOnce();
});

it("reports disabled historical editing without consulting a live game target", async () => {
  const f = fixture();
  const update = createGamePresentationUpdater(f.sessions, f.recordings);
  await expect(update(historicalRequest)).rejects.toMatchObject({
    status: 503,
  });
  expect(f.sessions.getGameTarget).not.toHaveBeenCalled();
  expect(f.sessions.updateGame).not.toHaveBeenCalled();
  expect(f.recordings.saveGamePresentation).not.toHaveBeenCalled();
});

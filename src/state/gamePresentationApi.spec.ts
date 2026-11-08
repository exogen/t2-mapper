import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  GAME_PRESENTATION_PATH,
  type PublishedGame,
} from "../../relay/gamePresentation";
import { casterStore, displayTeamName } from "./casterStore";
import {
  publishGamePresentation,
  readPublishedDemoPresentation,
  publishTeamNames,
} from "./gamePresentationApi";
import { demoLoadStore } from "./demoLoadStore";
import { editableDemoEntry } from "./editableGame";
import { streamSnapshotStore } from "./streamSnapshotStore";

vi.mock("../stream/demoIndex", () => ({
  DEMOS_BASE_URL: "https://demos.example.com/demos",
}));

const mocks = vi.hoisted(() => ({ refresh: vi.fn(async () => {}) }));
vi.mock("./appAccountStore", () => ({
  appApiBaseUrl: "https://api.example.com",
  refreshAccount: mocks.refresh,
}));

const game: PublishedGame = {
  id: "game",
  revision: 2,
  presentation: { title: "Final", teamNames: { 1: "Knights" } },
};
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  mocks.refresh.mockClear();
  casterStore.getState().suspend();
  casterStore.getState().activate("example:28000", "7", "Katabatic");
  casterStore.getState().setPublishedGame(game);
  demoLoadStore.setState({ sourceUrl: null, publishedGames: [] });
  streamSnapshotStore.setState({ snapshot: null });
});
afterEach(() => {
  casterStore.getState().suspend();
  vi.unstubAllGlobals();
});

it("publishes with the account cookie and expected revision without removing explicit personal defaults", async () => {
  const presentation = {
    title: "Grand Final",
    teamNames: { 1: "Wolves", 2: "Dragons" },
  };
  const saved = { id: game.id, revision: 3, presentation };
  casterStore.getState().renameTeam(1, "Storm");
  fetchMock.mockResolvedValue(Response.json(saved));
  await expect(publishGamePresentation(game, presentation)).resolves.toEqual(
    saved,
  );
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    new URL(GAME_PRESENTATION_PATH, "https://api.example.com"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: game.id,
        expectedRevision: 2,
        presentation,
      }),
    },
  );
  expect(casterStore.getState().publishedGame).toEqual(saved);
  expect(casterStore.getState().settings?.teamNames).toEqual({ 1: "Storm" });
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(displayTeamName(2, "Inferno")).toBe("Dragons");
});

it("publishes personal drafts without losing the shared title, untouched teams, or inherited names", async () => {
  const original = {
    ...game,
    presentation: {
      title: "Keep this title",
      teamNames: { 1: "Knights", 2: "Dragons", 4: "Other saved team" },
    },
  };
  fetchMock.mockResolvedValue(
    Response.json({ id: game.id, revision: 3, presentation: {} }),
  );
  await publishTeamNames(original, {
    1: "Storm",
    2: "",
    3: "   ",
    5: "  New team  ",
  });
  expect(
    JSON.parse(fetchMock.mock.calls[0][1]!.body as string).presentation,
  ).toEqual({
    title: "Keep this title",
    teamNames: {
      1: "Storm",
      2: "Dragons",
      4: "Other saved team",
      5: "New team",
    },
  });
});

it("ignores a successful response after the viewer switches games", async () => {
  const response = deferred<Response>();
  fetchMock.mockReturnValue(response.promise);
  const pending = publishGamePresentation(game, { title: "Old game update" });
  const next = {
    ...game,
    id: "next",
    presentation: { teamNames: { 1: "Next team" } },
  };
  casterStore.getState().activate("example:28000", "8", "Katabatic");
  casterStore.getState().setPublishedGame(next);
  response.resolve(
    Response.json({
      ...game,
      revision: 3,
      presentation: { title: "Old game update" },
    }),
  );
  await pending;
  expect(casterStore.getState().publishedGame).toEqual(next);
  expect(displayTeamName(1)).toBe("Next team");
});

it("does not replace a newer pushed revision with a late HTTP response", async () => {
  const response = deferred<Response>();
  fetchMock.mockReturnValue(response.promise);
  const pending = publishGamePresentation(game, { title: "HTTP edit" });
  const pushed = {
    ...game,
    revision: 4,
    presentation: { title: "Newer pushed edit" },
  };
  casterStore.getState().setPublishedGame(pushed);
  response.resolve(
    Response.json({
      ...game,
      revision: 3,
      presentation: { title: "HTTP edit" },
    }),
  );
  await pending;
  expect(casterStore.getState().publishedGame).toEqual(pushed);
});

it.each([401, 403])(
  "refreshes account permissions after an HTTP %s",
  async (status) => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "Administrator sign-in required" }, { status }),
    );
    await expect(publishGamePresentation(game, {})).rejects.toThrow(
      "Administrator sign-in required",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(casterStore.getState().publishedGame).toEqual(game);
  },
);

it("surfaces revision conflicts without changing the current game or refreshing the account", async () => {
  fetchMock.mockResolvedValue(
    Response.json(
      { error: "Game details changed. Try again." },
      { status: 409 },
    ),
  );
  await expect(publishGamePresentation(game, {})).rejects.toThrow(
    "Game details changed",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(casterStore.getState().publishedGame).toEqual(game);
});

it.each([401, 403, 500])(
  "handles a non-JSON HTTP %s without exposing a parse error",
  async (status) => {
    fetchMock.mockResolvedValue(
      new Response("Service unavailable", { status }),
    );
    await expect(publishGamePresentation(game, {})).rejects.toThrow(
      "Could not save game details. Please try again.",
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(status === 500 ? 0 : 1);
    expect(casterStore.getState().publishedGame).toEqual(game);
  },
);

it.each([
  { ...game, id: "wrong" },
  game,
  { ...game, revision: 1 },
  { id: game.id, revision: 3 },
  { ...game, revision: "3" },
  { ...game, presentation: { teamNames: { 1: 42 } } },
])(
  "rejects invalid success responses without modifying visible labels: %j",
  async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(publishGamePresentation(game, {})).rejects.toThrow(
      "Invalid game details response",
    );
    expect(casterStore.getState().publishedGame).toEqual(game);
  },
);

it("loads current published metadata through the authenticated API, including legacy sidecars", async () => {
  demoLoadStore.setState({
    sourceUrl: "https://demos.example.com/demos/old.rec",
  });
  fetchMock.mockResolvedValue(
    Response.json({
      filename: "old.rec",
      mission: "Katabatic",
      gameType: "CTF",
    }),
  );
  const record = await readPublishedDemoPresentation("old.rec");
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    new URL(
      `${GAME_PRESENTATION_PATH}?filename=old.rec`,
      "https://api.example.com",
    ),
    { credentials: "include", cache: "no-store", signal: undefined },
  );
  expect(record.games).toMatchObject([{ mission: "Katabatic", startMs: 0 }]);
  expect(demoLoadStore.getState().publishedGames).toEqual(record.games);
});

it("edits an old unlabelled game by recording locator and adopts its first server-assigned ID", async () => {
  const entry = {
    mission: "Katabatic",
    startMs: 0,
    gameType: "CTF",
    tournament: false,
  };
  const editable = editableDemoEntry("old.rec", entry, 0);
  demoLoadStore.setState({
    sourceUrl: "https://demos.example.com/demos/old.rec",
    publishedGames: [entry],
  });
  casterStore.getState().setPublishedGame(null);
  casterStore.getState().renameTeam(1, "Storm");
  const saved = {
    id: "new-persistent-id",
    revision: 1,
    presentation: { title: "2002 finals", teamNames: { 1: "Knights" } },
  };
  fetchMock.mockResolvedValue(Response.json(saved));
  await expect(
    publishGamePresentation(editable, saved.presentation),
  ).resolves.toEqual(saved);
  const request = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
  expect(request).toEqual({
    demo: {
      filename: "old.rec",
      gameIndex: 0,
      mission: "Katabatic",
      startMs: 0,
    },
    expectedRevision: 0,
    presentation: saved.presentation,
  });
  expect(demoLoadStore.getState().publishedGames![0]).toMatchObject({
    gameId: saved.id,
    presentationRevision: 1,
    title: "2002 finals",
    teamNames: { 1: "Knights" },
  });
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(casterStore.getState().publishedGame).toEqual(saved);
});

it("updates only the selected game in a multi-mission demo", async () => {
  const first = {
    mission: "Katabatic",
    startMs: 0,
    gameType: "CTF",
    tournament: false,
    title: "First",
  };
  const second = {
    mission: "Raindance",
    startMs: 60000,
    gameType: "CTF",
    tournament: false,
    gameId: "second",
    presentationRevision: 2,
    title: "Second",
  };
  demoLoadStore.setState({
    sourceUrl: "https://demos.example.com/demos/multi.rec",
    publishedGames: [first, second],
  });
  const saved = {
    id: "second",
    revision: 3,
    presentation: { title: "Updated second" },
  };
  fetchMock.mockResolvedValue(Response.json(saved));
  await publishGamePresentation(
    editableDemoEntry("multi.rec", second, 1),
    saved.presentation,
  );
  expect(demoLoadStore.getState().publishedGames![0]).toBe(first);
  expect(demoLoadStore.getState().publishedGames![1].title).toBe(
    "Updated second",
  );
});

it("does not apply an old demo save after another recording is installed", async () => {
  const entry = {
    mission: "Katabatic",
    startMs: 0,
    gameType: "CTF",
    tournament: false,
  };
  demoLoadStore.setState({
    sourceUrl: "https://demos.example.com/demos/old.rec",
    publishedGames: [entry],
  });
  const response = deferred<Response>();
  fetchMock.mockReturnValue(response.promise);
  const saving = publishGamePresentation(
    editableDemoEntry("old.rec", entry, 0),
    { title: "Old" },
  );
  demoLoadStore.setState({
    sourceUrl: "https://demos.example.com/demos/new.rec",
    publishedGames: [{ ...entry, title: "New recording" }],
  });
  response.resolve(
    Response.json({
      id: "new-id",
      revision: 1,
      presentation: { title: "Old" },
    }),
  );
  await saving;
  expect(demoLoadStore.getState().publishedGames![0].title).toBe(
    "New recording",
  );
  expect(casterStore.getState().publishedGame).toEqual(game);
});

it("can edit the first game while viewing the second without changing the second game's labels or personal overrides", async () => {
  const first = {
    mission: "Katabatic",
    startMs: 0,
    gameType: "CTF",
    tournament: false,
    gameId: "first",
    presentationRevision: 1,
  };
  const second = {
    mission: "Raindance",
    startMs: 60000,
    gameType: "CTF",
    tournament: false,
    gameId: "second",
    presentationRevision: 2,
    teamNames: { 1: "Second game team" },
  };
  demoLoadStore.setState({
    sourceUrl: "https://demos.example.com/demos/multi.rec",
    publishedGames: [first, second],
  });
  streamSnapshotStore.setState({ snapshot: { missionReadySec: 60 } as never });
  const viewed = {
    id: "second",
    revision: 2,
    presentation: { teamNames: second.teamNames },
  };
  casterStore.getState().setPublishedGame(viewed);
  casterStore.getState().renameTeam(1, "Storm");
  const saved = {
    id: "first",
    revision: 2,
    presentation: {
      title: "Updated first game",
      teamNames: { 1: "First game team" },
    },
  };
  fetchMock.mockResolvedValue(Response.json(saved));
  await expect(
    publishGamePresentation(
      editableDemoEntry("multi.rec", first, 0),
      saved.presentation,
    ),
  ).resolves.toEqual(saved);
  expect(demoLoadStore.getState().publishedGames![0].title).toBe(
    "Updated first game",
  );
  expect(demoLoadStore.getState().publishedGames![1]).toBe(second);
  expect(casterStore.getState().publishedGame).toEqual(viewed);
  expect(casterStore.getState().settings?.teamNames).toEqual({ 1: "Storm" });
  expect(displayTeamName(1, "Storm")).toBe("Storm");
});

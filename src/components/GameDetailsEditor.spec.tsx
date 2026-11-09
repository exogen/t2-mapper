import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PublishedGame } from "../../relay/gamePresentation";
import type { AppAccountState } from "../state/appAccountStore";
import type { LiveConnectionState } from "../state/liveConnectionStore";
import type { PlayerRosterEntry, TeamScore } from "../stream/types";
import type { EditableGame } from "../state/editableGame";
import type { useGamePresentationEditor } from "./useEditableGame";
import { GameDetailsButton, GameDetailsDialog } from "./GameDetailsEditor";

const fixture = vi.hoisted(() => ({
  account: {} as AppAccountState,
  live: {} as Pick<LiveConnectionState, "role" | "watchStatus">,
  caster: { publishedGame: null as PublishedGame | null },
  demo: {
    sourceUrl: null as string | null,
    publishedGames: [] as import("../../relay/demoMetadata").DemoGame[],
  },
  source: "live",
  editor: null as ReturnType<typeof useGamePresentationEditor> | null,
  snapshot: {
    teamScores: [] as TeamScore[],
    playerRoster: [] as PlayerRosterEntry[],
    missionReadySec: 0,
  },
}));

vi.mock("../state/appAccountStore", () => ({
  useAppAccount: (select: (state: AppAccountState) => unknown) =>
    select(fixture.account),
}));
vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (select: (state: typeof fixture.live) => unknown) =>
    select(fixture.live),
}));
vi.mock("../state/casterStore", () => ({
  useCaster: (select: (state: typeof fixture.caster) => unknown) =>
    select(fixture.caster),
}));
vi.mock("../state/gameEntityStore", () => ({
  useDataSource: () => fixture.source,
}));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (select: (state: typeof fixture.snapshot) => unknown) =>
    select(fixture.snapshot),
}));
vi.mock("../state/gamePresentationApi", () => ({
  publishGamePresentation: vi.fn(),
  readPublishedDemoPresentation: vi.fn(),
}));
vi.mock("./useEditableGame", async (original) => {
  const actual = await original<typeof import("./useEditableGame")>();
  return {
    ...actual,
    useGamePresentationEditor: (target: EditableGame | null) =>
      fixture.editor ?? actual.useGamePresentationEditor(target),
  };
});
vi.mock("../state/demoLoadStore", () => ({
  useDemoLoad: (select: (state: typeof fixture.demo) => unknown) =>
    select(fixture.demo),
}));
vi.mock("../stream/demoIndex", () => ({
  DEMOS_BASE_URL: "https://demos.example.com/demos",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("./InputControls", () => ({
  inputControlsStore: { setState: vi.fn() },
}));
vi.mock("react-dom", async (original) => ({
  ...(await original<typeof import("react-dom")>()),
  createPortal: (children: ReactNode) => children,
}));
vi.mock("@ariakit/react", () => ({
  VisuallyHidden: ({ children }: { children: ReactNode }) => (
    <span style={{ position: "absolute" }}>{children}</span>
  ),
  Dialog: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DialogHeading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const game: PublishedGame = {
  id: "game",
  revision: 2,
  presentation: { title: "Final", teamNames: { 1: "Knights" } },
};
const teams = [
  { teamId: 2, name: "Inferno" },
  { teamId: 1, name: "Storm" },
];

beforeEach(() => {
  fixture.account = {
    status: "ready",
    enabled: true,
    pending: null,
    error: null,
    signInUrl: null,
    user: {
      id: "admin",
      role: "admin",
      name: "Admin",
      image: null,
      discordId: "123",
      discordUsername: "admin",
    },
  };
  fixture.live = { role: "watcher", watchStatus: "live" };
  fixture.caster.publishedGame = game;
  fixture.source = "live";
  fixture.editor = null;
  fixture.snapshot = { teamScores: [], playerRoster: [], missionReadySec: 0 };
  fixture.demo = { sourceUrl: null, publishedGames: [] };
  vi.stubGlobal("document", { body: {} });
});
afterEach(() => vi.unstubAllGlobals());

it("offers the shared-details editor to a verified admin watching a live game", () => {
  const html = renderToStaticMarkup(<GameDetailsButton />);
  expect(html).toContain('aria-label="Edit shared game details"');
  expect(html).toContain('aria-haspopup="dialog"');
});

it.each(["guest", "regular user", "loading account", "failed account"])(
  "hides the editor for a %s",
  (kind) => {
    if (kind === "guest") fixture.account.user = null;
    else if (kind === "regular user") fixture.account.user!.role = "user";
    else
      fixture.account.status = kind === "loading account" ? "loading" : "error";
    expect(renderToStaticMarkup(<GameDetailsButton />)).toBe("");
  },
);

it.each(["demo", "mission"])(
  "hides publishing controls while viewing %s content",
  (source) => {
    fixture.source = source;
    expect(renderToStaticMarkup(<GameDetailsButton />)).toBe("");
  },
);

it("offers editing for a decades-old published demo with no saved labels or game ID", () => {
  fixture.source = "demo";
  fixture.caster.publishedGame = null;
  fixture.demo = {
    sourceUrl: "https://demos.example.com/demos/old-2002.rec",
    publishedGames: [
      { mission: "Katabatic", startMs: 0, gameType: "CTF", tournament: false },
    ],
  };
  expect(renderToStaticMarkup(<GameDetailsButton />)).toContain(
    'aria-label="Edit shared game details"',
  );
});

it("offers the authenticated editor even when a published demo's public sidecar did not load", () => {
  fixture.source = "demo";
  fixture.caster.publishedGame = null;
  fixture.demo = {
    sourceUrl: "https://demos.example.com/demos/old-2002.rec",
    publishedGames: [],
  };
  expect(renderToStaticMarkup(<GameDetailsButton />)).toContain(
    'aria-label="Edit shared game details"',
  );
});

it.each([
  null,
  "https://other.example.com/old.rec",
  "https://demos.example.com/demos/sources/external/old.rec",
])("does not offer demo editing for an unpublished source %s", (sourceUrl) => {
  fixture.source = "demo";
  fixture.demo = {
    sourceUrl,
    publishedGames: [
      { mission: "Katabatic", startMs: 0, gameType: "CTF", tournament: false },
    ],
  };
  expect(renderToStaticMarkup(<GameDetailsButton />)).toBe("");
});

it("hides the editor in direct play and shared replays", () => {
  fixture.live.role = "player";
  expect(renderToStaticMarkup(<GameDetailsButton />)).toBe("");
  // Joining a replay clears the live watcher connection, although both use
  // the live data-source renderer and a locally controlled spectator camera.
  fixture.live = { role: null, watchStatus: null };
  expect(renderToStaticMarkup(<GameDetailsButton />)).toBe("");
});

it.each(["connecting", "syncing", "ended", null] as const)(
  "hides the editor while watch status is %s",
  (status) => {
    fixture.live.watchStatus = status;
    expect(renderToStaticMarkup(<GameDetailsButton />)).toBe("");
  },
);

it("hides the editor when no published game identity is available", () => {
  fixture.caster.publishedGame = null;
  expect(renderToStaticMarkup(<GameDetailsButton />)).toBe("");
});

it("starts shared editing from saved labels without personal names or help text", () => {
  const html = renderToStaticMarkup(
    <GameDetailsDialog game={game} teams={teams} onClose={() => {}} />,
  );
  expect(html).toContain('value="Final"');
  expect(html).toContain('value="Knights"');
  expect(html).not.toContain('value="Storm"');
  expect(html).not.toContain("Personal team names still take precedence.");
  expect(html).not.toContain("Shown to all watchers");
  expect(html).toContain("Update stream data");
  expect(html).toContain(">Save</button>");
  expect(html).not.toMatch(/<fieldset[^>]*disabled=""/);
  expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  expect(html).toContain('maxLength="128"');
  expect(html).toContain('maxLength="64"');
});

it("labels archived editing as demo data without a standalone mission/time line", () => {
  fixture.source = "demo";
  fixture.demo = {
    sourceUrl: "https://demos.example.com/demos/old.rec",
    publishedGames: [],
  };
  const html = renderToStaticMarkup(
    <GameDetailsDialog
      game={{ ...game, demo: { filename: "old.rec" } }}
      teams={teams}
      onClose={() => {}}
    />,
  );
  expect(html).toContain("Update demo data");
  expect(html).not.toContain("Saved with this demo");
  expect(html).not.toContain("0:00");
  expect(html).not.toContain("Loading current demo");
  expect(html).toContain('aria-busy="true"');
});

it("disables an open editor after switching to another game", () => {
  fixture.caster.publishedGame = { ...game, id: "another-game" };
  const html = renderToStaticMarkup(
    <GameDetailsDialog game={game} teams={teams} onClose={() => {}} />,
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain("Editing is unavailable for this game");
  expect(html).toContain("Your unsaved changes are preserved");
  expect(html).toContain("<fieldset class=");
  expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
});

const archived: EditableGame = {
  ...game,
  presentation: { title: "Final", teamNames: { 1: "Knights", 4: "Dragons" } },
  demo: { filename: "old.rec" },
};

function standaloneDemo() {
  fixture.source = "mission";
  fixture.caster.publishedGame = null;
  fixture.editor = {
    details: archived,
    games: [
      { mission: "Katabatic", startMs: 0, gameType: "CTF", tournament: false },
    ],
    selectedIndex: 0,
    selectGame: vi.fn(),
    loading: false,
    error: null,
  };
  return renderToStaticMarkup(
    <GameDetailsDialog
      game={archived}
      teams={[]}
      standalone
      onClose={() => {}}
    />,
  );
}

it("edits a listed demo without loading it and uses its teams instead of the current roster", () => {
  const html = standaloneDemo();
  expect(html).toContain("Update demo data");
  expect(html).not.toContain("Editing is unavailable");
  expect(html).not.toMatch(/<fieldset[^>]*disabled=""/);
  expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  expect(html).toContain('value="Knights"');
  expect(html).toContain('value="Dragons"');
  expect(html).toContain('placeholder="Storm"');
  expect(html).toContain('placeholder="Inferno"');
  expect(html).toContain('placeholder="Diamond Sword"');
  expect(html).not.toContain("0 players");
  expect(html).not.toContain("Players");
});

it.each(["guest", "regular user", "loading account", "failed account"])(
  "disables listed-demo editing for a %s",
  (kind) => {
    if (kind === "guest") fixture.account.user = null;
    else if (kind === "regular user") fixture.account.user!.role = "user";
    else
      fixture.account.status = kind === "loading account" ? "loading" : "error";
    const html = standaloneDemo();
    expect(html).toContain("Editing is unavailable");
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  },
);

it("allows game selection in a listed multi-game demo before enabling fields", () => {
  standaloneDemo();
  fixture.editor!.details = null;
  fixture.editor!.selectedIndex = null;
  fixture.editor!.games!.push({
    mission: "Raindance",
    startMs: 1000,
    gameType: "CTF",
    tournament: false,
  });
  const html = renderToStaticMarkup(
    <GameDetailsDialog
      game={archived}
      teams={[]}
      standalone
      onClose={() => {}}
    />,
  );
  expect(html).toContain("Choose a game…");
  expect(html).not.toMatch(/<select[^>]*disabled=""/);
  expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  expect(html).not.toContain("Editing is unavailable");
});

it("does not let standalone editing bypass the loaded-game guard for streams", () => {
  const html = renderToStaticMarkup(
    <GameDetailsDialog
      game={game}
      teams={teams}
      standalone
      onClose={() => {}}
    />,
  );
  expect(html).toContain("Editing is unavailable");
  expect(html).toMatch(/<fieldset[^>]*disabled=""/);
});

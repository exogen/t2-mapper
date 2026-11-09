import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { DemoDropScreen } from "./DemoDropScreen";

const fixture = vi.hoisted(() => ({
  load: { phase: "downloading", progress: null, error: null },
  demos: [] as DemoIndexEntry[],
  account: { status: "ready", user: null as { role: string } | null },
}));

vi.mock("../state/demoLoadStore", () => ({
  useDemoLoad: (select: (state: typeof fixture.load) => unknown) =>
    select(fixture.load),
}));
vi.mock("./useDemoIndex", () => ({
  useDemoIndexSuspense: () => ({ data: fixture.demos }),
}));
vi.mock("./useAppNavigation", () => ({ useAppNavigation: () => ({}) }));
vi.mock("../state/appAccountStore", () => ({
  useAppAccount: (select: (state: typeof fixture.account) => unknown) =>
    select(fixture.account),
}));
vi.mock("./GameDetailsEditor", () => ({ GameDetailsDialog: () => null }));
vi.mock("../manifest", () => ({ findMissionInfo: () => null }));
vi.mock("./PreviewTileArt", () => ({ PreviewTileArt: () => null }));
vi.mock("./missionPreview", () => ({
  missionLoadScreenUrl: () => null,
  missionGalleryArtUrl: () => null,
}));

const demo: DemoIndexEntry = {
  filename: "match.rec",
  bytes: 0,
  recordedAt: "2026-11-08T04:56:27.138Z",
  server: "Tournament Server 2",
  address: "example:28000",
  games: [
    {
      mission: "TWL_Harvester",
      gameType: "CTF",
      startMs: 0,
      tournament: true,
      title: "Indexed quarterfinals",
      teamNames: { 1: "Knights", 2: "Dragons" },
    },
  ],
  mod: "Classic",
  recorder: "MapGenius",
  durationMs: 12 * 60_000,
  players: [],
  playerCount: 12,
};

beforeEach(() => {
  fixture.load = { phase: "downloading", progress: null, error: null };
  fixture.demos = [demo];
  fixture.account = { status: "ready", user: null };
});

const render = () => renderToStaticMarkup(<DemoDropScreen />);

it.each([
  ["downloading", "Downloading demo…"],
  ["parsing", "Loading demo…"],
])("shows loading progress without saved titles during %s", (phase, hint) => {
  fixture.load.phase = phase;
  const markup = render();
  expect(markup).toContain(hint);
  expect(markup).not.toContain("Indexed quarterfinals");
});

it("keeps loading markup unchanged when indexed titles become available", () => {
  const known = render();
  fixture.demos = [];
  expect(render()).toBe(known);
});

it("shows the saved title and teams above mission info on featured cards", () => {
  fixture.load.phase = "idle";
  const markup = render();
  expect(markup).toContain("Featured recent demos");
  expect(markup).toContain("TWL_Harvester");
  expect(markup).toContain("CTF");
  expect(markup.replace(/<[^>]*>/g, "")).toContain("Knights vs Dragons");
  expect(markup).toContain("Tournament Server 2");
  expect(markup).toContain('aria-label="Players"');
  expect(markup).not.toContain("12 players");
  expect(markup).toContain("Indexed quarterfinals");
  expect(markup.indexOf("Indexed quarterfinals")).toBeLessThan(
    markup.indexOf("Knights"),
  );
  expect(markup.indexOf("Dragons")).toBeLessThan(
    markup.indexOf("TWL_Harvester"),
  );
});

it("omits default team names without hiding the mission info", () => {
  fixture.load.phase = "idle";
  fixture.demos = [
    {
      ...demo,
      games: [{ ...demo.games[0], teamNames: { 1: "Storm", 2: "Inferno" } }],
    },
  ];
  const markup = render();
  expect(markup).not.toContain("Storm");
  expect(markup).not.toContain("Inferno");
  expect(markup).toContain("TWL_Harvester");
});

it("offers admins an edit button outside the demo playback link", () => {
  fixture.load.phase = "idle";
  fixture.account.user = { role: "admin" };
  const markup = render();
  expect(markup).toContain(
    'aria-label="Edit demo data: Indexed quarterfinals"',
  );
  expect(markup).toContain('aria-haspopup="dialog"');
  const link = markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0];
  expect(link).toContain("?demo=match.rec");
  expect(link).not.toContain("<button");
});

it.each(["guest", "user", "unverified admin"])(
  "hides demo editing for a %s",
  (kind) => {
    fixture.load.phase = "idle";
    fixture.account.user =
      kind === "guest" ? null : { role: kind === "user" ? "user" : "admin" };
    if (kind === "unverified admin") fixture.account.status = "error";
    expect(render()).not.toContain('aria-label="Edit demo data:');
  },
);

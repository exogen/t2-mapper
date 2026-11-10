import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { DemoDropScreen } from "./DemoDropScreen";
import { DemoCard, PendingDemoCard } from "./DemoCard";

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
vi.mock("./useQueryParams", () => ({
  useNavigationQueryState: () => [{ user: null }],
}));
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

it("shows mission info above the saved title and teams on featured cards", () => {
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
  expect(markup.indexOf("TWL_Harvester")).toBeLessThan(
    markup.indexOf("Indexed quarterfinals"),
  );
  expect(markup.indexOf("Indexed quarterfinals")).toBeLessThan(
    markup.indexOf("Knights"),
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
  expect(markup).toContain('aria-label="Demo actions"');
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

it("groups admin editing and owner deletion outside the playback link", () => {
  fixture.account.user = { role: "admin" };
  const markup = renderToStaticMarkup(
    <DemoCard demo={demo} onDelete={() => {}} />,
  );
  expect(markup.match(/role="group"/g)).toHaveLength(1);
  const actions = markup.match(
    /<div\b[^>]*role="group"[^>]*>[\s\S]*?<\/div>/,
  )?.[0];
  expect(actions).toContain('aria-label="Demo actions"');
  expect(actions).toContain(
    'aria-label="Edit demo data: Indexed quarterfinals"',
  );
  expect(actions).toContain('aria-label="Delete demo: Indexed quarterfinals"');
  expect(actions!.indexOf("Edit demo data:")).toBeLessThan(
    actions!.indexOf("Delete demo:"),
  );
  const link = markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0];
  expect(link).not.toContain("<button");
  expect(link).not.toContain('role="group"');
});

it("offers regular owners deletion without admin editing", () => {
  fixture.account.user = { role: "user" };
  const markup = renderToStaticMarkup(
    <DemoCard demo={demo} onDelete={() => {}} />,
  );
  expect(markup).toContain('aria-label="Demo actions"');
  expect(markup).toContain('aria-label="Delete demo: Indexed quarterfinals"');
  expect(markup).not.toContain('aria-label="Edit demo data:');
  expect(markup.match(/<button\b/g)).toHaveLength(1);
});

it("omits the action row without any permitted actions", () => {
  const markup = renderToStaticMarkup(<DemoCard demo={demo} />);
  expect(markup).not.toContain('aria-label="Demo actions"');
  expect(markup).not.toContain("<button");
});

it("disables both admin actions while deletion is in progress", () => {
  fixture.account.user = { role: "admin" };
  const markup = renderToStaticMarkup(
    <DemoCard demo={demo} onDelete={() => {}} deleting />,
  );
  const buttons = markup.match(/<button\b[^>]*>/g) ?? [];
  expect(buttons).toHaveLength(2);
  for (const button of buttons) expect(button).toContain('disabled=""');
  expect(markup).toContain('aria-busy="true"');
});

it("never gives featured cards delete controls, including for admins", () => {
  fixture.load.phase = "idle";
  fixture.account.user = { role: "admin" };
  expect(render()).not.toContain('aria-label="Delete demo:');
});

it("shows a noninteractive pending card with upload progress", () => {
  const markup = renderToStaticMarkup(
    <PendingDemoCard filename="game.rec" status="Uploading…" progress={0.5} />,
  );
  expect(markup).toContain("game.rec");
  expect(markup).toContain("Uploading…");
  expect(markup).toContain('role="status"');
  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain('value="0.5"');
  expect(markup).not.toMatch(/<a\b|<button\b/);
});

it("shows failed pending cards as an error rather than ongoing work", () => {
  const markup = renderToStaticMarkup(
    <PendingDemoCard filename="bad.rec" status="Corrupt recording" error />,
  );
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('aria-busy="false"');
  expect(markup).toContain("Corrupt recording");
  expect(markup).not.toContain("<progress");
});

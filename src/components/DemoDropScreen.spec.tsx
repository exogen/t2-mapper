import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { DemoDropScreen } from "./DemoDropScreen";

const fixture = vi.hoisted(() => ({
  load: { phase: "downloading", progress: null, error: null },
  demos: [] as DemoIndexEntry[],
}));

vi.mock("../state/demoLoadStore", () => ({
  useDemoLoad: (select: (state: typeof fixture.load) => unknown) =>
    select(fixture.load),
}));
vi.mock("./useDemoIndex", () => ({
  useDemoIndexSuspense: () => ({ data: fixture.demos }),
}));
vi.mock("./useAppNavigation", () => ({ useAppNavigation: () => ({}) }));
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

it("shows map names and saved teams on featured cards without game titles", () => {
  fixture.load.phase = "idle";
  const markup = render();
  expect(markup).toContain("Featured recent demos");
  expect(markup).toContain("TWL_Harvester");
  expect(markup).toContain("CTF");
  expect(markup).toContain("Knights vs Dragons");
  expect(markup).toContain("Tournament Server 2");
  expect(markup).toContain("12 players");
  expect(markup).not.toContain("Indexed quarterfinals");
});

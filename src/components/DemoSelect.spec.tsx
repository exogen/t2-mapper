import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { DemoSelect } from "./DemoSelect";
import { formatRecordedTime, recordedDayLabel } from "./demoFormat";

const fixture = vi.hoisted(() => ({ demos: [] as DemoIndexEntry[] }));

type Children = { children?: ReactNode };

// Render an open picker without depending on a browser or floating positioning.
vi.mock("@ariakit/react", () => ({
  ComboboxProvider: ({ children }: Children) => <>{children}</>,
  ComboboxPopover: ({ children }: Children) => <>{children}</>,
  ComboboxList: ({ children }: Children) => <>{children}</>,
  ComboboxGroup: ({ children }: Children) => <>{children}</>,
  ComboboxGroupLabel: ({ children }: Children) => <div>{children}</div>,
  ComboboxItem: ({ children, value }: Children & { value: string }) => (
    <article data-demo={value}>{children}</article>
  ),
  Combobox: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
  useComboboxStore: () => ({}),
  useStoreState: () => true,
}));
vi.mock("./useDemoIndex", () => ({
  useDemoIndex: () => ({
    data: fixture.demos,
    isPending: false,
    isError: false,
  }),
}));
vi.mock("./useAppNavigation", () => ({ useAppNavigation: () => ({}) }));
vi.mock("./useQueryParams", () => ({ useDemoQueryState: () => [null] }));
vi.mock("./useComboboxShortcut", () => ({ useComboboxShortcut() {} }));
vi.mock("../manifest", () => ({ findMissionInfo: () => null }));
vi.mock("../stream/demoIndex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../stream/demoIndex")>()),
  DEMOS_BASE_URL: "https://example.com/demos",
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
  durationMs: 43 * 60_000,
  players: ["Player One", "Player Two"],
  playerCount: 26,
  hasCommentary: true,
};

beforeEach(() => {
  fixture.demos = [demo];
});

function renderItem() {
  const markup = renderToStaticMarkup(<DemoSelect />);
  const item = markup.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
  expect(item).toBeDefined();
  return item!;
}

const text = (markup: string) => markup.replace(/<[^>]*>/g, "");

it("shows the map, saved match title, teams, recording details, and source in card order", () => {
  const item = renderItem();
  const labels = text(item);
  expect(labels).toContain("Knights vs Dragons");
  expect(item.indexOf("TWL_Harvester")).toBeLessThan(
    item.indexOf("Indexed quarterfinals"),
  );
  expect(item.indexOf("Indexed quarterfinals")).toBeLessThan(
    item.indexOf("Knights"),
  );
  expect(item.indexOf("Dragons")).toBeLessThan(
    item.indexOf(recordedDayLabel(demo.recordedAt)),
  );
  expect(item.indexOf('aria-label="Duration"')).toBeLessThan(
    item.indexOf('aria-label="Players"'),
  );
  expect(item.indexOf('aria-label="Players"')).toBeLessThan(
    item.indexOf("MapGenius"),
  );
  expect(item.indexOf("MapGenius")).toBeLessThan(
    item.indexOf("Tournament Server 2"),
  );
  expect(item).toContain('data-mission-type="CTF"');
  expect(item).toContain('aria-label="Tournament mode"');
  expect(item).toContain('aria-label="Commentary track"');
  expect(item).toContain("Recorded on");
  expect(item).toContain("Recorded by");
  expect(item).toContain("Server");
  expect(item).toContain('title="Player One, Player Two"');
  expect(labels).toContain("43m");
  expect(labels).toContain("26");
  expect(labels).not.toContain("26 players");
  expect(labels).not.toContain("·");
});

it("omits default teams, missing titles, and unavailable source fields", () => {
  fixture.demos = [
    {
      ...demo,
      server: "",
      recorder: "",
      hasCommentary: false,
      games: [
        {
          ...demo.games[0],
          title: undefined,
          tournament: false,
          teamNames: { 1: "Storm", 2: "Inferno" },
        },
      ],
    },
  ];
  const item = renderItem();
  expect(item).toContain("TWL_Harvester");
  expect(item).not.toContain("Indexed quarterfinals");
  expect(item).not.toContain("Storm");
  expect(item).not.toContain("Inferno");
  expect(item).not.toContain("Recorded by");
  expect(item).not.toContain("Server");
  expect(item).not.toContain('aria-label="Tournament mode"');
  expect(item).not.toContain('aria-label="Commentary track"');
  expect(item).toContain('aria-label="Duration"');
  expect(item).toContain('aria-label="Players"');
});

it("keeps titles and custom teams in game order for demos spanning multiple maps", () => {
  fixture.demos = [
    {
      ...demo,
      games: [
        demo.games[0],
        {
          ...demo.games[0],
          mission: "S5_Damnation",
          startMs: 60_000,
          title: "Semifinals",
          teamNames: { 2: "Crusaders", 1: "Athletes" },
        },
      ],
    },
  ];
  const item = renderItem();
  const labels = text(item);
  expect(labels).toContain("TWL_Harvester → S5_Damnation");
  expect(labels).toContain("Indexed quarterfinals → Semifinals");
  expect(labels).toContain("Knights vs Dragons → Athletes vs Crusaders");
  expect(item.match(/data-mission-type="CTF"/g)).toHaveLength(1);
});

it("formats recordings with an unknown timezone consistently in the entry", () => {
  fixture.demos = [{ ...demo, recordedAtTimezone: "unknown" }];
  const item = renderItem();
  expect(text(item)).toContain(
    `${recordedDayLabel(demo.recordedAt, "unknown")} ${formatRecordedTime(demo.recordedAt, "unknown")}`,
  );
});

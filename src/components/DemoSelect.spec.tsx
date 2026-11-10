import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryObserver,
  type UseQueryResult,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { DemoSelect } from "./DemoSelect";
import { formatRecordedTime, recordedDayLabel } from "./demoFormat";

type IndexQueryResult = Pick<
  UseQueryResult<DemoIndexEntry[]>,
  "data" | "isPending" | "isError" | "refetch"
>;

const fixture = vi.hoisted(() => ({
  demos: [] as DemoIndexEntry[],
  isOpen: true,
  refetch: vi.fn(),
  queryResult: null as (() => IndexQueryResult) | null,
}));
const effects = vi.hoisted(() => ({
  enabled: false,
  index: 0,
  entries: [] as {
    deps: readonly unknown[];
    cleanup?: (() => void) | void;
  }[],
  pending: [] as (() => void)[],
}));
const cleanups: (() => void)[] = [];

// Exercise opening effects after each render while keeping the markup tests
// independent of a browser and preserving React's real render hooks.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    if (!effects.enabled) return;
    const index = effects.index++;
    const previous = effects.entries[index];
    if (
      previous &&
      deps.length === previous.deps.length &&
      deps.every((value, i) => Object.is(value, previous.deps[i]))
    )
      return;
    effects.pending.push(() => {
      previous?.cleanup?.();
      effects.entries[index] = { deps, cleanup: effect() };
    });
  },
}));

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
  useStoreState: () => fixture.isOpen,
}));
vi.mock("./useDemoIndex", () => ({
  useDemoIndex: () =>
    fixture.queryResult?.() ?? {
      data: fixture.demos,
      isPending: false,
      isError: false,
      refetch: fixture.refetch,
    },
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
  fixture.isOpen = true;
  fixture.refetch.mockReset().mockResolvedValue(undefined);
  fixture.queryResult = null;
  effects.enabled = false;
  effects.index = 0;
  effects.entries = [];
  effects.pending = [];
});

afterEach(() => {
  for (const effect of effects.entries) effect.cleanup?.();
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function renderPicker() {
  effects.index = 0;
  const markup = renderToStaticMarkup(<DemoSelect />);
  for (const effect of effects.pending.splice(0)) effect();
  return markup;
}

function renderItem() {
  const markup = renderPicker();
  const item = markup.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
  expect(item).toBeDefined();
  return item!;
}

const text = (markup: string) => markup.replace(/<[^>]*>/g, "");

function observeIndex(
  cached: DemoIndexEntry[],
  queryFn: () => Promise<DemoIndexEntry[]>,
) {
  const client = new QueryClient();
  const queryKey = ["demoIndex"];
  client.setQueryData(queryKey, cached);
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn,
    staleTime: Infinity,
    retry: false,
  });
  const unsubscribe = observer.subscribe(() => {});
  cleanups.push(() => {
    unsubscribe();
    client.clear();
  });
  fixture.queryResult = () => observer.getCurrentResult();
  effects.enabled = true;
  return observer;
}

it("refreshes on opening without delaying the cached list, then updates it in place", async () => {
  const replacement = { ...demo, filename: "replacement.rec" };
  let finishRefresh!: (demos: DemoIndexEntry[]) => void;
  const pending = new Promise<DemoIndexEntry[]>((resolve) => {
    finishRefresh = resolve;
  });
  const queryFn = vi
    .fn<() => Promise<DemoIndexEntry[]>>()
    .mockReturnValueOnce(pending)
    .mockResolvedValue([replacement]);
  const observer = observeIndex([demo], queryFn);

  fixture.isOpen = false;
  renderPicker();
  expect(queryFn).not.toHaveBeenCalled();

  fixture.isOpen = true;
  const duringRefresh = renderPicker();
  expect(queryFn).toHaveBeenCalledOnce();
  expect(observer.getCurrentResult().isFetching).toBe(true);
  expect(duringRefresh).toContain('data-demo="match.rec"');
  expect(duringRefresh).toContain("Tournament mode only");
  expect(duringRefresh).not.toContain("Loading demos");

  renderPicker();
  expect(queryFn).toHaveBeenCalledOnce();

  finishRefresh([replacement]);
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().data).toEqual([replacement]),
  );
  const refreshed = renderPicker();
  expect(refreshed).toContain('data-demo="replacement.rec"');
  expect(refreshed).not.toContain('data-demo="match.rec"');
  expect(queryFn).toHaveBeenCalledOnce();

  fixture.isOpen = false;
  renderPicker();
  fixture.isOpen = true;
  const reopened = renderPicker();
  expect(reopened).toContain('data-demo="replacement.rec"');
  expect(queryFn).toHaveBeenCalledTimes(2);
});

it.each([false, true])(
  "keeps the cached picker usable if its background refresh fails, with an empty cache: %s",
  async (empty) => {
    const cached = empty ? [] : [demo];
    let failRefresh!: (error: Error) => void;
    const queryFn = vi.fn(
      () =>
        new Promise<DemoIndexEntry[]>((_resolve, reject) => {
          failRefresh = reject;
        }),
    );
    const observer = observeIndex(cached, queryFn);
    renderPicker();
    expect(queryFn).toHaveBeenCalledOnce();

    failRefresh(new Error("Demo index unavailable"));
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().isError).toBe(true),
    );
    const failed = renderPicker();
    expect(observer.getCurrentResult().data).toEqual(cached);
    expect(failed).not.toContain("Couldn't load the demo list");
    expect(failed).not.toContain("Loading demos");
    if (empty) expect(failed).toContain("No demos indexed yet");
    else {
      expect(failed).toContain('data-demo="match.rec"');
      expect(failed).toContain("Tournament mode only");
      expect(failed).toContain("Has commentary");
    }
    expect(queryFn).toHaveBeenCalledOnce();
  },
);

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

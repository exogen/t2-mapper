import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClipPage, ClipView } from "../../relay/clipTypes";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { UserClips } from "./UserClips";

const OWNER = "123456789012345678";
const OTHER = "223456789012345678";
const fixture = vi.hoisted(() => ({
  data: undefined as ClipPage | undefined,
  isError: false,
  isFetching: false,
  requestedPage: 1,
  setPage: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  invalidate: vi.fn(),
  action: { deleting: null as string | null, error: null as string | null },
  setAction: vi.fn(),
  cards: [] as Array<{
    clip: ClipView;
    canEdit?: boolean;
    onDelete?: () => void;
    deleting?: boolean;
  }>,
  query: {} as {
    queryKey: readonly (string | number)[];
    enabled: boolean;
    queryFn: (context: { signal: AbortSignal }) => Promise<ClipPage>;
    refetchInterval: (query: { state: { data?: ClipPage } }) => number | false;
  },
  pagination: {} as {
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
  },
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) =>
    initial === 1
      ? [fixture.requestedPage, fixture.setPage]
      : [fixture.action, fixture.setAction],
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: fixture.invalidate }),
  useQuery: (options: typeof fixture.query) => {
    fixture.query = options;
    return {
      data: fixture.data,
      isError: fixture.isError,
      isFetching: fixture.isFetching,
    };
  },
}));
vi.mock("../stream/clipApi", () => ({
  readUserClips: fixture.read,
  deleteClip: fixture.remove,
  clipShareUrl: (clip: ClipView) =>
    `https://play.example.com/?demo=${encodeURIComponent(clip.sourceDemo)}&clip=${clip.id}`,
}));
vi.mock("./ClipCard", async (original) => {
  const { ClipCard } = await original<typeof import("./ClipCard")>();
  return {
    ClipCard: (props: Parameters<typeof ClipCard>[0]) => {
      fixture.cards.push(props);
      return <ClipCard {...props} />;
    },
  };
});
vi.mock("./DemoPagination", async (original) => {
  const { DemoPagination } =
    await original<typeof import("./DemoPagination")>();
  return {
    DemoPagination: (props: Parameters<typeof DemoPagination>[0]) => {
      fixture.pagination = props;
      return <DemoPagination {...props} />;
    },
  };
});
vi.mock("./PreviewTileArt", () => ({
  MissionPreviewTileArt: ({
    mission,
    children,
  }: {
    mission: string;
    children: ReactNode;
  }) => <span data-mission={mission}>{children}</span>,
}));

const demos: DemoIndexEntry[] = [
  {
    filename: "match.rec",
    bytes: 1,
    recordedAt: "2026-11-15T12:00:00Z",
    server: "Example server",
    address: "example.test:28000",
    games: [
      {
        mission: "Katabatic",
        gameType: "CTF",
        startMs: 5000,
        tournament: false,
        title: "Opening match",
        teamNames: { 1: "Storm", 2: "Inferno" },
      },
      {
        mission: "Rollercoaster",
        gameType: "CTF",
        startMs: 60_000,
        tournament: false,
        title: "Championship final",
        teamNames: { 0: "Observer", 1: "Knights", 2: "Dragons" },
      },
    ],
    mod: "base",
    recorder: "MapGenius",
    durationMs: 120_000,
    players: [],
  },
];

function clip(id = "first"): ClipView {
  return {
    id,
    sourceDemo: "match.rec",
    startSec: 0,
    durationMs: 23_000,
    ownerDiscordId: OWNER,
    title: `Clip ${id}`,
    createdAt: Date.UTC(2026, 10, 15, 12),
    state: "ready",
    checkpointUrl: `/api/clips/${id}/checkpoint`,
  };
}

function page(clips: ClipView[] = []): ClipPage {
  return { clips, total: clips.length, page: 1, pageSize: 6, pending: 0 };
}

const render = (
  userId = OWNER,
  index: DemoIndexEntry[] | undefined = demos,
  canDelete = false,
) =>
  renderToStaticMarkup(
    <UserClips
      userId={userId}
      demos={index}
      creatorName="Discord Display Name"
      canDelete={canDelete}
    />,
  );

beforeEach(() => {
  fixture.data = page();
  fixture.isError = fixture.isFetching = false;
  fixture.requestedPage = 1;
  fixture.setPage.mockClear();
  fixture.read.mockReset();
  fixture.remove.mockReset();
  fixture.confirm.mockReset().mockReturnValue(true);
  fixture.invalidate.mockReset().mockResolvedValue(undefined);
  fixture.action = { deleting: null, error: null };
  fixture.setAction.mockReset().mockImplementation((next) => {
    fixture.action = typeof next === "function" ? next(fixture.action) : next;
  });
  fixture.cards = [];
  vi.stubGlobal("window", { confirm: fixture.confirm });
});

afterEach(() => vi.unstubAllGlobals());

it("offers editing and deletion only on the owner's own clips and honors cancellation", () => {
  fixture.data = page([clip()]);
  expect(render()).not.toContain('aria-label="Delete clip:');
  expect(fixture.cards.at(-1)?.onDelete).toBeUndefined();
  expect(fixture.cards.at(-1)?.canEdit).toBe(false);
  const html = render(OWNER, demos, true);
  expect(html).toContain('aria-label="Delete clip: Clip first"');
  expect(html).toContain('aria-label="Edit clip title"');
  expect(html.indexOf("</a>")).toBeLessThan(
    html.indexOf('aria-label="Delete clip:'),
  );
  fixture.confirm.mockReturnValue(false);
  fixture.cards.at(-1)?.onDelete?.();
  expect(fixture.confirm).toHaveBeenCalledWith(
    "Permanently delete this clip?\n\nClip first",
  );
  expect(fixture.remove).not.toHaveBeenCalled();
  fixture.data = page([{ ...clip(), ownerDiscordId: OTHER }]);
  render(OWNER, demos, true);
  expect(fixture.cards.at(-1)?.onDelete).toBeUndefined();
  expect(fixture.cards.at(-1)?.canEdit).toBe(false);
});

it("guards duplicate deletion requests and refreshes every page for the original creator", async () => {
  fixture.data = page([clip()]);
  let finish!: () => void;
  fixture.remove.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(OWNER, demos, true);
  const remove = fixture.cards.at(-1)!.onDelete!;
  remove();
  remove();
  expect(fixture.remove).toHaveBeenCalledOnce();
  expect(fixture.remove).toHaveBeenCalledWith("first", expect.any(AbortSignal));
  expect(fixture.confirm).toHaveBeenCalledOnce();
  expect(fixture.action.deleting).toBe("first");
  render(OWNER, demos, true);
  expect(fixture.cards.at(-1)?.deleting).toBe(true);
  finish();
  await vi.waitFor(() =>
    expect(fixture.invalidate).toHaveBeenCalledWith({
      queryKey: ["userClips", OWNER],
    }),
  );
  expect(fixture.action).toEqual({ deleting: null, error: null });
});

it("shows deletion failures and still refreshes after a possibly lost response", async () => {
  fixture.data = page([clip()]);
  fixture.remove.mockRejectedValue(new Error("Connection interrupted"));
  render(OWNER, demos, true);
  fixture.cards.at(-1)!.onDelete!();
  await vi.waitFor(() =>
    expect(fixture.invalidate).toHaveBeenCalledWith({
      queryKey: ["userClips", OWNER],
    }),
  );
  expect(fixture.action.deleting).toBeNull();
  const html = render(OWNER, demos, true);
  expect(html).toContain("Connection interrupted");
  expect(html).toContain('role="alert"');
});

it("loads the selected creator's public page with the query cancellation signal", async () => {
  const result = page([clip()]);
  fixture.read.mockResolvedValue(result);
  render();
  const controller = new AbortController();
  await expect(
    fixture.query.queryFn({ signal: controller.signal }),
  ).resolves.toEqual(result);
  expect(fixture.read).toHaveBeenCalledWith(OWNER, 1, controller.signal, false);
  expect(fixture.query.queryKey).toEqual(["userClips", OWNER, 1, "public"]);
  expect(fixture.query.enabled).toBe(true);
  render(OTHER);
  expect(fixture.query.queryKey).toEqual(["userClips", OTHER, 1, "public"]);
  expect(render("invalid")).toBe("");
  expect(fixture.query.enabled).toBe(false);
});

it("shows only returned clip cards with links to their saved camera playback", () => {
  fixture.data = page([{ ...clip("newer"), startSec: 70 }, clip("older")]);
  const html = render();
  expect(html.indexOf("Clip newer")).toBeLessThan(html.indexOf("Clip older"));
  expect(html).toContain(
    'href="https://play.example.com/?demo=match.rec&amp;clip=newer"',
  );
  expect(html).toContain('dateTime="2026-11-15T12:00:00.000Z"');
  expect(html).toContain('data-mission="Rollercoaster"');
  expect(html).toContain('data-mission="Katabatic"');
  expect(html).not.toContain("data-mission-type");
  expect(html).not.toContain("TileMapName");
  expect(html).toContain("Clipped ");
  expect(html).toContain("Clipped Sun, Nov 15, 2026</time>");
  expect(html).not.toMatch(/\d+:\d{2} [AP]M/);
  expect(html).toContain("23s");
  expect(html).not.toContain("&lt;1m");
  expect(html).toContain('title="Example server"');
  expect(html).not.toContain("Saved ");
  expect(html.match(/title="Discord Display Name"/g)).toHaveLength(2);
  expect(html).toContain("TileRecorderIcon");
  expect(html).toContain("Opening match");
  expect(html).toContain("Championship final");
  expect(html.indexOf("Championship final")).toBeLessThan(
    html.indexOf("Knights"),
  );
  expect(html.replace(/<[^>]*>/g, "")).toContain("Knights vs Dragons");
  expect(html).not.toContain("Storm");
  expect(html).not.toContain("Inferno");
  expect(html).not.toContain("Observer");
  expect(html).toContain("TilePlaceholder");
  expect(html).toContain('title="Clip newer"');
  expect(render(OWNER, [])).not.toContain("Unknown map");
  expect(render(OWNER, [])).toContain("Clip newer");
  expect(html).not.toContain("No clips yet.");
  expect(html).not.toContain('aria-label="Clip pages"');
});

it("converts server pages into independent profile pagination without slicing twice", () => {
  fixture.requestedPage = 2;
  fixture.data = {
    ...page(Array.from({ length: 6 }, (_, index) => clip(String(index + 6)))),
    total: 13,
    page: 2,
  };
  const html = render();
  expect(html.match(/data-clip-card="true"/g)).toHaveLength(6);
  expect(html).toContain('aria-label="Clip pages"');
  expect(fixture.query.queryKey).toEqual(["userClips", OWNER, 2, "public"]);
  expect(fixture.pagination).toMatchObject({ page: 1, pageCount: 3 });
  fixture.pagination.onPageChange(2);
  expect(fixture.setPage).toHaveBeenCalledWith(3);
  fixture.data = { ...fixture.data, total: 7, page: 2, clips: [clip("last")] };
  render();
  expect(fixture.pagination).toMatchObject({ page: 1, pageCount: 2 });
});

it.each([
  { data: undefined, isError: false, text: "Loading clips…" },
  { data: page(), isError: false, text: "No clips yet." },
  { data: { ...page(), pending: 1 }, isError: false, text: "Preparing clips…" },
  { data: undefined, isError: true, text: "Could not load clips." },
])("distinguishes clip state $text", ({ data, isError, text }) => {
  fixture.data = data;
  fixture.isError = isError;
  const html = render();
  expect(html).toContain(text);
  expect(html.includes('role="alert"')).toBe(isError);
});

it("retains cards during a failed refresh and polls only while clips are being prepared", () => {
  fixture.data = { ...page([clip()]), pending: 2 };
  fixture.isError = fixture.isFetching = true;
  const html = render();
  expect(html).toContain("Clip first");
  expect(html).toContain("Could not refresh clips.");
  expect(html).toContain('aria-label="Refreshing clips"');
  expect(fixture.query.refetchInterval({ state: { data: fixture.data } })).toBe(
    3_000,
  );
  expect(fixture.query.refetchInterval({ state: { data: page() } })).toBe(
    false,
  );
  expect(fixture.query.refetchInterval({ state: {} })).toBe(false);
});

it("requests an owner-only list and exposes failures and processing clips for deletion", async () => {
  fixture.data = page([
    { ...clip("failed"), state: "failed" },
    { ...clip("pending"), state: "processing" },
  ]);
  const markup = render(OWNER, demos, true);
  expect(markup).toContain("Could not prepare clip");
  expect(markup).toContain("Preparing clip…");
  expect(fixture.cards.every((card) => !!card.onDelete)).toBe(true);
  expect(fixture.query.queryKey).toEqual(["userClips", OWNER, 1, "manage"]);
  const signal = new AbortController().signal;
  await fixture.query.queryFn({ signal });
  expect(fixture.read).toHaveBeenCalledWith(OWNER, 1, signal, true);
});

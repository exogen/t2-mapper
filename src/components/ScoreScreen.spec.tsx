import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { casterStore } from "../state/casterStore";
import { ScoreScreen } from "./ScoreScreen";
import { ScoreHUD } from "./ScoreHUD";
import type { PlayerRosterEntry, TeamScore } from "../stream/types";

const fixture = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  source: "demo" as "demo" | "live" | "map",
  role: "watcher",
  liveReady: true,
  snapshot: {
    playerRoster: [] as PlayerRosterEntry[],
    connectedClientId: null,
    teamScores: [] as TeamScore[],
  },
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) =>
    fixture.effects.push(effect),
}));
vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("../state/gameEntityStore", async (original) => ({
  ...(await original<typeof import("../state/gameEntityStore")>()),
  useDataSource: () => fixture.source,
}));
vi.mock("../state/liveConnectionStore", async (original) => ({
  ...(await original<typeof import("../state/liveConnectionStore")>()),
  useLiveSelector: (select: (s: unknown) => unknown) => select(fixture),
}));
vi.mock("../state/streamSnapshotStore", async (original) => ({
  ...(await original<typeof import("../state/streamSnapshotStore")>()),
  useStreamSnapshot: (select: (s: unknown) => unknown) =>
    select(fixture.snapshot),
}));
vi.mock("./InputControls", () => ({
  inputControlsStore: { setState: vi.fn() },
}));

beforeEach(() => {
  fixture.source = "demo";
  fixture.role = "watcher";
  fixture.liveReady = true;
  fixture.snapshot.playerRoster = [];
  fixture.snapshot.teamScores = [
    { teamId: 1, name: "Storm", score: 1, playerCount: 0 },
    { teamId: 2, name: "Inferno", score: 2, playerCount: 0 },
    { teamId: 3, name: "Starwolf", score: 3, playerCount: 0 },
  ];
  casterStore.getState().activate("test:28000", "1", "Katabatic");
});
afterEach(() => {
  for (const cleanup of fixture.cleanups.splice(0).reverse()) cleanup();
  fixture.effects.length = 0;
  casterStore.getState().suspend();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function player(
  name: string,
  teamId: number,
  clientId: number,
): PlayerRosterEntry {
  return {
    name,
    rawName: name,
    teamId,
    clientId,
    score: 0,
    ping: 45,
    packetLoss: 0,
  };
}

function scoreTables() {
  return [
    ...renderToStaticMarkup(<ScoreScreen onClose={() => {}} />).matchAll(
      /<table\b[^>]*>[\s\S]*?<\/table>/g,
    ),
  ].map(([table]) => table);
}

it("names the split score tables and supplies observer column headers", () => {
  fixture.snapshot.teamScores = fixture.snapshot.teamScores.slice(0, 2);
  fixture.snapshot.playerRoster = [
    player("Alice", 1, 1),
    player("Bob", 1, 2),
    player("Carol", 2, 3),
    player("Watcher 1", 0, 4),
    player("Watcher 2", 0, 5),
    player("Watcher 3", 0, 6),
  ];
  const tables = scoreTables();
  expect(tables).toHaveLength(4);
  for (const [index, label] of [
    "Storm players",
    "Inferno players",
    "Observers, left column",
    "Observers, right column",
  ].entries()) {
    expect(tables[index].match(/<table[^>]*>/)?.[0]).toContain(
      `aria-label="${label}"`,
    );
    expect(tables[index].match(/<th[^>]*scope="col"[^>]*>/g)).toHaveLength(2);
  }
  for (const table of tables.slice(2)) {
    expect(table).toContain('<th scope="col">Player</th>');
    expect(table).toContain('<th scope="col">Score</th>');
  }
  // Empty rows still align the two halves visually, but are not extra players.
  expect(tables[1].match(/<tr aria-hidden="true">/g)).toHaveLength(1);
  expect(tables[3].match(/<tr aria-hidden="true">/g)).toHaveLength(1);
});

it("keeps empty real teams accessible while hiding an odd team's absent half", () => {
  fixture.snapshot.playerRoster = [player("Alice", 1, 1), player("Bob", 1, 2)];
  const tables = scoreTables();
  expect(tables).toHaveLength(4);
  expect(tables[1].match(/<table[^>]*>/)?.[0]).toContain(
    'aria-label="Inferno players"',
  );
  expect(tables[1].match(/<table[^>]*>/)?.[0]).not.toContain("aria-hidden");
  expect(tables[1]).toContain("Players (0)");
  expect(tables[2]).toContain('aria-label="Starwolf players"');
  expect(tables[3].match(/<table[^>]*>/)?.[0]).toContain('aria-hidden="true"');
});

it("gives the second free-for-all table a player header and hides its padding row", () => {
  fixture.snapshot.teamScores = [];
  fixture.snapshot.playerRoster = [
    player("Alice", 1, 1),
    player("Bob", 2, 2),
    player("Carol", 3, 3),
  ];
  const tables = scoreTables();
  expect(tables).toHaveLength(2);
  expect(tables[1].match(/<table[^>]*>/)?.[0]).toContain(
    'aria-label="Players, right column"',
  );
  expect(tables[1]).toContain(">Player</span>");
  expect(tables[1].match(/<th[^>]*scope="col"[^>]*>/g)).toHaveLength(2);
  expect(tables[1].match(/<tr aria-hidden="true">/g)).toHaveLength(1);
});

it.each(["F2", "Escape"])(
  "closes on a fresh %s press, not key repeat",
  (key) => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("Element", class extends EventTarget {});
    const onClose = vi.fn();
    renderToStaticMarkup(<ScoreScreen onClose={onClose} />);
    for (const effect of fixture.effects.splice(0)) {
      const cleanup = effect();
      if (cleanup) fixture.cleanups.push(cleanup);
    }
    // A nested team-name dialog owns its own exit keys.
    const nestedDialog = new Element();
    const nestedKey = Object.assign(new Event("keydown"), { code: key, key });
    Object.defineProperty(nestedKey, "target", {
      value: Object.assign(new Element(), { closest: () => nestedDialog }),
    });
    const nestedHandler = vi.fn();
    window.addEventListener("keydown", nestedHandler, { once: true });
    window.dispatchEvent(nestedKey);
    expect(nestedHandler).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    window.dispatchEvent(
      Object.assign(new Event("keydown"), { code: key, key, repeat: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
    const keyUp = vi.fn();
    window.addEventListener("keyup", keyUp, { once: true });
    window.dispatchEvent(Object.assign(new Event("keyup"), { code: key, key }));
    expect(keyUp).toHaveBeenCalledOnce();
    window.dispatchEvent(
      Object.assign(new Event("keydown"), { code: key, key, repeat: false }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  },
);

it.each(["demo", "live"] as const)(
  "offers team renaming for every score-screen team in %s mode",
  (source) => {
    fixture.source = source;
    casterStore.getState().renameTeam(1, "Knights");
    const html = renderToStaticMarkup(<ScoreScreen onClose={() => {}} />);
    expect(html).toContain('aria-label="Rename team 1: Knights"');
    expect(html).toContain('aria-label="Rename team 2: Inferno"');
    expect(html).toContain('aria-label="Rename team 3: Starwolf"');
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(3);
    expect(fixture.snapshot.teamScores[0].name).toBe("Storm");
  },
);

it.each(["no mission", "map", "live player", "watch not ready"])(
  "does not offer editing with %s",
  (mode) => {
    if (mode === "no mission") casterStore.getState().suspend();
    if (mode === "map") fixture.source = "map";
    if (mode === "live player") {
      fixture.source = "live";
      fixture.role = "player";
    }
    if (mode === "watch not ready") {
      fixture.source = "live";
      fixture.liveReady = false;
    }
    const html = renderToStaticMarkup(<ScoreScreen onClose={() => {}} />);
    expect(html).toContain("Storm");
    expect(html).not.toContain('aria-haspopup="dialog"');
    const hud = renderToStaticMarkup(<ScoreHUD hudStyle="solid" />);
    expect(hud).toContain("Storm");
    expect(hud).not.toContain('aria-haspopup="dialog"');
  },
);

it.each(["demo", "live"] as const)(
  "offers team renaming from the mini score HUD in %s mode without replacing server defaults",
  (source) => {
    fixture.source = source;
    casterStore.getState().renameTeam(1, "Knights");
    const html = renderToStaticMarkup(<ScoreHUD hudStyle="solid" />);
    expect(html).toContain('aria-label="Rename team 1: Knights"');
    expect(html).toContain('aria-label="Rename team 2: Inferno"');
    expect(html).toContain('aria-label="Rename team 3: Starwolf"');
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(3);
    expect(fixture.snapshot.teamScores[0].name).toBe("Storm");
  },
);

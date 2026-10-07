import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { casterStore } from "../state/casterStore";
import { ScoreScreen } from "./ScoreScreen";
import { ScoreHUD } from "./ScoreHUD";

const fixture = vi.hoisted(() => ({
  source: "demo" as "demo" | "live" | "map",
  role: "watcher",
  liveReady: true,
  snapshot: {
    playerRoster: [],
    connectedClientId: null,
    teamScores: [
      { teamId: 1, name: "Storm", score: 1, playerCount: 0 },
      { teamId: 2, name: "Inferno", score: 2, playerCount: 0 },
      { teamId: 3, name: "Starwolf", score: 3, playerCount: 0 },
    ],
  },
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
  casterStore.getState().activate("test:28000", "1", "Katabatic");
});
afterEach(() => casterStore.getState().suspend());

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

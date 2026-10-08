import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MatchHUD } from "./MatchHUD";
import { casterStore } from "../state/casterStore";
import { streamClock } from "../state/streamPlaybackStore";
import type { StreamSnapshot, TeamScore } from "../stream/types";
import type { TeamColorScheme } from "./iffTheme";
import type { ScoreStyle } from "./SettingsProvider";

const state = vi.hoisted(() => ({
  snapshot: {
    timeSec: 0,
    teamScores: [] as TeamScore[],
    playerSensorGroup: 0,
    playerRoster: [],
    flagDroppedAtSec: {} as Partial<Record<number, number>>,
    flagReturnDelaySec: 45 as number | null,
    matchEndedAtSec: null as number | null,
  },
  observerTeamColors: "blueOrange" as TeamColorScheme,
  scoreStyle: "classic" as ScoreStyle,
  missionType: "CTF" as string | null,
}));

vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("./SettingsProvider", () => ({ useSettings: () => state }));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (select: (snapshot: Partial<StreamSnapshot>) => unknown) =>
    select(state.snapshot),
  streamSnapshotStore: { getState: () => ({ snapshot: state.snapshot }) },
}));
vi.mock("../state/gameEntityStore", () => ({
  useDataSource: () => "demo",
  useMissionType: () => state.missionType,
}));
vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: () => false,
}));
vi.mock("./InputControls", () => ({
  inputControlsStore: { setState: vi.fn() },
}));
vi.mock("./useMatchClock", async (original) => ({
  ...(await original<typeof import("./useMatchClock")>()),
  useMatchClockMs: () => -123_000,
}));

beforeEach(() => {
  state.snapshot.teamScores = [
    { teamId: 1, name: "Storm", score: 3, playerCount: 12, flagStatus: "home" },
    {
      teamId: 2,
      name: "Inferno",
      score: 2,
      playerCount: 11,
      flagStatus: "held",
      flagCarrier: "Carrier",
    },
  ];
  state.snapshot.playerSensorGroup = 0;
  state.snapshot.timeSec = 0;
  state.snapshot.flagDroppedAtSec = {};
  state.snapshot.flagReturnDelaySec = 45;
  state.snapshot.matchEndedAtSec = null;
  streamClock.time = 0;
  state.observerTeamColors = "blueOrange";
  state.scoreStyle = "classic";
  state.missionType = "CTF";
  casterStore.getState().activate("test:28000", "1", "Katabatic");
});
afterEach(() => {
  casterStore.getState().suspend();
  streamClock.time = 0;
});

it.each(["classic", "broadcast"] as const)(
  "counts down a dropped flag on the playback clock in %s",
  (variant) => {
    state.snapshot.teamScores[0].flagStatus = "field";
    state.snapshot.flagDroppedAtSec = { 1: 10 };
    streamClock.time = 25;
    const render = () => renderToStaticMarkup(<MatchHUD variant={variant} />);
    expect(render()).toMatch(/Dropped <span[^>]*>–<\/span> 30s/);
    streamClock.time = 26;
    expect(render()).toMatch(/Dropped <span[^>]*>–<\/span> 29s/);
    // Seeking back uses the restored playback time, not time spent viewing.
    streamClock.time = 20;
    expect(render()).toMatch(/Dropped <span[^>]*>–<\/span> 35s/);
    state.snapshot.matchEndedAtSec = 20;
    streamClock.time = 100;
    expect(render()).toMatch(/Dropped <span[^>]*>–<\/span> 35s/);
    state.snapshot.teamScores[0].flagStatus = "home";
    expect(render()).not.toContain("Dropped");
  },
);

it.each(["classic", "broadcast"] as const)(
  "keeps unknown dropped-flag timers unlabeled in %s",
  (variant) => {
    state.snapshot.teamScores[0].flagStatus = "field";
    const render = () => renderToStaticMarkup(<MatchHUD variant={variant} />);
    expect(render()).toContain(">Dropped</span>");
    state.snapshot.flagDroppedAtSec = { 1: 0 };
    state.snapshot.flagReturnDelaySec = null;
    expect(render()).toContain(">Dropped</span>");
  },
);

it("uses custom team names and the existing match clock in the Broadcast HUD", () => {
  casterStore.getState().renameTeams({ 1: "Blood Eagle" });
  const html = renderToStaticMarkup(<MatchHUD variant="broadcast" />);
  expect(html).toContain("Rename team 1: Blood Eagle");
  expect(html).toContain("Rename team 2: Inferno");
  expect(html).toContain("02:03");
  expect(html).toContain("12 players");
  expect(html).toContain(">Home</span>");
  expect(html).toContain(">Carrier</span>");
  expect(html).not.toContain("Own flag");
});

it("shows every team without inventing flags for non-CTF games", () => {
  state.snapshot.teamScores = Array.from({ length: 4 }, (_, i) => ({
    teamId: i + 1,
    name: `Side ${i + 1}`,
    score: i * 100,
    playerCount: 5,
  }));
  const html = renderToStaticMarkup(<MatchHUD variant="broadcast" />);
  for (const team of state.snapshot.teamScores)
    expect(html).toContain(`Rename team ${team.teamId}: ${team.name}`);
  expect(html).not.toContain("Own flag");
  expect(html).not.toContain("Home");
});

it("does not assume a second team exists", () => {
  state.snapshot.teamScores = [
    { teamId: 1, name: "Rabbit", score: 7, playerCount: 1 },
  ];
  const html = renderToStaticMarkup(<MatchHUD variant="broadcast" />);
  expect(html).toContain("Rename team 1: Rabbit");
  expect(html).not.toContain("Rename team 2");
  expect(html).not.toContain("Inferno");
  expect(html).not.toContain("Own flag");
});

it("keeps a clock without phantom teams before team data is available", () => {
  state.snapshot.teamScores = [];
  expect(renderToStaticMarkup(<MatchHUD variant="classic" />)).toBe("");
  const html = renderToStaticMarkup(<MatchHUD variant="broadcast" />);
  expect(html).toContain("02:03");
  expect(html).not.toContain("Rename team");
});

it.each(["classic", "broadcast"] as const)(
  "leaves an unknown flag state blank in %s",
  (variant) => {
    state.snapshot.teamScores[0].flagStatus = undefined;
    const html = renderToStaticMarkup(<MatchHUD variant={variant} />);
    expect(html).not.toContain("Home");
    expect(html).toContain("Carrier");
  },
);

it("uses observer color preferences and keeps the recorder's friendly team first", () => {
  state.observerTeamColors = "redGreen";
  let html = renderToStaticMarkup(<MatchHUD variant="broadcast" />);
  expect(html.indexOf("--team-color:rgb(255, 0, 0)")).toBeLessThan(
    html.indexOf("--team-color:rgb(0, 155, 53)"),
  );
  state.snapshot.playerSensorGroup = 2;
  html = renderToStaticMarkup(<MatchHUD variant="broadcast" />);
  expect(html.indexOf("Rename team 2")).toBeLessThan(
    html.indexOf("Rename team 1"),
  );
  expect(html.indexOf("--team-color:rgb(0, 155, 53)")).toBeLessThan(
    html.indexOf("--team-color:rgb(255, 0, 0)"),
  );
});

it.each(["classic", "broadcast"] as const)(
  "shows CTF hundreds as captures in the %s HUD without changing the raw scores",
  (variant) => {
    state.scoreStyle = "competition";
    for (const [raw, expected] of [
      [
        [302, 210],
        [3, 2],
      ],
      [
        [99, 1234],
        [0, 12],
      ],
    ]) {
      state.snapshot.teamScores.forEach((team, i) => {
        team.score = raw[i];
      });
      const html = renderToStaticMarkup(<MatchHUD variant={variant} />);
      for (const score of expected) {
        expect(html).toMatch(new RegExp(`>${score}</(?:div|td)>`));
      }
      expect(state.snapshot.teamScores.map((team) => team.score)).toEqual(raw);
    }
    state.scoreStyle = "classic";
    const html = renderToStaticMarkup(<MatchHUD variant={variant} />);
    expect(html).toMatch(/>99<\/(?:div|td)>/);
    expect(html).toMatch(/>1,234<\/(?:div|td)>/);
  },
);

it.each(["TR2", "Rabbit", "Arena", "CnH", null])(
  "keeps raw scores for %s even with Competition selected",
  (missionType) => {
    state.scoreStyle = "competition";
    state.missionType = missionType;
    state.snapshot.teamScores[0].score = 302;
    for (const variant of ["classic", "broadcast"] as const) {
      const html = renderToStaticMarkup(<MatchHUD variant={variant} />);
      expect(html).toMatch(/>302<\/(?:div|td)>/);
    }
  },
);

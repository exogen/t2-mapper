import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MatchHUD } from "./MatchHUD";
import { casterStore } from "../state/casterStore";
import { streamClock } from "../state/streamPlaybackStore";
import type {
  PlayerRosterEntry,
  StreamSnapshot,
  TeamScore,
} from "../stream/types";
import type { TeamColorScheme } from "./iffTheme";
import type { ScoreStyle } from "./SettingsProvider";

const state = vi.hoisted(() => ({
  snapshot: {
    timeSec: 0,
    teamScores: [] as TeamScore[],
    playerSensorGroup: 0,
    playerRoster: [] as PlayerRosterEntry[],
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
vi.mock("../state/streamSnapshotStore", async (original) => ({
  useStreamSnapshot: (select: (snapshot: Partial<StreamSnapshot>) => unknown) =>
    select(state.snapshot),
  streamSnapshotStore: {
    ...(await original<typeof import("../state/streamSnapshotStore")>())
      .streamSnapshotStore,
    getState: () => ({ snapshot: state.snapshot }),
  },
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
    {
      teamId: 1,
      name: "Storm",
      score: 3,
      playerCount: 12,
      flag: { teamId: 1, status: "home" },
    },
    {
      teamId: 2,
      name: "Inferno",
      score: 2,
      playerCount: 11,
      flag: {
        teamId: 2,
        status: "held",
        carrier: { kind: "name", rawName: "Carrier" },
      },
    },
  ];
  state.snapshot.playerSensorGroup = 0;
  state.snapshot.playerRoster = [];
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
    state.snapshot.teamScores[0].flag!.status = "field";
    state.snapshot.flagDroppedAtSec = { 1: 10 };
    streamClock.time = 25;
    const render = () =>
      renderToStaticMarkup(
        <MatchHUD onOpenScoreScreen={() => {}} variant={variant} />,
      );
    expect(render()).toMatch(/Dropped <span[^>]*>–<\/span> 30s/);
    streamClock.time = 26;
    expect(render()).toMatch(/Dropped <span[^>]*>–<\/span> 29s/);
    // Seeking back uses the restored playback time, not time spent viewing.
    streamClock.time = 20;
    expect(render()).toMatch(/Dropped <span[^>]*>–<\/span> 35s/);
    state.snapshot.matchEndedAtSec = 20;
    streamClock.time = 100;
    expect(render()).toMatch(/Dropped <span[^>]*>–<\/span> 35s/);
    state.snapshot.teamScores[0].flag!.status = "home";
    expect(render()).not.toContain("Dropped");
  },
);

it.each(["classic", "broadcast"] as const)(
  "keeps unknown dropped-flag timers unlabeled in %s",
  (variant) => {
    state.snapshot.teamScores[0].flag!.status = "field";
    const render = () =>
      renderToStaticMarkup(
        <MatchHUD onOpenScoreScreen={() => {}} variant={variant} />,
      );
    expect(render()).toContain(">Dropped</span>");
    state.snapshot.flagDroppedAtSec = { 1: 0 };
    state.snapshot.flagReturnDelaySec = null;
    expect(render()).toContain(">Dropped</span>");
  },
);

it("uses custom team names and the existing match clock in the Broadcast HUD", () => {
  casterStore.getState().renameTeams({ 1: "Blood Eagle" });
  const html = renderToStaticMarkup(
    <MatchHUD onOpenScoreScreen={() => {}} variant="broadcast" />,
  );
  expect(html).toContain("Rename team 1: Blood Eagle");
  expect(html).toContain("Rename team 2: Inferno");
  expect(html).toContain("02:03");
  expect(html).toContain("12 players");
  expect(html).toContain(">Home</span>");
  expect(html).toContain(">Carrier</span>");
  expect(html).not.toContain("Own flag");
});

it("renders the broadcast flag carrier's clan and name colors from the flag message", () => {
  state.snapshot.teamScores[1].flag!.carrier = {
    kind: "name",
    rawName: "\x10\x0b=TAG=\x0cCarrier\x11",
  };
  const html = renderToStaticMarkup(
    <MatchHUD onOpenScoreScreen={() => {}} variant="broadcast" />,
  );
  expect(html).toContain('data-status="held"');
  expect(html).toContain('title="=TAG=Carrier"');
  expect(html).toContain('style="color:var(--tribes-color-7)">=TAG=</span>');
  expect(html).toContain('style="color:var(--tribes-color-8)">Carrier</span>');
  const classic = renderToStaticMarkup(
    <MatchHUD onOpenScoreScreen={() => {}} variant="classic" />,
  );
  expect(classic).toContain(">=TAG=Carrier</span>");
  expect(classic).not.toContain("--tribes-color-7");
});

it("uses roster name colors for older checkpoint state without raw carrier names", () => {
  state.snapshot.teamScores[1].flag!.carrier = {
    kind: "name",
    rawName: "=TAG=Carrier",
  };
  state.snapshot.playerRoster = [
    {
      clientId: 7,
      name: "=TAG=Carrier",
      rawName: "\x10\x0b=TAG=\x08Carrier\x11",
      teamId: 1,
      score: 0,
      ping: 0,
      packetLoss: 0,
    },
  ];
  const render = () =>
    renderToStaticMarkup(
      <MatchHUD onOpenScoreScreen={() => {}} variant="broadcast" />,
    );
  expect(render()).toContain(
    'style="color:var(--tribes-color-7)">=TAG=</span>',
  );
  // A duplicate display name cannot identify which raw name belongs to the carrier.
  state.snapshot.playerRoster = [
    ...state.snapshot.playerRoster,
    {
      ...state.snapshot.playerRoster[0],
      clientId: 8,
      rawName: "=TAG=Carrier",
    },
  ];
  expect(render()).not.toContain("--tribes-color-7");
  expect(render()).toContain(">=TAG=Carrier</span>");
});

it("shows every team without inventing flags for non-CTF games", () => {
  state.snapshot.teamScores = Array.from({ length: 4 }, (_, i) => ({
    teamId: i + 1,
    name: `Side ${i + 1}`,
    score: i * 100,
    playerCount: 5,
  }));
  const html = renderToStaticMarkup(
    <MatchHUD onOpenScoreScreen={() => {}} variant="broadcast" />,
  );
  for (const team of state.snapshot.teamScores)
    expect(html).toContain(`Rename team ${team.teamId}: ${team.name}`);
  expect(html).not.toContain("Own flag");
  expect(html).not.toContain("Home");
});

it("does not assume a second team exists", () => {
  state.snapshot.teamScores = [
    { teamId: 1, name: "Rabbit", score: 7, playerCount: 1 },
  ];
  const html = renderToStaticMarkup(
    <MatchHUD onOpenScoreScreen={() => {}} variant="broadcast" />,
  );
  expect(html).toContain("Rename team 1: Rabbit");
  expect(html).not.toContain("Rename team 2");
  expect(html).not.toContain("Inferno");
  expect(html).not.toContain("Own flag");
});

it("keeps a clock without phantom teams before team data is available", () => {
  state.snapshot.teamScores = [];
  expect(
    renderToStaticMarkup(
      <MatchHUD onOpenScoreScreen={() => {}} variant="classic" />,
    ),
  ).toBe("");
  const html = renderToStaticMarkup(
    <MatchHUD onOpenScoreScreen={() => {}} variant="broadcast" />,
  );
  expect(html).toContain("02:03");
  expect(html).not.toContain("Rename team");
});

it.each(["classic", "broadcast"] as const)(
  "leaves an unknown flag state blank in %s",
  (variant) => {
    state.snapshot.teamScores[0].flag = undefined;
    const html = renderToStaticMarkup(
      <MatchHUD onOpenScoreScreen={() => {}} variant={variant} />,
    );
    expect(html).not.toContain("Home");
    expect(html).toContain("Carrier");
  },
);

it.each(["classic", "broadcast"] as const)(
  "keeps the intended colors and the recorder's friendly team first in %s",
  (variant) => {
    const render = () =>
      renderToStaticMarkup(
        <MatchHUD onOpenScoreScreen={() => {}} variant={variant} />,
      );
    const colors = (html: string) =>
      [...html.matchAll(/--team-color:(rgb\([^)]+\))/g)].map(
        (match) => match[1],
      );
    if (variant === "broadcast") {
      for (const [scheme, expected] of [
        ["blueOrange", ["rgb(40, 152, 255)", "rgb(255, 100, 15)"]],
        ["greenRed", ["rgb(0, 212, 71)", "rgb(255, 60, 10)"]],
        ["redGreen", ["rgb(255, 60, 10)", "rgb(0, 212, 71)"]],
      ] as const) {
        state.observerTeamColors = scheme;
        expect(colors(render())).toEqual(expected);
      }
    }
    state.snapshot.playerSensorGroup = 2;
    const html = render();
    expect(html.indexOf("Rename team 2")).toBeLessThan(
      html.indexOf("Rename team 1"),
    );
    if (variant === "classic") {
      expect(html).toContain("--team-name-friendly:rgb(45, 228, 106)");
      expect(html).toContain("--team-name-default:rgb(121, 203, 212)");
      expect(colors(html)).toEqual([]);
    } else {
      expect(colors(html)).toEqual(["rgb(0, 212, 71)", "rgb(255, 60, 10)"]);
    }
  },
);

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
      const html = renderToStaticMarkup(
        <MatchHUD onOpenScoreScreen={() => {}} variant={variant} />,
      );
      for (const score of expected) {
        expect(html).toMatch(new RegExp(`>${score}</(?:div|td)>`));
      }
      expect(state.snapshot.teamScores.map((team) => team.score)).toEqual(raw);
    }
    state.scoreStyle = "classic";
    const html = renderToStaticMarkup(
      <MatchHUD onOpenScoreScreen={() => {}} variant={variant} />,
    );
    expect(html).toMatch(/>99<\/(?:div|td)>/);
    expect(html).toMatch(/>1,234<\/(?:div|td)>/);
  },
);

it.each(["PracticeCTF", "LCTF", "SCtF"])(
  "shows %s hundreds as captures",
  (missionType) => {
    state.scoreStyle = "competition";
    state.missionType = missionType;
    state.snapshot.teamScores[0].score = 104;
    state.snapshot.teamScores[1].score = 213;
    for (const variant of ["classic", "broadcast"] as const) {
      const html = renderToStaticMarkup(
        <MatchHUD onOpenScoreScreen={() => {}} variant={variant} />,
      );
      expect(html).toMatch(/>1<\/(?:div|td)>/);
      expect(html).toMatch(/>2<\/(?:div|td)>/);
      expect(html).not.toMatch(/>(?:104|213)<\/(?:div|td)>/);
    }
  },
);

it.each(["TR2", "Rabbit", "Arena", "CnH", null])(
  "keeps raw scores for %s even with Competition selected",
  (missionType) => {
    state.scoreStyle = "competition";
    state.missionType = missionType;
    state.snapshot.teamScores[0].score = 302;
    for (const variant of ["classic", "broadcast"] as const) {
      const html = renderToStaticMarkup(
        <MatchHUD onOpenScoreScreen={() => {}} variant={variant} />,
      );
      expect(html).toMatch(/>302<\/(?:div|td)>/);
    }
  },
);

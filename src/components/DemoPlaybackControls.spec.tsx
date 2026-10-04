import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { TimelineEvent } from "../state/demoTimelineStore";
import type { TeamColorScheme } from "./iffTheme";
import { DemoPlaybackControls } from "./DemoPlaybackControls";

const state = vi.hoisted(() => ({
  events: [] as TimelineEvent[] | null,
  observerPerspective: false,
  observerTeamColors: "blueOrange" as TeamColorScheme,
  recording: { duration: 100 },
  playback: {
    status: "paused",
    resumeAfterSeek: null,
    downloadComplete: true,
    pendingSeekSec: null,
    seekProgress: null,
  },
}));

vi.mock("./InputControls", () => ({ useInputAction() {} }));
vi.mock("./usePlayback", () => ({
  useRecording: () => state.recording,
  useIsPlaying: () => false,
  useIsSeeking: () => false,
  useCurrentTime: () => 0,
  useDuration: () => state.recording.duration,
  useSpeed: () => 1,
  SPEED_OPTIONS: [1],
  usePlaybackActions: () => ({ toggle() {}, seek() {}, setSpeed() {} }),
}));
vi.mock("../state/engineStore", () => ({
  isCurrentPlayback: () => true,
  useEngineSelector: (selector: (value: typeof state) => unknown) =>
    selector(state),
}));
vi.mock("../state/demoLoadStore", () => ({ useDemoLoad: () => null }));
vi.mock("../state/demoTimelineStore", () => ({
  useDemoTimeline: (selector: (value: typeof state) => unknown) =>
    selector(state),
}));
vi.mock("../state/demoDirectorStore", () => ({
  startDirector() {},
  exitDirector() {},
  useDirector: (
    selector: (value: {
      status: string;
      scanProgress: null;
      error: null;
    }) => unknown,
  ) => selector({ status: "idle", scanProgress: null, error: null }),
}));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({ observerTeamColors: state.observerTeamColors }),
}));

beforeEach(() => {
  state.events = [];
  state.recording.duration = 100;
  state.observerPerspective = false;
  state.observerTeamColors = "blueOrange";
});

function markers(...events: TimelineEvent[]) {
  state.events = events;
  return (
    renderToStaticMarkup(<DemoPlaybackControls />).match(
      /<button[^>]*data-type="(?:match-start|flag-cap)"[^>]*>[\s\S]*?<\/button>/g,
    ) ?? []
  );
}

it("adds capture markers with no held time in their labels alongside the match-start tick", () => {
  const result = markers(
    { type: "match-start", timeSec: 10, description: "Match started" },
    { type: "flag-grab", timeSec: 20, description: "Flag grabbed" },
    {
      type: "flag-cap",
      timeSec: 25,
      description: "Teammate captured the Inferno flag (Held: 00:04.70)",
      capturer: "Teammate",
      actorTeamId: 1,
      teamAffinity: "friendly",
    },
    { type: "flag-drop", timeSec: 30, description: "Flag dropped" },
    {
      type: "flag-cap",
      timeSec: 75,
      description: "Opponent captured the Storm flag",
      capturer: "Opponent",
      actorTeamId: 2,
      teamAffinity: "enemy",
    },
  );
  expect(result).toHaveLength(3);
  expect(result[0]).toContain("left:10%");
  expect(result[0]).toContain('title="Match started – 0:10"');
  expect(result[0]).not.toContain("<svg");
  expect(result[1]).toContain("left:25%;color:rgb(0, 212, 71)");
  expect(result[1]).toContain("<svg");
  expect(result[1]).toContain('title="Storm scores (Teammate) – 0:25"');
  expect(result[1]).toContain(
    'aria-label="Seek to Storm scores (Teammate) – 0:25"',
  );
  expect(result[2]).toContain("left:75%;color:rgb(255, 60, 10)");
  expect(result[2]).toContain('title="Inferno scores (Opponent) – 1:15"');
});

it("uses the scoring team's custom name rather than the captured flag's team", () => {
  expect(
    markers({
      type: "flag-cap",
      timeSec: 25,
      description: "Player captured the Inferno flag",
      capturer: "Player",
      actorTeamId: 1,
      actorTeamName: "Rambo",
      flagTeamName: "Inferno",
      flagTeamId: 2,
    })[0],
  ).toContain('title="Rambo scores (Player) – 0:25"');
});

it.each([
  ["blueOrange", "rgb(45, 162, 255)", "rgb(255, 100, 15)"],
  ["greenRed", "rgb(0, 212, 71)", "rgb(255, 60, 10)"],
  ["redGreen", "rgb(255, 60, 10)", "rgb(0, 212, 71)"],
] as const)(
  "uses the scoring team's %s observer color",
  (scheme, team1, team2) => {
    state.observerPerspective = true;
    state.observerTeamColors = scheme;
    const result = markers(
      {
        type: "flag-cap",
        timeSec: 25,
        description: "Inferno flag captured",
        actorTeamId: 1,
        flagTeamId: 2,
        teamAffinity: "neutral",
      },
      {
        type: "flag-cap",
        timeSec: 75,
        description: "Storm flag captured",
        actorTeamId: 2,
        flagTeamId: 1,
        teamAffinity: "neutral",
      },
    );
    expect(result[0]).toContain(`color:${team1}`);
    expect(result[1]).toContain(`color:${team2}`);
  },
);

it("keeps an unknown scoring team neutral", () => {
  expect(
    markers({ type: "flag-cap", timeSec: 25, description: "Flag captured" })[0],
  ).toContain("color:rgb(200, 200, 200)");
});

it("handles a capture-only timeline and multiple captures at the same timestamp", () => {
  expect(
    markers(
      { type: "flag-cap", timeSec: 25, description: "First capture" },
      { type: "flag-cap", timeSec: 25, description: "Second capture" },
    ),
  ).toHaveLength(2);
});

it("omits markers before scanning and when the duration is zero", () => {
  state.events = null;
  expect(renderToStaticMarkup(<DemoPlaybackControls />)).not.toContain(
    'data-type="flag-cap"',
  );
  state.recording.duration = 0;
  expect(
    markers({ type: "flag-cap", timeSec: 25, description: "Flag captured" }),
  ).toEqual([]);
});

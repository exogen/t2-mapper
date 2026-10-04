import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { TimelineEvent } from "../state/demoTimelineStore";
import { DemoTimeline } from "./DemoTimeline";
import type { TeamColorScheme } from "./iffTheme";

const state = vi.hoisted(() => ({
  events: [] as TimelineEvent[],
  scanProgress: null,
  error: null,
  observerPerspective: false,
  observerTeamColors: "blueOrange" as TeamColorScheme,
}));

vi.mock("../state/demoTimelineStore", () => ({
  useDemoTimeline: (selector: (value: typeof state) => unknown) =>
    selector(state),
}));
vi.mock("../state/gameEntityStore", () => ({
  useRecorderName: () => "OldName",
}));
vi.mock("../state/demoTimelineFollow", () => ({ seekToTimelineEvent() {} }));
vi.mock("./usePlayback", () => ({ useRecording: () => null }));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({
    setSidebarOpen() {},
    observerTeamColors: state.observerTeamColors,
  }),
}));
vi.mock("./useMediaQuery", () => ({ useMediaQuery: () => false }));

beforeEach(() => {
  state.observerPerspective = false;
  state.observerTeamColors = "blueOrange";
});

function renderMarkup(...events: TimelineEvent[]) {
  state.events = events;
  return renderToStaticMarkup(<DemoTimeline />);
}

function render(...events: TimelineEvent[]) {
  return renderMarkup(...events).replace(/<[^>]*>/g, "");
}

it.each([
  ["kill", "You killed Opponent"],
  ["flag-grab", "You grabbed the enemy flag"],
  ["flag-drop", "You dropped the flag"],
  ["flag-return", "You returned the flag"],
] as const)("keeps recorder %s labels after a rename", (type, label) => {
  expect(
    render({
      type,
      timeSec: 1,
      description: "Recorder event",
      isRecorder: true,
      killer: "NewName",
      victim: "Opponent",
      actor: "NewName",
    }),
  ).toContain(label);
});

it("labels the recorder's death even when its navigation target is the killer", () => {
  expect(
    render({
      type: "death",
      timeSec: 1,
      description: "Killed by Opponent",
      isRecorder: false,
      killer: "Opponent",
      victim: "NewName",
    }),
  ).toContain("Opponent killed you");
});

it("names another player using the recorder's former name", () => {
  expect(
    render({
      type: "flag-grab",
      timeSec: 1,
      description: "OldName grabbed the flag",
      isRecorder: false,
      actor: "OldName",
    }),
  ).toContain("OldName grabbed the enemy flag");
});

it("groups generator state changes and hides player filters for observers", () => {
  state.observerPerspective = true;
  const text = render(
    { type: "generator-offline", timeSec: 1, description: "Generator offline" },
    { type: "generator-online", timeSec: 2, description: "Generator online" },
    { type: "rename", timeSec: 3, description: "Name changed" },
  );
  expect(text).toContain("All (3)");
  expect(text).toContain("Gens (2)");
  expect(text).toContain("Names (1)");
  expect(text).not.toContain("Kills (");
  expect(text).not.toContain("Deaths (");
});

it("keeps empty player filters and hides an empty rename filter", () => {
  const text = render();
  expect(text).toContain("Kills (0)");
  expect(text).toContain("Deaths (0)");
  expect(text).not.toContain("Names (");
});

const flagTypes = [
  "flag-grab",
  "flag-drop",
  "flag-return",
  "flag-cap",
] as const;

function flagColor(event: TimelineEvent) {
  return /data-type="flag-[^"]+" style="color:([^"]+)"/.exec(
    renderMarkup(event),
  )?.[1];
}

it.each([
  ["blueOrange", "rgb(45, 162, 255)", "rgb(255, 100, 15)"],
  ["greenRed", "rgb(0, 212, 71)", "rgb(255, 60, 10)"],
  ["redGreen", "rgb(255, 60, 10)", "rgb(0, 212, 71)"],
] as const)(
  "colors every observer flag action by its owner's team using %s",
  (scheme, team1, team2) => {
    state.observerPerspective = true;
    state.observerTeamColors = scheme;
    for (const type of flagTypes) {
      for (const [actorTeamId, color] of [
        [1, team1],
        [2, team2],
      ] as const) {
        expect(
          flagColor({
            type,
            timeSec: 1,
            description: "Flag event",
            actorTeamId,
            flagTeamId: type === "flag-return" ? actorTeamId : 3 - actorTeamId,
            teamAffinity: "neutral",
          }),
        ).toBe(color);
      }
    }
  },
);

it.each(flagTypes)(
  "colors player %s icons by friendly/enemy action",
  (type) => {
    state.observerTeamColors = "redGreen";
    for (const [teamAffinity, color] of [
      ["friendly", "rgb(0, 212, 71)"],
      ["enemy", "rgb(255, 60, 10)"],
    ] as const) {
      expect(
        flagColor({
          type,
          timeSec: 1,
          description: "Flag event",
          teamAffinity,
          actorTeamId: teamAffinity === "friendly" ? 1 : 2,
          flagTeamId: teamAffinity === "friendly" ? 2 : 1,
        }),
      ).toBe(color);
    }
  },
);

it("updates observer flag colors when the configured palette changes", () => {
  state.observerPerspective = true;
  const event: TimelineEvent = {
    type: "flag-cap",
    timeSec: 1,
    description: "Flag captured",
    actorTeamId: 1,
    flagTeamId: 2,
  };
  expect(flagColor(event)).toBe("rgb(45, 162, 255)");
  state.observerTeamColors = "redGreen";
  expect(flagColor(event)).toBe("rgb(255, 60, 10)");
});

it.each([undefined, 0, 3])(
  "keeps unknown observer action team %s neutral",
  (actorTeamId) => {
    state.observerPerspective = true;
    expect(
      flagColor({
        type: "flag-cap",
        timeSec: 1,
        description: "Flag captured",
        actorTeamId,
        flagTeamId: 1,
      }),
    ).toBe("rgb(200, 200, 200)");
  },
);

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { TimelineEvent } from "../state/demoTimelineStore";
import { DemoTimeline } from "./DemoTimeline";

const state = vi.hoisted(() => ({
  events: [] as TimelineEvent[],
  scanProgress: null,
  error: null,
  observerPerspective: false,
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
  useSettings: () => ({ setSidebarOpen() {} }),
}));
vi.mock("./useMediaQuery", () => ({ useMediaQuery: () => false }));

beforeEach(() => {
  state.observerPerspective = false;
});

function render(...events: TimelineEvent[]) {
  state.events = events;
  return renderToStaticMarkup(<DemoTimeline />).replace(/<[^>]*>/g, "");
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

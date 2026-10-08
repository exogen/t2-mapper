import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayerHUD } from "./PlayerHUD";
import { casterStore } from "../state/casterStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import type { HudPosition, MatchHudStyle } from "./SettingsProvider";

const settings = vi.hoisted(() => ({
  showChat: false,
  showCompass: false,
  showReticle: false,
  showScoreHud: false,
  scoreHudPosition: "left" as HudPosition,
  showQuickCamHud: false,
  quickCamHudPosition: "left" as HudPosition,
  scoreHudStyle: "solid",
  showMatchHud: true,
  matchHudStyle: "classic" as MatchHudStyle,
  observerTeamColors: "blueOrange",
}));

vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("./SettingsProvider", () => ({ useSettings: () => settings }));
vi.mock("./InputControls", () => ({
  inputControlsStore: { setState: vi.fn() },
}));
vi.mock("./ScoreHUD", () => ({
  ScoreHUD: () => <section aria-label="Player scores" />,
}));
vi.mock("./QuickCamHUD", () => ({
  QuickCamHUD: () => <nav aria-label="Quick cams" />,
}));
vi.mock("./useMatchClock", async (original) => ({
  ...(await original<typeof import("./useMatchClock")>()),
  useMatchClockMs: () => -123_000,
}));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (select: (snapshot: unknown) => unknown) =>
    select({
      controlPlayerGhostId: "player",
      entities: [],
      teamScores: [
        { teamId: 1, name: "Storm", score: 3, playerCount: 5 },
        { teamId: 2, name: "Inferno", score: 2, playerCount: 5 },
      ],
      playerSensorGroup: 0,
      camera: { yaw: 0 },
      weaponsHud: { slots: [{ index: 0, ammo: 5 }], activeIndex: 0 },
    }),
}));

beforeEach(() => {
  settings.showScoreHud = settings.showQuickCamHud = false;
  settings.scoreHudPosition = settings.quickCamHudPosition = "left";
  settings.matchHudStyle = "classic";
  settings.showMatchHud = true;
  settings.showCompass = false;
  streamPlaybackStore.setState({
    cameraMode: "original",
    followEntityId: null,
  });
  casterStore.getState().activate("test:28000", "1", "Katabatic");
});
afterEach(() => casterStore.getState().suspend());

it.each<[boolean, HudPosition, boolean, HudPosition, boolean]>([
  [false, "left", false, "left", true],
  [false, "right", false, "right", true],
  [true, "left", false, "right", true],
  [false, "right", true, "left", true],
  [true, "right", false, "left", false],
  [false, "left", true, "right", false],
  [true, "left", true, "right", false],
  [true, "right", true, "left", false],
])(
  "renders score HUD enabled %s on %s and quick cam HUD enabled %s on %s with weapon slots: %s",
  (showScore, score, showQuickCam, quickCam, weapons) => {
    settings.showScoreHud = showScore;
    settings.scoreHudPosition = score;
    settings.showQuickCamHud = showQuickCam;
    settings.quickCamHudPosition = quickCam;
    const html = renderToStaticMarkup(<PlayerHUD />);
    expect(html.includes('aria-label="Player scores"')).toBe(showScore);
    expect(html.includes('aria-label="Quick cams"')).toBe(showQuickCam);
    expect(html.includes('alt="Blaster"')).toBe(weapons);
  },
);

it("keeps weapon slots when a right-side quick cam HUD has no active mission", () => {
  settings.showQuickCamHud = true;
  settings.quickCamHudPosition = "right";
  casterStore.getState().suspend();
  const html = renderToStaticMarkup(<PlayerHUD />);
  expect(html).not.toContain('aria-label="Quick cams"');
  expect(html).toContain('alt="Blaster"');
});

it("toggles either Match HUD style while preserving mini scores and showing the clock once", () => {
  settings.showCompass = settings.showScoreHud = true;
  for (const variant of ["classic", "broadcast"] as const) {
    settings.matchHudStyle = variant;
    settings.showMatchHud = true;
    const html = renderToStaticMarkup(<PlayerHUD />);
    expect(html).toContain('aria-label="Player scores"');
    expect(html.match(/aria-label="Match HUD"/g)).toHaveLength(1);
    expect(html.match(/02:03/g)).toHaveLength(1);
    expect(html.includes("<table")).toBe(variant === "classic");
    settings.showMatchHud = false;
    const hidden = renderToStaticMarkup(<PlayerHUD />);
    expect(hidden).not.toContain('aria-label="Match HUD"');
    expect(hidden).toContain('aria-label="Player scores"');
    expect(hidden.match(/02:03/g)).toHaveLength(1);
  }
});

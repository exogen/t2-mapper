import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayerHUD } from "./PlayerHUD";
import { casterStore } from "../state/casterStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import type { HudPosition, MatchHudStyle } from "./SettingsProvider";
import type { StreamEntity } from "../stream/types";

const fixture = vi.hoisted(() => ({
  replay: false,
  watcher: false,
  entities: [] as StreamEntity[],
  cameraYaw: 0,
}));

vi.mock("./usePlayback", () => ({
  useRecording: () =>
    fixture.replay
      ? { source: "live", streamingPlayback: { localSpectator: true } }
      : null,
}));
vi.mock("../state/liveConnectionStore", async (original) => ({
  ...(await original<typeof import("../state/liveConnectionStore")>()),
  useLiveSelector: (select: (state: unknown) => unknown) =>
    select({ role: fixture.watcher ? "watcher" : null }),
}));

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
vi.mock("../state/streamSnapshotStore", async (original) => ({
  ...(await original<typeof import("../state/streamSnapshotStore")>()),
  useStreamSnapshot: (select: (snapshot: unknown) => unknown) =>
    select({
      controlPlayerGhostId: "player",
      entities: fixture.entities,
      status: { health: 0.9, energy: 0.8, heat: 0.3 },
      teamScores: [
        { teamId: 1, name: "Storm", score: 3, playerCount: 5 },
        { teamId: 2, name: "Inferno", score: 2, playerCount: 5 },
      ],
      playerSensorGroup: 0,
      camera: { yaw: fixture.cameraYaw },
      weaponsHud: { slots: [{ index: 0, ammo: 5 }], activeIndex: 0 },
    }),
}));

beforeEach(() => {
  fixture.replay = fixture.watcher = false;
  fixture.entities = [];
  fixture.cameraYaw = 0;
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
    const html = renderToStaticMarkup(
      <PlayerHUD onOpenScoreScreen={() => {}} />,
    );
    expect(html.includes('aria-label="Player scores"')).toBe(showScore);
    expect(html.includes('aria-label="Quick cams"')).toBe(showQuickCam);
    expect(html.includes('alt="Blaster"')).toBe(weapons);
  },
);

it("keeps weapon slots when a right-side quick cam HUD has no active mission", () => {
  settings.showQuickCamHud = true;
  settings.quickCamHudPosition = "right";
  casterStore.getState().suspend();
  const html = renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(html).not.toContain('aria-label="Quick cams"');
  expect(html).toContain('alt="Blaster"');
});

it("toggles either Match HUD style while preserving mini scores and showing the clock once", () => {
  settings.showCompass = settings.showScoreHud = true;
  for (const variant of ["classic", "broadcast"] as const) {
    settings.matchHudStyle = variant;
    settings.showMatchHud = true;
    const html = renderToStaticMarkup(
      <PlayerHUD onOpenScoreScreen={() => {}} />,
    );
    expect(html).toContain('aria-label="Player scores"');
    expect(html.match(/aria-label="Match HUD"/g)).toHaveLength(1);
    expect(html.match(/02:03/g)).toHaveLength(1);
    expect(html.includes("<table")).toBe(variant === "classic");
    settings.showMatchHud = false;
    const hidden = renderToStaticMarkup(
      <PlayerHUD onOpenScoreScreen={() => {}} />,
    );
    expect(hidden).not.toContain('aria-label="Match HUD"');
    expect(hidden).toContain('aria-label="Player scores"');
    expect(hidden.match(/02:03/g)).toHaveLength(1);
  }
});

it("uses the replay viewer's local compass instead of the recorder's heading", () => {
  settings.showCompass = true;
  fixture.cameraYaw = Math.PI / 2;
  const recorder = renderToStaticMarkup(
    <PlayerHUD onOpenScoreScreen={() => {}} />,
  );
  expect(recorder).toContain('transform="rotate(-90 36 36)"');
  fixture.replay = true;
  const replay = renderToStaticMarkup(
    <PlayerHUD onOpenScoreScreen={() => {}} />,
  );
  expect(replay).not.toContain('transform="rotate(-90 36 36)"');
  expect(replay).toContain('<svg viewBox="0 0 72 72"');
});

it("shows the followed replay player's health and equipment rather than the recorder's inventory", () => {
  fixture.replay = true;
  fixture.entities = [
    {
      id: "followed",
      type: "Player",
      className: "Player",
      health: 0.25,
      energy: 0.5,
      imageSlots: [
        { shapeName: "weapon_disc.dts", mountPoint: 0, dataBlockId: 1 },
      ],
    } as StreamEntity,
  ];
  streamPlaybackStore.setState({
    cameraMode: "orbitOverride",
    followEntityId: "followed",
  });
  const html = renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(html).toContain("width:25%");
  expect(html).toContain("width:50%");
  expect(html).toContain('alt="Spinfusor"');
  expect(html).not.toContain('alt="Blaster"');
  expect(html).not.toContain("width:90%");
});

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayerHUD } from "./PlayerHUD";
import { casterStore } from "../state/casterStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import type { HudPosition, HudStyle, MatchHudStyle } from "./SettingsProvider";
import type { StreamEntity, StreamSnapshot } from "../stream/types";
import { clipStore } from "../state/clipStore";
import type { ClipHudSettings, ClipTake } from "../../relay/clipTypes";
import type { GameEngine } from "../engine/gameEngine";

const fixture = vi.hoisted(() => ({
  replay: false,
  demo: false,
  watcher: false,
  entities: [] as StreamEntity[],
  cameraYaw: 0,
  missileLock: undefined as StreamSnapshot["missileLock"],
  inferredMissileLocks: undefined as StreamSnapshot["inferredMissileLocks"],
  weaponsHud: { slots: [{ index: 0, ammo: 5 }], activeIndex: 0 },
}));

vi.mock("./usePlayback", () => ({
  useRecording: () =>
    fixture.demo
      ? { source: "demo" }
      : fixture.replay
        ? { source: "live", streamingPlayback: { localSpectator: true } }
        : fixture.watcher
          ? { source: "live", streamingPlayback: { localSpectator: false } }
          : null,
}));
vi.mock("../state/liveConnectionStore", async (original) => ({
  ...(await original<typeof import("../state/liveConnectionStore")>()),
  useLiveSelector: (select: (state: unknown) => unknown) =>
    select({ role: fixture.watcher ? "watcher" : null }),
}));

const settings = vi.hoisted(() => ({
  showChat: false,
  chatHudStyle: "solid" as HudStyle,
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
vi.mock("./ChatWindow", async (original) => {
  const { ChatWindow } = await original<typeof import("./ChatWindow")>();
  return {
    ChatWindow: (props: { hudStyle?: HudStyle }) => (
      <section aria-label="Chat HUD">
        <ChatWindow {...props} />
      </section>
    ),
  };
});
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
      weaponsHud: fixture.weaponsHud,
      missileLock: fixture.missileLock,
      inferredMissileLocks: fixture.inferredMissileLocks,
    }),
}));

beforeEach(() => {
  fixture.replay = fixture.demo = fixture.watcher = false;
  fixture.entities = [];
  fixture.cameraYaw = 0;
  fixture.missileLock = fixture.inferredMissileLocks = undefined;
  fixture.weaponsHud = { slots: [{ index: 0, ammo: 5 }], activeIndex: 0 };
  settings.showScoreHud = settings.showQuickCamHud = false;
  settings.scoreHudPosition = settings.quickCamHudPosition = "left";
  settings.matchHudStyle = "classic";
  settings.showMatchHud = true;
  settings.showChat = false;
  settings.chatHudStyle = "solid";
  settings.showCompass = false;
  settings.showReticle = false;
  clipStore.setState({ active: null, draft: null, playing: false });
  streamPlaybackStore.setState({
    cameraMode: "original",
    followEntityId: null,
  });
  casterStore.getState().activate("test:28000", "1", "Katabatic");
});
afterEach(() => {
  casterStore.getState().suspend();
  clipStore.setState({ active: null, draft: null, playing: false });
});

function activateClip(hud?: ClipHudSettings) {
  const active: ClipTake = {
    version: 1,
    sourceDemo: "test.rec",
    samples: [],
    ...(hud && { hud }),
  };
  clipStore.setState({ active, playing: false });
}

it("includes the stock missile lock sprites with the reticle HUD", () => {
  const engine = {} as GameEngine;
  const render = () =>
    renderToStaticMarkup(
      <PlayerHUD engine={engine} onOpenScoreScreen={() => {}} />,
    ).toLowerCase();
  expect(render()).not.toContain("ret_missile_marker.png");
  settings.showReticle = true;
  const markup = render();
  for (const sprite of [
    "marker",
    "marker_red",
    "horizflash_red",
    "vertflash_red",
  ])
    expect(markup).toContain(`ret_missile_${sprite}.png`);
});

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

it("uses a paused clip's HUD choices and restores viewer preferences on exit", () => {
  settings.showCompass = true;
  const preferences = { ...settings };
  activateClip({
    showChat: true,
    showMatchHud: true,
    matchHudStyle: "broadcast",
  });
  const clip = renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(clip).toContain('aria-label="Chat HUD"');
  expect(clip.match(/aria-label="Match HUD"/g)).toHaveLength(1);
  expect(clip).not.toContain("<table");
  expect(clip.match(/02:03/g)).toHaveLength(1);
  expect(settings).toEqual(preferences);

  clipStore.getState().stopPlayback();
  const ordinary = renderToStaticMarkup(
    <PlayerHUD onOpenScoreScreen={() => {}} />,
  );
  expect(ordinary).not.toContain('aria-label="Chat HUD"');
  expect(ordinary).toContain("<table");
  expect(settings).toEqual(preferences);
});

it("honors disabled clip HUDs even when both viewer preferences are enabled", () => {
  settings.showChat = true;
  activateClip({
    showChat: false,
    showMatchHud: false,
    matchHudStyle: "classic",
  });
  const html = renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(html).not.toContain('aria-label="Chat HUD"');
  expect(html).not.toContain('aria-label="Match HUD"');
  expect(settings.showChat).toBe(true);
  expect(settings.showMatchHud).toBe(true);
});

it("renders the creator's chat style and restores the viewer's style on exit", () => {
  settings.showChat = true;
  activateClip({
    showChat: true,
    chatHudStyle: "transparent",
    showMatchHud: false,
    matchHudStyle: "classic",
  });
  const clip = renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(clip).toContain('data-style="transparent"');
  expect(settings.chatHudStyle).toBe("solid");
  clipStore.getState().stopPlayback();
  const ordinary = renderToStaticMarkup(
    <PlayerHUD onOpenScoreScreen={() => {}} />,
  );
  expect(ordinary).toContain('data-style="solid"');
  expect(settings.chatHudStyle).toBe("solid");
});

it("uses the viewer's chat style when an older clip omits it", () => {
  settings.chatHudStyle = "transparent";
  activateClip({
    showChat: true,
    showMatchHud: false,
    matchHudStyle: "classic",
  });
  const html = renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(html).toContain('data-style="transparent"');
});

it("keeps viewer HUD preferences for older clips without saved presentation", () => {
  settings.showChat = true;
  settings.showMatchHud = false;
  settings.matchHudStyle = "broadcast";
  activateClip();
  const html = renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(html).toContain('aria-label="Chat HUD"');
  expect(html).not.toContain('aria-label="Match HUD"');
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

it("uses the rendered compass heading for a clip in Original view", () => {
  settings.showCompass = true;
  fixture.cameraYaw = Math.PI / 2;
  activateClip();
  const render = () =>
    renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  const clip = render();
  expect(clip).toContain('<svg viewBox="0 0 72 72"');
  expect(clip).not.toContain('transform="rotate(-90 36 36)"');
  clipStore.getState().stopPlayback();
  expect(render()).toContain('transform="rotate(-90 36 36)"');
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

function followDemoWeapon(weapon: string, mountObjectId?: string) {
  fixture.demo = true;
  fixture.entities = [
    {
      id: "followed",
      type: "Player",
      className: "Player",
      mountObjectId,
      imageSlots: [{ shapeName: weapon, mountPoint: 0, dataBlockId: 1 }],
    } as StreamEntity,
  ];
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followEntityId: "followed",
  });
  return () => renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
}

it.each([
  ["weapon_sniper.dts", "Laser Rifle", "Zoom data unavailable."],
  ["weapon_missile.dts", "Missile", "Missile lock estimated."],
])(
  "attaches the observer demo note to the equipped %s slot only in demo playback",
  (weapon, label, note) => {
    const render = followDemoWeapon(weapon);
    const markup = render();
    expect(markup).toMatch(
      new RegExp(`data-active="true"><img[^>]+alt="${label}"`),
    );
    expect(markup).toContain(">Observer demo</span>");
    expect(markup).toContain(`>${note}</span>`);
    fixture.demo = false;
    fixture.replay = true;
    expect(render()).toContain(`>${note}</span>`);
    fixture.replay = false;
    fixture.watcher = true;
    expect(render()).not.toContain("Observer demo");
  },
);

it("omits weapon notes for the recorder's own equipped weapon", () => {
  const render = followDemoWeapon("weapon_missile.dts");
  fixture.weaponsHud = {
    slots: [
      { index: 5, ammo: -1 },
      { index: 8, ammo: 5 },
    ],
    activeIndex: 8,
  };
  fixture.missileLock = { selfLocked: false, selfHomed: false };
  // A previously followed player may still be selected in Original view.
  streamPlaybackStore.setState({ cameraMode: "original" });
  expect(render()).toContain('alt="Missile"');
  expect(render()).not.toContain("Observer demo");
  fixture.weaponsHud.activeIndex = 5;
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followEntityId: "player",
  });
  expect(render()).toContain('alt="Laser Rifle"');
  expect(render()).not.toContain("Observer demo");
});

it.each(["followed", "vehicle"])(
  "omits the missile note for a recorded lock on %s",
  (targetId) => {
    const render = followDemoWeapon("weapon_missile.dts", "vehicle");
    fixture.inferredMissileLocks = [
      { shooterId: "other", targetId, warnTarget: true },
    ];
    expect(render()).toContain(">Missile lock estimated.</span>");
    fixture.missileLock = {
      selfLocked: false,
      selfHomed: false,
      outgoing: { kind: "object", targetId },
    };
    expect(render()).not.toContain("Observer demo");
  },
);

it("hides the reticle while following a corpse that still has a weapon", () => {
  settings.showReticle = true;
  const player = {
    id: "followed",
    type: "Player",
    className: "Player",
    damageState: 0,
    imageSlots: [
      { shapeName: "weapon_disc.dts", mountPoint: 0, dataBlockId: 1 },
    ],
  } as StreamEntity;
  fixture.entities = [player];
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followEntityId: player.id,
  });
  const render = () =>
    renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(render()).toContain("ReticleImage");
  fixture.entities = [{ ...player, damageState: 1 }];
  expect(render()).not.toContain("ReticleImage");
});

it("shows the reticle only after a clip transition into first person lands", () => {
  settings.showReticle = true;
  fixture.entities = [
    {
      id: "followed",
      type: "Player",
      className: "Player",
      imageSlots: [
        { shapeName: "weapon_disc.dts", mountPoint: 0, dataBlockId: 1 },
      ],
    } as StreamEntity,
  ];
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followEntityId: "followed",
  });
  clipStore.setState({
    active: {
      version: 1,
      sourceDemo: "test.rec",
      samples: [],
      transitions: [
        {
          startMs: 500,
          durationMs: 500,
          projection: "perspective",
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          fov: 70,
          aspect: 1,
        },
      ],
    },
    playheadMs: 500,
  });
  const render = () =>
    renderToStaticMarkup(<PlayerHUD onOpenScoreScreen={() => {}} />);
  expect(render()).not.toContain("ReticleImage");
  clipStore.setState({ playheadMs: 1_000 });
  expect(render()).toContain("ReticleImage");
});

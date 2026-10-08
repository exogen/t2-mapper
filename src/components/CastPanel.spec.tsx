import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CastPanel } from "./CastPanel";
import { QuickCamPanel } from "./QuickCamPanel";
import { QuickCamHUD } from "./QuickCamHUD";
import { QuickCamIcon } from "./QuickCamIcon";
import { QuickCamKey } from "./KeyboardOverlay";
import { LuUser } from "react-icons/lu";
import { BiSolidCameraHome } from "react-icons/bi";
import { casterStore } from "../state/casterStore";
import type { SavedCamera } from "../state/casterStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { streamEntityToGameEntity } from "../stream/entityBridge";
import type { PlayerRosterEntry, StreamSnapshot } from "../stream/types";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import type { TeamColorScheme } from "./iffTheme";
import { commentaryTracksStore } from "../state/commentaryTracksStore";

const fixture = vi.hoisted(() => ({
  liveReady: true,
  role: "watcher",
  source: "live" as "live" | "demo",
  observerTeamColors: "blueOrange" as TeamColorScheme,
  playerSensorGroup: 0,
  playerRoster: [] as PlayerRosterEntry[],
  quickCamHideUnassignedSlots: false,
}));

vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({
    commentaryEnabled: true,
    commentarySubtitles: true,
    followBehindPlayer: false,
    observerTeamColors: fixture.observerTeamColors,
    showQuickCamHud: false,
    setShowQuickCamHud: vi.fn(),
    quickCamHudPosition: "left",
    setQuickCamHudPosition: vi.fn(),
    quickCamHideUnassignedSlots: fixture.quickCamHideUnassignedSlots,
    setQuickCamHideUnassignedSlots: vi.fn(),
  }),
}));
vi.mock("./InputControls", () => ({
  inputControlsStore: { setState: vi.fn() },
  useInputControls: () => false,
}));
vi.mock("../state/gameEntityStore", async (original) => ({
  ...(await original<typeof import("../state/gameEntityStore")>()),
  useDataSource: () => fixture.source,
}));
vi.mock("../state/streamSnapshotStore", async (original) => ({
  ...(await original<typeof import("../state/streamSnapshotStore")>()),
  useStreamSnapshot: (select: (state: unknown) => unknown) =>
    select({
      playerSensorGroup: fixture.playerSensorGroup,
      playerRoster: fixture.playerRoster,
      teamScores: [
        { teamId: 1, name: "Storm" },
        { teamId: 2, name: "Inferno" },
        { teamId: 3, name: "Starwolf" },
      ],
    }),
}));
vi.mock("../state/liveConnectionStore", async (original) => ({
  ...(await original<typeof import("../state/liveConnectionStore")>()),
  useLiveSelector: (select: (s: unknown) => unknown) => select(fixture),
}));

beforeEach(() => {
  fixture.liveReady = true;
  fixture.source = "live";
  fixture.observerTeamColors = "blueOrange";
  fixture.playerSensorGroup = 0;
  fixture.playerRoster = [];
  fixture.quickCamHideUnassignedSlots = false;
  gameEntityStore.getState().setAllStreamEntities([flag("1", 1), flag("2", 2)]);
  casterStore.getState().activate("test:28000", "1", "Katabatic");
});

afterEach(async () => {
  casterStore.getState().suspend();
  gameEntityStore.getState().clearStreamEntities();
  setStreamSnapshot(null);
  await commentaryTracksStore.getState().load(null);
});

function flag(id: string, teamId: number, playerName?: string) {
  return streamEntityToGameEntity({
    id,
    teamId,
    playerName,
    type: "Item",
    className: "Item",
    targetRenderFlags: 2,
  });
}

it("shows ten quick cams and their HUD setting without team or commentary controls", () => {
  const html = renderToStaticMarkup(<QuickCamPanel watching />);
  expect(html.match(/aria-label="Save camera \d"/g)).toHaveLength(10);
  expect(html).toContain('id="quickCamHudPositionInput"');
  expect(html).toContain('id="showQuickCamHudInput"');
  expect(html).toContain("Quick cam HUD");
  expect(html).not.toContain('<option value="off"');
  expect(html).toContain('id="quickCamHideUnassignedSlotsInput"');
  expect(html).toContain("Hide unassigned slots");
  expect(html).toContain("Storm Flag");
  expect(html).toContain("Inferno Flag");
  expect(html).not.toContain("Rename team");
  expect(html).not.toContain("Play audio commentary");
});

it("hides commentary controls when the demo has no commentary", () => {
  expect(renderToStaticMarkup(<CastPanel />)).toBe("");
});

it("offers quick cams in demos without commentary or a live connection", () => {
  fixture.liveReady = false;
  fixture.source = "demo";
  const html = renderToStaticMarkup(<QuickCamPanel watching={false} />);
  expect(html.match(/aria-label="Save camera \d"/g)).toHaveLength(10);
  expect(html.match(/<fieldset[^>]*>/)?.[0]).not.toContain("disabled");
  expect(html).not.toContain("Play audio commentary");
  expect(html).not.toContain("Show commentary subtitles");
});

it("shows default flags, saved views and empty slot shortcuts in the quick cam HUD", () => {
  casterStore.getState().renameTeam(1, "Knights");
  casterStore.getState().saveCamera(0, {
    kind: "fly",
    label: "Free-fly",
    fov: 90,
    followBehindPlayer: false,
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
  });
  const html = renderToStaticMarkup(<QuickCamHUD />);
  expect(html).toContain('aria-label="Quick cams"');
  expect(html).toContain("Knights Flag");
  expect(html).toContain("Inferno Flag");
  expect(html).toContain("Camera 10");
  expect(html).not.toContain("Not set");
  expect(html.match(/<button/g)).toHaveLength(10);
  expect(html.match(/aria-label="Shift"/g)).toHaveLength(7);
  expect(html).toContain('title="Press Shift+3 to set camera 3"');
});

it("hides the quick cam HUD after leaving the mission", () => {
  casterStore.getState().suspend();
  expect(renderToStaticMarkup(<QuickCamHUD />)).toBe("");
});

it.each(["live", "demo"] as const)(
  "hides unassigned slots only in the %s HUD while retaining default flags and saved views",
  (source) => {
    fixture.source = source;
    fixture.quickCamHideUnassignedSlots = true;
    casterStore.getState().saveCamera(0, {
      kind: "fly",
      label: "Free-fly",
      fov: 90,
      followBehindPlayer: false,
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
    });
    const hud = renderToStaticMarkup(<QuickCamHUD />);
    expect(hud.match(/<button/g)).toHaveLength(3);
    expect(hud).toContain("Storm Flag");
    expect(hud).toContain("Inferno Flag");
    expect(hud).toContain("Camera 10");
    expect(hud).not.toContain("to set");
    const panel = renderToStaticMarkup(
      <QuickCamPanel watching={source === "live"} />,
    );
    expect(panel.match(/aria-label="Save camera \d"/g)).toHaveLength(10);
    expect(
      panel.match(
        /<input[^>]*id="quickCamHideUnassignedSlotsInput"[^>]*>/,
      )?.[0],
    ).toContain("checked");
    fixture.quickCamHideUnassignedSlots = false;
    expect(
      renderToStaticMarkup(<QuickCamHUD />).match(/<button/g),
    ).toHaveLength(10);
  },
);

it.each(["live", "demo"] as const)(
  "shows only the neutral flag default in a %s Rabbit game",
  (source) => {
    fixture.source = source;
    gameEntityStore
      .getState()
      .setAllStreamEntities([flag("rabbit", 0, "Rabbit Flag")]);
    casterStore.getState().renameTeam(1, "Knights");
    const panel = renderToStaticMarkup(
      <QuickCamPanel watching={source === "live"} />,
    );
    const hud = renderToStaticMarkup(<QuickCamHUD />);
    for (const html of [panel, hud]) {
      expect(html).toContain("Rabbit Flag");
      expect(html).toContain("color:rgb(200, 200, 200)");
      expect(html).not.toMatch(/Storm Flag|Inferno Flag|Knights Flag/);
    }
    expect(panel).toContain('title="Recall camera 1: Rabbit Flag"');
    expect(panel).toContain('title="Recall camera 2: Not set"');
    expect(hud.match(/aria-label="Shift"/g)).toHaveLength(9);
    expect(hud).toContain('title="Press Shift+2 to set camera 2"');
    const hint = renderToStaticMarkup(<QuickCamKey />);
    expect(hint).toContain("Follow flag");
    expect(hint).not.toContain("Follow flags");
    expect(hint).toContain(">1<");
    expect(hint).not.toContain(">2<");

    // Saving the default still flashes without switching to the custom hint.
    casterStore.getState().saveCamera(1, {
      kind: "flag",
      slot: 1,
      label: "Flag 1",
      fov: 90,
      followBehindPlayer: false,
      yaw: 0,
      pitch: 0,
      distance: 10,
    });
    expect(renderToStaticMarkup(<QuickCamKey />)).not.toContain("Quick cam");
  },
);

it("shows empty slots and a quick cam hint in games without flags", () => {
  gameEntityStore.getState().clearStreamEntities();
  const hud = renderToStaticMarkup(<QuickCamHUD />);
  expect(hud.match(/aria-label="Shift"/g)).toHaveLength(10);
  expect(hud).not.toMatch(/Storm Flag|Inferno Flag/);
  const panel = renderToStaticMarkup(<QuickCamPanel watching />);
  expect(panel).not.toContain(">Unassigned<");
  expect(renderToStaticMarkup(<QuickCamKey />)).toContain("Quick cam");
});

it.each(["live", "demo"] as const)(
  "keeps original flag labels through handoffs in %s quick cams",
  (source) => {
    fixture.source = source;
    setStreamSnapshot({
      flagTargets: [{ targetId: 40, typeName: "Flag", teamId: 0 }],
    } as StreamSnapshot);
    const item = streamEntityToGameEntity({
      id: "rabbit",
      type: "Item",
      targetRenderFlags: 2,
      teamId: 0,
      targetTypeName: "Flag",
    });
    const carrier = streamEntityToGameEntity({
      id: "player",
      type: "Player",
      className: "Player",
      targetRenderFlags: 2,
      teamId: 1,
      playerName: "Alice",
      targetTypeName: "_ClientConnection",
      imageSlots: [
        { shapeName: "flag", skinName: "base", mountPoint: 0, dataBlockId: 1 },
      ],
    });
    for (const [entity, label] of [
      [item, "Flag"],
      [carrier, "Flag"],
      [item, "Flag"],
    ] as const) {
      gameEntityStore.getState().setAllStreamEntities([entity]);
      for (const html of [
        renderToStaticMarkup(<QuickCamHUD />),
        renderToStaticMarkup(<QuickCamPanel watching={source === "live"} />),
      ]) {
        expect(html).toContain(`>${label}</span>`);
        expect(html).toContain("color:rgb(200, 200, 200)");
        expect(html).not.toMatch(/Storm Flag|Inferno Flag|_ClientConnection/);
      }
      expect(renderToStaticMarkup(<QuickCamKey />)).toContain("Follow flag");
    }
  },
);

it("uses actual flag teams, custom names and all available number bindings", () => {
  gameEntityStore
    .getState()
    .setAllStreamEntities([flag("red", 2), flag("green", 3)]);
  setStreamSnapshot({
    teamScores: [
      { teamId: 2, name: "Red" },
      { teamId: 3, name: "Green" },
    ],
  } as StreamSnapshot);
  casterStore.getState().renameTeam(3, "Knights");
  const hud = renderToStaticMarkup(<QuickCamHUD />);
  expect(hud).toContain("Red Flag");
  expect(hud).toContain("Knights Flag");
  expect(hud).toContain('title="Press Shift+1 to set camera 1"');
  const hint = renderToStaticMarkup(<QuickCamKey />);
  expect(hint).toContain("Follow flags");
  expect(hint).not.toContain(">1<");
  expect(hint).toContain(">2<");
  expect(hint).toContain(">3<");
});

it("keeps custom bindings available without inventing flag defaults", () => {
  gameEntityStore.getState().setAllStreamEntities([flag("rabbit", 0)]);
  casterStore.getState().saveCamera(2, playerCamera);
  expect(renderToStaticMarkup(<QuickCamHUD />)).toContain("Player");
  expect(renderToStaticMarkup(<QuickCamKey />)).toContain("Quick cam");
});

it("labels saved flags outside the default number slots using their actual team", () => {
  gameEntityStore.getState().setAllStreamEntities([flag("ten", 10)]);
  casterStore.getState().renameTeam(10, "Knights");
  casterStore.getState().saveCamera(3, {
    kind: "flag",
    slot: 10,
    label: "Flag 10",
    fov: 90,
    followBehindPlayer: false,
    yaw: 0,
    pitch: 0,
    distance: 10,
  });
  expect(renderToStaticMarkup(<QuickCamHUD />)).toContain("Knights Flag");
  expect(renderToStaticMarkup(<QuickCamKey />)).toContain("Quick cam");
});

it.each([
  ["blueOrange", "rgb(40, 152, 255)", "rgb(255, 100, 15)"],
  ["greenRed", "rgb(0, 155, 53)", "rgb(255, 0, 0)"],
  ["redGreen", "rgb(255, 0, 0)", "rgb(0, 155, 53)"],
] as const)(
  "colors quick cam flags using the %s observer palette in both surfaces",
  (scheme, first, second) => {
    fixture.observerTeamColors = scheme;
    for (const html of [
      renderToStaticMarkup(<QuickCamHUD />),
      renderToStaticMarkup(<QuickCamPanel watching />),
    ]) {
      expect(html).toContain(`color:${first}`);
      expect(html).toContain(`color:${second}`);
    }
  },
);

it.each([1, 2])(
  "colors flags from the team %s recorder's perspective",
  (teamId) => {
    fixture.source = "demo";
    fixture.playerSensorGroup = teamId;
    fixture.observerTeamColors = "blueOrange";
    const friendly = renderToStaticMarkup(
      <QuickCamIcon flagTeamId={teamId} camera={undefined} Icon={LuUser} />,
    );
    const enemy = renderToStaticMarkup(
      <QuickCamIcon
        flagTeamId={teamId === 1 ? 2 : 1}
        camera={undefined}
        Icon={LuUser}
      />,
    );
    expect(friendly).toContain("color:rgb(0, 155, 53)");
    expect(enemy).toContain("color:rgb(255, 0, 0)");
  },
);

const playerCamera: SavedCamera = {
  kind: "follow",
  playerName: "Player",
  label: "Player",
  fov: 90,
  followBehindPlayer: false,
  yaw: 0,
  pitch: 0,
  distance: 10,
};

it("updates player icon affiliation in place and honors the engine's viewer-relative IFF", () => {
  const entity = streamEntityToGameEntity({
    id: "player",
    type: "Player",
    className: "Player",
    playerName: "[TAG]Player",
    playerRawName: "\x10\x0b[TAG]\x08Player\x11",
    teamId: 1,
    iffColor: { r: 255, g: 0, b: 0 },
  });
  gameEntityStore.getState().setStreamEntity(entity);
  const render = () =>
    renderToStaticMarkup(<QuickCamIcon camera={playerCamera} Icon={LuUser} />);
  expect(render()).toContain("color:rgb(40, 152, 255)");
  if (entity.renderType !== "Player") throw Error("Expected player");
  entity.teamId = 2;
  expect(render()).toContain("color:rgb(255, 100, 15)");
  fixture.playerSensorGroup = 2;
  expect(render()).toContain("color:rgb(255, 0, 0)");
  entity.iffColor = { r: 0, g: 255, b: 0 };
  expect(render()).toContain("color:rgb(0, 155, 53)");
});

it("keeps a waiting player's team color using their current roster entry", () => {
  fixture.playerRoster = [
    {
      clientId: 5,
      name: "[TAG]Player",
      rawName: "\x10\x0b[TAG]\x08Player\x11",
      teamId: 2,
      score: 0,
      ping: 0,
      packetLoss: 0,
    },
  ];
  const render = () =>
    renderToStaticMarkup(<QuickCamIcon camera={playerCamera} Icon={LuUser} />);
  expect(render()).toContain("color:rgb(255, 100, 15)");
  fixture.playerSensorGroup = 2;
  expect(render()).toContain("color:rgb(0, 155, 53)");
  fixture.playerRoster = [];
  expect(render()).toContain("color:rgb(200, 200, 200)");
});

it("does not tint free-fly or unset icons", () => {
  const camera: SavedCamera = {
    kind: "fly",
    label: "Free-fly",
    fov: 90,
    followBehindPlayer: false,
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
  };
  expect(
    renderToStaticMarkup(
      <QuickCamIcon camera={camera} Icon={BiSolidCameraHome} />,
    ),
  ).not.toContain('style="color:');
  expect(
    renderToStaticMarkup(<QuickCamIcon camera={undefined} Icon={LuUser} />),
  ).not.toContain('style="color:');
});

it.each<["live" | "demo", boolean, boolean]>([
  ["live", false, false],
  ["live", true, true],
  ["demo", false, true],
])(
  "enables the quick cam HUD for %s with liveReady %s: %s",
  (source, liveReady, enabled) => {
    fixture.source = source;
    fixture.liveReady = liveReady;
    const buttons = renderToStaticMarkup(<QuickCamHUD />).match(
      /<button[^>]*>/g,
    );
    expect(buttons).toHaveLength(10);
    for (const button of buttons!) {
      const slot = Number(button.match(/data-slot="(\d)"/)![1]);
      const empty = slot !== 1 && slot !== 2;
      expect(button.includes("disabled")).toBe(!enabled || empty);
    }
  },
);

it.each([1, 2])(
  "only offers a track picker with multiple commentary tracks (%s)",
  (count) => {
    commentaryTracksStore.setState({
      hasCommentary: true,
      tracks: Array.from({ length: count }, (_, i) => ({
        label: `Track ${i}`,
        suffix: `${i}`,
      })),
    });
    const html = renderToStaticMarkup(<CastPanel />);
    expect(html).toContain("Play audio commentary");
    expect(html).toContain("Show commentary subtitles");
    expect(html.includes("<select")).toBe(count > 1);
    expect(html).not.toContain("Save camera");
    expect(html).not.toContain("Rename team");
    expect(html).not.toContain("Quick cam HUD");
  },
);

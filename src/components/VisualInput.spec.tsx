import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { VisualInput } from "./VisualInput";
import {
  streamPlaybackStore,
  type DemoCameraMode,
} from "../state/streamPlaybackStore";
import { subtitlesStore } from "../state/commentaryTrack";
import styles from "./VisualInput.module.css";

const fixture = vi.hoisted(() => ({
  touch: true as boolean | null,
  owner: "input" as "input" | "tour" | "director" | "commandCircuit",
  source: "live" as "demo" | "live" | null,
  localSpectator: true,
  inputMode: "fly" as "local" | "fly" | "follow",
  showInputOverlay: false,
  touchMode: "moveLookStick" as "moveLookStick" | "dualStick",
  watchedPlayerVisible: true,
}));

vi.mock("react", async (original) => {
  const labels = ["Touch joystick", "Keyboard overlay"];
  return {
    ...(await original<typeof import("react")>()),
    lazy: () => {
      const label = labels.shift();
      return () => <div aria-label={label} />;
    },
  };
});
vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("./useTouchDevice", () => ({ useTouchDevice: () => fixture.touch }));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({ showInputOverlay: fixture.showInputOverlay }),
  useControls: () => ({ touchMode: fixture.touchMode }),
}));
vi.mock("../state/cameraOwner", () => ({
  useCameraOwner: () => fixture.owner,
}));
vi.mock("../state/inputModeStore", () => ({
  useInputMode: () => fixture.inputMode,
}));
vi.mock("./usePlayback", () => ({
  useRecording: () =>
    fixture.source
      ? {
          source: fixture.source,
          streamingPlayback: { localSpectator: fixture.localSpectator },
        }
      : null,
}));
vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (select: (state: unknown) => unknown) =>
    select({ role: null }),
}));
vi.mock("../state/replayConnectionStore", () => ({
  useReplaySelector: (select: (state: unknown) => unknown) =>
    select({ ready: true }),
}));
vi.mock("./WatchedPlayerHUD", () => ({
  WatchedPlayerHUD: () =>
    fixture.watchedPlayerVisible ? <div aria-label="Watched player" /> : null,
}));

beforeEach(() => {
  Object.assign(fixture, {
    touch: true,
    owner: "input",
    source: "live",
    localSpectator: true,
    inputMode: "fly",
    showInputOverlay: false,
    touchMode: "moveLookStick",
    watchedPlayerVisible: true,
  });
  streamPlaybackStore.setState({ cameraMode: "freeFly" });
  subtitlesStore.setState({ showing: false });
});

function hasJoystick(menuOpen?: boolean) {
  return renderToStaticMarkup(<VisualInput menuOpen={menuOpen} />).includes(
    'aria-label="Touch joystick"',
  );
}

it.each<[DemoCameraMode, boolean]>([
  ["freeFly", true],
  ["orbitOverride", false],
  ["firstPersonOverride", false],
  ["original", false],
])(
  "offers replay touch camera controls only in free-fly mode (%s)",
  (cameraMode, expected) => {
    streamPlaybackStore.setState({ cameraMode });
    expect(
      renderToStaticMarkup(<VisualInput />).includes(
        'aria-label="Touch joystick"',
      ),
    ).toBe(expected);
  },
);

it("hides touch joysticks while the menu is open and restores them afterward", () => {
  expect(hasJoystick()).toBe(true);
  expect(hasJoystick(true)).toBe(false);
  expect(hasJoystick(false)).toBe(true);
});

it.each(["dualStick", "moveLookStick"] as const)(
  "positions the followed-player chip for the visible %s controller",
  (touchMode) => {
    fixture.touchMode = touchMode;
    streamPlaybackStore.setState({ cameraMode: "orbitOverride" });
    const shown = renderToStaticMarkup(<VisualInput cameraLauncherVisible />);
    expect(shown).toContain('aria-label="Watched player"');
    expect(shown).not.toContain('aria-label="Touch joystick"');
    if (touchMode === "dualStick") {
      expect(shown).not.toContain(styles.MobileStackWithLauncher);
    } else {
      expect(shown).toContain(styles.MobileStackWithLauncher);
    }
    const noLauncher = renderToStaticMarkup(<VisualInput />);
    expect(noLauncher).not.toContain(styles.MobileStackWithLauncher);
  },
);

it.each(["tour", "director", "commandCircuit"] as const)(
  "keeps joysticks hidden after dismissal when %s owns the camera",
  (owner) => {
    fixture.owner = owner;
    expect(hasJoystick(true)).toBe(false);
    expect(hasJoystick(false)).toBe(false);
  },
);

it.each<[DemoCameraMode]>([
  ["orbitOverride"],
  ["firstPersonOverride"],
  ["original"],
])("does not restore joysticks in stream camera mode %s", (cameraMode) => {
  streamPlaybackStore.setState({ cameraMode });
  expect(hasJoystick(true)).toBe(false);
  expect(hasJoystick(false)).toBe(false);
});

it.each<["fly" | "follow", boolean]>([
  ["fly", true],
  ["follow", false],
])(
  "preserves native observer mode gates after dismissal (%s)",
  (inputMode, expected) => {
    fixture.localSpectator = false;
    fixture.inputMode = inputMode;
    expect(hasJoystick(true)).toBe(false);
    expect(hasJoystick(false)).toBe(expected);
  },
);

it("keeps desktop watched-player and keyboard overlays unchanged", () => {
  fixture.touch = false;
  fixture.showInputOverlay = true;
  const shown = renderToStaticMarkup(<VisualInput />);
  const hidden = renderToStaticMarkup(
    <VisualInput menuOpen cameraLauncherVisible />,
  );
  expect(shown).toContain('aria-label="Watched player"');
  expect(shown).toContain('aria-label="Keyboard overlay"');
  expect(hidden).toBe(shown);
});

it("shows the mobile watched-player HUD outside the menu independently of the input-overlay setting", () => {
  const shown = renderToStaticMarkup(<VisualInput />);
  expect(shown).toContain('aria-label="Watched player"');
  expect(shown).not.toContain('aria-label="Keyboard overlay"');
  expect(renderToStaticMarkup(<VisualInput menuOpen />)).not.toContain(
    'aria-label="Watched player"',
  );
  expect(renderToStaticMarkup(<VisualInput menuOpen={false} />)).toContain(
    'aria-label="Watched player"',
  );
});

it.each([true, false] as const)(
  "does not offer a watched-player HUD without a recording (touch=%s)",
  (touch) => {
    fixture.touch = touch;
    fixture.source = null;
    expect(renderToStaticMarkup(<VisualInput />)).not.toContain(
      'aria-label="Watched player"',
    );
  },
);

it("waits until the device type is known before offering a watched-player HUD", () => {
  fixture.touch = null;
  expect(renderToStaticMarkup(<VisualInput />)).not.toContain(
    'aria-label="Watched player"',
  );
});

it("preserves subtitle and input-overlay settings for the desktop HUD", () => {
  fixture.touch = false;
  fixture.showInputOverlay = true;
  subtitlesStore.setState({ showing: true });
  const subtitles = renderToStaticMarkup(<VisualInput />);
  expect(subtitles).toContain('aria-label="Watched player"');
  expect(subtitles).not.toContain('aria-label="Keyboard overlay"');

  subtitlesStore.setState({ showing: false });
  fixture.showInputOverlay = false;
  const disabledOverlay = renderToStaticMarkup(<VisualInput />);
  expect(disabledOverlay).toContain('aria-label="Watched player"');
  expect(disabledOverlay).not.toContain('aria-label="Keyboard overlay"');
});

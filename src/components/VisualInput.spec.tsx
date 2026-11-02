import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { VisualInput } from "./VisualInput";
import {
  streamPlaybackStore,
  type DemoCameraMode,
} from "../state/streamPlaybackStore";

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  lazy: () => () => <div aria-label="Touch joystick" />,
}));
vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("./useTouchDevice", () => ({ useTouchDevice: () => true }));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({ showInputOverlay: false }),
}));
vi.mock("../state/cameraOwner", () => ({ useCameraOwner: () => "input" }));
vi.mock("./usePlayerOrbitLocked", () => ({
  usePlayerOrbitLocked: () => false,
}));
vi.mock("./usePlayback", () => ({
  useRecording: () => ({
    source: "live",
    streamingPlayback: { localSpectator: true },
  }),
}));
vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (select: (state: unknown) => unknown) =>
    select({ role: null }),
}));
vi.mock("../state/replayConnectionStore", () => ({
  useReplaySelector: (select: (state: unknown) => unknown) =>
    select({ ready: true }),
}));
vi.mock("./WatchedPlayerHUD", () => ({ WatchedPlayerHUD: () => null }));

beforeEach(() => streamPlaybackStore.setState({ cameraMode: "freeFly" }));

it.each<[DemoCameraMode, boolean]>([
  ["freeFly", true],
  ["orbitOverride", true],
  ["firstPersonOverride", false],
  ["original", false],
])(
  "offers replay touch camera controls only in controllable mode %s",
  (cameraMode, expected) => {
    streamPlaybackStore.setState({ cameraMode });
    expect(
      renderToStaticMarkup(<VisualInput />).includes(
        'aria-label="Touch joystick"',
      ),
    ).toBe(expected);
  },
);

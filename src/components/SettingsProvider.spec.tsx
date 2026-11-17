import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClipTake } from "../../relay/clipTypes";
import { clipStore } from "../state/clipStore";
import { settingsStore } from "../state/settingsStore";
import { useSettings } from "./SettingsProvider";

vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("zustand/traditional", () => ({
  useStoreWithEqualityFn: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));

const original = settingsStore.getState();
const take: ClipTake = { version: 1, sourceDemo: "test.rec", samples: [] };
const storage = { getItem: vi.fn(), setItem: vi.fn() };

beforeEach(() => {
  clipStore.setState({
    active: null,
    draft: null,
    recording: false,
    playing: false,
  });
  settingsStore.setState({
    ...original,
    showInputOverlay: true,
    hudPreferences: {
      score: { enabled: true, position: "left" },
      quickCam: { enabled: true, position: "right" },
    },
  });
  storage.setItem.mockClear();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  clipStore.setState({
    active: null,
    draft: null,
    recording: false,
    playing: false,
  });
  settingsStore.setState(original);
  vi.unstubAllGlobals();
});

function SettingsProbe({
  read,
}: {
  read: (settings: ReturnType<typeof useSettings>) => void;
}) {
  read(useSettings());
  return null;
}

const hudSettings = () => {
  let settings!: ReturnType<typeof useSettings>;
  renderToStaticMarkup(
    <SettingsProbe
      read={(value) => {
        settings = value;
      }}
    />,
  );
  const {
    clipPlaybackActive,
    showScoreHud,
    showQuickCamHud,
    showInputOverlay,
  } = settings;
  return {
    clipPlaybackActive,
    showScoreHud,
    showQuickCamHud,
    showInputOverlay,
  };
};

it.each([true, false])(
  "temporarily suppresses viewer HUDs during clip playback (playing=%s)",
  (playing) => {
    const before = settingsStore.getState();
    clipStore.setState({ active: take, playing });
    expect(hudSettings()).toEqual({
      clipPlaybackActive: true,
      showScoreHud: false,
      showQuickCamHud: false,
      showInputOverlay: false,
    });
    expect(settingsStore.getState()).toBe(before);
    expect(storage.setItem).not.toHaveBeenCalled();
    clipStore.getState().stopPlayback();
    expect(hudSettings()).toEqual({
      clipPlaybackActive: false,
      showScoreHud: true,
      showQuickCamHud: true,
      showInputOverlay: true,
    });
    expect(settingsStore.getState()).toBe(before);
  },
);

it("keeps clip preview restricted until discard and leaves recording preferences alone", () => {
  clipStore.setState({ recording: true });
  expect(hudSettings().clipPlaybackActive).toBe(false);
  expect(hudSettings().showInputOverlay).toBe(true);
  clipStore.setState({ active: take, draft: take, recording: false });
  clipStore.getState().stopPlayback();
  expect(hudSettings().showScoreHud).toBe(false);
  clipStore.getState().discard();
  expect(hudSettings().showScoreHud).toBe(true);
  expect(hudSettings().showQuickCamHud).toBe(true);
});

it.each([true, false])(
  "shows and locks the creator's saved HUD choices without changing viewer preferences (playing=%s)",
  (playing) => {
    settingsStore.setState({
      showChat: true,
      chatHudStyle: "solid",
      showMatchHud: false,
      matchHudStyle: "classic",
    });
    const before = settingsStore.getState();
    const active = {
      ...take,
      hud: {
        showChat: false,
        chatHudStyle: "transparent" as const,
        showMatchHud: true,
        matchHudStyle: "broadcast" as const,
      },
    };
    clipStore.setState({ active, playing });
    let settings!: ReturnType<typeof useSettings>;
    const read = () =>
      renderToStaticMarkup(
        <SettingsProbe
          read={(value) => {
            settings = value;
          }}
        />,
      );
    read();
    expect(settings).toMatchObject({
      clipHudLocked: true,
      showChat: false,
      chatHudStyle: "transparent",
      showMatchHud: true,
      matchHudStyle: "broadcast",
    });
    expect(settingsStore.getState()).toBe(before);
    expect(storage.setItem).not.toHaveBeenCalled();
    clipStore.getState().stopPlayback();
    read();
    expect(settings).toMatchObject({
      clipHudLocked: false,
      showChat: true,
      chatHudStyle: "solid",
      showMatchHud: false,
      matchHudStyle: "classic",
    });
    expect(settingsStore.getState()).toBe(before);
  },
);

it("keeps draft HUD controls editable and leaves legacy clip presentation unlocked", () => {
  let settings!: ReturnType<typeof useSettings>;
  const read = () =>
    renderToStaticMarkup(
      <SettingsProbe
        read={(value) => {
          settings = value;
        }}
      />,
    );
  clipStore.setState({ active: take, draft: take });
  read();
  expect(settings.clipHudLocked).toBe(false);
  settings.setShowChat(false);
  settings.setChatHudStyle("transparent");
  settings.setShowMatchHud(false);
  settings.setMatchHudStyle("broadcast");
  read();
  expect(settings).toMatchObject({
    showChat: false,
    chatHudStyle: "transparent",
    showMatchHud: false,
    matchHudStyle: "broadcast",
  });
  clipStore.setState({ draft: null });
  read();
  expect(settings.clipHudLocked).toBe(false);
  expect(settings).toMatchObject({
    showChat: false,
    chatHudStyle: "transparent",
    showMatchHud: false,
    matchHudStyle: "broadcast",
  });
});

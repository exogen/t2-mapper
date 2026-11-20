import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClipTake } from "../../relay/clipTypes";
import type { ClipState } from "../state/clipStore";
import type { AppAccountState } from "../state/appAccountStore";
import { settingsStore } from "../state/settingsStore";

const fixture = vi.hoisted(() => ({
  account: {} as AppAccountState,
  clip: {} as ClipState,
  source: "hosted:test.rec" as string | null,
  captureReady: true,
  actions: new Map<string, () => void>(),
  effects: [] as Array<() => void | (() => void)>,
  playback: {
    recording: { source: "demo" },
    status: "paused",
    downloadComplete: true,
    demoBuffer: new ArrayBuffer(4),
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) =>
    fixture.effects.push(effect),
}));
vi.mock("../state/clipStore", () => ({
  canStartClipRecording: () => fixture.captureReady,
  clipStore: {
    getState: () => fixture.clip,
    getInitialState: () => fixture.clip,
    subscribe: () => () => {},
  },
}));
vi.mock("./InputControls", () => ({
  useInputAction: (action: string, callback: () => void) =>
    fixture.actions.set(action, callback),
}));
vi.mock("../state/inputControls", () => ({
  inputControlsStore: { setState: vi.fn() },
}));
vi.mock("./useAppNavigation", () => ({
  useAppNavigation: () => ({ exitClip: vi.fn() }),
}));
vi.mock("../state/appAccountStore", () => ({
  appAccountStore: { getState: () => fixture.account },
  useAppAccount: (select: (state: AppAccountState) => unknown) =>
    select(fixture.account),
}));
vi.mock("../state/demoLoadStore", () => ({
  demoLoadStore: { getState: () => ({ sourceUrl: fixture.source }) },
  useDemoLoad: (select: (state: { sourceUrl: string | null }) => unknown) =>
    select({ sourceUrl: fixture.source }),
}));
vi.mock("../state/editableGame", () => ({
  publishedDemoFilename: (url: string | null) =>
    url?.startsWith("hosted:") ? url.slice(7) : null,
}));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({ playback: fixture.playback }) },
  useEngineSelector: (
    select: (state: { playback: typeof fixture.playback }) => unknown,
  ) => select({ playback: fixture.playback }),
}));
vi.mock("@ariakit/react", async (original) => ({
  ...(await original<typeof import("@ariakit/react")>()),
  Dialog: ({
    children,
    "aria-label": label,
  }: {
    children: React.ReactNode;
    "aria-label": string;
  }) => (
    <div role="dialog" aria-label={label}>
      {children}
    </div>
  ),
  DialogHeading: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));
import {
  ClipControlsProvider,
  ClipRecordButton,
  ClipEditorPanel,
  ClipPlaybackControls,
} from "./ClipControls";

const take: ClipTake = {
  version: 1,
  sourceDemo: "test.rec",
  samples: [0, 450, 750, 1000].map((timeMs) => ({
    timeMs,
    demoTimeSec: 10 + timeMs / 1000,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    fov: 90,
    aspect: 16 / 9,
    projection: "perspective",
    cameraMode: "freeFly",
    targetId: null,
    flagSlot: null,
    rate: timeMs < 450 ? 1 : timeMs < 750 ? 0.25 : 2,
    playing: timeMs !== 450,
  })),
};
beforeEach(() => {
  fixture.clip = {
    recording: false,
    draft: null,
    trimStartMs: 0,
    trimEndMs: 1000,
    elapsedMs: 0,
    active: null,
    playbackEffects: null,
    playheadMs: 0,
    playing: false,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    discard: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stopPlayback: vi.fn(),
    setTrimRange: vi.fn(),
    seek: vi.fn(),
    appendSample: vi.fn(),
    smoothingLevel: 0,
    setSmoothingLevel: vi.fn(),
  };
  fixture.account = {
    status: "ready",
    enabled: true,
    user: {
      id: "user",
      name: "Player",
      role: "user",
      discordId: "123456789012345678",
      discordUsername: "player",
      image: null,
      t2Profile: null,
      t2AccountNames: [],
    },
    pending: null,
    error: null,
    signInUrl: null,
  };
  fixture.source = "hosted:test.rec";
  fixture.captureReady = true;
  fixture.actions.clear();
  fixture.effects = [];
  fixture.playback.recording = { source: "demo" };
  fixture.playback.status = "paused";
  fixture.playback.downloadComplete = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  const { showChat, chatHudStyle, showMatchHud, matchHudStyle } =
    settingsStore.getInitialState();
  settingsStore.setState({
    hasSeenClipRecordingHelp: false,
    showChat,
    chatHudStyle,
    showMatchHud,
    matchHudStyle,
  });
});

function render() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ClipControlsProvider>
        <ClipRecordButton />
        <ClipEditorPanel />
        <ClipPlaybackControls />
      </ClipControlsProvider>
    </QueryClientProvider>,
  );
}

it("offers recording only for signed-in users with a canonical hosted source", () => {
  expect(render()).toContain('aria-label="Record clip"');
  fixture.account.user = null;
  expect(render()).not.toContain('aria-label="Record clip"');
  fixture.account.user = { id: "user" } as never;
  for (const source of [
    null,
    "file:local.rec",
    "https://external.example/demo.rec",
  ]) {
    fixture.source = source;
    expect(render()).not.toContain('aria-label="Record clip"');
  }
});

it.each(["signed-out", "signed-in"])(
  "preserves saved clip playback when the account becomes %s",
  (accountState) => {
    fixture.clip.active = take;
    fixture.clip.playing = true;
    if (accountState === "signed-out") fixture.account.user = null;
    render();
    const cleanups = fixture.effects.map((effect) => effect());
    expect(fixture.clip.discard).not.toHaveBeenCalled();
    expect(fixture.clip.stopPlayback).not.toHaveBeenCalled();
    expect(fixture.clip.active).toBe(take);
    expect(fixture.clip.playing).toBe(true);
    cleanups.forEach((cleanup) => cleanup?.());
  },
);

it.each(["recording", "draft"])(
  "discards private %s state when the account changes",
  (state) => {
    fixture.account.user = null;
    fixture.clip.recording = state === "recording";
    if (state === "draft") fixture.clip.draft = fixture.clip.active = take;
    render();
    const cleanups = fixture.effects.map((effect) => effect());
    expect(fixture.clip.discard).toHaveBeenCalledOnce();
    cleanups.forEach((cleanup) => cleanup?.());
  },
);

it("keeps the visible label fixed while recording and exposes the stop action", () => {
  fixture.clip.recording = true;
  fixture.clip.elapsedMs = 1234;
  const markup = render();
  expect(markup).toContain('aria-label="Stop clip recording"');
  expect(markup).toContain(">Record clip</span>");
  expect(markup).toContain('data-recording="true"');
  expect(markup).toContain("Recording… 1.2s / 60s");
  expect(markup).toContain("Camera smoothing");
  expect(markup).toContain(">Stop recording</span>");
  expect(markup).not.toContain('aria-label="Discard clip"');
  expect(markup).toMatch(/id="clipCameraSmoothing"[^>]*disabled=""/);
});

it("uses the record button's action for R, including stopping during source preparation", () => {
  settingsStore.setState({ hasSeenClipRecordingHelp: true });
  expect(render()).toContain('aria-keyshortcuts="R"');
  fixture.actions.get("recordClip")!();
  expect(fixture.clip.start).toHaveBeenCalledOnce();
  fixture.clip.recording = true;
  fixture.captureReady = false;
  fixture.playback.status = "seeking";
  expect(render()).toContain('title="Stop clip recording (R)"');
  fixture.actions.get("recordClip")!();
  expect(fixture.clip.stop).toHaveBeenCalledOnce();
});

it.each([
  "signed-out",
  "pending",
  "local",
  "live",
  "draft",
  "active",
  "seeking",
  "preparing",
])("keeps R inactive while recording is unavailable: %s", (reason) => {
  settingsStore.setState({ hasSeenClipRecordingHelp: true });
  if (reason === "signed-out") fixture.account.user = null;
  if (reason === "pending") fixture.account.pending = "sign-out";
  if (reason === "local") fixture.source = "file:local.rec";
  if (reason === "live") fixture.playback.recording = { source: "live" };
  if (reason === "draft") fixture.clip.draft = take;
  if (reason === "active") fixture.clip.active = take;
  if (reason === "seeking") fixture.playback.status = "seeking";
  if (reason === "preparing") fixture.captureReady = false;
  expect(render()).not.toContain('aria-keyshortcuts="R"');
  fixture.actions.get("recordClip")!();
  expect(fixture.clip.start).not.toHaveBeenCalled();
  expect(fixture.clip.stop).not.toHaveBeenCalled();
});

it("offers smoothing and save/discard in the default-open clip accordion", () => {
  fixture.clip.draft = take;
  fixture.clip.active = take;
  const markup = render();
  expect(markup).toContain(">Save clip</button>");
  expect(markup).toContain('aria-label="Discard clip"');
  expect(markup).toContain(">Discard</button>");
  expect(markup.indexOf('aria-label="Discard clip"')).toBeLessThan(
    markup.indexOf(">Save clip</button>"),
  );
  expect(markup).not.toContain('aria-label="Trim clip"');
  expect(markup).toMatch(
    /<button[^>]*disabled=""[^>]*aria-label="Record clip"/,
  );
  expect(markup).not.toContain("Exit clip");
  expect(markup).not.toContain('type="text"');
  expect(markup).toContain("Clip recorder");
  expect(markup).toContain("data-clip-editor-panel");
  expect(markup).toContain('aria-expanded="true"');
  expect(markup).toContain('aria-valuetext="Off"');
  fixture.clip.smoothingLevel = 2;
  expect(render()).toContain('aria-valuetext="High"');
  expect(render()).toContain('aria-valuemax="2"');
  expect(render()).not.toContain("Medium");
  fixture.playback.downloadComplete = false;
  expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>Save clip<\/button>/);
});

it.each(["firstPersonOverride", "original"])(
  "disables smoothing in %s sections without losing the setting for other views",
  (cameraMode) => {
    fixture.clip.draft = {
      ...take,
      samples: take.samples.map((sample, index) => ({
        ...sample,
        cameraMode: index < 2 ? cameraMode : "freeFly",
        cut: index === 2,
      })),
    };
    fixture.clip.active = fixture.clip.draft;
    fixture.clip.smoothingLevel = 2;
    fixture.clip.playheadMs = 450;
    const firstPerson = render();
    expect(firstPerson).toMatch(/id="clipCameraSmoothing"[^>]*disabled=""/);
    expect(firstPerson).toContain('aria-valuetext="Off"');
    fixture.clip.playheadMs = 750;
    const freeCamera = render();
    expect(freeCamera).not.toMatch(/id="clipCameraSmoothing"[^>]*disabled=""/);
    expect(freeCamera).toContain('aria-valuetext="High"');
    expect(fixture.clip.smoothingLevel).toBe(2);
  },
);

it("offers graphics effects and HUD settings in the accordion before saving", () => {
  vi.spyOn(settingsStore, "getInitialState").mockImplementation(() =>
    settingsStore.getState(),
  );
  expect(render()).not.toContain('id="clipShowChatHud"');
  fixture.clip.draft = take;
  fixture.clip.active = take;
  settingsStore.setState({
    showChat: false,
    chatHudStyle: "transparent",
    showMatchHud: true,
    matchHudStyle: "broadcast",
  });
  const markup = render();
  const panelStart = markup.indexOf("data-clip-editor-panel");
  const actionsStart = markup.indexOf('aria-label="Discard clip"');
  const legend = markup.indexOf("<legend>Override viewer settings?</legend>");
  const fieldsetStart = markup.lastIndexOf("<fieldset", legend);
  const fieldsetEnd = markup.indexOf("</fieldset>", legend);
  const effects = markup.indexOf('id="clipIncludeEffects"');
  const chat = markup.indexOf('id="clipShowChatHud"');
  const match = markup.indexOf('id="clipShowMatchHud"');
  expect(fieldsetStart).toBeGreaterThan(panelStart);
  expect(legend).toBeGreaterThan(fieldsetStart);
  expect(effects).toBeGreaterThan(legend);
  expect(chat).toBeGreaterThan(effects);
  expect(match).toBeGreaterThan(chat);
  expect(fieldsetEnd).toBeGreaterThan(match);
  expect(actionsStart).toBeGreaterThan(fieldsetEnd);
  expect(markup).toContain('for="clipIncludeEffects">Current graphics effects');
  expect(
    markup.match(/<input[^>]*id="clipIncludeEffects"[^>]*>/)?.[0],
  ).not.toContain('checked=""');
  expect(
    markup.match(/<input[^>]*id="clipShowChatHud"[^>]*>/)?.[0],
  ).not.toContain('checked=""');
  expect(markup.match(/<input[^>]*id="clipShowMatchHud"[^>]*>/)?.[0]).toContain(
    'checked=""',
  );
  expect(markup).toContain('aria-label="Chat HUD style"');
  expect(markup).toContain('aria-label="Match HUD style"');
  expect(markup).toContain(">Transparent</span>");
  expect(markup).toContain(">Broadcast</span>");
  expect(markup).not.toContain('aria-label="Save clip"');
  expect(markup).not.toContain("data-clip-save-confirm");

  settingsStore.setState({
    showChat: true,
    chatHudStyle: "solid",
    showMatchHud: false,
    matchHudStyle: "classic",
  });
  const updated = render();
  expect(updated.match(/<input[^>]*id="clipShowChatHud"[^>]*>/)?.[0]).toContain(
    'checked=""',
  );
  expect(
    updated.match(/<input[^>]*id="clipShowMatchHud"[^>]*>/)?.[0],
  ).not.toContain('checked=""');
  expect(updated).toContain(">Solid</span>");
  expect(updated).toContain(">Classic</span>");
});

it("shows anonymous viewers the current recorded speed in a disabled shared select", () => {
  fixture.account.user = null;
  fixture.clip.active = take;
  const markup = render();
  expect(markup).toContain('aria-label="Clip playback speed"');
  expect(markup).toContain('data-select="custom"');
  expect(markup).toContain(">1×</span>");
  const trigger = markup.match(/<button[^>]*id="clipPlaybackSpeed"[^>]*>/)?.[0];
  expect(trigger).toContain('disabled=""');
  expect(markup).not.toContain("Recorded");
  expect(markup).not.toContain("<select");
  expect(markup).not.toContain('aria-label="Record clip"');
  fixture.clip.playheadMs = 450;
  expect(render()).toContain(">0.25×</span>");
  fixture.clip.playheadMs = 750;
  expect(render()).toContain(">2×</span>");
});

it("keeps clip errors out of the playback controls", () => {
  fixture.clip.error = "Record a little longer before stopping.";
  expect(renderToStaticMarkup(<ClipPlaybackControls />)).toBe("");
  expect(render()).toContain('aria-label="Clip error"');
  fixture.clip.active = take;
  expect(renderToStaticMarkup(<ClipPlaybackControls />)).not.toContain(
    fixture.clip.error,
  );
});

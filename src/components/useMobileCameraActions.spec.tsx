import { beforeEach, expect, it, vi } from "vitest";
import {
  resetStreamPlayback,
  streamPlaybackStore,
  type DemoCameraMode,
} from "../state/streamPlaybackStore";
import { useMobileCameraActions } from "./useMobileCameraActions";

const fixture = vi.hoisted(() => ({
  source: "demo" as "map" | "demo" | "live" | null,
  owner: "input" as "input" | "tour" | "director" | "commandCircuit",
  inputMode: "follow" as "local" | "fly" | "follow",
  watching: false,
  watchingReady: false,
  localSpectator: false,
  replayReady: false,
  nativeReady: false,
  followEnabled: true,
  duration: 120,
  recorderName: null as string | null,
  currentPlayback: true,
  canFollow: true,
  canFirstPerson: true,
  canCyclePlayers: true,
  cycleLocalPlayer: vi.fn(() => true),
  deactivateCommandCircuit: vi.fn(),
  nativeRequest: vi.fn(() => true),
  adapter: {} as object,
  selectLocalMode: vi.fn(() => true),
  notify: vi.fn(),
  followFlag: vi.fn(() => true),
  flags: [
    { slot: 1, teamId: 1, label: "Storm flag" },
    { slot: 2, teamId: 2, label: "Inferno flag" },
    { slot: 3, teamId: 3, label: "Other flag" },
  ],
}));

vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    selector: (state: unknown) => unknown,
  ) => selector(store.getState()),
}));
vi.mock("../state/cameraOwner", () => ({
  useCameraOwner: () => fixture.owner,
  resolveCameraOwner: () => fixture.owner,
}));
vi.mock("../state/engineStore", () => ({
  isCurrentPlayback: () => fixture.currentPlayback,
}));
vi.mock("../state/mobileNativeCamera", () => ({
  requestNativeCameraMode: fixture.nativeRequest,
}));
vi.mock("../state/commandCircuitStore", () => ({
  commandCircuitStore: {
    getState: () => ({ deactivate: fixture.deactivateCommandCircuit }),
  },
}));
vi.mock("../state/inputControls", () => ({
  notifySubscribers: fixture.notify,
}));
vi.mock("../state/inputModeStore", () => ({
  useInputMode: () => fixture.inputMode,
  inputModeStore: {
    getState: () => ({ mode: fixture.inputMode }),
  },
}));
vi.mock("../state/liveConnectionStore", () => {
  const getState = () => ({
    role: fixture.watching ? "watcher" : "player",
    gameStatus: fixture.nativeReady ? "connected" : null,
    liveReady: fixture.watching ? fixture.watchingReady : fixture.nativeReady,
    adapter: fixture.adapter,
  });
  return {
    useLiveSelector: (selector: (state: unknown) => unknown) =>
      selector(getState()),
    liveConnectionStore: {
      getState,
    },
  };
});
vi.mock("../state/replayConnectionStore", () => ({
  replayConnectionStore: { getState: () => ({ ready: fixture.replayReady }) },
}));
vi.mock("../state/selectCameraMode", () => ({
  getLocalCameraCapabilities: () => ({
    canFollow: fixture.canFollow,
    canFirstPerson: fixture.canFirstPerson,
    canCyclePlayers: fixture.canCyclePlayers,
  }),
  selectLocalCameraMode: fixture.selectLocalMode,
  cycleLocalCameraPlayer: fixture.cycleLocalPlayer,
}));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (selector: () => unknown) => selector(),
}));
vi.mock("./usePlayback", () => ({
  useRecording: () =>
    fixture.source === "demo" || fixture.source === "live"
      ? {
          source: fixture.source,
          duration: fixture.duration,
          recorderName: fixture.recorderName,
          streamingPlayback: { localSpectator: fixture.localSpectator },
        }
      : null,
}));
vi.mock("./useIsWatchSpectator", () => ({
  useIsWatchSpectator: ({ requireReady = false } = {}) =>
    (fixture.watching && (!requireReady || fixture.watchingReady)) ||
    (fixture.localSpectator && (!requireReady || fixture.replayReady)),
}));
vi.mock("./useFlagCameras", () => ({
  useFlagCameras: () => fixture.flags,
}));
vi.mock("./useFollowCamera", () => ({
  useFollowCamera: () => ({
    enabled: fixture.followEnabled,
    followFlag: fixture.followFlag,
  }),
}));

beforeEach(() => {
  Object.assign(fixture, {
    source: "demo",
    owner: "input",
    inputMode: "follow",
    watching: false,
    watchingReady: false,
    localSpectator: false,
    replayReady: false,
    nativeReady: false,
    followEnabled: true,
    duration: 120,
    recorderName: null,
    currentPlayback: true,
    canFollow: true,
    canFirstPerson: true,
    canCyclePlayers: true,
    adapter: {},
  });
  fixture.notify.mockClear();
  fixture.nativeRequest.mockReset().mockReturnValue(true);
  fixture.followFlag.mockReset().mockReturnValue(true);
  fixture.selectLocalMode.mockReset().mockReturnValue(true);
  fixture.cycleLocalPlayer.mockReset().mockReturnValue(true);
  fixture.deactivateCommandCircuit.mockReset().mockImplementation(() => {
    fixture.owner = "input";
  });
  resetStreamPlayback();
  streamPlaybackStore.setState({ cameraMode: "orbitOverride" });
});

it("selects a local mode directly and delegates existing player actions", () => {
  const actions = useMobileCameraActions();
  expect(actions.modes.find((mode) => mode.active)?.label).toBe("Follow");
  expect(actions.selectMode("firstPersonOverride")).toBe(true);
  expect(fixture.selectLocalMode).toHaveBeenCalledExactlyOnceWith(
    "firstPersonOverride",
    true,
  );
  actions.nextPlayer();
  actions.previousPlayer();
  expect(fixture.cycleLocalPlayer.mock.calls).toEqual([[1], [-1]]);
  expect(fixture.notify).not.toHaveBeenCalled();
  expect(actions.flags.map((flag) => flag.slot)).toEqual([1, 2]);
  expect(actions.followFlag(1)).toBe(true);
  expect(fixture.followFlag).toHaveBeenCalledExactlyOnceWith(1);
});

it.each<[DemoCameraMode, string]>([
  ["original", "Original view"],
  ["freeFly", "Free-fly"],
  ["orbitOverride", "Follow"],
  ["firstPersonOverride", "First person"],
])("labels local camera mode %s as %s", (cameraMode, label) => {
  streamPlaybackStore.setState({ cameraMode });
  const actions = useMobileCameraActions();
  expect(actions.modes.find((mode) => mode.active)?.label).toBe(label);
  expect(actions.modes.find((mode) => mode.active)?.id).toBe(cameraMode);
});

it("supports native observer actions without offering client-only flag cameras", () => {
  Object.assign(fixture, { source: "live", nativeReady: true });
  streamPlaybackStore.setState({ cameraMode: "original" });
  const actions = useMobileCameraActions();
  expect(actions.modes.find((mode) => mode.active)?.label).toBe("Follow");
  expect(actions.modes.map((mode) => mode.id)).toEqual([
    "freeFly",
    "orbitOverride",
  ]);
  expect(actions.modes.every((mode) => mode.enabled)).toBe(true);
  expect(actions.canCyclePlayers).toBe(true);
  expect(actions.canSeek).toBe(false);
  expect(actions.canFollowFlags).toBe(false);
  expect(actions.selectMode("freeFly")).toBe(true);
  actions.nextPlayer();
  expect(actions.followFlag(1)).toBe(false);
  expect(fixture.followFlag).not.toHaveBeenCalled();
  expect(fixture.nativeRequest.mock.calls.map((call) => call.slice(1))).toEqual(
    [["fly"], ["follow", 1]],
  );
  expect(fixture.notify).not.toHaveBeenCalled();
});

it("dispatches each seek to its existing bracket-key action", () => {
  const actions = useMobileCameraActions();
  expect(actions.canSeek).toBe(true);
  actions.rewind30();
  actions.rewind5();
  actions.forward5();
  actions.forward30();
  expect(fixture.notify.mock.calls).toEqual([
    ["seekBackwardLarge"],
    ["seekBackward"],
    ["seekForward"],
    ["seekForwardLarge"],
  ]);
});

it.each([
  { source: "live", watching: true, watchingReady: true },
  { source: "map" },
  { source: null },
  { duration: Infinity },
  { currentPlayback: false },
  { owner: "tour" },
])("does not dispatch seeks for unavailable playback %j", (changes) => {
  Object.assign(fixture, changes);
  const actions = useMobileCameraActions();
  expect(actions.canSeek).toBe(false);
  actions.rewind30();
  actions.rewind5();
  actions.forward5();
  actions.forward30();
  expect(fixture.notify).not.toHaveBeenCalled();
});

it("keeps demo seeks available while the director owns the camera", () => {
  fixture.owner = "director";
  expect(useMobileCameraActions().canSeek).toBe(true);
});

it("offers only quick flag follows 1 and 2", () => {
  const actions = useMobileCameraActions();
  expect(actions.flags.map((flag) => flag.slot)).toEqual([1, 2]);
  expect(actions.followFlag(0)).toBe(false);
  expect(actions.followFlag(3)).toBe(false);
  expect(fixture.followFlag).not.toHaveBeenCalled();
  expect(actions.followFlag(2)).toBe(true);
  expect(fixture.followFlag).toHaveBeenCalledExactlyOnceWith(2);
});

it.each<DemoCameraMode>([
  "original",
  "freeFly",
  "orbitOverride",
  "firstPersonOverride",
])(
  "allows local player cycling from %s and delegates perspective handling",
  (cameraMode) => {
    streamPlaybackStore.setState({ cameraMode });
    const actions = useMobileCameraActions();
    expect(actions.canCyclePlayers).toBe(true);
    actions.nextPlayer();
    actions.previousPlayer();
    expect(fixture.cycleLocalPlayer.mock.calls).toEqual([[1], [-1]]);
    expect(fixture.notify).not.toHaveBeenCalled();
  },
);

it("allows player cycling from flag follow, but disables it with no eligible players", () => {
  streamPlaybackStore.setState({ followFlagSlot: 1 });
  expect(useMobileCameraActions().canCyclePlayers).toBe(true);
  fixture.canCyclePlayers = false;
  expect(useMobileCameraActions().canCyclePlayers).toBe(false);
});

it.each(["tour", "director"] as const)(
  "does not dispatch manual camera actions while %s owns the view",
  (owner) => {
    fixture.owner = owner;
    const actions = useMobileCameraActions();
    expect(actions.modes.every((mode) => !mode.enabled)).toBe(true);
    expect(actions.canCyclePlayers).toBe(false);
    expect(actions.canFollowFlags).toBe(false);
    expect(actions.selectMode("freeFly")).toBe(false);
    actions.nextPlayer();
    actions.previousPlayer();
    expect(actions.followFlag(1)).toBe(false);
    expect(fixture.notify).not.toHaveBeenCalled();
    expect(fixture.followFlag).not.toHaveBeenCalled();
  },
);

it("leaves command circuit after successfully selecting a player", () => {
  fixture.owner = "commandCircuit";
  const actions = useMobileCameraActions();
  expect(actions.canFollowFlags).toBe(true);
  expect(actions.modes.every((mode) => !mode.enabled)).toBe(true);
  expect(actions.canCyclePlayers).toBe(true);
  actions.nextPlayer();
  expect(fixture.cycleLocalPlayer).toHaveBeenCalledExactlyOnceWith(1);
  expect(fixture.deactivateCommandCircuit).toHaveBeenCalledOnce();
});

it("keeps command circuit active if there is no eligible player", () => {
  fixture.owner = "commandCircuit";
  fixture.canCyclePlayers = false;
  fixture.cycleLocalPlayer.mockReturnValue(false);
  const actions = useMobileCameraActions();
  expect(actions.canCyclePlayers).toBe(false);
  actions.nextPlayer();
  expect(fixture.deactivateCommandCircuit).not.toHaveBeenCalled();
});

it("offers no follow or seeking controls during map exploration", () => {
  fixture.source = "map";
  fixture.inputMode = "local";
  const actions = useMobileCameraActions();
  expect(actions.modes.every((mode) => !mode.enabled)).toBe(true);
  expect(actions.canFollowFlags).toBe(false);
  expect(actions.canSeek).toBe(false);
});

it.each([false, true])(
  "keeps live camera actions unavailable until ready (watching: %s)",
  (watching) => {
    Object.assign(fixture, { source: "live", watching });
    const actions = useMobileCameraActions();
    expect(actions.modes.every((mode) => !mode.enabled)).toBe(true);
    expect(actions.canCyclePlayers).toBe(false);
    expect(actions.canSeek).toBe(false);
    expect(actions.canFollowFlags).toBe(false);
  },
);

it("enables local camera controls for a ready watch or replay session", () => {
  Object.assign(fixture, {
    source: "live",
    watching: true,
    watchingReady: true,
  });
  const actions = useMobileCameraActions();
  expect(actions.modes.map((mode) => mode.id)).toEqual([
    "freeFly",
    "orbitOverride",
    "firstPersonOverride",
  ]);
  expect(actions.modes.every((mode) => mode.enabled)).toBe(true);
  expect(actions.canCyclePlayers).toBe(true);
  expect(actions.canSeek).toBe(false);
  expect(actions.canFollowFlags).toBe(true);
});

it.each(["MapGenius", "mApGeNiUs"])(
  "omits original view for relay recorder %s",
  (recorderName) => {
    fixture.recorderName = recorderName;
    const actions = useMobileCameraActions();
    expect(actions.modes.map((mode) => mode.id)).toEqual([
      "freeFly",
      "orbitOverride",
      "firstPersonOverride",
    ]);
    actions.selectMode("original");
    expect(fixture.selectLocalMode).toHaveBeenCalledExactlyOnceWith(
      "original",
      false,
    );
  },
);

it("disables player-only perspectives when their targets are unavailable", () => {
  Object.assign(fixture, { canFollow: false, canFirstPerson: false });
  const actions = useMobileCameraActions();
  expect(
    actions.modes.filter((mode) => mode.enabled).map((mode) => mode.id),
  ).toEqual(["original", "freeFly"]);
  fixture.canFollow = true;
  const flag = useMobileCameraActions();
  expect(flag.modes.find((mode) => mode.id === "orbitOverride")?.enabled).toBe(
    true,
  );
  expect(
    flag.modes.find((mode) => mode.id === "firstPersonOverride")?.enabled,
  ).toBe(false);
});

it("delegates supported native mode choices to the shared coordinator", () => {
  Object.assign(fixture, {
    source: "live",
    nativeReady: true,
    inputMode: "fly",
  });
  const actions = useMobileCameraActions();
  expect(actions.modes.find((mode) => mode.active)?.id).toBe("freeFly");
  fixture.inputMode = "follow";
  expect(actions.selectMode("orbitOverride")).toBe(true);
  expect(fixture.notify).not.toHaveBeenCalled();
  expect(actions.selectMode("freeFly")).toBe(true);
  expect(fixture.nativeRequest.mock.calls.map((call) => call.slice(1))).toEqual(
    [["follow"], ["fly"]],
  );
  expect(fixture.notify).not.toHaveBeenCalled();
  expect(actions.selectMode("original")).toBe(false);
  expect(actions.selectMode("firstPersonOverride")).toBe(false);
  expect(fixture.selectLocalMode).not.toHaveBeenCalled();
});

it.each([
  { currentPlayback: false },
  { owner: "tour" },
  { owner: "director" },
  { owner: "commandCircuit" },
])("rechecks context for deferred mode selection %j", (changes) => {
  const actions = useMobileCameraActions();
  Object.assign(fixture, changes);
  expect(actions.selectMode("freeFly")).toBe(false);
  expect(fixture.selectLocalMode).not.toHaveBeenCalled();
  expect(fixture.notify).not.toHaveBeenCalled();
});

it("rechecks watch readiness after the drawer starts closing", () => {
  Object.assign(fixture, {
    source: "live",
    watching: true,
    watchingReady: true,
  });
  const actions = useMobileCameraActions();
  fixture.watchingReady = false;
  expect(actions.selectMode("freeFly")).toBe(false);
  expect(fixture.selectLocalMode).not.toHaveBeenCalled();
});

it.each([{ nativeReady: false }, { inputMode: "local" }])(
  "rechecks native observer eligibility after the drawer starts closing %j",
  (changes) => {
    Object.assign(fixture, { source: "live", nativeReady: true });
    const actions = useMobileCameraActions();
    Object.assign(fixture, changes);
    expect(actions.selectMode("freeFly")).toBe(false);
    expect(fixture.notify).not.toHaveBeenCalled();
  },
);

it("delegates fresh target eligibility and rejects stale playback before cycling", () => {
  const actions = useMobileCameraActions();
  fixture.cycleLocalPlayer.mockReturnValue(false);
  actions.nextPlayer();
  fixture.currentPlayback = false;
  actions.previousPlayer();
  expect(fixture.cycleLocalPlayer).toHaveBeenCalledExactlyOnceWith(1);
  expect(fixture.notify).not.toHaveBeenCalled();
  expect(fixture.deactivateCommandCircuit).not.toHaveBeenCalled();
});

it("rechecks native follow readiness before deferred player cycling", () => {
  Object.assign(fixture, { source: "live", nativeReady: true });
  const actions = useMobileCameraActions();
  fixture.nativeReady = false;
  actions.previousPlayer();
  fixture.nativeReady = true;
  fixture.owner = "director";
  actions.nextPlayer();
  expect(fixture.notify).not.toHaveBeenCalled();
});

it.each(["fly", "follow"] as const)(
  "delegates native player requests from %s to the shared mode coordinator",
  (inputMode) => {
    Object.assign(fixture, { source: "live", nativeReady: true, inputMode });
    const actions = useMobileCameraActions();
    expect(actions.canCyclePlayers).toBe(true);
    actions.nextPlayer();
    actions.previousPlayer();
    expect(
      fixture.nativeRequest.mock.calls.map((call) => call.slice(1)),
    ).toEqual([
      ["follow", 1],
      ["follow", -1],
    ]);
    expect(fixture.notify).not.toHaveBeenCalled();
    expect(fixture.cycleLocalPlayer).not.toHaveBeenCalled();
  },
);

it("leaves native command circuit before requesting player follow", () => {
  Object.assign(fixture, {
    source: "live",
    nativeReady: true,
    owner: "commandCircuit",
  });
  const actions = useMobileCameraActions();
  expect(actions.canCyclePlayers).toBe(true);
  actions.nextPlayer();
  expect(fixture.deactivateCommandCircuit).toHaveBeenCalledOnce();
  expect(fixture.nativeRequest).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ source: "live" }),
    "follow",
    1,
  );
  expect(fixture.notify).not.toHaveBeenCalled();
});

it.each([
  { source: "demo" },
  { source: "live", watching: true, watchingReady: true },
  { source: "live", localSpectator: true, replayReady: true },
])("opens the existing target finder for supported playback %j", (changes) => {
  Object.assign(fixture, changes);
  const state = streamPlaybackStore.getState();
  const actions = useMobileCameraActions();
  expect(actions.canFindTarget).toBe(true);
  actions.findTarget();
  expect(fixture.notify).toHaveBeenCalledExactlyOnceWith("findTarget");
  expect(fixture.selectLocalMode).not.toHaveBeenCalled();
  expect(fixture.cycleLocalPlayer).not.toHaveBeenCalled();
  expect(fixture.deactivateCommandCircuit).not.toHaveBeenCalled();
  expect(streamPlaybackStore.getState()).toBe(state);
});

it("keeps target search available in command circuit and with an empty target list", () => {
  Object.assign(fixture, {
    owner: "commandCircuit",
    canFollow: false,
    canFirstPerson: false,
    canCyclePlayers: false,
  });
  const actions = useMobileCameraActions();
  expect(actions.canFindTarget).toBe(true);
  actions.findTarget();
  expect(fixture.notify).toHaveBeenCalledExactlyOnceWith("findTarget");
  expect(fixture.deactivateCommandCircuit).not.toHaveBeenCalled();
});

it.each([
  { source: "live", nativeReady: true },
  { source: "live", watching: true },
  { source: "live", localSpectator: true },
  { source: "map" },
  { source: null },
  { currentPlayback: false },
  { owner: "tour" },
  { owner: "director" },
])("does not open target search in unsupported context %j", (changes) => {
  Object.assign(fixture, changes);
  const actions = useMobileCameraActions();
  expect(actions.canFindTarget).toBe(false);
  actions.findTarget();
  expect(fixture.notify).not.toHaveBeenCalled();
});

it.each([{ currentPlayback: false }, { owner: "tour" }, { owner: "director" }])(
  "rechecks deferred target search context %j",
  (changes) => {
    const actions = useMobileCameraActions();
    Object.assign(fixture, changes);
    actions.findTarget();
    expect(fixture.notify).not.toHaveBeenCalled();
  },
);

it.each(["watch", "replay"])(
  "rechecks %s readiness before opening deferred target search",
  (kind) => {
    Object.assign(fixture, {
      source: "live",
      watching: kind === "watch",
      watchingReady: kind === "watch",
      localSpectator: kind === "replay",
      replayReady: kind === "replay",
    });
    const actions = useMobileCameraActions();
    expect(actions.canFindTarget).toBe(true);
    fixture.watchingReady = false;
    fixture.replayReady = false;
    actions.findTarget();
    expect(fixture.notify).not.toHaveBeenCalled();
  },
);

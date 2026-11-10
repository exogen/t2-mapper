import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StreamRecording } from "../stream/types";
import { requestNativeCameraMode } from "./mobileNativeCamera";

const fixture = vi.hoisted(() => ({
  recording: null as object | null,
  adapter: {} as object,
  mode: "fly" as "local" | "fly" | "follow",
  role: "player" as "player" | "watcher",
  connected: true,
  ready: true,
  owner: "input" as "input" | "commandCircuit" | "tour" | "director",
  notify: vi.fn(),
  modeListeners: new Set<() => void>(),
  connectionListeners: new Set<() => void>(),
  recordingListeners: new Set<() => void>(),
  ownerListeners: new Set<() => void>(),
}));

vi.mock("./inputControls", () => ({ notifySubscribers: fixture.notify }));
vi.mock("./cameraOwner", () => ({
  resolveCameraOwner: () => fixture.owner,
}));
vi.mock("./engineStore", () => ({
  isCurrentPlayback: (recording: object) => fixture.recording === recording,
  engineStore: {
    subscribe: (listener: () => void) => {
      fixture.recordingListeners.add(listener);
      return () => fixture.recordingListeners.delete(listener);
    },
  },
}));
vi.mock("./inputModeStore", () => ({
  inputModeStore: {
    getState: () => ({ mode: fixture.mode }),
    subscribe: (listener: () => void) => {
      fixture.modeListeners.add(listener);
      return () => fixture.modeListeners.delete(listener);
    },
  },
}));
vi.mock("./liveConnectionStore", () => ({
  liveConnectionStore: {
    getState: () => ({
      adapter: fixture.adapter,
      role: fixture.role,
      gameStatus: fixture.connected ? "connected" : null,
      liveReady: fixture.ready,
    }),
    subscribe: (listener: () => void) => {
      fixture.connectionListeners.add(listener);
      return () => fixture.connectionListeners.delete(listener);
    },
  },
}));
vi.mock("./cameraTourStore", () => ({
  cameraTourStore: {
    subscribe: (listener: () => void) => {
      fixture.ownerListeners.add(listener);
      return () => fixture.ownerListeners.delete(listener);
    },
  },
}));
vi.mock("./demoDirectorStore", () => ({
  demoDirectorStore: {
    subscribe: (listener: () => void) => {
      fixture.ownerListeners.add(listener);
      return () => fixture.ownerListeners.delete(listener);
    },
  },
}));
vi.mock("./commandCircuitStore", () => ({
  commandCircuitStore: {
    subscribe: (listener: () => void) => {
      fixture.ownerListeners.add(listener);
      return () => fixture.ownerListeners.delete(listener);
    },
  },
}));

let recording: StreamRecording;

function acknowledge(mode: "fly" | "follow") {
  fixture.mode = mode;
  fixture.modeListeners.forEach((listener) => listener());
}

function expectNoSubscriptions() {
  expect(fixture.modeListeners.size).toBe(0);
  expect(fixture.connectionListeners.size).toBe(0);
  expect(fixture.recordingListeners.size).toBe(0);
  expect(fixture.ownerListeners.size).toBe(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  recording = { source: "live" } as StreamRecording;
  Object.assign(fixture, {
    recording,
    adapter: {},
    mode: "fly",
    role: "player",
    connected: true,
    ready: true,
    owner: "input",
  });
  fixture.notify.mockClear();
});

afterEach(() => {
  fixture.recording = null;
  fixture.recordingListeners.forEach((listener) => listener());
  expectNoSubscriptions();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it("keeps repeated follow selections idempotent before and after acknowledgement", () => {
  expect(requestNativeCameraMode(recording, "follow")).toBe(true);
  expect(requestNativeCameraMode(recording, "follow")).toBe(true);
  expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
  acknowledge("follow");
  expect(requestNativeCameraMode(recording, "follow")).toBe(true);
  expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
  expectNoSubscriptions();
});

it.each([
  [1, "nextPlayerKey"],
  [-1, "prevPlayerKey"],
] as const)(
  "cycles direction %s only after follow acknowledgement",
  (direction, action) => {
    requestNativeCameraMode(recording, "follow", direction);
    expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
    acknowledge("follow");
    expect(fixture.notify.mock.calls).toEqual([
      ["toggleObserverMode"],
      [action],
    ]);
    expectNoSubscriptions();
  },
);

it("lets a newer free-fly choice cancel the old cycle and restore free-fly after acknowledgement", () => {
  requestNativeCameraMode(recording, "follow", 1);
  requestNativeCameraMode(recording, "fly");
  expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
  acknowledge("follow");
  expect(fixture.notify.mock.calls).toEqual([
    ["toggleObserverMode"],
    ["toggleObserverMode"],
  ]);
  acknowledge("fly");
  expect(fixture.notify).toHaveBeenCalledTimes(2);
  expectNoSubscriptions();
});

it("lets an explicit follow choice replace a pending player-cycle action", () => {
  requestNativeCameraMode(recording, "follow", 1);
  requestNativeCameraMode(recording, "follow");
  acknowledge("follow");
  expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
  expectNoSubscriptions();
});

it("uses the latest mode choice while one toggle is in flight", () => {
  requestNativeCameraMode(recording, "follow");
  requestNativeCameraMode(recording, "fly");
  requestNativeCameraMode(recording, "follow");
  acknowledge("follow");
  expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
  expectNoSubscriptions();
});

it("uses the latest pending player direction without sending a second toggle", () => {
  requestNativeCameraMode(recording, "follow", 1);
  requestNativeCameraMode(recording, "follow", -1);
  acknowledge("follow");
  expect(fixture.notify.mock.calls).toEqual([
    ["toggleObserverMode"],
    ["prevPlayerKey"],
  ]);
});

it("waits for an in-flight exit before re-entering follow for a newer player action", () => {
  fixture.mode = "follow";
  requestNativeCameraMode(recording, "fly");
  requestNativeCameraMode(recording, "follow", 1);
  expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
  acknowledge("fly");
  acknowledge("follow");
  expect(fixture.notify.mock.calls).toEqual([
    ["toggleObserverMode"],
    ["toggleObserverMode"],
    ["nextPlayerKey"],
  ]);
});

it("cycles immediately when the native observer already follows a player", () => {
  fixture.mode = "follow";
  requestNativeCameraMode(recording, "follow", -1);
  expect(fixture.notify).toHaveBeenCalledExactlyOnceWith("prevPlayerKey");
  expectNoSubscriptions();
});

it.each([
  { source: "demo" },
  { source: "live", streamingPlayback: { localSpectator: true } },
])("rejects non-native recordings %j", (properties) => {
  recording = properties as StreamRecording;
  fixture.recording = recording;
  expect(requestNativeCameraMode(recording, "follow")).toBe(false);
  expect(fixture.notify).not.toHaveBeenCalled();
  expectNoSubscriptions();
});

it.each([
  { ready: false },
  { connected: false },
  { role: "watcher" },
  { mode: "local" },
  { recording: null },
  { owner: "tour" },
  { owner: "director" },
  { owner: "commandCircuit" },
])("rejects unsupported native context %j", (changes) => {
  Object.assign(fixture, changes);
  expect(requestNativeCameraMode(recording, "follow", 1)).toBe(false);
  expect(fixture.notify).not.toHaveBeenCalled();
  expectNoSubscriptions();
});

it.each(["disconnect", "recording", "adapter", "owner"])(
  "cancels an in-flight intent immediately when %s changes",
  (change) => {
    requestNativeCameraMode(recording, "follow", 1);
    if (change === "disconnect") {
      fixture.ready = false;
      fixture.connectionListeners.forEach((listener) => listener());
    } else if (change === "recording") {
      fixture.recording = {};
      fixture.recordingListeners.forEach((listener) => listener());
    } else if (change === "adapter") {
      fixture.adapter = {};
      fixture.connectionListeners.forEach((listener) => listener());
    } else {
      fixture.owner = "director";
      fixture.ownerListeners.forEach((listener) => listener());
    }
    expectNoSubscriptions();
    acknowledge("follow");
    expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
  },
);

it("expires a request if the server never acknowledges its mode change", () => {
  requestNativeCameraMode(recording, "follow", 1);
  vi.advanceTimersByTime(1500);
  expectNoSubscriptions();
  acknowledge("follow");
  expect(fixture.notify.mock.calls).toEqual([["toggleObserverMode"]]);
});

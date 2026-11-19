import { afterAll, expect, test, vi } from "vitest";
import {
  buildShortcutHelp,
  type ShortcutHelpAvailability,
} from "./shortcutHelp";
import type { AppMode } from "./useQueryParams";

vi.hoisted(() => vi.stubGlobal("window", new EventTarget()));
afterAll(() => vi.unstubAllGlobals());

function rows(
  mode: AppMode,
  availability: Partial<ShortcutHelpAvailability> = {},
) {
  return buildShortcutHelp(mode, {
    actions: new Set(),
    cameraMode: "original",
    inputMode: "local",
    pointerLocked: false,
    ...availability,
  }).flatMap((group) => group.rows);
}

test("keeps the Record clip shortcut visible when it is unavailable", () => {
  const recordingShortcut = (row: { label: string }) =>
    row.label.startsWith("Record clip");
  expect(rows("map").find(recordingShortcut)).toBeUndefined();
  expect(rows("demo").find(recordingShortcut)?.keys).toEqual([
    { parts: ["R"], active: false },
  ]);
  expect(
    rows("demo", { actions: new Set(["recordClip"]) }).find(recordingShortcut)
      ?.keys,
  ).toEqual([{ parts: ["R"], active: true }]);
});

test("dims inert demo camera movement and locked speed controls", () => {
  const availability = {
    actions: new Set([
      "lookUp",
      "moveForward",
      "seekBackward",
      "decreasePlaybackSpeed",
    ]),
    canSeekDemo: true,
  };
  const shortcuts = rows("demo", availability);
  expect(
    shortcuts.find((row) => row.label === "Move forward / back")?.keys[0]
      ?.active,
  ).toBe(false);
  expect(
    shortcuts.find((row) => row.label === "Look around")?.keys[0]?.active,
  ).toBe(false);
  expect(
    shortcuts
      .find((row) => row.label === "Decrease playback speed")
      ?.keys.every((key) => !key.active),
  ).toBe(true);
  expect(
    shortcuts.find((row) => row.label === "Seek back / forward 5s")?.keys[0]
      ?.active,
  ).toBe(true);
  const freeFly = rows("demo", { ...availability, cameraMode: "freeFly" });
  expect(
    freeFly.find((row) => row.label === "Move forward / back")?.keys[0]?.active,
  ).toBe(true);
});

test("shows one range for map camera selection", () => {
  for (const active of [true, false]) {
    const actions = new Set(active ? ["camera1"] : []);
    expect(
      rows("map", { actions }).find(
        (row) => row.label === "Select a map camera",
      )?.keys,
    ).toEqual([{ parts: ["1–9"], active }]);
  }
});

test.each([
  ["original", "local", false],
  ["firstPersonOverride", "follow", false],
  ["orbitOverride", "follow", true],
] as const)("shows the wheel action in %s", (cameraMode, inputMode, zooms) => {
  const shortcuts = rows("demo", {
    actions: new Set(["adjustSpeed"]),
    cameraMode,
    inputMode,
  });
  expect(
    shortcuts.find((row) => row.label === "Adjust fly speed")?.keys,
  ).toEqual([{ parts: ["Scroll"], active: !zooms }]);
  expect(
    shortcuts.find((row) => row.label === "Zoom follow camera")?.keys,
  ).toEqual([{ parts: ["Scroll"], active: zooms }]);
});

test("shows one quick cam range whether quick cam controls are available or not", () => {
  const actions = new Set(["quickCam0", "saveQuickCam0"]);
  for (const active of [true, false]) {
    const shortcuts = rows("demo", {
      actions,
      quickCamRecallAvailable: active,
      quickCamSaveAvailable: active,
    });
    expect(
      shortcuts.find((row) => row.label === "Recall a quick cam")?.keys,
    ).toEqual([{ parts: ["0–9"], active }]);
    expect(
      shortcuts.find((row) => row.label === "Save a quick cam")?.keys,
    ).toEqual([{ parts: ["Shift", "0–9"], active }]);
  }
});

test("shows mouse lock and drag availability for the current pointer state", () => {
  const actions = new Set(["canvasClick", "dragLook", "lockedLook"]);
  function keys(
    label: string,
    availability: Partial<ShortcutHelpAvailability> = {},
  ) {
    return rows("map", { actions, ...availability }).find(
      (row) => row.label === label,
    )?.keys;
  }

  expect(keys("Lock mouse")).toEqual([{ parts: ["Left click"], active: true }]);
  expect(keys("Lock mouse", { mouseLockBlocked: true })?.[0].active).toBe(
    false,
  );
  expect(keys("Lock mouse", { pointerLocked: true })?.[0].active).toBe(false);
  expect(keys("Look with mouse", { pointerLocked: false })).toEqual([
    { parts: ["Drag"], active: true },
  ]);
  expect(keys("Look with mouse", { pointerLocked: true })).toEqual([
    { parts: ["Drag"], active: false },
  ]);
});

test("shows the correct click for each direction of player cycling", () => {
  const availability = {
    actions: new Set([
      "nextPlayerKey",
      "prevPlayerKey",
      "nextPlayer",
      "prevPlayer",
    ]),
    hasFollowTarget: true,
  };
  const unlocked = rows("demo", availability);
  expect(unlocked.find((row) => row.label === "Next player")?.keys).toEqual([
    { parts: ["N"], active: true },
    { parts: ["Left click"], active: false },
  ]);
  const locked = rows("demo", { ...availability, pointerLocked: true });
  expect(locked.find((row) => row.label === "Next player")?.keys[1]).toEqual({
    parts: ["Left click"],
    active: true,
  });
  expect(locked.find((row) => row.label === "Previous player")?.keys).toEqual([
    { parts: ["Shift", "N"], active: true },
    { parts: ["Right click"], active: true },
  ]);
});

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ActiveInputBindings } from "./ActiveInputBindings";
import type { InputMapEntry } from "./InputControls";

const fixture = vi.hoisted(() => ({
  source: "demo" as "demo" | "live" | null,
  watcher: false,
  replay: false,
  owner: "input" as "input" | "tour" | "director" | "commandCircuit",
  targetFinderOpen: false,
  orbit: false,
  inputMode: "local" as "local" | "fly" | "follow",
  cameraMode: "original" as "original" | "freeFly" | "orbitOverride",
}));

vi.mock("./usePlayback", () => ({
  useRecording: () =>
    fixture.source && {
      source: fixture.source,
      streamingPlayback: { localSpectator: fixture.replay },
    },
}));
vi.mock("../state/inputModeStore", () => ({
  useInputMode: () => fixture.inputMode,
}));
vi.mock("./SettingsProvider", () => ({
  useControls: () => ({ clickToCycle: true }),
}));
vi.mock("../state/cameraOwner", () => ({
  useCameraOwner: () => fixture.owner,
}));
vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (select: (state: unknown) => unknown) =>
    select({ role: fixture.watcher ? "watcher" : "player" }),
}));
vi.mock("zustand", () => ({
  useStore: (_store: unknown, select: (state: unknown) => unknown) =>
    select({
      open: fixture.targetFinderOpen,
      followFlagSlot: null,
      cameraMode: fixture.cameraMode,
    }),
}));
vi.mock("./usePlayerOrbitLocked", () => ({
  usePlayerOrbitAvailable: () => fixture.orbit,
}));
vi.mock("./InputBindings", () => ({
  InputBindings: ({ map }: { map: readonly InputMapEntry[] }) => (
    <span data-actions={map.map((entry) => entry.name).join(",")} />
  ),
}));

afterEach(() => {
  fixture.source = "demo";
  fixture.watcher = false;
  fixture.replay = false;
  fixture.owner = "input";
  fixture.targetFinderOpen = false;
  fixture.orbit = false;
  fixture.inputMode = "local";
  fixture.cameraMode = "original";
});

it.each([
  ["live", false, false, "follow", "original", 1, false],
  ["live", false, false, "fly", "original", 1, true],
  ["live", false, false, "local", "original", 0, false],
  ["demo", false, false, "follow", "orbitOverride", 1, true],
  ["live", true, false, "follow", "orbitOverride", 1, true],
  ["live", false, true, "follow", "orbitOverride", 1, true],
  [null, false, false, "local", "original", 1, true],
] as const)(
  "binds wheel control once for %s, watcher %s, replay %s, input %s, camera %s",
  (source, watcher, replay, inputMode, cameraMode, scrollCount, movement) => {
    Object.assign(fixture, { source, watcher, replay, inputMode, cameraMode });
    const html = renderToStaticMarkup(<ActiveInputBindings />);
    expect(html.match(/\badjustSpeed\b/g) ?? []).toHaveLength(scrollCount);
    expect(html.includes("moveForward")).toBe(movement);
  },
);

it.each(["tour", "director", "commandCircuit"] as const)(
  "keeps native follow wheel zoom unbound while %s owns the camera",
  (owner) => {
    Object.assign(fixture, { source: "live", inputMode: "follow", owner });
    expect(renderToStaticMarkup(<ActiveInputBindings />)).not.toContain(
      "adjustSpeed",
    );
  },
);

it.each(["input", "tour", "director", "commandCircuit"] as const)(
  "offers demo quick cams while %s owns the camera, without competing number bindings",
  (owner) => {
    fixture.owner = owner;
    const html = renderToStaticMarkup(<ActiveInputBindings />);
    for (let slot = 0; slot < 10; slot++) {
      expect(html.match(new RegExp(`\\bquickCam${slot}\\b`, "g"))).toHaveLength(
        1,
      );
      expect(
        html.match(new RegExp(`\\bsaveQuickCam${slot}\\b`, "g")),
      ).toHaveLength(1);
    }
    expect(html).not.toMatch(/followFlag\d|\bcamera\d/);
  },
);

it.each([
  [null, false, false],
  ["live", false, false],
  ["live", true, true],
] as const)(
  "enables quick cams for source %s, watcher %s: %s",
  (source, watcher, enabled) => {
    fixture.source = source;
    fixture.watcher = watcher;
    const html = renderToStaticMarkup(<ActiveInputBindings />);
    expect(html.includes("quickCam0")).toBe(enabled);
  },
);

it.each(["input", "tour", "director", "commandCircuit"] as const)(
  "binds the score screen in demo and live while %s owns the camera",
  (owner) => {
    fixture.owner = owner;
    for (const source of ["demo", "live"] as const) {
      fixture.source = source;
      expect(
        renderToStaticMarkup(<ActiveInputBindings />).match(
          /\btoggleScoreScreen\b/g,
        ),
      ).toHaveLength(1);
    }
    fixture.source = null;
    expect(renderToStaticMarkup(<ActiveInputBindings />)).not.toContain(
      "toggleScoreScreen",
    );
  },
);

it("binds the follow lock only while orbiting a player", () => {
  expect(renderToStaticMarkup(<ActiveInputBindings />)).not.toContain(
    "toggleFollowBehindPlayer",
  );
  fixture.orbit = true;
  expect(renderToStaticMarkup(<ActiveInputBindings />)).toContain(
    "toggleFollowBehindPlayer",
  );
});

it("leaves number keys to the target finder while it is open", () => {
  fixture.targetFinderOpen = true;
  expect(renderToStaticMarkup(<ActiveInputBindings />)).toBe("");
});

it("mounts local camera movement, target finding and quick cams for replay viewers without demo transport", () => {
  fixture.source = "live";
  fixture.replay = true;
  const html = renderToStaticMarkup(<ActiveInputBindings />);
  for (const action of [
    "moveForward",
    "moveBackward",
    "moveLeft",
    "moveRight",
    "findTarget",
    "toggleObserverMode",
    "quickCam1",
    "saveQuickCam1",
  ])
    expect(html).toContain(action);
  for (const action of ["playPause", "seekForward", "increasePlaybackSpeed"])
    expect(html).not.toContain(action);
  fixture.replay = false;
  const player = renderToStaticMarkup(<ActiveInputBindings />);
  expect(player).not.toContain("moveForward");
  expect(player).not.toContain("findTarget");
});

it.each(["tour", "director", "commandCircuit"] as const)(
  "keeps replay quick cams available while %s owns the camera",
  (owner) => {
    fixture.source = "live";
    fixture.replay = true;
    fixture.owner = owner;
    const html = renderToStaticMarkup(<ActiveInputBindings />);
    expect(html).toContain("quickCam1");
    expect(html).not.toContain("playPause");
  },
);

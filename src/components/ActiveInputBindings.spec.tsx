import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ActiveInputBindings } from "./ActiveInputBindings";
import type { InputMapEntry } from "./InputControls";

const fixture = vi.hoisted(() => ({
  source: "demo" as "demo" | "live" | null,
  watcher: false,
  owner: "input" as "input" | "tour" | "director" | "commandCircuit",
  targetFinderOpen: false,
}));

vi.mock("./usePlayback", () => ({
  useRecording: () => fixture.source && { source: fixture.source },
}));
vi.mock("./InputContext", () => ({ useInputMode: () => "local" }));
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
    select({ open: fixture.targetFinderOpen, followFlagSlot: null }),
}));
vi.mock("./InputBindings", () => ({
  InputBindings: ({ map }: { map: readonly InputMapEntry[] }) => (
    <span data-actions={map.map((entry) => entry.name).join(",")} />
  ),
}));

afterEach(() => {
  fixture.source = "demo";
  fixture.watcher = false;
  fixture.owner = "input";
  fixture.targetFinderOpen = false;
});

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

it("leaves number keys to the target finder while it is open", () => {
  fixture.targetFinderOpen = true;
  expect(renderToStaticMarkup(<ActiveInputBindings />)).toBe("");
});

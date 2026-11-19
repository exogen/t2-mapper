import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WatchedPlayerHUD } from "./WatchedPlayerHUD";

const fixture = vi.hoisted(() => ({
  projectileFollow: null as
    | { kind: "armed"; playerName: string }
    | { kind: "tracking"; sourceName?: string }
    | null,
}));

vi.mock("../state/streamPlaybackStore", () => ({
  streamPlaybackStore: { getState: () => fixture },
}));
vi.mock("zustand", () => ({
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("../state/casterStore", () => ({ useCaster: () => undefined }));
vi.mock("../state/gameEntityStore", () => ({ gameEntityStore: {} }));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: () => null,
}));
vi.mock("../state/playerResolver", () => ({ playerForEntity: vi.fn() }));
vi.mock("../state/flagTeam", () => ({ flagLabel: vi.fn() }));
vi.mock("./usePlayerOrbitLocked", () => ({
  usePlayerOrbitAvailable: () => true,
}));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({
    followBehindPlayer: true,
    setFollowBehindPlayer: vi.fn(),
  }),
}));
vi.mock("./InputControls", () => ({ useInputAction: vi.fn() }));

it.each([
  [{ kind: "armed", playerName: "Scout" }, "Following next projectile", true],
  [
    { kind: "tracking", sourceName: "Scout" },
    "Following Scout’s projectile",
    false,
  ],
  [
    { kind: "tracking", sourceName: "Base Turret" },
    "Following Base Turret’s projectile",
    false,
  ],
  [{ kind: "tracking" }, "Following projectile", false],
] as const)("shows %s in the follow badge", (state, label, orbitButton) => {
  fixture.projectileFollow = state;
  const markup = renderToStaticMarkup(<WatchedPlayerHUD />);
  expect(markup.replace(/<[^>]+>/g, "")).toBe(label);
  expect(markup.includes('data-armed="true"')).toBe(state.kind === "armed");
  expect(markup.includes('aria-label="Keep follow camera behind player"')).toBe(
    orbitButton,
  );
});

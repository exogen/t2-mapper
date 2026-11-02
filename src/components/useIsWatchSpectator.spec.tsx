import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { useIsWatchSpectator } from "./useIsWatchSpectator";

const fixture = vi.hoisted(() => ({
  local: false,
  role: "player",
  liveReady: false,
  replayReady: false,
}));
vi.mock("./usePlayback", () => ({
  useRecording: () => ({
    source: "live",
    streamingPlayback: { localSpectator: fixture.local },
  }),
}));
vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (select: (state: unknown) => unknown) => select(fixture),
}));
vi.mock("../state/replayConnectionStore", () => ({
  useReplaySelector: (select: (state: unknown) => unknown) =>
    select({ ready: fixture.replayReady }),
}));

function Spectator({ requireReady }: { requireReady: boolean }) {
  return <span>{String(useIsWatchSpectator({ requireReady }))}</span>;
}

it.each([
  [false, "player", true, true, false, false],
  [false, "watcher", false, false, false, true],
  [false, "watcher", false, true, true, false],
  [false, "watcher", true, false, true, true],
  [true, "player", false, false, false, true],
  [true, "player", true, false, true, false],
  [true, "player", false, true, true, true],
] as const)(
  "selects spectator controls for local=%s role=%s liveReady=%s replayReady=%s requireReady=%s → %s",
  (local, role, liveReady, replayReady, requireReady, expected) => {
    Object.assign(fixture, { local, role, liveReady, replayReady });
    expect(
      renderToStaticMarkup(<Spectator requireReady={requireReady} />),
    ).toBe(`<span>${expected}</span>`);
  },
);

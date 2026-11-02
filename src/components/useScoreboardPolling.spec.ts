import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useScoreboard } from "./useScoreboard";

const fixture = vi.hoisted(() => ({
  role: "player",
  local: false,
  request: vi.fn(),
  cleanups: [] as Array<() => void>,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (make: () => unknown) => make(),
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect();
    if (cleanup) fixture.cleanups.push(cleanup);
  },
}));
vi.mock("../state/gameEntityStore", () => ({ useDataSource: () => "live" }));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (select: (state: null) => unknown) => select(null),
}));
vi.mock("../state/casterStore", () => ({
  useCaster: () => undefined,
  displayTeamName: (_id: number, name: string) => name,
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: { getState: () => ({ sendCommand: fixture.request }) },
  useLiveSelector: (select: (state: unknown) => unknown) => select(fixture),
}));
vi.mock("../state/replayConnectionStore", () => ({
  useReplaySelector: (select: (state: unknown) => unknown) =>
    select({ ready: true }),
}));
vi.mock("./usePlayback", () => ({
  useRecording: () => ({
    source: "live",
    streamingPlayback: { localSpectator: fixture.local },
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  fixture.request.mockClear();
});
afterEach(() => {
  fixture.cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

it.each([
  [false, "player", 2],
  [false, "watcher", 0],
  [true, "player", 0],
] as const)(
  "polls scores only for a real player connection: local=%s role=%s",
  (local, role, count) => {
    Object.assign(fixture, { local, role });
    useScoreboard();
    vi.advanceTimersByTime(4000);
    expect(fixture.request).toHaveBeenCalledTimes(count);
  },
);

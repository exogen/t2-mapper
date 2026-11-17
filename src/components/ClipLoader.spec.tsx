import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClipTake, ClipView } from "../../relay/clipTypes";
import type { StreamRecording } from "../stream/types";
import type { NavigationQuery } from "./useQueryParams";

type ExitListener = (
  state: { active: ClipTake | null },
  previous: { active: ClipTake | null },
) => void;
const fixture = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  listeners: new Set<ExitListener>(),
  active: null as ClipTake | null,
  status: "paused",
  view: undefined as ClipView | undefined,
  source: null as string | null,
  recording: null as StreamRecording | null,
  route: {
    mode: "demo",
    clip: "clip-one",
    demo: "test.rec",
  } as NavigationQuery,
  setRoute: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  queryOptions: null as {
    refetchInterval: typeof import("../stream/clipApi").clipRefetchInterval;
  } | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) =>
    fixture.effects.push(effect),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: NonNullable<typeof fixture.queryOptions>) => {
    fixture.queryOptions = options;
    return { data: fixture.view, error: null, refetch: vi.fn() };
  },
}));
vi.mock("zustand", () => ({
  useStore: (
    store: { getState(): unknown },
    select: (state: unknown) => unknown,
  ) => select(store.getState()),
}));
vi.mock("../state/clipStore", () => ({
  clipStore: {
    getState: () => ({ active: fixture.active, stopPlayback: fixture.stop }),
    subscribe: (listener: ExitListener) => {
      fixture.listeners.add(listener);
      return () => fixture.listeners.delete(listener);
    },
  },
}));
vi.mock("../state/demoLoadStore", () => ({
  useDemoLoad: (select: (state: { sourceUrl: string | null }) => unknown) =>
    select({ sourceUrl: fixture.source }),
}));
vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({
      playback: { status: fixture.status },
      setPlaybackStatus: fixture.pause,
    }),
  },
  useEngineSelector: (select: (state: unknown) => unknown) =>
    select({
      playback: {
        recording: fixture.recording,
        demoBuffer: null,
        downloadComplete: false,
      },
    }),
}));
vi.mock("../state/editableGame", () => ({
  publishedDemoFilename: (source: string | null) => source,
}));
vi.mock("../state/streamPlaybackStore", () => ({
  streamPlaybackStore: {
    getState: () => ({ playback: fixture.recording?.streamingPlayback }),
  },
}));
vi.mock("../stream/clipApi", async (original) => ({
  ...(await original<typeof import("../stream/clipApi")>()),
  readClip: vi.fn(),
  readClipCheckpoint: vi.fn(),
}));
vi.mock("../stream/clipPlayback", () => ({ startClipPlayback: vi.fn() }));
vi.mock("./useQueryParams", () => ({
  navigationMode: () => "demo",
  useNavigationQueryState: () => [fixture.route, fixture.setRoute],
}));
vi.mock("./useAppNavigation", () => ({
  useAppNavigation: () => ({ exitClip: vi.fn() }),
}));

import { ClipLoader } from "./ClipLoader";
import { ClipApiError } from "../stream/clipApi";

const cleanups: Array<() => void> = [];
function stopActive() {
  const previous = { active: fixture.active };
  fixture.active = null;
  for (const listener of fixture.listeners)
    listener({ active: null }, previous);
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.status = "paused";
  fixture.active = null;
  fixture.view = undefined;
  fixture.source = null;
  fixture.recording = null;
  fixture.queryOptions = null;
  fixture.route = {
    mode: "demo",
    clip: "clip-one",
    demo: "test.rec",
  } as NavigationQuery;
  fixture.setRoute.mockImplementation(
    (update: (route: NavigationQuery) => Partial<NavigationQuery>) =>
      Object.assign(fixture.route, update(fixture.route)),
  );
  fixture.stop.mockImplementation(stopActive);
});
function mountLoader() {
  ClipLoader();
  for (const effect of fixture.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  fixture.active = {} as ClipTake;
}
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  fixture.listeners.clear();
});

it("turns a seek out of a clip into an ordinary demo route", () => {
  mountLoader();
  fixture.status = "seeking";
  stopActive();
  expect(fixture.route).toMatchObject({
    clip: null,
    demo: "test.rec",
    t: null,
  });
});

it("keeps the clip route during an internal restart that stops before seeking", () => {
  mountLoader();
  stopActive();
  fixture.status = "seeking";
  expect(fixture.setRoute).not.toHaveBeenCalled();
  expect(fixture.route.clip).toBe("clip-one");
});

it("does not clear a newer clip route when an old clip is interrupted", () => {
  mountLoader();
  fixture.route.clip = "clip-two";
  fixture.status = "seeking";
  stopActive();
  expect(fixture.route.clip).toBe("clip-two");
});

it("preserves a pending source seek while preparing the initial clip view", () => {
  fixture.status = "seeking";
  fixture.source = "test.rec";
  fixture.recording = { streamingPlayback: {} } as StreamRecording;
  fixture.view = {
    id: "clip-one",
    sourceDemo: "test.rec",
    state: "processing",
  } as ClipView;
  mountLoader();
  expect(fixture.pause).not.toHaveBeenCalled();
});

it.each([404, 410])(
  "stops polling a removed clip with cached processing data after HTTP %s",
  (status) => {
    fixture.view = { state: "processing" } as ClipView;
    mountLoader();
    expect(
      fixture.queryOptions!.refetchInterval({
        state: {
          data: fixture.view,
          error: new ClipApiError("Clip unavailable", status),
        },
      }),
    ).toBe(false);
  },
);

it("offers an exit for a permanently failed clip instead of a retry that cannot restart its job", () => {
  fixture.view = {
    id: "clip-one",
    state: "failed",
    error: "Could not prepare this clip.",
  } as ClipView;
  const markup = renderToStaticMarkup(ClipLoader());
  expect(markup).toContain("Could not prepare this clip.");
  expect(markup).toContain("Exit clip");
  expect(markup).not.toContain("Retry");
});

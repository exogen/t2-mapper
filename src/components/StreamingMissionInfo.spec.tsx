import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { formatRecordedTime, recordedDayLabel } from "./demoFormat";
import { StreamingMissionInfo } from "./StreamingMissionInfo";

vi.mock("./GameDetailsEditor", () => ({ GameDetailsButton: () => null }));
import type { WatchEndReason } from "../../relay/types";
import type { ReplayState } from "../../relay/replayTypes";
import type { PublishedGame } from "../../relay/gamePresentation";
import { demoDownloadUrl, type DemoIndexEntry } from "../stream/demoIndex";

const state = vi.hoisted(() => ({
  dataSource: "demo",
  recorderName: null as string | null,
  recordingDate: null as string | null,
  serverName: null as string | null,
  sourceUrl: null as string | null,
  demos: [] as DemoIndexEntry[],
  publishedGames: null as DemoIndexEntry["games"] | null,
  snapshot: { missionReadySec: 0 },
  replay: null as ReplayState | null,
  publishedGame: null as PublishedGame | null,
  live: {
    role: "player",
    watcherCount: 0,
    recording: false,
    streamDelayMs: 0,
    gameStatus: "disconnected",
    watchStatus: null,
    watchEndReason: undefined as WatchEndReason | undefined,
    ping: null as number | null,
  },
}));

vi.mock("../state/gameEntityStore", () => ({
  useDataSource: () => state.dataSource,
  useMissionDisplayName: () => "Surreal",
  useMissionType: () => "CTF",
  useMissionTypeDisplayName: () => null,
  useRecorderName: () => state.recorderName,
  useRecordingDate: () => state.recordingDate,
  useServerDisplayName: () => state.serverName,
}));
vi.mock("../state/liveConnectionStore", () => ({
  selectPing: (value: typeof state.live) => value.ping,
  useLiveSelector: (selector: (value: typeof state.live) => unknown) =>
    selector(state.live),
}));
vi.mock("../state/replayConnectionStore", () => ({
  useReplaySelector: (
    selector: (value: { state: ReplayState | null }) => unknown,
  ) => selector({ state: state.replay }),
}));
vi.mock("../state/demoLoadStore", () => ({
  useDemoLoad: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock("../state/casterStore", () => ({
  useCaster: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (selector: (snapshot: typeof state.snapshot) => unknown) =>
    selector(state.snapshot),
}));
vi.mock("./usePlayback", () => ({ useRecording: () => ({}) }));
vi.mock("./useAppNavigation", () => ({
  useAppNavigation: () => ({ demoIndex() {}, disconnectServer() {} }),
}));
vi.mock("./useDemoIndex", () => ({
  useDemoIndex: () => ({ data: state.demos }),
}));
vi.mock("../manifest", () => ({ findMissionInfo: () => null }));

beforeEach(() => {
  state.dataSource = "demo";
  state.recorderName = null;
  state.recordingDate = null;
  state.serverName = null;
  state.sourceUrl = null;
  state.demos = [];
  state.publishedGames = null;
  state.snapshot = { missionReadySec: 0 };
  state.replay = null;
  state.publishedGame = null;
  state.live.role = "player";
  state.live.watcherCount = 0;
  state.live.gameStatus = "disconnected";
  state.live.watchEndReason = undefined;
  state.live.ping = null;
});

function render() {
  return renderToStaticMarkup(<StreamingMissionInfo />);
}

const game = {
  mission: "Surreal",
  gameType: "CTF",
  startMs: 0,
  tournament: false,
};

function indexedDemo(
  filename: string,
  games: DemoIndexEntry["games"] = [],
): DemoIndexEntry {
  return {
    filename,
    bytes: 0,
    recordedAt: "2002-10-03T04:05:00.000Z",
    server: "Match Server",
    address: "example:28000",
    games,
    mod: "Classic",
    recorder: "MapGenius",
    durationMs: 0,
    players: [],
  };
}

it.each(["demo", "live", "replay"])(
  "shows the current saved title after the map and game type in the %s toolbar",
  (mode) => {
    state.dataSource = mode === "demo" ? "demo" : "live";
    state.sourceUrl = demoDownloadUrl("match.rec");
    state.demos = [
      indexedDemo("match.rec", [{ ...game, title: "Indexed final" }]),
    ];
    state.publishedGames = [{ ...game, title: "Sidecar final" }];
    state.publishedGame = {
      id: "game",
      revision: 1,
      presentation: {
        title: mode === "demo" ? "Sidecar final" : "Stream final",
      },
    };
    if (mode === "replay") state.replay = replay();
    const markup = render();
    expect(markup).toContain("Surreal");
    expect(markup).toContain("CTF");
    expect(markup).not.toContain("Indexed final");
    const title = mode === "demo" ? "Sidecar final" : "Stream final";
    expect(markup).toContain(title);
    expect(markup.indexOf("Surreal")).toBeLessThan(markup.indexOf(title));
    expect(markup.indexOf("CTF")).toBeLessThan(markup.indexOf(title));
  },
);

it.each(["cleared", "unavailable"])(
  "does not revive an indexed title when the current title is %s",
  (kind) => {
    state.sourceUrl = demoDownloadUrl("match.rec");
    state.demos = [
      indexedDemo("match.rec", [{ ...game, title: "Stale indexed title" }]),
    ];
    state.publishedGames = [game];
    state.publishedGame =
      kind === "cleared" ? { id: "game", revision: 2, presentation: {} } : null;
    const markup = render();
    expect(markup).toContain("Surreal");
    expect(markup).toContain("CTF");
    expect(markup).not.toContain("Stale indexed title");
  },
);

it("keeps the admin restriction visible in the disconnected toolbar", () => {
  state.dataSource = "live";
  state.live.watchEndReason = "watchingDisabled";
  const markup = render();
  expect(markup).toContain("Watching disabled");
  expect(markup).not.toContain("Disconnected");
});

it("shows the recorder when the demo has no date or server", () => {
  state.recorderName = "Flyers";
  const markup = render();
  expect(markup).toContain("Flyers");
  expect(markup).toContain("Recorded by");
  expect(markup).not.toContain("Recorded on");
});

it("shows the date when the demo has no recorder or server", () => {
  state.recordingDate = "Oct-2-2002 9:05PM";
  const markup = render();
  expect(markup).toContain("Oct 2 2002 9:05 PM");
  expect(markup).toContain("Recorded on");
  expect(markup).not.toContain("Recorded by");
});

it("shows the server when the demo has no recorder or date", () => {
  state.serverName = "Match Server";
  const markup = render();
  expect(markup).toContain("Match Server");
  expect(markup).not.toContain("Recorded by");
  expect(markup).not.toContain("Recorded on");
});

it.each(["live", "demo", "replay"])(
  "uses connection-quality server icons only for live servers (%s)",
  (mode) => {
    state.dataSource = mode === "demo" ? "demo" : "live";
    state.serverName = "Match Server";
    state.live.gameStatus = "connected";
    state.live.ping = 42;
    if (mode === "replay") state.replay = replay({ status: "playing" });

    const markup = render();
    const serverIcon = markup
      .match(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)
      ?.find(
        (icon) =>
          icon.includes("<title>Server</title>") ||
          icon.includes("<title>Connected"),
      );
    expect(markup).toContain("Match Server");
    expect(serverIcon).toBeDefined();
    if (mode === "live") {
      expect(serverIcon).toContain('data-bar="3"');
      expect(serverIcon).toContain('data-quality="good"');
      expect(serverIcon).toContain("<title>Connected – 42 ms</title>");
    } else {
      expect(serverIcon).toContain("<title>Server</title>");
      expect(serverIcon).not.toContain("data-bar=");
      expect(serverIcon).not.toContain("data-quality=");
      expect(serverIcon).not.toContain("Connected");
    }
  },
);

it("shows the indexed recording date without header attribution", () => {
  const recordedAt = "2002-10-03T04:05:00.000Z";
  state.sourceUrl = demoDownloadUrl("flyers.rec");
  state.demos = [{ ...indexedDemo("flyers.rec"), recordedAt }];
  const markup = render();
  expect(markup).toContain(
    `${recordedDayLabel(recordedAt)} ${formatRecordedTime(recordedAt)}`,
  );
  expect(markup).toContain("Recorded on");
  expect(markup).not.toContain("Recorded by");
});

it("keeps live player attribution separate from demo attribution", () => {
  state.dataSource = "live";
  state.recorderName = "Flyers";
  state.recordingDate = "Oct-2-2002 9:05PM";
  state.serverName = "Match Server";
  state.live.gameStatus = "connected";
  const markup = render();
  expect(markup).toContain("Connected as");
  expect(markup).toContain("Flyers");
  expect(markup).toContain("Match Server");
  expect(markup).not.toContain("Recorded by");
  expect(markup).not.toContain("Recorded on");
});

function replay(overrides: Partial<ReplayState> = {}): ReplayState {
  return {
    sessionId: "room",
    demo: "fixture.rec",
    tick: 100,
    durationTicks: 100,
    status: "ended",
    epoch: 2,
    revision: 3,
    watcherCount: 4,
    isOwner: false,
    closed: false,
    ...overrides,
  };
}

it.each([false, true])(
  "shows the replay's recorded date for owner=%s using demo formatting",
  (isOwner) => {
    state.dataSource = "live";
    state.recordingDate = "Jan-1-2026 1:00AM";
    state.recorderName = "MapGenius";
    state.replay = replay({
      isOwner,
      recordingDate: "Oct-2-2002 9:05PM",
      recorderName: "Flyers",
    });
    const markup = render();
    expect(markup).toContain("Oct 2 2002 9:05 PM");
    expect(markup).toContain("Recorded on");
    expect(markup).not.toContain("Jan 1 2026");
  },
);

it("formats relay replay dates using the recorder's UTC header", () => {
  state.dataSource = "live";
  state.replay = replay({
    recordingDate: "Oct-2-2002 9:05PM",
    recorderName: "MapGenius",
  });
  const recordedAt = "2002-10-02T21:05:00.000Z";
  expect(render()).toContain(
    `${recordedDayLabel(recordedAt)} ${formatRecordedTime(recordedAt)}`,
  );
});

it("omits the replay date when the recording has no date", () => {
  state.dataSource = "live";
  state.recordingDate = "Oct-2-2002 9:05PM";
  state.sourceUrl = demoDownloadUrl("flyers.rec");
  state.demos = [indexedDemo("flyers.rec")];
  state.replay = replay();
  expect(render()).not.toContain("Recorded on");
});

it.each([false, true])(
  "keeps the replay count at natural EOF for owner=%s with one Leave replay action",
  (isOwner) => {
    state.dataSource = "live";
    state.serverName = "Replay source";
    state.replay = replay({ isOwner });
    const markup = render();
    expect(markup.match(/aria-label="Spectators"/g)).toHaveLength(1);
    expect(markup).toContain("<title>4 spectating</title>");
    expect(markup.match(/aria-label="Leave replay"/g)).toHaveLength(1);
    expect(markup).not.toContain('aria-label="Disconnect"');
  },
);

it("shows the replay count before server metadata or a live scene is available", () => {
  state.dataSource = "map";
  state.replay = replay({ status: "preparing", tick: 0 });
  const markup = render();
  expect(markup.match(/aria-label="Spectators"/g)).toHaveLength(1);
  expect(markup).toContain("<title>4 spectating</title>");
  expect(markup).toContain('aria-label="Leave replay"');
});

it("hides the count once the creator explicitly closes the replay", () => {
  state.dataSource = "live";
  state.replay = replay({ closed: true });
  const markup = render();
  expect(markup).not.toContain('aria-label="Spectators"');
  expect(markup).toContain('aria-label="Leave replay"');
});

it("preserves the live watcher count and disconnect label without adding a demo count", () => {
  state.dataSource = "live";
  state.serverName = "Live source";
  state.live.role = "watcher";
  state.live.gameStatus = "connected";
  state.live.watcherCount = 2;
  const markup = render();
  expect(markup.match(/aria-label="Spectators"/g)).toHaveLength(1);
  expect(markup).toContain("<title>2 spectating</title>");
  expect(markup).toContain('aria-label="Disconnect"');
  state.dataSource = "demo";
  expect(render()).not.toContain('aria-label="Spectators"');
});

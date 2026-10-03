import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { formatRecordedTime, recordedDayLabel } from "./demoFormat";
import { StreamingMissionInfo } from "./StreamingMissionInfo";

const state = vi.hoisted(() => ({
  dataSource: "demo",
  recorderName: null as string | null,
  recordingDate: null as string | null,
  serverName: null as string | null,
  sourceUrl: null as string | null,
  demoParam: null as string | null,
  demos: [] as { filename: string; recordedAt: string }[],
  live: {
    role: "player",
    watcherCount: 0,
    recording: false,
    streamDelayMs: 0,
    gameStatus: "disconnected",
    watchStatus: null,
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
vi.mock("../state/demoLoadStore", () => ({
  useDemoLoad: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: () => null,
}));
vi.mock("./usePlayback", () => ({ useRecording: () => ({}) }));
vi.mock("./useAppNavigation", () => ({
  useAppNavigation: () => ({ demoIndex() {}, disconnectServer() {} }),
}));
vi.mock("./useDemoIndex", () => ({
  useDemoIndex: () => ({ data: state.demos }),
}));
vi.mock("./useQueryParams", () => ({
  useDemoQueryState: () => [state.demoParam],
}));
vi.mock("../manifest", () => ({ findMissionInfo: () => null }));

beforeEach(() => {
  state.dataSource = "demo";
  state.recorderName = null;
  state.recordingDate = null;
  state.serverName = null;
  state.sourceUrl = null;
  state.demoParam = null;
  state.demos = [];
  state.live.gameStatus = "disconnected";
});

function render() {
  return renderToStaticMarkup(<StreamingMissionInfo />);
}

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

it("shows the indexed recording date without header attribution", () => {
  const recordedAt = "2002-10-03T04:05:00.000Z";
  state.sourceUrl = "https://demos.example/flyers.rec";
  state.demoParam = "flyers.rec";
  state.demos = [{ filename: "flyers.rec", recordedAt }];
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

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StreamRecording } from "../stream/types";
import { engineStore } from "../state/engineStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { streamClock } from "../state/streamPlaybackStore";
import { StartSharedReplayButton } from "./StartSharedReplayButton";
import { MAX_REPLAY_UPLOAD_BYTES } from "../../relay/replayTypes";

const fixture = vi.hoisted(() => ({
  recording: null as StreamRecording | null,
  create: vi.fn(),
  createLocal: vi.fn(),
}));
vi.mock("./usePlayback", () => ({ useRecording: () => fixture.recording }));
vi.mock("./useAppNavigation", () => ({
  useAppNavigation: () => ({
    createReplay: fixture.create,
    createLocalReplay: fixture.createLocal,
  }),
}));
vi.mock("../state/engineStore", async (original) => {
  const actual = await original<typeof import("../state/engineStore")>();
  return {
    ...actual,
    useEngineSelector: (
      select: (
        state: ReturnType<typeof actual.engineStore.getState>,
      ) => unknown,
    ) => select(actual.engineStore.getState()),
  };
});
vi.mock("../state/demoLoadStore", async (original) => {
  const actual = await original<typeof import("../state/demoLoadStore")>();
  return {
    ...actual,
    useDemoLoad: (
      select: (
        state: ReturnType<typeof actual.demoLoadStore.getState>,
      ) => unknown,
    ) => select(actual.demoLoadStore.getState()),
  };
});

beforeEach(() => {
  fixture.create.mockClear();
  fixture.createLocal.mockClear();
  fixture.recording = { source: "demo", duration: 100 } as StreamRecording;
  engineStore.getState().setRecording(fixture.recording, new ArrayBuffer(32));
  demoLoadStore.setState({
    sourceUrl: "https://demos.test/loaded.rec",
    sourceReference: "loaded.rec",
    requestedDemo: "loaded.rec",
  });
  streamClock.time = 10;
});
afterEach(() => {
  engineStore.getState().setRecording(null);
  demoLoadStore.setState(demoLoadStore.getInitialState(), true);
  streamClock.time = 0;
});

it("starts the installed demo at the position shown when clicked, without selecting a pending demo", () => {
  demoLoadStore.setState({
    phase: "downloading",
    requestedDemo: "pending.rec",
    requestedUrl: "https://demos.test/pending.rec",
  });
  const button = StartSharedReplayButton()!;
  expect(renderToStaticMarkup(button)).toContain("Start shared replay");
  expect(button.props.disabled).toBe(false);
  streamClock.time = 12.345;
  button.props.onClick();
  expect(fixture.create).toHaveBeenCalledExactlyOnceWith("loaded.rec", 386);
});

it("uploads the installed local bytes/name even while another hosted demo is requested", () => {
  demoLoadStore.setState({
    sourceUrl: null,
    sourceReference: null,
    sourceFileName: "My recording.rec",
    requestedDemo: "pending.rec",
  });
  const button = StartSharedReplayButton()!;
  const html = renderToStaticMarkup(button);
  expect(html).toContain("Start shared replay");
  expect(button.props.disabled).toBe(false);
  expect(button.props.title).toContain("temporarily");
  const buffer = engineStore.getState().playback.demoBuffer;
  streamClock.time = 12.345;
  button.props.onClick();
  expect(fixture.create).not.toHaveBeenCalled();
  expect(fixture.createLocal).toHaveBeenCalledExactlyOnceWith(
    buffer,
    "My recording.rec",
    386,
  );
});

it("disables local sharing until all bytes are ready and enforces the upload limit", () => {
  demoLoadStore.setState({ sourceReference: null, sourceUrl: null });
  engineStore.getState().setDownloadComplete(false);
  let button = StartSharedReplayButton()!;
  expect(button.props.disabled).toBe(true);
  button.props.onClick();
  expect(fixture.createLocal).not.toHaveBeenCalled();
  engineStore.getState().setDownloadComplete(true);
  engineStore.getState().setDemoBuffer(fixture.recording!, {
    byteLength: MAX_REPLAY_UPLOAD_BYTES + 1,
  } as ArrayBuffer);
  button = StartSharedReplayButton()!;
  expect(button.props.disabled).toBe(true);
  expect(button.props.title).toContain("150 MB");
});

it("does not upload a replaced buffer before the sidebar rerenders", () => {
  demoLoadStore.setState({
    sourceReference: null,
    sourceFileName: "Local.rec",
  });
  const button = StartSharedReplayButton()!;
  engineStore.getState().setDemoBuffer(fixture.recording!, new ArrayBuffer(64));
  button.props.onClick();
  expect(fixture.createLocal).not.toHaveBeenCalled();
});

it("does not start an old recording after its rendered button has been superseded", () => {
  const button = StartSharedReplayButton()!;
  engineStore
    .getState()
    .setRecording({ source: "demo", duration: 100 } as StreamRecording);
  button.props.onClick();
  expect(fixture.create).not.toHaveBeenCalled();
});

it("does not use a replaced source reference before the sidebar has rerendered", () => {
  const button = StartSharedReplayButton()!;
  demoLoadStore.setState({ sourceReference: "replacement.rec" });
  button.props.onClick();
  expect(fixture.create).not.toHaveBeenCalled();
});

it("stays out of live and replay sessions", () => {
  fixture.recording = { source: "live" } as StreamRecording;
  expect(StartSharedReplayButton()).toBeNull();
  fixture.recording = null;
  expect(StartSharedReplayButton()).toBeNull();
});

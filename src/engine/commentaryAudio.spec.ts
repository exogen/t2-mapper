import { expect, it, onTestFinished, vi } from "vitest";
import { demoDirectorStore } from "../state/demoDirectorStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { commentaryPlayback, streamClock } from "../state/streamPlaybackStore";
import { installCommentaryAudio } from "./commentaryAudio";
import { FramePriority } from "./framePriority";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";

vi.mock("../state/commentaryTrack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/commentaryTrack")>()),
  loadCommentaryTrack: async () => ({ audioStartSec: 0, cues: [] }),
}));

const HAVE_METADATA = 1;
const HAVE_FUTURE_DATA = 3;

class TestAudio extends EventTarget {
  src = "";
  duration = 60;
  currentTime = 0;
  playbackRate = 1;
  volume = 1;
  readyState = HAVE_FUTURE_DATA;
  paused = true;
  ended = false;
  seeking = false;

  play = vi.fn(async () => {
    this.paused = false;
  });

  pause() {
    this.paused = true;
  }

  removeAttribute() {
    this.src = "";
  }

  load() {}
}

function setupCommentary() {
  const audio = new TestAudio();
  const gestures = new EventTarget();
  vi.stubGlobal("Audio", function () {
    return audio;
  });
  vi.stubGlobal("window", gestures);
  vi.stubGlobal("HTMLMediaElement", { HAVE_METADATA, HAVE_FUTURE_DATA });
  const previousSettings = settingsStore.getState();
  const previousStatus = demoDirectorStore.getState().status;
  const previousSource = demoLoadStore.getState().sidecarSourceUrl;
  const previousPlayback = engineStore.getState().playback;
  const previousTime = streamClock.time;
  settingsStore.setState({ audioVolume: 0.5, commentaryEnabled: true });
  demoDirectorStore.setState({ status: "playing" });
  demoLoadStore.setState({ sidecarSourceUrl: "/sample.rec" });
  engineStore.setState({
    playback: { ...previousPlayback, status: "playing", rate: 1 },
  });
  streamClock.time = 0;
  const scheduler = new FrameScheduler();
  const dispose = installCommentaryAudio({ scheduler } as GameEngine);
  onTestFinished(() => {
    dispose();
    engineStore.setState({ playback: previousPlayback });
    demoLoadStore.setState({ sidecarSourceUrl: previousSource });
    demoDirectorStore.setState({ status: previousStatus });
    settingsStore.setState(previousSettings);
    streamClock.time = previousTime;
    vi.unstubAllGlobals();
  });
  const frame = () =>
    scheduler.run(FramePriority.AudioSync, {} as FrameContext);
  const start = async () => {
    frame();
    await Promise.resolve(); // Commentary clock metadata arrives.
    frame();
    await Promise.resolve();
  };
  return { audio, gestures, start, frame };
}

it("reports commentary on air only once playback starts and clears it while buffering", async () => {
  const { audio, start, frame } = setupCommentary();
  await start();
  expect(audio.paused).toBe(false);
  expect(commentaryPlayback.active).toBe(false);
  audio.dispatchEvent(new Event("playing"));
  expect(commentaryPlayback.active).toBe(true);

  audio.readyState = 2;
  audio.dispatchEvent(new Event("waiting"));
  frame();
  expect(audio.paused).toBe(false);
  expect(commentaryPlayback.active).toBe(false);

  audio.readyState = HAVE_FUTURE_DATA;
  audio.dispatchEvent(new Event("playing"));
  expect(commentaryPlayback.active).toBe(true);
  audio.seeking = true;
  audio.dispatchEvent(new Event("seeking"));
  expect(commentaryPlayback.active).toBe(false);
  audio.seeking = false;
  audio.dispatchEvent(new Event("seeked"));
  expect(commentaryPlayback.active).toBe(true);

  engineStore.getState().setPlaybackStatus("paused");
  expect(audio.paused).toBe(true);
  expect(commentaryPlayback.active).toBe(false);
});

it("retries a blocked commentary play synchronously during the next gesture", async () => {
  const { audio, gestures, start, frame } = setupCommentary();
  audio.play.mockRejectedValueOnce(new DOMException("", "NotAllowedError"));
  await start();
  frame();
  expect(audio.play).toHaveBeenCalledOnce();

  gestures.dispatchEvent(new Event("click"));
  expect(audio.play).toHaveBeenCalledTimes(2);
});

it("starts metadata-only commentary in the first gesture and waits for playback", async () => {
  const { audio, gestures, start, frame } = setupCommentary();
  audio.readyState = HAVE_METADATA;
  streamClock.time = 10;
  let finishPlay!: () => void;
  audio.play.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishPlay = resolve;
      }),
  );
  await start();
  expect(audio.play).not.toHaveBeenCalled();

  gestures.dispatchEvent(new Event("click"));
  expect(audio.play).toHaveBeenCalledOnce();
  expect(audio.currentTime).toBe(10);
  audio.readyState = HAVE_FUTURE_DATA;
  frame();
  gestures.dispatchEvent(new Event("keydown"));
  expect(audio.play).toHaveBeenCalledOnce();
  expect(commentaryPlayback.active).toBe(false);

  audio.paused = false;
  audio.dispatchEvent(new Event("playing"));
  finishPlay();
  await Promise.resolve();
  expect(commentaryPlayback.active).toBe(true);
});

it("ignores a play rejection superseded by a transport pause", async () => {
  const { audio, start, frame } = setupCommentary();
  let rejectFirstPlay!: (error: DOMException) => void;
  audio.play.mockImplementationOnce(
    () =>
      new Promise<void>((_, reject) => {
        rejectFirstPlay = reject;
      }),
  );
  await start();
  expect(audio.play).toHaveBeenCalledOnce();

  engineStore.getState().setPlaybackStatus("paused");
  rejectFirstPlay(new DOMException("", "NotAllowedError"));
  await Promise.resolve();
  engineStore.getState().setPlaybackStatus("playing");
  frame();
  expect(audio.play).toHaveBeenCalledTimes(2);
});

it("applies commentary master volume without a render frame", () => {
  const { audio } = setupCommentary();
  expect(audio.volume).toBe(0.5);
  settingsStore.setState({ audioVolume: 0.2 });
  expect(audio.volume).toBe(0.2);
});

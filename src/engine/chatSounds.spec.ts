import { AudioLoader } from "three";
import { expect, it, onTestFinished, vi } from "vitest";
import { testCatchupPayload } from "../../relay/serverPacketFixtures";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import { commentaryPlayback, streamClock } from "../state/streamPlaybackStore";
import { TestLiveStream } from "../stream/streamTestFixtures";
import { PlaybackAudioListener } from "./PlaybackAudioListener";
import { audioBufferCache } from "./audioBuffers";
import * as audioGraph from "./audioGraph";
import { createAudioPlaybackFade } from "./audioPlaybackFade";
import { installFakeAudioContext } from "./audioTestFixtures";
import { installChatSounds } from "./chatSounds";

function setupChat() {
  const { context, sources } = installFakeAudioContext();
  Object.assign(context, { state: "running" });
  const loader = new AudioLoader();
  const pending = new Map<string, (buffer: AudioBuffer) => void>();
  vi.spyOn(loader, "load").mockImplementation((url, onLoad) => {
    pending.set(url, onLoad);
  });
  const audioListener = new PlaybackAudioListener();
  vi.spyOn(audioGraph, "getAudioGraph").mockReturnValue({
    audioListener,
    audioLoader: loader,
    outputFade: createAudioPlaybackFade(audioListener.context),
  });
  const stream = new TestLiveStream();
  const catchup = testCatchupPayload();
  stream.hydrate(catchup);
  engineStore.getState().setRecording({
    source: "live",
    streamingPlayback: stream,
    duration: Infinity,
    missionName: null,
    gameType: null,
    serverDisplayName: null,
    recorderName: null,
    recordingDate: null,
  });
  engineStore.getState().setPlaybackStatus("playing");
  const dispose = installChatSounds();
  onTestFinished(() => {
    dispose();
    for (const onLoad of pending.values()) onLoad({} as AudioBuffer);
    settingsStore.setState({ audioEnabled: true });
    engineStore.getState().setRecording(null);
    engineStore.getState().setPlaybackStatus("stopped");
    commentaryPlayback.active = false;
    streamClock.time = 0;
    setStreamSnapshot(null);
    audioBufferCache.clear();
    vi.restoreAllMocks();
  });

  const publish = (time: number) => {
    const snapshot = stream.stepToTime(time);
    streamClock.time = snapshot.timeSec;
    setStreamSnapshot(snapshot);
  };
  const finishLoading = (path: string, buffer: AudioBuffer) => {
    const url = audioToUrl(path);
    const onLoad = pending.get(url)!;
    pending.delete(url);
    onLoad(buffer);
  };
  return { stream, catchup, publish, sources, pending, finishLoading };
}

it.each([false, true])(
  "plays fresh live chat IDs once after catch-up (audio toggled: %s)",
  (toggleAudio) => {
    const { stream, catchup, publish, sources, pending, finishLoading } =
      setupChat();
    const cues = () => {
      stream.command(
        "ServerMessage",
        "",
        "Flag captured!~wfx/misc/flag_capture.wav",
      );
      stream.command(
        "ServerMessage",
        "",
        "~wvoice/announcer/ann.stoscores.wav",
      );
      stream.command(
        "CannedChatMessage",
        "",
        "%1: %2",
        "Player",
        "Shazbot!~wgbl.shazbot",
        "VGS",
        "Male1",
        "1",
      );
    };
    const flagBuffer = { duration: 1 } as AudioBuffer;
    const scoreBuffer = { duration: 2 } as AudioBuffer;
    const voiceBuffer = { duration: 3 } as AudioBuffer;
    audioBufferCache.set(audioToUrl("fx/misc/flag_capture.wav"), flagBuffer);
    cues();
    publish(1);
    expect(sources).toHaveLength(1);
    expect(pending.size).toBe(2);

    stream.hydrate(catchup);
    // Decode finishes before the first frame from the new stream.
    finishLoading("voice/announcer/ann.stoscores.wav", scoreBuffer);
    expect(sources).toHaveLength(1);
    // A settings change can reprocess the snapshot still published from before catch-up.
    if (toggleAudio) {
      settingsStore.setState({ audioEnabled: false });
      settingsStore.setState({ audioEnabled: true });
    }
    expect(sources).toHaveLength(1);
    cues();
    publish(1);
    // Both revisions requested this buffer. Only the new voice bind plays.
    finishLoading("voice/Male1/gbl.shazbot.wav", voiceBuffer);
    expect(sources).toMatchObject([
      { buffer: flagBuffer },
      { buffer: flagBuffer },
      { buffer: scoreBuffer },
      { buffer: voiceBuffer },
    ]);
    for (const source of sources) expect(source.start).toHaveBeenCalledOnce();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    stream.command("ServerMessage", "", "An unrelated text message");
    publish(2);
    expect(sources).toHaveLength(4);
  },
);

it("consumes muted messages and cancels pending cues without replaying history", () => {
  const { stream, publish, sources, pending, finishLoading } = setupChat();
  const flagPath = "fx/misc/flag_capture.wav";
  const scorePath = "voice/announcer/ann.stoscores.wav";
  const flagBuffer = { duration: 1 } as AudioBuffer;
  audioBufferCache.set(audioToUrl(flagPath), flagBuffer);
  stream.command("ServerMessage", "", `Flag captured!~w${flagPath}`);
  stream.command("ServerMessage", "", `~w${scorePath}`);
  publish(1);
  expect(sources).toHaveLength(1);
  expect(pending.size).toBe(1);

  settingsStore.setState({ audioEnabled: false });
  expect(sources[0].stop).toHaveBeenCalledOnce();
  stream.command("ServerMessage", "", `Flag captured!~w${flagPath}`);
  publish(2);
  settingsStore.setState({ audioEnabled: true });
  finishLoading(scorePath, { duration: 2 } as AudioBuffer);
  expect(sources).toHaveLength(1);

  stream.command("ServerMessage", "", `Flag captured!~w${flagPath}`);
  publish(3);
  expect(sources).toHaveLength(2);
});

it("does not play the frozen chat snapshot when a recording unloads", () => {
  const { stream, publish, sources } = setupChat();
  const path = "fx/misc/flag_capture.wav";
  audioBufferCache.set(audioToUrl(path), { duration: 1 } as AudioBuffer);
  stream.command("ServerMessage", "", `Flag captured!~w${path}`);
  publish(1);
  expect(sources).toHaveLength(1);

  engineStore.getState().setRecording(null);
  expect(sources[0].stop).toHaveBeenCalledOnce();
  settingsStore.setState({ audioEnabled: false });
  settingsStore.setState({ audioEnabled: true });
  expect(sources).toHaveLength(1);
});

it("drops a pending announcer cue when commentary starts before it decodes", () => {
  const { stream, publish, sources, pending, finishLoading } = setupChat();
  const path = "voice/announcer/ann.stoscores.wav";
  stream.command("ServerMessage", "", `~w${path}`);
  publish(1);
  expect(pending.size).toBe(1);

  commentaryPlayback.active = true;
  finishLoading(path, { duration: 2 } as AudioBuffer);
  expect(sources).toHaveLength(0);

  commentaryPlayback.active = false;
  stream.command("ServerMessage", "", `~w${path}`);
  publish(2);
  expect(sources).toHaveLength(1);
});

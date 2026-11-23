import { AudioLoader, Group } from "three";
import { expect, it, onTestFinished, vi } from "vitest";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import type {
  StreamEntity,
  StreamSnapshot,
  StreamingPlayback,
} from "../stream/types";
import { PlaybackAudioListener } from "./PlaybackAudioListener";
import { audioBufferCache } from "./audioBuffers";
import { installFakeAudioContext } from "./audioTestFixtures";
import { ParticleSnapshotIndex } from "./particleSnapshot";
import { createProjectileAudio } from "./projectileAudio";
import * as soundEffects from "./soundEffects";

const projectile = (id: string): StreamEntity => ({
  id,
  type: "Projectile",
  dataBlockId: 1,
  position: [0, 0, 0],
});

function mount(projectiles: StreamEntity[]) {
  const { sources } = installFakeAudioContext();
  const audioLoader = new AudioLoader();
  const load = vi.spyOn(audioLoader, "load").mockImplementation(() => {});
  const subscribe = vi.spyOn(soundEffects, "getCachedAudioBuffer");
  const audioListener = new PlaybackAudioListener();
  const group = new Group();
  const index = new ParticleSnapshotIndex();
  const stream = {
    playbackRevision: 0,
    getDataBlockData(id: number) {
      switch (id) {
        case 1:
          return { sound: 2 };
        case 2:
          return {
            filename: "fx/weapons/missile_projectile.wav",
            description: 3,
          };
        case 3:
          return { is3D: true, isLooping: true, maxDistance: 10 };
      }
    },
  };
  const playback = stream as unknown as StreamingPlayback;
  const snapshot = (entities: StreamEntity[]) =>
    ({
      entities,
      timeSec: 1,
      playbackRevision: stream.playbackRevision,
    }) as StreamSnapshot;
  const snapshotRef = { current: snapshot(projectiles) };
  const originalPlayback = engineStore.getState().playback;
  const originalAudioEnabled = settingsStore.getState().audioEnabled;
  engineStore.getState().setRecording({
    source: "live",
    duration: Infinity,
    missionName: null,
    gameType: null,
    serverDisplayName: null,
    recorderName: null,
    recordingDate: null,
    streamingPlayback: playback,
  });
  engineStore.getState().setPlaybackStatus("playing");
  settingsStore.setState({ audioEnabled: true });
  const audio = createProjectileAudio(group, playback, snapshotRef, {
    audioLoader,
    audioListener,
  });
  const buffer = { length: 32, numberOfChannels: 1 } as AudioBuffer;
  onTestFinished(() => {
    audio.dispose();
    for (const [, onLoad] of load.mock.calls) onLoad(buffer);
    audioBufferCache.clear();
    engineStore.setState({ playback: originalPlayback });
    settingsStore.setState({ audioEnabled: originalAudioEnabled });
    vi.restoreAllMocks();
  });
  return {
    group,
    load,
    sources,
    stream,
    subscribe,
    publish(entities: StreamEntity[]) {
      snapshotRef.current = snapshot(entities);
    },
    frame() {
      index.update(snapshotRef.current);
      audio.update(index);
    },
    completeDecode() {
      expect(load).toHaveBeenCalledOnce();
      load.mock.calls[0][1](buffer);
    },
  };
}

it("requests one pending buffer per projectile and caps starts from the shared decode", () => {
  const projectiles = Array.from({ length: 27 }, (_, i) =>
    projectile(String(i)),
  );
  const owner = mount(projectiles);
  for (let frame = 0; frame < 5; frame++) owner.frame();
  expect(owner.subscribe).toHaveBeenCalledTimes(projectiles.length);
  owner.completeDecode();
  expect(owner.sources).toHaveLength(20);
  expect(owner.group.children).toHaveLength(20);

  owner.publish(projectiles.slice(1));
  owner.frame();
  expect(owner.sources).toHaveLength(21);
  expect(owner.sources[0].stop).toHaveBeenCalledOnce();
  expect(owner.group.children).toHaveLength(20);
});

it("uses the latest projectile state and position even before the next frame", () => {
  const [moving, exploded, distant, gone] = [
    "moving",
    "exploded",
    "distant",
    "gone",
  ].map(projectile);
  const owner = mount([moving, exploded, distant, gone]);
  owner.frame();
  owner.publish([
    { ...moving, position: [1, 2, 3] },
    { ...exploded, hasExploded: true },
    { ...distant, position: [0, 0, 30] },
  ]);
  owner.completeDecode();
  expect(owner.sources).toHaveLength(1);
  expect(owner.group.children[0].position.toArray()).toEqual([2, 3, 1]);
});

it("retires pending projectile starts on mute and restarts eligible loops on re-enable", () => {
  const owner = mount([projectile("disc")]);
  owner.frame();
  settingsStore.setState({ audioEnabled: false });
  settingsStore.setState({ audioEnabled: true });
  owner.completeDecode();
  expect(owner.sources).toHaveLength(0);
  owner.frame();
  expect(owner.sources).toHaveLength(1);
  settingsStore.setState({ audioEnabled: false });
  expect(owner.sources[0].stop).toHaveBeenCalledOnce();
  expect(owner.group.children).toHaveLength(0);
});

it("discards a decode from the preceding live revision", () => {
  const owner = mount([projectile("disc")]);
  owner.frame();
  owner.stream.playbackRevision++;
  owner.completeDecode();
  expect(owner.sources).toHaveLength(0);
  owner.frame();
  expect(owner.sources).toHaveLength(0);
  owner.publish([projectile("disc")]);
  owner.frame();
  expect(owner.sources).toHaveLength(1);
});

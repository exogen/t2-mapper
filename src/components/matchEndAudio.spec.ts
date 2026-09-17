import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Audio, Group, type AnimationAction } from "three";
import type {
  ImageSlot,
  StreamSnapshot,
  StreamingPlayback,
} from "../stream/types";
import { streamClock, resetStreamPlayback } from "../state/streamPlaybackStore";
import { useImageStateAnimation } from "./useImageStateAnimation";
import { useJetSound } from "./useJetSound";
import { useEntitySoundSlots } from "./useEntitySoundSlots";
import { ParticleEffects } from "./ParticleEffects";
import { ChatSoundPlayer } from "./ChatSoundPlayer";
import { playOneShotSound, trackSound } from "./AudioEmitter";

// Run the real sound owners with controllable frames and buffer completions.
// Three's audio node is replaced because these tests have no Web Audio device.
const test = vi.hoisted(() => ({
  frames: [] as Array<(state: unknown, delta: number) => void>,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  pending: [] as Array<() => void>,
  defer: false,
  snapshot: null as StreamSnapshot | null,
  playback: {
    status: "playing",
    seekNonce: 0,
    recording: {
      streamingPlayback: { getDataBlockData: () => ({ sound: 7 }) },
    },
  },
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: (current: unknown) => ({ current }),
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | (() => void)) => test.effects.push(fn),
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (fn: (state: unknown, delta: number) => void) =>
    test.frames.push(fn),
  useThree: () => undefined,
}));
vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  class TestAudio extends three.Object3D {
    isPlaying = false;
    play = vi.fn(() => {
      this.isPlaying = true;
    });
    stop = vi.fn(() => {
      this.isPlaying = false;
    });
    disconnect = vi.fn();
    setBuffer = vi.fn();
    setLoop = vi.fn();
    setPlaybackRate = vi.fn();
    setVolume = vi.fn();
    onEnded() {
      this.isPlaying = false;
    }
  }
  return { ...three, Audio: TestAudio };
});
vi.mock("./AudioContext", () => ({
  useAudio: () => ({ audioLoader: {}, audioListener: new Group() }),
}));
vi.mock("./AudioEmitter", () => ({
  createPositionalAudio: () => new Audio(null!),
  resolveAudioProfile: () => ({
    filename: "loop.wav",
    isLooping: true,
    is3D: true,
    volume: 1,
    refDist: 20,
    maxDist: 100,
  }),
  getCachedAudioBuffer: (
    _url: string,
    _loader: unknown,
    cb: (buffer: unknown) => void,
  ) => {
    if (test.defer) test.pending.push(() => cb({}));
    else cb({});
  },
  stopAndDetachSound: (sound: Audio) => {
    sound.stop();
    sound.removeFromParent();
  },
  audioContextRunning: () => true,
  getEffectiveSoundRate: () => 1,
  getSoundGeneration: () => 0,
  trackSound: vi.fn(),
  untrackSound: vi.fn(),
  playOneShotSound: vi.fn(),
}));
vi.mock("./audioPlaybackRate", () => ({ getEffectiveSoundRate: () => 1 }));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({ audioEnabled: true, animationEnabled: true }),
  useDebug: () => ({ debugMode: false }),
}));
vi.mock("../loaders", () => ({ audioToUrl: (path: string) => path }));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({ playback: test.playback }) },
  effectDeltaSec: () => 0,
  effectNow: () => 0,
}));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (selector: (snapshot: StreamSnapshot | null) => unknown) =>
    selector(test.snapshot),
}));
vi.mock("./usePlayback", () => ({
  useRecording: () => test.playback.recording,
}));

function flushEffects() {
  for (const effect of test.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) test.cleanups.push(cleanup);
  }
}
function frame() {
  flushEffects();
  for (const fn of test.frames) fn({}, 1 / 60);
}
function endMatch() {
  streamClock.matchEndedAtSec = streamClock.time;
}
function WeaponSounds() {
  const root = new Group();
  const slot: ImageSlot = {
    shapeName: "weapon",
    dataBlockId: 1,
    mountPoint: 0,
    mountedAtSec: 10,
    animation: {
      revision: 1,
      changedAtSec: 10,
      spinTime: 0,
      spinTimeSec: 10,
      state: {
        stateIndex: 0,
        sequenceName: null,
        flashSequence: false,
        visSequenceName: null,
        isFiring: true,
        spinTimeScale: 1,
        reverse: false,
        scaleAnimation: false,
        timeoutValue: 0.15,
        transitioned: false,
        entered: true,
        soundDataBlockIds: [7],
      },
    },
    // Only the sound profile is read when restoring a latched firing state.
    imageStates: [{ soundDataBlockId: 7 }] as ImageSlot["imageStates"],
  };
  useImageStateAnimation(() => slot, {
    actions: { current: new Map<string, AnimationAction>() },
    imageRoot: root,
    seqIndexToName: [],
    cyclicSequences: new Set(),
  });
  return root;
}
function mountProjectile() {
  const snapshot = {
    entities: [
      { id: "disc", type: "Projectile", dataBlockId: 1, position: [0, 0, 0] },
    ],
    timeSec: 10,
    audioEvents: [],
  } as unknown as StreamSnapshot;
  const element = ParticleEffects({
    playback: test.playback.recording
      .streamingPlayback as unknown as StreamingPlayback,
    snapshotRef: { current: snapshot },
  });
  const root = new Group();
  element.props.ref.current = root;
  return { root, snapshot };
}

beforeEach(() => {
  resetStreamPlayback();
  streamClock.time = 10;
  test.defer = false;
  test.snapshot = null;
  test.playback.seekNonce = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  for (const cleanup of test.cleanups.splice(0)) cleanup();
  test.frames.length = 0;
  test.effects.length = 0;
  test.pending.length = 0;
  resetStreamPlayback();
});

it("stops a latched firing loop at match end and restores it when seeking back", () => {
  const root = WeaponSounds();
  frame();
  const sound = root.children[0] as Audio;
  expect(sound.isPlaying).toBe(true);
  endMatch();
  frame();
  frame();
  expect(sound.stop).toHaveBeenCalledOnce();
  expect(root.children).toHaveLength(0);
  streamClock.matchEndedAtSec = null;
  test.playback.seekNonce++;
  frame();
  expect((root.children[0] as Audio).isPlaying).toBe(true);
});

it.each([WeaponSounds, () => mountProjectile().root])(
  "does not start a pending action loop after match end (%#)",
  (mount) => {
    test.defer = true;
    const root = mount();
    frame();
    expect(test.pending).toHaveLength(1);
    endMatch();
    for (const load of test.pending.splice(0)) load();
    frame();
    expect(root.children).toHaveLength(0);
    expect(test.pending).toHaveLength(0);
  },
);

it("stops jets despite a held jet flag, then allows jets in the next match", () => {
  const root = new Group();
  const update = useJetSound(root, 7);
  flushEffects();
  update(true);
  const sound = root.children[0] as Audio;
  expect(sound.isPlaying).toBe(true);
  endMatch();
  update(true);
  update(true);
  expect(sound.stop).toHaveBeenCalledOnce();
  streamClock.matchEndedAtSec = null;
  update(true);
  expect(sound.isPlaying).toBe(true);
});

it("does not start jets whose buffer finishes loading during debrief", () => {
  test.defer = true;
  const root = new Group();
  const update = useJetSound(root, 7);
  flushEffects();
  update(true);
  expect(test.pending).toHaveLength(1);
  endMatch();
  for (const load of test.pending.splice(0)) load();
  update(true);
  expect(root.children).toHaveLength(0);
});

it("stops a frozen projectile's loop but still plays new audio events", () => {
  const { root, snapshot } = mountProjectile();
  frame();
  const sound = root.children[0] as Audio;
  expect(sound.isPlaying).toBe(true);
  endMatch();
  snapshot.audioEvents.push({ timeSec: 11, profileId: 8 });
  frame();
  frame();
  expect(sound.stop).toHaveBeenCalledOnce();
  expect(root.children).toHaveLength(0);
  expect(playOneShotSound).toHaveBeenCalledOnce();
  streamClock.matchEndedAtSec = null;
  frame();
  expect((root.children[0] as Audio).isPlaying).toBe(true);
  expect(playOneShotSound).toHaveBeenCalledOnce();
});

it("leaves looping entity ambience audible during debrief", () => {
  const root = new Group();
  useEntitySoundSlots(
    { current: { soundSlots: [{ index: 0, playing: true, profileId: 7 }] } },
    root,
  );
  frame(); // Resolve profile.
  frame(); // Start the loop.
  const sound = root.children[0] as Audio;
  expect(sound.isPlaying).toBe(true);
  endMatch();
  frame();
  expect(sound.stop).not.toHaveBeenCalled();
  expect(sound.isPlaying).toBe(true);
});

it("plays the match-end announcement and voice binds while the world is frozen", () => {
  endMatch();
  test.snapshot = {
    timeSec: 10,
    matchEnded: true,
    chatMessages: [
      { id: 1, timeSec: 10, soundPath: "voice/announcer/ann.stowins.wav" },
      {
        id: 2,
        timeSec: 10,
        soundPath: "voice/male1/gbl.grtgame.wav",
        sender: "player",
      },
    ],
  } as StreamSnapshot;
  ChatSoundPlayer();
  flushEffects();
  expect(trackSound).toHaveBeenCalledTimes(2);
  for (const [sound] of vi.mocked(trackSound).mock.calls) {
    expect(sound.isPlaying).toBe(true);
  }
});

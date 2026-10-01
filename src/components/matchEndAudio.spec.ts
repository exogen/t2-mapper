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
  looping: true,
  contextRunning: true,
  failPlay: false,
  generation: 0,
  snapshot: null as StreamSnapshot | null,
  playback: {
    status: "playing",
    seekNonce: 0,
    seekTime: 0,
    recording: {
      source: "demo",
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
  useThree: (selector: (state: unknown) => unknown) =>
    selector({ gl: undefined, invalidate() {} }),
}));
vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  class TestAudio extends three.Object3D {
    isPlaying = false;
    play = vi.fn(() => {
      if (test.failPlay) throw new Error("playback failed");
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
    isLooping: test.looping,
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
  audioContextRunning: () => test.contextRunning,
  getEffectiveSoundRate: () => 1,
  getSoundGeneration: () => test.generation,
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
  streamSnapshotStore: { getState: () => ({ snapshot: test.snapshot }) },
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
function WeaponSounds(onSlot?: (slot: ImageSlot) => void) {
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
  onSlot?.(slot);
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
  test.looping = true;
  test.contextRunning = true;
  test.failPlay = false;
  test.generation = 0;
  test.playback.status = "playing";
  test.snapshot = null;
  test.playback.seekNonce = 0;
  test.playback.seekTime = 0;
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
  useEntitySoundSlots({ current: { soundSlots: [soundSlot(0)] } }, root);
  frame(); // Resolve profile.
  frame(); // Start the loop.
  const sound = root.children[0] as Audio;
  expect(sound.isPlaying).toBe(true);
  endMatch();
  frame();
  expect(sound.stop).not.toHaveBeenCalled();
  expect(sound.isPlaying).toBe(true);
});

function soundSlot(index = 1, revision = 1, changedAtSec = 10) {
  return { index, playing: true, profileId: 7, revision, changedAtSec };
}

it("plays each station activation once, including repeated packets with identical values", () => {
  test.looping = false;
  const root = new Group();
  const activation = soundSlot();
  const entity = { soundSlots: [activation] };
  useEntitySoundSlots({ current: entity }, root);
  frame();
  frame();
  const first = root.children[0] as Audio;
  first.onEnded();
  frame();
  frame();
  expect(trackSound).toHaveBeenCalledOnce();

  // ShapeBase times out the server slot without sending a stop packet.
  entity.soundSlots = [{ ...activation, revision: 2 }];
  frame();
  expect(trackSound).toHaveBeenCalledTimes(2);
  expect(root.children).toHaveLength(1);
  const second = root.children[0] as Audio;
  expect(second).not.toBe(first);
  expect(second.isPlaying).toBe(true);
  frame();
  expect(trackSound).toHaveBeenCalledTimes(2);
});

it("restarts an active slot when another play update arrives for the same profile", () => {
  test.looping = false;
  const root = new Group();
  const activation = soundSlot();
  const entity = { soundSlots: [activation] };
  useEntitySoundSlots({ current: entity }, root);
  frame();
  frame();
  const first = root.children[0] as Audio;
  entity.soundSlots = [{ ...activation, revision: 2 }];
  frame();
  expect(first.stop).toHaveBeenCalledOnce();
  expect(trackSound).toHaveBeenCalledTimes(2);
  expect(root.children).toHaveLength(1);
  expect(root.children[0]).not.toBe(first);
});

it("does not replay a finished activation when another sound slot changes", () => {
  test.looping = false;
  const root = new Group();
  const activation = soundSlot();
  const entity = { soundSlots: [activation] };
  useEntitySoundSlots({ current: entity }, root);
  frame();
  frame();
  const first = root.children[0] as Audio;
  first.onEnded();
  entity.soundSlots = [{ ...soundSlot(0), profileId: 8 }, activation];
  frame();
  frame();
  expect(first.play).toHaveBeenCalledOnce();
  expect(first.stop).toHaveBeenCalledOnce();
  expect(trackSound).toHaveBeenCalledTimes(2);
});

it("does not replay an activation when a snapshot is cloned with the same revision", () => {
  test.looping = false;
  const root = new Group();
  const entity = { soundSlots: [soundSlot()] };
  useEntitySoundSlots({ current: entity }, root);
  frame();
  frame();
  entity.soundSlots = structuredClone(entity.soundSlots);
  frame();
  expect(trackSound).toHaveBeenCalledOnce();
  expect((root.children[0] as Audio).stop).not.toHaveBeenCalled();
});

it("detaches a finished slot sound without forgetting the consumed trigger", () => {
  test.looping = false;
  const root = new Group();
  useEntitySoundSlots({ current: { soundSlots: [soundSlot()] } }, root);
  frame();
  frame();
  const sound = root.children[0] as Audio;
  sound.onEnded();
  expect(root.children).toHaveLength(0);
  frame();
  expect(trackSound).toHaveBeenCalledOnce();
});

it("requests a slot buffer once while it is loading", () => {
  test.defer = true;
  const root = new Group();
  useEntitySoundSlots({ current: { soundSlots: [soundSlot()] } }, root);
  for (let i = 0; i < 6; i++) frame();
  expect(test.pending).toHaveLength(1);
  for (const load of test.pending.splice(0)) load();
  frame();
  expect(trackSound).toHaveBeenCalledOnce();
});

it("does not reuse a previous recording's pending profile load", () => {
  test.defer = true;
  const root = new Group();
  useEntitySoundSlots({ current: { soundSlots: [soundSlot()] } }, root);
  frame();
  test.playback.recording.streamingPlayback = {
    ...test.playback.recording.streamingPlayback,
  };
  frame();
  expect(test.pending).toHaveLength(2);
  test.pending.shift()!();
  frame();
  expect(trackSound).not.toHaveBeenCalled();
  test.pending.shift()!();
  frame();
  expect(trackSound).toHaveBeenCalledOnce();
});

it("cleans up a slot node if playback fails", () => {
  test.looping = false;
  test.failPlay = true;
  const root = new Group();
  useEntitySoundSlots({ current: { soundSlots: [soundSlot()] } }, root);
  frame();
  frame();
  expect(root.children).toHaveLength(0);
  expect(trackSound).not.toHaveBeenCalled();
});

it.each([false, true])(
  "resumes loops without replaying one-shots after pause (looping=%s)",
  (looping) => {
    test.looping = looping;
    const root = new Group();
    useEntitySoundSlots({ current: { soundSlots: [soundSlot()] } }, root);
    frame();
    frame();
    const first = root.children[0] as Audio;
    test.playback.status = "paused";
    frame();
    expect(first.stop).toHaveBeenCalledOnce();
    test.playback.status = "playing";
    frame();
    expect(trackSound).toHaveBeenCalledTimes(looping ? 2 : 1);
  },
);

it.each([false, true])(
  "restores only loops when mounting at a seek destination (looping=%s)",
  (looping) => {
    test.looping = looping;
    test.playback.seekNonce++;
    test.playback.seekTime = 500;
    streamClock.time = 500;
    const root = new Group();
    const entity = { soundSlots: [soundSlot(1, 20, 499)] };
    useEntitySoundSlots({ current: entity }, root);
    frame();
    frame();
    expect(trackSound).toHaveBeenCalledTimes(looping ? 1 : 0);
    if (!looping) {
      streamClock.time = 501;
      entity.soundSlots = [soundSlot(1, 21, 501)];
      frame();
      frame();
      expect(trackSound).toHaveBeenCalledOnce();
    }
  },
);

it("drops a slot one-shot that became stale while loading", () => {
  test.looping = false;
  test.defer = true;
  const root = new Group();
  const entity = { soundSlots: [soundSlot()] };
  useEntitySoundSlots({ current: entity }, root);
  frame();
  streamClock.time = 13;
  for (const load of test.pending.splice(0)) load();
  frame();
  expect(trackSound).not.toHaveBeenCalled();
  entity.soundSlots = [soundSlot(1, 2, 13)];
  frame();
  expect(trackSound).toHaveBeenCalledOnce();
});

it("replays the same station activation after rewinding past it", () => {
  test.looping = false;
  const root = new Group();
  const entity = { soundSlots: [soundSlot(1, 2, 10)] };
  useEntitySoundSlots({ current: entity }, root);
  frame();
  frame();
  const first = root.children[0] as Audio;

  test.playback.status = "seeking";
  test.playback.seekNonce++;
  test.playback.seekTime = 9.5;
  test.generation++;
  frame();
  expect(first.isPlaying).toBe(false);
  streamClock.time = 9.5;
  entity.soundSlots = [soundSlot(1, 1, 8)];
  test.playback.status = "playing";
  frame();
  expect(trackSound).toHaveBeenCalledOnce();

  streamClock.time = 10;
  entity.soundSlots = [soundSlot(1, 2, 10)];
  frame();
  expect(trackSound).toHaveBeenCalledTimes(2);
  expect((root.children[0] as Audio).isPlaying).toBe(true);
});

it.each([
  [10, 10],
  [10.01, 10],
  [9.088, 284 * 0.032],
])(
  "skips a reconstructed activation at a tick or fractional seek target (%s)",
  (seekTime, changedAtSec) => {
    test.looping = false;
    test.playback.seekNonce++;
    test.playback.seekTime = seekTime;
    streamClock.time = seekTime;
    const root = new Group();
    const entity = { soundSlots: [soundSlot(1, 1, changedAtSec)] };
    useEntitySoundSlots({ current: entity }, root);
    frame();
    frame();
    expect(trackSound).not.toHaveBeenCalled();
    streamClock.time = 10.032;
    entity.soundSlots = [soundSlot(1, 2, 10.032)];
    frame();
    frame();
    expect(trackSound).toHaveBeenCalledOnce();
  },
);

it.each([false, true])(
  "keeps a paused seek silent, then restores only loops (looping=%s)",
  (looping) => {
    test.looping = looping;
    const root = new Group();
    const entity = { soundSlots: [soundSlot()] };
    useEntitySoundSlots({ current: entity }, root);
    frame();
    frame();
    test.playback.seekNonce++;
    test.playback.seekTime = 50;
    test.generation++;
    test.playback.status = "seeking";
    frame();
    streamClock.time = 50;
    entity.soundSlots = [soundSlot(1, 5, 49.9)];
    test.playback.status = "paused";
    frame();
    expect(root.children).toHaveLength(0);
    test.playback.status = "playing";
    frame();
    expect(trackSound).toHaveBeenCalledTimes(looping ? 2 : 1);
  },
);

it("does not play a pending station sound after a seek, but keeps its buffer for future activations", () => {
  test.looping = false;
  test.defer = true;
  const root = new Group();
  const entity = { soundSlots: [soundSlot()] };
  useEntitySoundSlots({ current: entity }, root);
  frame();
  test.playback.seekNonce++;
  test.playback.seekTime = 50;
  test.generation++;
  test.playback.status = "seeking";
  for (const load of test.pending.splice(0)) load();
  frame();
  streamClock.time = 50;
  entity.soundSlots = [soundSlot(1, 5, 49.9)];
  test.playback.status = "playing";
  frame();
  expect(trackSound).not.toHaveBeenCalled();
  entity.soundSlots = [soundSlot(1, 6, 50)];
  frame();
  expect(trackSound).not.toHaveBeenCalled();
  streamClock.time = 50.032;
  entity.soundSlots = [soundSlot(1, 7, 50.032)];
  frame();
  expect(trackSound).toHaveBeenCalledOnce();
});

it("does not replay a slot one-shot when the audio context unlocks later", () => {
  test.looping = false;
  test.contextRunning = false;
  const root = new Group();
  const entity = { soundSlots: [soundSlot()] };
  useEntitySoundSlots({ current: entity }, root);
  frame();
  frame();
  test.contextRunning = true;
  frame();
  expect(trackSound).not.toHaveBeenCalled();
  entity.soundSlots = [soundSlot(1, 2)];
  frame();
  frame();
  expect(trackSound).toHaveBeenCalledOnce();
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

it("skips chat sounds that became stale before the effect could run", () => {
  test.snapshot = {
    timeSec: 10,
    chatMessages: [
      { id: 1, timeSec: 10, soundPath: "voice/announcer/ann.stowins.wav" },
    ],
  } as StreamSnapshot;
  ChatSoundPlayer();
  test.snapshot = { ...test.snapshot, timeSec: 13 };
  flushEffects();
  expect(trackSound).not.toHaveBeenCalled();
});

function mountChatSound() {
  ChatSoundPlayer();
  const processMessages = test.effects.at(-1)!;
  flushEffects();
  return processMessages;
}

it("replays a voice bind after rewinding and crossing the same message again", () => {
  const message = {
    id: 1,
    timeSec: 10,
    soundPath: "voice/male1/gbl.grtgame.wav",
    sender: "player",
  };
  const messages = [message];
  test.snapshot = { timeSec: 10, chatMessages: messages } as StreamSnapshot;
  const processMessages = mountChatSound();
  expect(trackSound).toHaveBeenCalledOnce();
  const first = vi.mocked(trackSound).mock.calls[0][0];

  test.playback.seekNonce++;
  test.playback.seekTime = 9;
  streamClock.time = 9;
  test.snapshot.timeSec = 9;
  messages.length = 0;
  processMessages();
  expect(first.isPlaying).toBe(false);
  streamClock.time = 10;
  test.snapshot.timeSec = 10.032;
  messages.push(message);
  processMessages();
  expect(trackSound).toHaveBeenCalledTimes(2);
  processMessages();
  expect(trackSound).toHaveBeenCalledTimes(2);
});

it.each(["playing", "paused", "seeking"])(
  "does not replay nearby historical chat at a seek destination (%s)",
  (status) => {
    test.playback.status = status;
    test.playback.seekNonce++;
    test.playback.seekTime = 10.5;
    streamClock.time = 10.5;
    test.snapshot = {
      timeSec: 10.528,
      chatMessages: [
        { id: 1, timeSec: 10, soundPath: "voice/male1/gbl.grtgame.wav" },
      ],
    } as StreamSnapshot;
    const processMessages = mountChatSound();
    expect(trackSound).not.toHaveBeenCalled();
    test.playback.status = "playing";
    processMessages();
    expect(trackSound).not.toHaveBeenCalled();
    streamClock.time = 11;
    test.snapshot.timeSec = 11.008;
    test.snapshot.chatMessages.push({
      ...test.snapshot.chatMessages[0],
      id: 2,
      timeSec: 11,
    });
    processMessages();
    expect(trackSound).toHaveBeenCalledOnce();
  },
);

it("does not replay chat when its tick timestamp rounds above the seek target", () => {
  test.playback.seekNonce++;
  test.playback.seekTime = 9.088;
  streamClock.time = 9.088;
  test.snapshot = {
    timeSec: 9.12,
    chatMessages: [
      {
        id: 1,
        timeSec: 284 * 0.032,
        soundPath: "voice/male1/gbl.grtgame.wav",
      },
    ],
  } as StreamSnapshot;
  mountChatSound();
  expect(trackSound).not.toHaveBeenCalled();
});

it.each(["seek", "completed seek", "pause", "stale"])(
  "drops a pending chat buffer after playback changes (%s)",
  (change) => {
    test.defer = true;
    test.snapshot = {
      timeSec: 10,
      chatMessages: [
        { id: 1, timeSec: 10, soundPath: "voice/male1/gbl.grtgame.wav" },
      ],
    } as StreamSnapshot;
    mountChatSound();
    expect(test.pending).toHaveLength(1);
    if (change === "seek" || change === "completed seek") {
      // Before the controller's next frame can invalidate global audio.
      test.playback.seekNonce++;
      test.playback.seekTime = 50;
      test.playback.status = change === "seek" ? "seeking" : "playing";
    } else if (change === "pause") {
      test.playback.status = "paused";
    } else {
      streamClock.time = 13;
    }
    for (const load of test.pending.splice(0)) load();
    expect(trackSound).not.toHaveBeenCalled();
  },
);

it("does not consume seek invalidation before the destination weapon state arrives", () => {
  test.looping = false;
  let slot!: ImageSlot;
  WeaponSounds((value) => {
    slot = value;
  });
  frame();
  expect(playOneShotSound).toHaveBeenCalledOnce();
  vi.mocked(playOneShotSound).mockClear();
  test.playback.status = "seeking";
  test.playback.seekNonce++;
  frame();
  frame();
  streamClock.time = 500;
  slot.animation = { ...slot.animation!, revision: 2, changedAtSec: 500 };
  test.playback.status = "playing";
  frame();
  expect(playOneShotSound).not.toHaveBeenCalled();
  // A genuinely new state transition still plays normally.
  slot.animation = { ...slot.animation, revision: 3 };
  frame();
  expect(playOneShotSound).toHaveBeenCalledOnce();
});

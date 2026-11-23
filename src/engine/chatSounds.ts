import type { Audio } from "three";
import { audioToUrl } from "../loaders";
import { getAudioGraph } from "./audioGraph";
import {
  audioContextRunning,
  getCachedAudioBuffer,
  getSoundGeneration,
  playManagedOneShot,
  stopAndDetachSound,
} from "./soundEffects";
import { combineCleanups, reaction } from "./storeReaction";
import { settingsStore } from "../state/settingsStore";
import { commentaryPlayback, streamClock } from "../state/streamPlaybackStore";
import { engineStore, type PlaybackSliceState } from "../state/engineStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { streamTimeToTick } from "../stream/streamHelpers";
import type {
  ChatMessage,
  StreamRecording,
  StreamSnapshot,
} from "../stream/types";

const MAX_CHAT_SOUND_AGE_SEC = 5;

interface PendingChatSound {
  sender: string;
  cancel(): void;
}

interface ChatTraversal {
  recording: StreamRecording | null;
  seekNonce: number;
  revision: number | undefined;
}

function readTraversal({
  recording,
  seekNonce,
}: PlaybackSliceState): ChatTraversal {
  return {
    recording,
    seekNonce,
    revision: recording?.streamingPlayback?.playbackRevision,
  };
}

function matchesTraversal(
  traversal: ChatTraversal,
  { recording, seekNonce }: PlaybackSliceState,
): boolean {
  return (
    traversal.recording === recording &&
    traversal.seekNonce === seekNonce &&
    traversal.revision === recording?.streamingPlayback?.playbackRevision
  );
}

function allowsChatSound({ status }: PlaybackSliceState): boolean {
  return status === "playing" || status === "ending";
}

/**
 * The in-game announcer's spoken lines, skipped while the commentary
 * track is on air (the casters call these moments themselves). Two
 * homes: `voice/announcer/ann.*` (scores, flag events, game over) and —
 * despite the fx path — `fx/misc/hunters_*`, which is the announcer
 * VOICE counting down ("Thirty seconds!"): stock defaultGame.cs wires
 * `hunters_%1.wav` for both the match-start and match-end counts.
 * Torque paths are case-insensitive, so compare lowercased.
 */
function isAnnouncerSound(soundPath: string): boolean {
  const path = soundPath.toLowerCase();
  return (
    path.startsWith("voice/announcer/") || path.startsWith("fx/misc/hunters_")
  );
}

/**
 * Plays non-positional sound effects for chat messages with ~w sound tags.
 * `processMessages` consumes new messages in ID order; `reset` stops and
 * forgets everything.
 *
 * While the CastGenius commentary track is on air, the in-game
 * announcer is suppressed entirely (the booth makes those calls);
 * everything else rides the global master-volume duck.
 */
export function createChatSoundPlayer() {
  const { audioLoader, audioListener } = getAudioGraph();
  // Rewinding a demo or rehydrating a live stream can reuse message IDs.
  let traversal = readTraversal(engineStore.getState().playback);
  let lastMessageId = 0;
  // Own chat sounds and pending loads through natural EOF. Manual transport
  // changes still silence them via the shared audio device.
  const liveSounds = new Map<Audio<GainNode>, string>();
  const pendingLoads = new Set<PendingChatSound>();
  let processedMessages: StreamSnapshot["chatMessages"] | null = null;

  const stopSounds = () => {
    for (const load of pendingLoads) load.cancel();
    for (const sound of liveSounds.keys()) stopAndDetachSound(sound);
    liveSounds.clear();
  };

  const reset = () => {
    stopSounds();
    lastMessageId = 0;
    processedMessages = null;
  };

  function finishAudioTail(expected: ChatTraversal) {
    const playback = engineStore.getState().playback;
    if (
      playback.status !== "ending" ||
      !matchesTraversal(expected, playback) ||
      processedMessages !==
        (streamSnapshotStore.getState().snapshot?.chatMessages ?? null) ||
      pendingLoads.size > 0
    )
      return;
    for (const sound of liveSounds.keys()) {
      if (sound.isPlaying) return;
    }
    engineStore.getState().setPlaybackStatus("paused");
  }

  function queueSound(
    { soundPath, soundPitch, sender, timeSec }: ChatMessage,
    ageSec: number,
    expected: ChatTraversal,
  ) {
    if (!soundPath) return;
    const announcer = isAnnouncerSound(soundPath);
    if (announcer && commentaryPlayback.active) return;

    let url: string;
    try {
      url = audioToUrl(soundPath);
    } catch {
      // File not in manifest.
      return;
    }

    // A slow older voice bind must not interrupt this player's newer one.
    if (sender) {
      for (const load of pendingLoads) {
        if (load.sender === sender) load.cancel();
      }
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let deadline: number | undefined;
    let unsubscribe: (() => void) | undefined;
    const load: PendingChatSound = {
      sender,
      cancel() {
        clearTimeout(timeout);
        pendingLoads.delete(load);
        unsubscribe?.();
      },
    };
    const settle = () => {
      load.cancel();
      finishAudioTail(expected);
    };
    const generation = getSoundGeneration();
    pendingLoads.add(load);

    try {
      unsubscribe = getCachedAudioBuffer(
        url,
        audioLoader,
        (buffer) => {
          if (!pendingLoads.has(load)) return;
          try {
            const playback = engineStore.getState().playback;
            // A suspended context queues the cue until the user unlocks it.
            if (
              generation !== getSoundGeneration() ||
              !matchesTraversal(expected, playback) ||
              !allowsChatSound(playback) ||
              !settingsStore.getState().audioEnabled ||
              (announcer && commentaryPlayback.active) ||
              (deadline !== undefined && performance.now() > deadline) ||
              Math.abs(streamClock.time - timeSec) > MAX_CHAT_SOUND_AGE_SEC ||
              !audioContextRunning(audioListener)
            )
              return;

            // A new voice bind replaces the sender's previous cue. Also
            // forget sounds stopped globally, which skip the onEnded callback.
            for (const [sound, owner] of liveSounds) {
              if (sender && sender === owner) stopAndDetachSound(sound);
              else if (sound.isPlaying) continue;
              liveSounds.delete(sound);
            }
            const sound = audioListener.createChatSound();
            sound.setBuffer(buffer);
            if (
              playManagedOneShot(sound, {
                pitch: soundPitch ?? 1,
                onEnd: () => {
                  liveSounds.delete(sound);
                  finishAudioTail(expected);
                },
              })
            ) {
              liveSounds.set(sound, sender);
            }
          } finally {
            settle();
          }
        },
        settle,
      );
      // The demo clock stops at EOF. Apply the remaining age budget in real
      // time to in-flight loads. Cache hits settle synchronously.
      if (pendingLoads.has(load)) {
        const waitMs = (MAX_CHAT_SOUND_AGE_SEC - ageSec) * 1000;
        deadline = performance.now() + waitMs;
        timeout = setTimeout(settle, waitMs);
      }
    } catch {
      settle();
    }
  }

  function processMessages() {
    const playback = engineStore.getState().playback;
    if (!matchesTraversal(traversal, playback)) {
      reset();
      traversal = readTraversal(playback);
    }
    const expected = traversal;
    const { audioEnabled } = settingsStore.getState();
    if (!audioEnabled) stopSounds();
    const snapshot = streamSnapshotStore.getState().snapshot;
    // The old snapshot can outlive an unload, a catch-up, or a seek in progress.
    if (
      !playback.recording ||
      playback.status === "seeking" ||
      snapshot?.playbackRevision !== expected.revision
    )
      return;

    // A final buffer may finish before the final snapshot is processed.
    // Hold EOF open until the entire batch has been handled.
    processedMessages = null;
    const canPlay = audioEnabled && allowsChatSound(playback);
    const messages = snapshot?.chatMessages ?? null;
    const timeSec = snapshot?.timeSec ?? 0;
    for (const msg of messages ?? []) {
      if (msg.id <= lastMessageId) continue;
      lastMessageId = msg.id;
      if (!canPlay) continue;
      // A seek restores chat history without replaying nearby old lines.
      if (
        playback.recording.source === "demo" &&
        playback.seekTime > 0 &&
        streamTimeToTick(msg.timeSec) <= streamTimeToTick(playback.seekTime)
      )
        continue;
      const ageSec = Math.abs(timeSec - msg.timeSec);
      if (ageSec > MAX_CHAT_SOUND_AGE_SEC) continue;
      queueSound(msg, ageSec, expected);
    }
    processedMessages = messages;
    finishAudioTail(expected);
  }

  return { processMessages, reset };
}

/** Chat sounds as each snapshot publishes its messages. */
export function installChatSounds(): () => void {
  const { processMessages, reset } = createChatSoundPlayer();
  return combineCleanups(
    reset,
    reaction(engineStore, (state) => state.playback.recording, processMessages),
    reaction(settingsStore, (state) => state.audioEnabled, processMessages),
    reaction(
      streamSnapshotStore,
      (state) => state.snapshot?.chatMessages,
      processMessages,
    ),
    // At natural EOF, playback pauses once the last chat sounds finish.
    reaction(
      engineStore,
      (state) => state.playback.status === "ending",
      processMessages,
    ),
  );
}

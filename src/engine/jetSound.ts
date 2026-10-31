import type { Object3D, PositionalAudio } from "three";
import { getAudioGraph } from "./audioGraph";
import {
  createPositionalAudio,
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  resolveAudioProfile,
  stopAndDetachSound,
  trackSound,
  untrackSound,
  type ResolvedAudioProfile,
} from "./soundEffects";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { streamClock } from "../state/streamPlaybackStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { reaction } from "./storeReaction";

/**
 * A looping jet sound the client plays itself rather than through the
 * networked sound slots (Player::updateJet and FlyingVehicle::updateJet
 * call alxPlay3d directly while jetting). `update` is called every frame
 * with whether the jets are on; the profile is resolved once from
 * `profileId` and the sound attached to `parent`.
 */
export function createJetSound(
  parent: Object3D,
  profileId: number | null | undefined,
): { update(jetting: boolean): void; dispose(): void } {
  const { audioLoader, audioListener } = getAudioGraph();
  let sound: PositionalAudio | null = null;
  let buffer: AudioBuffer | null = null;
  let profile: ResolvedAudioProfile | null = null;

  const stopSound = () => {
    if (!sound) return;
    stopAndDetachSound(sound);
    sound = null;
  };

  if (audioLoader && profileId != null) {
    const sp = engineStore.getState().playback.recording?.streamingPlayback;
    const resolved = sp
      ? resolveAudioProfile(profileId, sp.getDataBlockData.bind(sp))
      : null;
    if (resolved) {
      profile = resolved;
      try {
        getCachedAudioBuffer(
          audioToUrl(resolved.filename),
          audioLoader,
          (b) => {
            buffer = b;
          },
        );
      } catch {
        // File not in manifest.
      }
    }
  }

  // Vehicle animation can be disabled, so don't depend on the frame update
  // to silence an existing loop at match end (or when audio is turned off).
  const stopAudioReaction = reaction(
    settingsStore,
    (state) => state.audioEnabled,
    (audioEnabled) => {
      if (!audioEnabled) stopSound();
    },
  );
  const stopMatchEndReaction = reaction(
    streamSnapshotStore,
    (state) => state.snapshot?.matchEnded ?? false,
    (matchEnded) => {
      if (matchEnded) stopSound();
    },
  );

  return {
    update(jetting) {
      jetting &&= !streamClock.worldPaused;
      const audioEnabled = settingsStore.getState().audioEnabled;
      const playing = sound?.isPlaying ?? false;
      if (jetting && !playing) {
        if (!audioEnabled || !audioListener || !buffer || !profile) return;
        let next = sound;
        if (!next) {
          next = createPositionalAudio(audioListener, profile);
          parent.add(next);
          sound = next;
        }
        try {
          next.setBuffer(buffer);
          next.setLoop(true);
          next.setPlaybackRate(getEffectiveSoundRate());
          next.play();
          trackSound(next, 1);
        } catch {
          /* AudioContext suspended */
        }
      } else if (playing && sound && (!jetting || !audioEnabled)) {
        // Also stop when audio is turned off mid-thrust — the start branch
        // is gated on audioEnabled, but an already-running loop isn't.
        untrackSound(sound);
        try {
          sound.stop();
        } catch {
          /* already stopped */
        }
      }
    },
    dispose() {
      stopAudioReaction();
      stopMatchEndReaction();
      stopSound();
    },
  };
}

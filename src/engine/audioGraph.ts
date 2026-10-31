import { AudioLoader, LoadingManager } from "three";
import { PlaybackAudioListener } from "./PlaybackAudioListener";
import { createAudioPlaybackFade } from "./audioPlaybackFade";

export interface AudioGraph {
  audioLoader: AudioLoader;
  audioListener: PlaybackAudioListener;
}

// Page-lifetime singletons. The listener owns the Web Audio graph: its gain
// node is wired to the speakers in its constructor, and every sound ever
// created keeps routing through the listener it was built with. Recreating
// the listener (as this once did on every default-camera switch — observer ↔
// command circuit) orphaned all in-flight sounds on a still-connected graph:
// they kept playing forever, immune to the volume slider and mute. One
// listener, moved between cameras, means volume/suspend always reach every
// sound.
let graph: AudioGraph | null = null;
let playbackFade: ReturnType<typeof createAudioPlaybackFade> | null = null;

/** The page's one audio graph, created on first use. */
export function getAudioGraph(): AudioGraph {
  if (graph) return graph;
  // Audio doesn't suspend rendering; exclude it from visual loading progress.
  const audioLoader = new AudioLoader(new LoadingManager());
  const audioListener = new PlaybackAudioListener();
  // Stay silent until the first frame applies the user's volume.
  audioListener.gain.gain.value = 0;
  // Safety limiter between the master gain and the speakers. Dozens of
  // simultaneous effects sum well past full scale and hard-clip at the
  // destination — harsh distortion that reads as crackle. A compressor
  // with a high ratio and fast attack transparently catches the peaks
  // instead.
  const ctx = audioListener.context;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  playbackFade = createAudioPlaybackFade(ctx);
  // Master gain → limiter → playback fade → speakers. Fade the output
  // after the limiter, including any samples buffered inside it.
  audioListener.gain.disconnect(ctx.destination);
  audioListener.gain.connect(limiter);
  limiter.connect(playbackFade.node);
  playbackFade.node.connect(ctx.destination);
  graph = { audioLoader, audioListener };
  return graph;
}

/** The fade between the limiter and the speakers (see getAudioGraph). */
export function getPlaybackFade(): ReturnType<typeof createAudioPlaybackFade> {
  getAudioGraph();
  return playbackFade!;
}

import { PlaybackAudioListener } from "./PlaybackAudioListener";
import {
  createAudioBufferLoader,
  type AudioBufferLoader,
} from "./audioBuffers";
import { createAudioPlaybackFade } from "./audioPlaybackFade";

export interface AudioSources {
  audioLoader: AudioBufferLoader;
  audioListener: PlaybackAudioListener;
}

interface AudioGraph extends AudioSources {
  outputFade: ReturnType<typeof createAudioPlaybackFade>;
}

// Sources stay connected to their original listener. Keep one graph for the
// page so camera and canvas switches preserve the shared mixer.
let graph: AudioGraph | undefined;

function createAudioGraph(): AudioGraph {
  const audioListener = new PlaybackAudioListener();
  const context = audioListener.context;
  const audioLoader = createAudioBufferLoader(context);
  // Stay silent until the mixer applies the user's volume.
  audioListener.gain.gain.value = 0;
  // Safety limiter between the master gain and the speakers. Dozens of
  // simultaneous effects sum well past full scale and hard-clip at the
  // destination — harsh distortion that reads as crackle. A compressor
  // with a high ratio and fast attack transparently catches the peaks
  // instead.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const outputFade = createAudioPlaybackFade(context);
  // Master gain → limiter → playback fade → speakers. Fade the output
  // after the limiter, including any samples buffered inside it.
  audioListener.gain.disconnect(context.destination);
  audioListener.gain.connect(limiter);
  limiter.connect(outputFade.node);
  outputFade.node.connect(context.destination);
  return { audioLoader, audioListener, outputFade };
}

export function getAudioGraph(): AudioGraph {
  return (graph ??= createAudioGraph());
}

import { Audio, AudioListener } from "three";

function createGate(context: BaseAudioContext) {
  const node = context.createGain();
  node.gain.value = 0;
  return {
    node,
    setPlaying(playing: boolean) {
      node.gain.value = playing ? 1 : 0;
    },
  };
}

/** Separate world/chat gates, sharing the listener's master volume and limiter. */
export class PlaybackAudioListener extends AudioListener {
  readonly world = createGate(this.context);
  readonly chat = createGate(this.context);

  constructor() {
    super();
    this.world.node.connect(this.gain);
    this.chat.node.connect(this.gain);
  }

  override getInput(): GainNode {
    return this.world.node;
  }

  createChatSound(): Audio<GainNode> {
    const sound = new Audio(this);
    sound.gain.disconnect(this.getInput());
    sound.gain.connect(this.chat.node);
    return sound;
  }
}

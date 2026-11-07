import { Audio, AudioListener, Object3D, Quaternion, Vector3 } from "three";
import { AudioParamVector, setKRate } from "./spatialAudio";

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

/**
 * The Web Audio listener's position and orientation params, at k-rate, or null
 * where it has only the instant setters (Firefox).
 */
function listenerPose(listener: BaseAudioContext["listener"]) {
  if (!listener.positionX) return null;
  setKRate(listener.positionX, listener.positionY, listener.positionZ);
  setKRate(listener.forwardX, listener.forwardY, listener.forwardZ);
  setKRate(listener.upX, listener.upY, listener.upZ);
  return {
    position: new AudioParamVector(
      listener.positionX,
      listener.positionY,
      listener.positionZ,
    ),
    forward: new AudioParamVector(
      listener.forwardX,
      listener.forwardY,
      listener.forwardZ,
    ),
    up: new AudioParamVector(listener.upX, listener.upY, listener.upZ),
  };
}

const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();
const _forward = new Vector3();
const _up = new Vector3();

/**
 * Separate world/chat gates, sharing the listener's master volume and limiter.
 */
export class PlaybackAudioListener extends AudioListener {
  readonly world = createGate(this.context);
  readonly chat = createGate(this.context);
  private readonly pose = listenerPose(this.context.listener);

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

  /**
   * Places the Web Audio listener the way PlaybackPositionalAudio places its
   * panner: instantly at first, then gliding over SPATIAL_SMOOTHING_SEC.
   */
  override updateMatrixWorld(force?: boolean): void {
    // Object3D's update only: AudioListener's ramps over the whole next frame.
    Object3D.prototype.updateMatrixWorld.call(this, force);
    this.matrixWorld.decompose(_position, _quaternion, _scale);
    _forward.set(0, 0, -1).applyQuaternion(_quaternion);
    _up.set(0, 1, 0).applyQuaternion(_quaternion);
    if (this.pose) {
      const time = this.context.currentTime;
      this.pose.position.set(_position, time);
      this.pose.forward.set(_forward, time);
      this.pose.up.set(_up, time);
    } else {
      const listener = this.context.listener;
      listener.setPosition(_position.x, _position.y, _position.z);
      listener.setOrientation(
        _forward.x,
        _forward.y,
        _forward.z,
        _up.x,
        _up.y,
        _up.z,
      );
    }
  }
}

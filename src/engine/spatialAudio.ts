import { AudioListener, Object3D, PositionalAudio, Vector3 } from "three";

/**
 * How long, in seconds, a 3D audio position takes to glide linearly to each
 * new value: short enough to track the picture, long enough that per-frame
 * position steps don't click.
 */
export const SPATIAL_SMOOTHING_SEC = 0.01;

/**
 * Has these panner or listener params computed once per 128-frame render
 * quantum instead of per sample. Chrome and Safari process a panner per
 * sample while it or the listener is moving unless every panner and listener
 * param is k-rate, so a moving camera made every playing sound pay per-sample
 * cost. Firefox has no automationRate.
 */
export function setKRate(...params: AudioParam[]): void {
  for (const param of params) param.automationRate = "k-rate";
}

/**
 * Three AudioParams set together as one vector. Each new value is reached
 * linearly SPATIAL_SMOOTHING_SEC after it's set, continuing from the glide
 * toward the previous one, but the first value, a `snap`, and any value set
 * before the audio clock moves past the last snap apply instantly. Unchanged
 * values aren't rewritten.
 *
 * Glides never cancel a glide under way, only append to it: Chrome and
 * Safari can render between two calls, so cancelling and rescheduling could
 * play a quantum from the half-written timeline. And they're linear ramps,
 * which depend on time alone, while Chrome advances a k-rate setTarget on
 * every read (several times per quantum, and once per panner for the
 * listener).
 */
export class AudioParamVector {
  private readonly params: readonly [AudioParam, AudioParam, AudioParam];
  /** The latest value set, reached at `end`. */
  private readonly value = new Vector3();
  private end = -Infinity;
  private snapTime: number | null = null;

  constructor(x: AudioParam, y: AudioParam, z: AudioParam) {
    this.params = [x, y, z];
  }

  set(value: Vector3, time: number, snap = false): void {
    if (!snap && this.snapTime !== null && value.equals(this.value)) return;
    // Until the clock moves, nothing has rendered since the last snap, so a
    // new value can replace it outright.
    snap ||= this.snapTime === null || time === this.snapTime;
    const end = snap ? time : time + SPATIAL_SMOOTHING_SEC;
    for (let i = 0; i < 3; i++) {
      const param = this.params[i];
      // For a glide, clears only what a write at this same instant set: a
      // second event at the same time is kept, not replaced. A snap also
      // clears a glide under way.
      param.cancelScheduledValues(end);
      if (snap) {
        param.setValueAtTime(value.getComponent(i), time);
      } else {
        // Holds the value already reached until now, so the ramp starts now.
        if (time >= this.end) {
          param.setValueAtTime(this.value.getComponent(i), time);
        }
        param.linearRampToValueAtTime(value.getComponent(i), end);
      }
    }
    if (snap) this.snapTime = time;
    this.end = end;
    this.value.copy(value);
  }
}

const _position = new Vector3();

/**
 * PositionalAudio whose panner is exactly where the sound is when it starts,
 * then glides over SPATIAL_SMOOTHING_SEC as it moves. three ramps toward each
 * frame's position over the whole next frame, so a new sound's attack plays
 * from the panner's default position (the world origin) and moving sounds
 * trail the picture by a frame. Orientation is never written: with no
 * directional cones, it doesn't affect the panner.
 */
export class PlaybackPositionalAudio extends PositionalAudio {
  private readonly pannerPosition: AudioParamVector;

  constructor(listener: AudioListener) {
    super(listener);
    const { positionX, positionY, positionZ } = this.panner;
    const { orientationX, orientationY, orientationZ } = this.panner;
    setKRate(positionX, positionY, positionZ);
    setKRate(orientationX, orientationY, orientationZ);
    this.pannerPosition = new AudioParamVector(positionX, positionY, positionZ);
  }

  override play(delay?: number): this | undefined {
    if (this.hasPlaybackControl && !this.isPlaying) {
      // Mid-frame, a model moved this frame may still hold last frame's world
      // matrix; the scene pass corrects it, instantly if the audio clock
      // hasn't moved.
      this.updateWorldMatrix(true, false);
      this.placePanner(true);
    }
    return super.play(delay);
  }

  override updateMatrixWorld(force?: boolean): void {
    // Object3D's update only: PositionalAudio's ramps the panner over the
    // whole next frame.
    Object3D.prototype.updateMatrixWorld.call(this, force);
    if (this.hasPlaybackControl && !this.isPlaying) return;
    this.placePanner(false);
  }

  private placePanner(snap: boolean): void {
    _position.setFromMatrixPosition(this.matrixWorld);
    this.pannerPosition.set(_position, this.context.currentTime, snap);
  }
}

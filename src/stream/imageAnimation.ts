import { timelineRandom } from "./timelineRandom";
import {
  WeaponImageStateMachine,
  type WeaponAnimState,
} from "./weaponStateMachine";
import type { WeaponImageDataBlockState, WeaponImageState } from "./types";

export interface ImageAnimationThread {
  sequence: number;
  startedAtSec: number;
  reverse: boolean;
  /** Scale against the asset's duration only after that asset becomes available. */
  timeout?: number;
  /** Flash visibility uses the main sequence's time scale. */
  scaleSequence?: number;
  position?: number;
  /** A later state resets cyclic threads; noncyclic poses finish normally. */
  reset?: boolean;
}

export interface ImageAnimationState {
  state: WeaponAnimState;
  revision: number;
  changedAtSec: number;
  anim?: ImageAnimationThread;
  flash?: ImageAnimationThread;
  spinTime: number;
  spinTimeSec: number;
}

/** ShapeBase's image state belongs to the stream's clock, even without a model.
 * Store immutable outputs on image slots; no renderer has to guess past flags
 * or run an activation sequence to catch up after a seek. */
export class ImageAnimation {
  private machine: WeaponImageStateMachine;
  private random: ReturnType<typeof timelineRandom>;
  private spinTime = 0;
  private timeSec: number;
  current: ImageAnimationState;

  constructor(
    states: WeaponImageDataBlockState[],
    timeSec: number,
    seed: number,
  ) {
    // Sequence indices are valid before DTS resources load. Resolve names only
    // at the renderer, using that image's own sequence table.
    const max = Math.max(
      0,
      ...states.flatMap((s) => [s.sequence ?? -1, s.sequenceVis ?? -1]),
    );
    this.machine = new WeaponImageStateMachine(
      states,
      Array.from({ length: max + 1 }, (_, i) => String(i)),
    );
    this.random = timelineRandom(seed);
    this.timeSec = timeSec;
    const state = this.machine.snapshot(true);
    this.current = {
      state,
      revision: 0,
      changedAtSec: timeSec,
      spinTime: 0,
      spinTimeSec: timeSec,
    };
    this.enter(state, timeSec);
  }

  saveState() {
    return {
      machine: this.machine.saveState(),
      randomState: this.random.state,
      spinTime: this.spinTime,
      timeSec: this.timeSec,
      current: this.current,
    };
  }

  restoreState(state: ReturnType<ImageAnimation["saveState"]>): void {
    this.machine.restoreState(state.machine);
    this.random.state = state.randomState;
    this.spinTime = state.spinTime;
    this.timeSec = state.timeSec;
    this.current = state.current;
  }

  advance(
    timeSec: number,
    flags: WeaponImageState,
    forceFire = false,
  ): ImageAnimationState {
    const dt = Math.max(0, timeSec - this.timeSec);
    this.spinTime += dt * this.current.state.spinTimeScale;
    this.timeSec = timeSec;
    const state = this.machine.tick(dt, flags, forceFire);
    if (state.entered || (state.transitioned && state.flashSequence)) {
      this.enter(state, timeSec);
    } else if (state.spinTimeScale !== this.current.state.spinTimeScale) {
      this.current = {
        ...this.current,
        state,
        spinTime: this.spinTime,
        spinTimeSec: timeSec,
      };
    }
    return this.current;
  }

  private enter(state: WeaponAnimState, timeSec: number): void {
    let anim = this.current.anim,
      flash = this.current.flash;
    if (state.entered) {
      if (anim) anim = { ...anim, reset: true };
      if (flash) flash = { ...flash, position: 0 };
    }
    if (state.sequenceName != null && (state.entered || state.flashSequence)) {
      anim = {
        sequence: Number(state.sequenceName),
        startedAtSec: timeSec,
        reverse: state.reverse,
        timeout:
          state.scaleAnimation && state.timeoutValue > 0
            ? state.timeoutValue
            : undefined,
      };
      if (state.flashSequence) {
        // Retail demos do not record the client's RNG. Stable per-image values
        // keep our random flash poses identical across playback and seeks.
        anim.position = this.random();
        if (state.visSequenceName != null)
          flash = {
            sequence: Number(state.visSequenceName),
            startedAtSec: timeSec,
            reverse: false,
            timeout: anim.timeout,
            scaleSequence: anim.sequence,
          };
      }
    }
    this.current = {
      state,
      revision: this.current.revision + 1,
      changedAtSec: timeSec,
      anim,
      flash,
      spinTime: this.spinTime,
      spinTimeSec: timeSec,
    };
  }
}

export function imageThreadPosition(
  thread: ImageAnimationThread,
  now: number,
  duration: number,
  cyclic: boolean,
  scaleDuration = duration,
): number {
  if (thread.position != null) return thread.position;
  if (thread.reset && cyclic) return 0;
  const period =
    thread.timeout != null && scaleDuration > 0
      ? (duration * thread.timeout) / scaleDuration
      : duration;
  if (!(period > 0)) return 0;
  const elapsed = Math.max(0, now - thread.startedAtSec) / period;
  const position = thread.reverse ? 1 - elapsed : elapsed;
  return cyclic ? ((position % 1) + 1) % 1 : Math.max(0, Math.min(1, position));
}

import type { WeaponImageDataBlockState, WeaponImageState } from "./types";

/** Transition index sentinel: -1 means "no transition defined". */
const NO_TRANSITION = -1;

/** Max transitions per tick to prevent infinite loops from misconfigured datablocks. */
const MAX_TRANSITIONS_PER_TICK = 32;

/** Torque SpinState enum values from ShapeBaseImageData (shapeBase.h). */
const SPIN_STOP = 1; // NoSpin
const SPIN_UP = 2; // SpinUp
const SPIN_DOWN = 3; // SpinDown
const SPIN_FULL = 4; // FullSpin

export interface WeaponAnimState {
  /** Name of the current animation sequence to play (lowercase), or null. */
  sequenceName: string | null;
  /** Whether the current state is a fire state. */
  isFiring: boolean;
  /** Spin thread timeScale (0 = stopped, 1 = full speed). */
  spinTimeScale: number;
  /** Whether the animation should play in reverse. */
  reverse: boolean;
  /** Whether the animation timeScale should be scaled to the timeout. */
  scaleAnimation: boolean;
  /** The timeout value of the current state (for timeScale calculation). */
  timeoutValue: number;
  /** True when a state transition occurred this tick. */
  transitioned: boolean;
  /** AudioProfile datablock IDs for sounds that should play this tick.
   *  In the engine, every state entry triggers its stateSound; a single tick
   *  can chain through multiple states, so multiple sounds may fire. */
  soundDataBlockIds: number[];
  /** Index of the current state in the state machine. */
  stateIndex: number;
}

/**
 * Client-side weapon image state machine replicating the Torque C++ logic from
 * `ShapeBase::updateImageState` / `ShapeBase::setImageState`. The server sends
 * only condition flags (trigger, ammo, loaded, wet, target) and a fireCount;
 * the client runs its own copy of the state machine to determine which
 * animation to play.
 */
export class WeaponImageStateMachine {
  private states: WeaponImageDataBlockState[];
  private seqIndexToName: string[];
  private currentStateIndex = 0;
  private delayTime = 0;
  private lastFireCount = -1;
  private spinTimeScale = 0;

  constructor(states: WeaponImageDataBlockState[], seqIndexToName: string[]) {
    this.states = states;
    this.seqIndexToName = seqIndexToName;
    if (states.length > 0) {
      this.delayTime = states[0].timeoutValue ?? 0;
    }
  }

  get stateIndex(): number {
    return this.currentStateIndex;
  }

  reset(): void {
    this.currentStateIndex = 0;
    this.delayTime =
      this.states.length > 0 ? (this.states[0].timeoutValue ?? 0) : 0;
    this.lastFireCount = -1;
  }

  /**
   * Advance the state machine by `dt` seconds using the given condition flags.
   * Returns the animation state to apply this frame.
   */
  tick(dt: number, flags: WeaponImageState): WeaponAnimState {
    if (this.states.length === 0) {
      return {
        sequenceName: null,
        isFiring: false,
        spinTimeScale: 0,
        reverse: false,
        scaleAnimation: false,
        timeoutValue: 0,
        transitioned: false,
        soundDataBlockIds: [],
        stateIndex: -1,
      };
    }

    // Detect fire count changes — forces a resync to the Fire state.
    // The server increments fireCount each time it fires; if our state machine
    // has diverged, this brings us back in sync.
    const fireCountChanged =
      this.lastFireCount >= 0 && flags.fireCount !== this.lastFireCount;
    this.lastFireCount = flags.fireCount;

    const soundDataBlockIds: number[] = [];

    if (fireCountChanged) {
      const fireIdx = this.states.findIndex((s) => s.fire);
      if (fireIdx >= 0 && fireIdx !== this.currentStateIndex) {
        this.currentStateIndex = fireIdx;
        this.delayTime = this.states[fireIdx].timeoutValue ?? 0;
        // Fire count resync is a state entry — play its sound.
        const fireSound = this.states[fireIdx].soundDataBlockId;
        if (fireSound >= 0) soundDataBlockIds.push(fireSound);
      }
    }

    this.delayTime -= dt;

    let transitioned = fireCountChanged;

    // Per-tick transition evaluation (C++ updateImageState): check conditions
    // and timeout when delayTime <= 0 or waitForTimeout is false.
    let nextState = this.evaluateTickTransitions(flags);

    // Process transitions. Self-transitions just reset delayTime (matching
    // the C++ setImageState early return path). Different-state transitions
    // run full entry logic including recursive entry transitions.
    let transitionsThisTick = 0;
    while (nextState >= 0 && transitionsThisTick < MAX_TRANSITIONS_PER_TICK) {
      transitionsThisTick++;
      transitioned = true;

      if (nextState === this.currentStateIndex) {
        // Self-transition (C++ setImageState self-transition path):
        // reset delayTime only; skip entry transitions and spin handling.
        this.delayTime = this.states[nextState].timeoutValue ?? 0;
        break;
      }

      // Transition to a different state (C++ setImageState normal path).
      const lastSpin = this.states[this.currentStateIndex].spin;
      const lastDelay = this.delayTime;
      this.currentStateIndex = nextState;
      const newTimeout = this.states[nextState].timeoutValue ?? 0;
      this.delayTime = newTimeout;

      // Every state entry plays its sound (C++ setImageState).
      const entrySound = this.states[nextState].soundDataBlockId;
      if (entrySound >= 0) soundDataBlockIds.push(entrySound);

      // Spin handling on state entry (C++ setImageState spin switch).
      const newSpin = this.states[nextState].spin;
      switch (newSpin) {
        case SPIN_STOP:
          this.spinTimeScale = 0;
          break;
        case SPIN_FULL:
          this.spinTimeScale = 1;
          break;
        case SPIN_UP:
          // Partial ramp reversal from SpinDown: adjust delayTime so the ramp
          // starts from the current barrel speed.
          if (lastSpin === SPIN_DOWN && newTimeout > 0) {
            this.delayTime *= 1 - lastDelay / newTimeout;
          }
          break;
        case SPIN_DOWN:
          // Partial ramp reversal from SpinUp.
          if (lastSpin === SPIN_UP && newTimeout > 0) {
            this.delayTime *= 1 - lastDelay / newTimeout;
          }
          break;
        // SPIN_IGNORE (0): preserve spinTimeScale.
      }

      // Entry transitions: check conditions immediately (no waitForTimeout,
      // no timeout). Matches C++ setImageState's recursive condition checks.
      nextState = this.evaluateEntryTransitions(flags);
    }

    // Per-tick spin update (C++ updateImageState spin switch).
    // In C++, FullSpin/NoSpin/IgnoreSpin are no-ops here (set on state entry
    // in setImageState). But our fireCount resync path bypasses the transition
    // loop, so we must handle FullSpin and NoSpin per-tick as a fallback.
    const state = this.states[this.currentStateIndex];
    const timeout = state.timeoutValue ?? 0;
    switch (state.spin) {
      case SPIN_STOP:
        this.spinTimeScale = 0;
        break;
      case SPIN_UP:
        this.spinTimeScale =
          timeout > 0 ? Math.max(0, 1 - this.delayTime / timeout) : 1;
        break;
      case SPIN_FULL:
        this.spinTimeScale = 1;
        break;
      case SPIN_DOWN:
        this.spinTimeScale =
          timeout > 0 ? Math.max(0, this.delayTime / timeout) : 0;
        break;
      // SPIN_IGNORE (0): leave spinTimeScale unchanged.
    }

    return {
      sequenceName: this.resolveSequenceName(state),
      isFiring: state.fire,
      spinTimeScale: this.spinTimeScale,
      reverse: !state.direction,
      scaleAnimation: state.scaleAnimation,
      timeoutValue: state.timeoutValue ?? 0,
      transitioned,
      soundDataBlockIds,
      stateIndex: this.currentStateIndex,
    };
  }

  /**
   * Per-tick transition evaluation (C++ updateImageState).
   * Respects waitForTimeout: only evaluates when delayTime has elapsed
   * or the state doesn't require waiting. Includes timeout transition.
   *
   * V12 engine priority order: loaded, ammo, target, wet, trigger, timeout.
   */
  private evaluateTickTransitions(flags: WeaponImageState): number {
    const state = this.states[this.currentStateIndex];
    const timedOut = this.delayTime <= 0;
    const canTransition = timedOut || !state.waitForTimeout;

    if (!canTransition) return -1;

    const cond = this.evaluateConditions(state, flags);
    if (cond !== -1) return cond;

    // timeout (only when delayTime has elapsed)
    if (timedOut) {
      const timeoutTarget = state.transitionOnTimeout;
      if (timeoutTarget !== NO_TRANSITION) {
        return timeoutTarget;
      }
    }

    return -1;
  }

  /**
   * Entry transition evaluation (C++ setImageState).
   * Fires immediately on state entry — ignores waitForTimeout and does NOT
   * check timeout transition.
   */
  private evaluateEntryTransitions(flags: WeaponImageState): number {
    const state = this.states[this.currentStateIndex];
    return this.evaluateConditions(state, flags);
  }

  /**
   * Evaluate condition-based transitions in V12 priority order:
   * loaded, ammo, target, wet, trigger.
   *
   * Matches C++ updateImageState: no self-transition guard. If a condition
   * resolves to the current state, setImageState handles it as a
   * self-transition (just resets delayTime).
   */
  private evaluateConditions(
    state: WeaponImageDataBlockState,
    flags: WeaponImageState,
  ): number {
    // loaded
    const loadedTarget = flags.loaded
      ? state.transitionOnLoaded
      : state.transitionOnNotLoaded;
    if (loadedTarget !== NO_TRANSITION) {
      return loadedTarget;
    }

    // ammo
    const ammoTarget = flags.ammo
      ? state.transitionOnAmmo
      : state.transitionOnNoAmmo;
    if (ammoTarget !== NO_TRANSITION) {
      return ammoTarget;
    }

    // target
    const targetTarget = flags.target
      ? state.transitionOnTarget
      : state.transitionOnNoTarget;
    if (targetTarget !== NO_TRANSITION) {
      return targetTarget;
    }

    // wet
    const wetTarget = flags.wet
      ? state.transitionOnWet
      : state.transitionOnNotWet;
    if (wetTarget !== NO_TRANSITION) {
      return wetTarget;
    }

    // trigger
    const triggerTarget = flags.triggerDown
      ? state.transitionOnTriggerDown
      : state.transitionOnTriggerUp;
    if (triggerTarget !== NO_TRANSITION) {
      return triggerTarget;
    }

    return -1;
  }

  /** Resolve a state's sequence index to a clip name via the GLB metadata. */
  private resolveSequenceName(state: WeaponImageDataBlockState): string | null {
    if (state.sequence == null || state.sequence < 0) return null;
    const name = this.seqIndexToName[state.sequence];
    return name ?? null;
  }
}

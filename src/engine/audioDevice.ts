import { createLogger } from "../logger";

const log = createLogger("audioDevice");
const CLOCK_CHECK_MS = 300;
const CLOCK_RECOVERY_INTERVAL_MS = 2000;
const UNLOCK_IDLE_GRACE_MS = 200;
const transitionTargets = {
  resume: "running",
  suspend: "suspended",
} as const;
type TransitionKind = keyof typeof transitionTargets;

const devices = new WeakMap<
  AudioContext,
  ReturnType<typeof createAudioDevice>
>();

/** One transition queue for the page-lifetime context, including view teardown. */
export function getAudioDevice(context: AudioContext) {
  let device = devices.get(context);
  if (!device) {
    device = createAudioDevice(context);
    devices.set(context, device);
  }
  return device;
}

function createAudioDevice(context: AudioContext) {
  let wantsRunning = false;
  let unlocked = context.state === "running";
  let unlockRequested = false;
  let transition: {
    kind: TransitionKind;
    pending: number;
    latestRequest: number;
  } | null = null;
  let unlockIdleGrace: ReturnType<typeof setTimeout> | undefined;
  let clockCheck: ReturnType<typeof setTimeout> | undefined;
  let clockStalled = false;
  let clockRecoveryAttempted = false;
  let lastClockRecovery = -Infinity;
  const listeners = new Set<() => void>();

  function clearTransition() {
    if (transition?.kind === "resume" && context.state !== "running")
      unlockRequested = false;
    transition = null;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function cancelUnlockIdleGrace() {
    clearTimeout(unlockIdleGrace);
    unlockIdleGrace = undefined;
  }

  function markUnlocked() {
    unlocked = true;
    if (!unlockRequested) return;
    unlockRequested = false;
    if (!wantsRunning && unlockIdleGrace === undefined) {
      // Play can arrive on the click after a pointerdown unlocked the device.
      // Give it a chance to reuse the already running, still-muted device.
      unlockIdleGrace = setTimeout(() => {
        unlockIdleGrace = undefined;
        reconcile();
      }, UNLOCK_IDLE_GRACE_MS);
    }
  }

  function cancelClockCheck() {
    clearTimeout(clockCheck);
    clockCheck = undefined;
  }

  function canCheckClockNow() {
    return (
      (wantsRunning || transition?.kind === "resume") &&
      globalThis.document?.visibilityState !== "hidden" &&
      context.state === "running"
    );
  }

  function scheduleClockCheck() {
    if (!canCheckClockNow()) {
      cancelClockCheck();
      return;
    }
    if (clockCheck !== undefined) return;

    const start = context.currentTime;
    const measuredTransition = transition;
    const measuredRequest = transition?.latestRequest;
    clockCheck = setTimeout(() => {
      clockCheck = undefined;
      if (!canCheckClockNow()) return;
      if (
        transition?.kind === "resume" &&
        (transition !== measuredTransition ||
          transition.latestRequest !== measuredRequest)
      ) {
        scheduleClockCheck();
        return;
      }

      const stalled = context.currentTime <= start;
      if (clockStalled !== stalled) {
        clockStalled = stalled;
        notify();
      }
      if (!stalled) {
        // Rendering has caught up even if the resume promises never settle.
        if (transition?.kind === "resume") {
          clearTransition();
          reconcile();
        }
        return;
      }
      const now = performance.now();
      if (
        !wantsRunning ||
        !canCheckClockNow() ||
        transition?.kind === "suspend" ||
        clockRecoveryAttempted ||
        now - lastClockRecovery < CLOCK_RECOVERY_INTERVAL_MS
      )
        return;

      // Some browsers report "running" after an interruption with a frozen
      // audio clock. Reconcile will resume once the native suspend completes,
      // provided the transport still wants audio.
      clockRecoveryAttempted = true;
      lastClockRecovery = now;
      // A running state and a stalled clock can both outlive a resume promise.
      // Give pending resumes the measurement window before restarting.
      if (transition?.kind === "resume") clearTransition();
      log.warn("Audio clock stalled while running; restarting the device");
      requestTransition("suspend");
    }, CLOCK_CHECK_MS);
  }

  function verifyClock() {
    clockRecoveryAttempted = false;
    scheduleClockCheck();
  }

  function requestTransition(kind: TransitionKind) {
    const current = (transition ??= {
      kind,
      pending: 0,
      latestRequest: 0,
    });
    const sequence = ++current.latestRequest;
    current.pending++;
    const complete = (failed: boolean) => {
      if (transition !== current) return;
      // Once the latest operation succeeds, earlier promises from the same
      // burst no longer need to settle for us to move on.
      const reachedTarget =
        !failed &&
        sequence === current.latestRequest &&
        context.state === transitionTargets[kind];
      if (--current.pending === 0 || reachedTarget) clearTransition();
      // An OS interruption can outlast a successful resume request. Wait
      // for a state change or gesture if the device is still interrupted.
      const resumeIncomplete = kind === "resume" && context.state !== "running";
      syncContext(!failed && !resumeIncomplete);
    };
    context[kind]().then(
      () => complete(false),
      (error) => {
        log.warn("Audio %s failed: %o", kind, error);
        complete(true);
      },
    );
  }

  function reconcile() {
    if (context.state === "closed") return;
    if (context.state === "interrupted" && transition?.kind === "suspend") {
      // An interruption can stop the device while a suspend is still pending.
      // WebKit may keep that promise waiting for a state it cannot reach.
      clearTransition();
    }
    if (transition) return;
    if (wantsRunning || unlockRequested) {
      if (context.state !== "running") requestTransition("resume");
    } else if (context.state === "running" && unlockIdleGrace === undefined) {
      // Safari can leave suspend pending on an interrupted context, blocking
      // the next playback gesture from resuming the device.
      requestTransition("suspend");
    }
  }

  function syncContext(continueTransition: boolean) {
    if (context.state === "running") markUnlocked();
    if (context.state === "closed") cancelUnlockIdleGrace();
    notify();
    if (continueTransition) reconcile();
    scheduleClockCheck();
  }

  context.addEventListener("statechange", () => {
    // A single operation can reach its native target while its promise
    // remains pending. With retries, an earlier operation may emit the event
    // before the latest operation has taken effect.
    if (
      transition?.latestRequest === 1 &&
      context.state === transitionTargets[transition.kind]
    )
      clearTransition();
    syncContext(true);
  });

  return {
    setRunning(running: boolean) {
      const changed = running !== wantsRunning;
      wantsRunning = running;
      if (running && changed) cancelUnlockIdleGrace();
      reconcile();
      if (changed) {
        notify();
        if (running) verifyClock();
        else scheduleClockCheck();
      }
    },
    unlock(retryStalledClock = false) {
      if (context.state === "running") {
        markUnlocked();
        // An explicit retry can restart a confirmed stall without waiting
        // out the cooldown that limits automatic recovery.
        if (retryStalledClock && clockStalled) {
          if (wantsRunning && transition?.kind === "suspend") {
            // Retry only in the same direction, once, and let the normal
            // completion path resume when the device has actually suspended.
            if (transition.latestRequest === 1) {
              clockRecoveryAttempted = true;
              lastClockRecovery = performance.now();
              requestTransition("suspend");
            }
            scheduleClockCheck();
            return;
          }
          lastClockRecovery = -Infinity;
        }
      } else if (context.state !== "closed") {
        if (!unlocked || context.state === "interrupted")
          unlockRequested = true;
        // WebKit can leave resume pending across an interruption. A new
        // user gesture can retry it even if this context was unlocked before.
        if (transition?.kind === "resume" && (unlockRequested || wantsRunning))
          requestTransition("resume");
      }
      reconcile();
      verifyClock();
    },
    verifyClock,
    needsAttention() {
      return wantsRunning && (context.state !== "running" || clockStalled);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

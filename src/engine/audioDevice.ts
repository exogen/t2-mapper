import { createLogger } from "../logger";

const log = createLogger("audioDevice");
const CLOCK_CHECK_MS = 300;
const CLOCK_RECOVERY_INTERVAL_MS = 2000;
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
  // A foreground or gesture check can be requested before resume completes.
  let clockCheckRequested = false;
  let clockCheck: ReturnType<typeof setTimeout> | undefined;
  let lastClockRecovery = -Infinity;
  const listeners = new Set<() => void>();

  function clearTransition() {
    if (transition?.kind === "resume") unlockRequested = false;
    transition = null;
  }

  function cancelClockCheck() {
    clockCheckRequested = false;
    clearTimeout(clockCheck);
    clockCheck = undefined;
  }

  function canRequestClockCheck() {
    return wantsRunning && globalThis.document?.visibilityState !== "hidden";
  }

  function canCheckClockNow() {
    return canRequestClockCheck() && !transition && context.state === "running";
  }

  function scheduleClockCheck() {
    if (!clockCheckRequested || !canCheckClockNow()) return;
    clockCheckRequested = false;
    if (clockCheck !== undefined) return;

    const start = context.currentTime;
    clockCheck = setTimeout(() => {
      clockCheck = undefined;
      const now = performance.now();
      if (
        !canCheckClockNow() ||
        context.currentTime > start ||
        now - lastClockRecovery < CLOCK_RECOVERY_INTERVAL_MS
      )
        return;

      // Some browsers report "running" after an interruption with a frozen
      // audio clock. Reconcile will resume once the native suspend completes,
      // provided the transport still wants audio.
      lastClockRecovery = now;
      log.warn("Audio clock stalled while running; restarting the device");
      requestTransition("suspend");
    }, CLOCK_CHECK_MS);
  }

  function verifyClock() {
    if (!canRequestClockCheck()) {
      cancelClockCheck();
      return;
    }
    clockCheckRequested = true;
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
      if (kind === "resume" && !failed) unlocked = true;
      // A successful latest resume has completed the native transition.
      // Earlier resume promises from the same burst may still be unresolved.
      const resumed =
        kind === "resume" &&
        !failed &&
        sequence === current.latestRequest &&
        context.state === "running";
      if (--current.pending === 0 || resumed) clearTransition();
      // An OS interruption can outlast a successful resume request. Wait
      // for a state change or gesture if the device is still interrupted.
      const interrupted =
        kind === "resume" && wantsRunning && context.state === "interrupted";
      syncContext(!failed && !interrupted);
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
    if (transition || context.state === "closed") return;
    const kind = wantsRunning || unlockRequested ? "resume" : "suspend";
    if (context.state !== transitionTargets[kind]) requestTransition(kind);
  }

  function syncContext(continueTransition: boolean) {
    for (const listener of listeners) listener();
    if (continueTransition) reconcile();
    scheduleClockCheck();
  }

  context.addEventListener("statechange", () => {
    // A single operation can reach its native target while its promise
    // remains pending. Multiple outstanding resumes still use the promise
    // path, since an earlier one can emit the running event.
    if (
      transition?.pending === 1 &&
      context.state === transitionTargets[transition.kind]
    ) {
      if (transition.kind === "resume") unlocked = true;
      clearTransition();
    }
    if (context.state === "closed") cancelClockCheck();
    syncContext(true);
  });

  return {
    setRunning(running: boolean) {
      wantsRunning = running;
      if (!running) cancelClockCheck();
      reconcile();
    },
    unlock() {
      if (context.state === "running") {
        unlocked = true;
        unlockRequested = false;
      } else if (context.state !== "closed") {
        if (!unlocked) unlockRequested = true;
        // WebKit can leave resume pending across an interruption. A new
        // user gesture can retry it even if this context was unlocked before.
        if (
          transition?.kind === "resume" &&
          (!unlocked ||
            (wantsRunning &&
              globalThis.navigator?.userActivation?.isActive !== false))
        )
          requestTransition("resume");
      }
      reconcile();
      verifyClock();
    },
    verifyClock,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

import { createLogger } from "../logger";

const log = createLogger("audioDevice");
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
  let unlocking = false;
  let pending = 0;
  let operation: "resume" | "suspend" | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  function request(next: "resume" | "suspend") {
    operation = next;
    pending++;
    const complete = (failed: boolean) => {
      if (next === "resume" && !failed) unlocked = true;
      if (--pending === 0) {
        operation = null;
        if (next === "resume") unlocking = false;
      }
      notify();
      // Retry failures on the next gesture/state/transport change, not in a loop.
      if (!failed) reconcile();
    };
    context[next]().then(
      () => complete(false),
      (error) => {
        log.warn("Audio %s failed: %o", next, error);
        complete(true);
      },
    );
  }

  function reconcile() {
    if (pending || context.state === "closed") return;
    const running = wantsRunning || unlocking;
    if (running && context.state !== "running") request("resume");
    else if (!running && context.state !== "suspended") request("suspend");
  }

  context.addEventListener("statechange", () => {
    notify();
    reconcile();
  });

  return {
    setRunning(running: boolean) {
      wantsRunning = running;
      reconcile();
    },
    unlock() {
      if (context.state === "running") {
        unlocked = true;
        unlocking = false;
      }
      if (!unlocked && context.state !== "closed") {
        unlocking = true;
        // A blocked resume may need another call inside a user gesture.
        // Same-direction requests are safe; never overlap resume with suspend.
        if (operation === "resume") request("resume");
      }
      reconcile();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

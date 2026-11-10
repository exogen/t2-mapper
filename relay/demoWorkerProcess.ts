import { fork } from "node:child_process";
import os from "node:os";
import { loadDemoCheckpointHeapMB } from "./demoCheckpointConfig.js";

const WORKER_TIMEOUT_MS = 10 * 60_000;

/** How a demo worker process ended. */
export interface DemoWorkerExit<T> {
  /** The last IPC message the worker sent. */
  message: T | undefined;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  /** The tail of the worker's stderr. */
  stderr: string;
}

/**
 * Run a demo replay script in an independent, low-priority child process.
 * The caller owns scheduling. Cancellation and the ten-minute deadline kill
 * the child, but the promise waits for its process and stdio to close.
 */
export function runDemoWorker<T>(
  script: URL,
  args: readonly string[],
  { signal, env }: { signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {},
): Promise<DemoWorkerExit<T>> {
  const heapMB = loadDemoCheckpointHeapMB();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const child = fork(script, args, {
      execArgv: [
        "--import=tsx/esm",
        `--max-old-space-size=${heapMB}`,
        "--max-semi-space-size=8",
      ],
      env,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    if (child.pid) {
      try {
        os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Hosts may forbid changing priority; process isolation still applies.
      }
    }
    let message: T | undefined;
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let stopping = false;
    let workerError: Error | undefined;
    const kill = () => {
      if (stopping || settled) return;
      stopping = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, WORKER_TIMEOUT_MS);
    timer.unref();
    const onStderr = (chunk: string) => {
      stderr = (stderr + chunk).slice(-8192);
    };
    const onMessage = (value: T) => {
      message = value;
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);
      child.stderr?.off("data", onStderr);
      child.off("message", onMessage);
      child.off("close", onClose);
    };
    const onClose = (
      code: number | null,
      exitSignal: NodeJS.Signals | null,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (signal?.aborted) reject(signal.reason);
      else if (workerError && !timedOut) reject(workerError);
      else resolve({ message, code, signal: exitSignal, timedOut, stderr });
    };
    child.on("error", (error: Error) => {
      if (settled) return;
      workerError ??= error;
      if (child.pid) {
        // An IPC/kill error does not establish that a spawned process exited.
        kill();
      } else {
        settled = true;
        cleanup();
        reject(error);
      }
    });
    child.once("close", onClose);
    child.on("message", onMessage);
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", onStderr);
    signal?.addEventListener("abort", kill, { once: true });
    if (signal?.aborted) kill();
  });
}

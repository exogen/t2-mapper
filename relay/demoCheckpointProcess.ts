import { fork } from "node:child_process";
import os from "node:os";
import type { DemoCheckpointGenerationResult } from "./demoCheckpointGenerator.js";

export class DemoCheckpointGenerationError extends Error {}

/** Keep parser replay and garbage collection off the relay's event loop. */
export function runDemoCheckpointProcess(
  input: string,
  output: string,
  assetRoot: string,
  force = false,
): Promise<DemoCheckpointGenerationResult> {
  return new Promise((resolve, reject) => {
    const child = fork(
      new URL("./demoCheckpointWorker.ts", import.meta.url),
      [input, output, assetRoot, String(force)],
      {
        execArgv: [
          "--import=tsx/esm",
          "--max-old-space-size=128",
          "--max-semi-space-size=8",
        ],
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    );
    if (child.pid) {
      try {
        os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Hosts may forbid changing priority; process isolation still applies.
      }
    }
    let result: DemoCheckpointGenerationResult | undefined;
    let errors = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 10 * 60_000);
    timer.unref();
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      errors = (errors + chunk).slice(-8192);
    });
    child.on("message", (message: DemoCheckpointGenerationResult) => {
      result = message;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new DemoCheckpointGenerationError(error.message));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0 && result) resolve(result);
      else
        reject(
          new DemoCheckpointGenerationError(
            timedOut
              ? "Checkpoint generation timed out"
              : errors.trim() || `Checkpoint worker exited (${code ?? signal})`,
          ),
        );
    });
  });
}

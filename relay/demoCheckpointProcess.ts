import type { DemoCheckpointGenerationResult } from "./demoCheckpointGenerator.js";
import type { DemoCheckpointPlan } from "../src/stream/demoCheckpoints";
import {
  checkDemoCheckpointPlan,
  loadDemoCheckpointPlan,
} from "./demoCheckpointConfig.js";
import { runDemoWorker } from "./demoWorkerProcess.js";

export class DemoCheckpointGenerationError extends Error {}

/** Generate checkpoints in a worker process (see `runDemoWorker`). */
export function runDemoCheckpointProcess(
  input: string,
  output: string,
  assetRoot: string,
  force = false,
  plan: DemoCheckpointPlan = loadDemoCheckpointPlan(),
): Promise<DemoCheckpointGenerationResult> {
  plan = checkDemoCheckpointPlan(plan);
  return runDemoWorker<DemoCheckpointGenerationResult>(
    new URL("./demoCheckpointWorker.ts", import.meta.url),
    [
      input,
      output,
      assetRoot,
      String(force),
      String(plan.intervalTicks),
      String(plan.maxCount),
    ],
  ).then(
    ({ message, code, signal, timedOut, stderr }) => {
      if (code === 0 && message) return message;
      throw new DemoCheckpointGenerationError(
        timedOut
          ? "Checkpoint generation timed out"
          : stderr.trim() || `Checkpoint worker exited (${code ?? signal})`,
      );
    },
    (error: Error) => {
      throw new DemoCheckpointGenerationError(error.message);
    },
  );
}

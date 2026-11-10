import type { DemoMetadata } from "./demoMetadata.js";
import type { PreparedDemoCheckpoints } from "./demoCheckpointGenerator.js";
import { loadDemoCheckpointPlan } from "./demoCheckpointConfig.js";
import { runDemoWorker } from "./demoWorkerProcess.js";

export interface DemoUploadProcessingResult {
  metadata: DemoMetadata;
  /** Names the published file, like the live recorder's mission at start. */
  startMission: string;
  checkpoints: PreparedDemoCheckpoints;
}

export class DemoUploadProcessingError extends Error {}

/** Validate and replay an untrusted recording in a worker (see `runDemoWorker`). */
export function runDemoUploadProcess(
  input: string,
  assetRoot: string,
  signal?: AbortSignal,
): Promise<DemoUploadProcessingResult> {
  const plan = loadDemoCheckpointPlan();
  return runDemoWorker<{ result?: DemoUploadProcessingResult; error?: string }>(
    new URL("./demoUploadWorker.ts", import.meta.url),
    [input, assetRoot, String(plan.intervalTicks), String(plan.maxCount)],
    {
      signal,
      // No R2, OAuth, auth-cookie, or database credentials belong in this child.
      env: { PATH: process.env.PATH, NODE_ENV: "production", TZ: "UTC" },
    },
  ).then(
    ({ message, code, timedOut }) => {
      if (code === 0 && message?.result) return message.result;
      // Never surface stderr: it holds attacker-influenced parser diagnostics.
      throw new DemoUploadProcessingError(
        timedOut
          ? "Demo processing exceeded the time limit."
          : typeof message?.error === "string"
            ? message.error.slice(0, 300)
            : "The recording could not be processed.",
      );
    },
    (error) => {
      if (signal?.aborted) throw error;
      throw new DemoUploadProcessingError(
        "The demo processor could not be started.",
      );
    },
  );
}

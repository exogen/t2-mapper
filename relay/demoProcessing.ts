import { DemoProcessingQueue } from "./demoProcessingQueue.js";
import { runDemoCheckpointProcess } from "./demoCheckpointProcess.js";
import { runDemoUploadProcess } from "./demoUploadProcess.js";
import { runDemoGuidProcess } from "./demoGuids.js";
import { runDemoStatsProcess } from "./demoStats.js";

/** Relay policy: recordings, uploads, stats, then player profile updates. */
export function createRelayDemoProcessing() {
  const queue = new DemoProcessingQueue();
  return {
    processUpload: (input: string, assetRoot: string, signal?: AbortSignal) =>
      queue.run(
        "upload",
        () => runDemoUploadProcess(input, assetRoot, signal),
        signal,
      ),
    generateCheckpoints: (
      ...args: Parameters<typeof runDemoCheckpointProcess>
    ) => queue.run("recording", () => runDemoCheckpointProcess(...args)),
    // Brief and part of publication, which holds the uploader's lock, so it
    // must not wait behind a replay that has already started.
    readNamesByGuid: runDemoGuidProcess,
    repairNamesByGuid: (input: string, signal?: AbortSignal) =>
      queue.run("stats", () => runDemoGuidProcess(input, signal), signal),
    computeStats: (
      input: string,
      assetRoot: string,
      manifestPath: string,
      signal?: AbortSignal,
    ) =>
      queue.run(
        "stats",
        () => runDemoStatsProcess(input, assetRoot, manifestPath, signal),
        signal,
      ),
    updateProfiles: <T>(task: () => Promise<T>, signal?: AbortSignal) =>
      queue.run("profiles", task, signal),
  };
}

import { DemoProcessingQueue } from "./demoProcessingQueue.js";
import { runDemoCheckpointProcess } from "./demoCheckpointProcess.js";
import { runDemoUploadProcess } from "./demoUploadProcess.js";

/** Relay policy: one replay worker, with recordings ahead of waiting uploads. */
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
  };
}

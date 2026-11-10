import os from "node:os";

// Set scheduling priority before importing the parser, simulation, or assets.
try {
  os.setPriority(0, os.constants.priority.PRIORITY_LOW);
} catch (error) {
  // Some local macOS sandboxes forbid nice changes. Production Linux must apply it.
  if (process.platform === "linux") throw error;
}

const [input, assetRoot, intervalTicks, maxCount] = process.argv.slice(2);
let completed = false;
process.on("disconnect", () => {
  if (!completed) process.exit(1);
});

try {
  const [fs, path, analysis, checkpoints, config, limits] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
    import("./demoAnalysis.js"),
    import("./demoCheckpointGenerator.js"),
    import("./demoCheckpointConfig.js"),
    import("./userDemoTypes.js"),
  ]);
  const bytes = await fs.readFile(input);
  analysis.validateDemoUploadBytes(bytes);
  const { metadata, startMission } = await analysis.analyzeDemoRecording(
    bytes,
    path.basename(input),
    { strict: true },
  );
  const plan = config.checkDemoCheckpointPlan({
    intervalTicks: Number(intervalTicks),
    maxCount: Number(maxCount),
  });
  const checkpoint = await checkpoints.generateDemoCheckpoints(
    input,
    `${input}.checkpoints.json`,
    assetRoot,
    undefined,
    false,
    plan,
    // The relay holds the final metadata to the rest of the sidecar budget.
    limits.MAX_USER_DEMO_SIDECAR_BYTES - limits.MAX_USER_DEMO_METADATA_BYTES,
  );
  completed = true;
  process.send!(
    {
      result: {
        metadata,
        startMission,
        checkpoints: { ...checkpoint, ...plan },
      },
    },
    () => process.disconnect(),
  );
} catch (error) {
  completed = true;
  const { DemoUploadValidationError } = await import("./demoAnalysis.js");
  const message =
    error instanceof DemoUploadValidationError
      ? error.message
      : "The recording is corrupt, unsupported, or too complex to process.";
  process.exitCode = 1;
  process.send!({ error: message }, () => process.disconnect());
}

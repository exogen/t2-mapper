import os from "node:os";

// Set scheduling priority before importing the parser and playback.
try {
  os.setPriority(0, os.constants.priority.PRIORITY_LOW);
} catch (error) {
  // Some local macOS sandboxes forbid nice changes. Production Linux must apply it.
  if (process.platform === "linux") throw error;
}

const [input, assetRoot, manifestPath] = process.argv.slice(2);
let completed = false;
process.on("disconnect", () => {
  if (!completed) process.exit(1);
});

try {
  const [fs, stats] = await Promise.all([
    import("node:fs/promises"),
    import("./demoPlayerStats.js"),
  ]);
  const sequences = await stats.loadStationPurchaseSequences(
    assetRoot,
    manifestPath,
  );
  const sidecar = await stats.computeDemoPlayerStats(
    await fs.readFile(input),
    sequences,
  );
  completed = true;
  process.send!({ stats: sidecar }, () => process.disconnect());
} catch (error) {
  completed = true;
  console.error(error);
  process.exitCode = 1;
  process.disconnect();
}

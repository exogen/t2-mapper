import os from "node:os";

// Set scheduling priority before importing the parser.
try {
  os.setPriority(0, os.constants.priority.PRIORITY_LOW);
} catch (error) {
  // Some local macOS sandboxes forbid nice changes. Production Linux must apply it.
  if (process.platform === "linux") throw error;
}

const [input] = process.argv.slice(2);
let completed = false;
process.on("disconnect", () => {
  if (!completed) process.exit(1);
});

try {
  const [fs, path, analysis] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
    import("./demoAnalysis.js"),
  ]);
  const namesByGuid = await analysis.readDemoNamesByGuid(
    await fs.readFile(input),
    path.basename(input),
  );
  completed = true;
  process.send!({ namesByGuid }, () => process.disconnect());
} catch (error) {
  completed = true;
  console.error(error);
  process.exitCode = 1;
  process.disconnect();
}

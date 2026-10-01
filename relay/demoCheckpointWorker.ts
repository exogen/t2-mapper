import { generateDemoCheckpoints } from "./demoCheckpointGenerator.js";

const [input, output, assetRoot, force] = process.argv.slice(2);
let completed = false;
process.on("disconnect", () => {
  if (!completed) process.exit(1);
});
try {
  const result = await generateDemoCheckpoints(
    input,
    output,
    assetRoot,
    undefined,
    force !== "true",
  );
  completed = true;
  process.send!(
    { ...result, peakRSSMiB: process.resourceUsage().maxRSS / 1024 },
    () => process.disconnect(),
  );
} catch (error) {
  completed = true;
  console.error(error);
  process.exitCode = 1;
  process.disconnect();
}

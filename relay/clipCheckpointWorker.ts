import os from "node:os";

try {
  os.setPriority(0, os.constants.priority.PRIORITY_LOW);
} catch (error) {
  if (process.platform === "linux") throw error;
}

const [input, output, assetRoot, tick, maxOutputBytes, endTick] =
  process.argv.slice(2);
let completed = false;
process.on("disconnect", () => {
  if (!completed) process.exit(1);
});

try {
  const { generateDemoCheckpoints } =
    await import("./demoCheckpointGenerator.js");
  const result = await generateDemoCheckpoints(
    input,
    output,
    assetRoot,
    undefined,
    false,
    { maxCount: 1, intervalTicks: 1 },
    Number(maxOutputBytes),
    [Number(tick)],
    endTick ? Number(endTick) : undefined,
  );
  completed = true;
  process.send!({ result }, () => process.disconnect());
} catch (error) {
  completed = true;
  console.error(error);
  process.exitCode = 1;
  process.send!(
    { error: "The recording could not be prepared for this clip." },
    () => process.disconnect(),
  );
}

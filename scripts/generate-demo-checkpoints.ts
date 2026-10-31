/**
 * Generate <demo>.checkpoints.json: one a minute before the first kickoff (or
 * one interval in, without one), then every --interval minutes, up to --count
 * in all.
 */
import { parseArgs } from "node:util";
import { generateDemoCheckpoints } from "../relay/demoCheckpointGenerator.js";
import { DEMO_CHECKPOINT_SUFFIX } from "../src/stream/demoCheckpoints";
import { loadDemoCheckpointPlan } from "../relay/demoCheckpointConfig.js";
import { ASSET_BASE_DIR } from "../src/resourcePaths";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: "string" },
    "asset-root": { type: "string", default: ASSET_BASE_DIR },
    force: { type: "boolean", default: false },
    count: { type: "string" },
    interval: { type: "string" },
  },
});
const [input] = positionals;
if (!input || positionals.length !== 1)
  throw new Error(
    `Usage: generate-demo-checkpoints.ts <demo.rec> [--interval=MINUTES] [--count=N] [--output=sidecar.json] [--asset-root=${ASSET_BASE_DIR}] [--force]`,
  );
const output = values.output ?? `${input}${DEMO_CHECKPOINT_SUFFIX}`;
const result = await generateDemoCheckpoints(
  input,
  output,
  values["asset-root"],
  (event) => console.log(JSON.stringify(event)),
  !values.force,
  loadDemoCheckpointPlan({ interval: values.interval, count: values.count }),
);
console.log(JSON.stringify({ phase: "saved", output, ...result }));

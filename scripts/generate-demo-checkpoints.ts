/** Generate <demo>.checkpoints.json before the first kickoff and every 12 minutes. */
import { parseArgs } from "node:util";
import { generateDemoCheckpoints } from "../relay/demoCheckpointGenerator.js";
import { DEMO_CHECKPOINT_SUFFIX } from "../src/stream/demoCheckpoints";
import { loadDemoCheckpointCount } from "../relay/demoCheckpointConfig.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: "string" },
    "asset-root": { type: "string", default: "docs/base" },
    force: { type: "boolean", default: false },
    count: { type: "string" },
  },
});
const [input] = positionals;
if (!input || positionals.length !== 1)
  throw new Error(
    "Usage: generate-demo-checkpoints.ts <demo.rec> [--count=N] [--output=sidecar.json] [--asset-root=docs/base] [--force]",
  );
const output = values.output ?? `${input}${DEMO_CHECKPOINT_SUFFIX}`;
const result = await generateDemoCheckpoints(
  input,
  output,
  values["asset-root"],
  (event) => console.log(JSON.stringify(event)),
  !values.force,
  loadDemoCheckpointCount(
    values.count,
    values.count !== undefined ? "--count" : "DEMO_CHECKPOINT_COUNT",
  ),
);
console.log(JSON.stringify({ phase: "saved", output, ...result }));

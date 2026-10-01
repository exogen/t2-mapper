/** Generate <demo>.checkpoints.json at 60s before each confirmed timeline kickoff. */
import { parseArgs } from "node:util";
import { generateDemoCheckpoints } from "../relay/demoCheckpointGenerator.js";
import { DEMO_CHECKPOINT_SUFFIX } from "../src/stream/demoCheckpoints";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: "string" },
    "asset-root": { type: "string", default: "docs/base" },
    force: { type: "boolean", default: false },
  },
});
const [input] = positionals;
if (!input || positionals.length !== 1)
  throw new Error(
    "Usage: generate-demo-checkpoints.ts <demo.rec> [--output=sidecar.json] [--asset-root=docs/base] [--force]",
  );
const output = values.output ?? `${input}${DEMO_CHECKPOINT_SUFFIX}`;
const result = await generateDemoCheckpoints(
  input,
  output,
  values["asset-root"],
  (event) => console.log(JSON.stringify(event)),
  !values.force,
);
console.log(JSON.stringify({ phase: "saved", output, ...result }));

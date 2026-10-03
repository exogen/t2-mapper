/** Generate missing/current-version seek sidecars for demos already in R2. */
import path from "node:path";
import { parseArgs } from "node:util";
import { DemoCheckpointPublisher } from "../relay/demoCheckpointPublisher.js";
import { listAllObjects, r2Client } from "./lib/r2.js";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    concurrency: { type: "string", default: "1" },
    filter: { type: "string" },
    "asset-root": { type: "string", default: "docs/base" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    "Usage: npm run demos:backfill-checkpoints -- [--dry-run] [--force] [--concurrency=1] [--filter=substring] [--asset-root=docs/base]",
  );
  process.exit(0);
}
const concurrency = Number(values.concurrency);
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  console.error("--concurrency must be a positive integer");
  process.exit(1);
}
const { client, config } = r2Client("npm run demos:backfill-checkpoints");
const demos = (await listAllObjects(client, config)).filter(
  ({ key }) =>
    key.endsWith(".rec") && (!values.filter || key.includes(values.filter)),
);
const counts = { published: 0, current: 0, failed: 0, planned: 0 };
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, demos.length) }, async () => {
    // Each publisher serializes its jobs. Separate instances give backfills
    // a bounded pool without changing the live relay's single-worker queue.
    const publisher = new DemoCheckpointPublisher(
      config,
      path.resolve(values["asset-root"]),
    );
    while (next < demos.length) {
      const { key } = demos[next++];
      try {
        if (values["dry-run"]) {
          if (!values.force && (await publisher.isCurrent(key))) {
            counts.current++;
            continue;
          }
          counts.planned++;
          console.log(JSON.stringify({ key, action: "generate" }));
        } else {
          const result = await publisher.publish(key, { force: values.force });
          counts[result]++;
          console.log(JSON.stringify({ key, result }));
        }
      } catch (error) {
        counts.failed++;
        console.error(key, error);
      }
    }
  }),
);
console.log(JSON.stringify({ demos: demos.length, ...counts }));
if (counts.failed) process.exitCode = 1;

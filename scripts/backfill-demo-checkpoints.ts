/** Generate missing or incompatible seek sidecars for demos already in R2. */
import path from "node:path";
import { parseArgs } from "node:util";
import { DemoCheckpointPublisher } from "../relay/demoCheckpointPublisher.js";
import { loadDemoCheckpointCount } from "../relay/demoCheckpointConfig.js";
import { listAllObjects, r2Client } from "./lib/r2.js";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    concurrency: { type: "string", default: "1" },
    count: { type: "string" },
    filter: { type: "string" },
    "asset-root": { type: "string", default: "docs/base" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    [
      "Usage: npm run demos:backfill-checkpoints -- [options]",
      "",
      "  --count=N              Maximum checkpoints per demo (DEMO_CHECKPOINT_COUNT, or 1)",
      "  --filter=TEXT          Case-sensitive substring of the full R2 key, including the demo filename",
      "                         Example: --filter=stonehengelt matches demos/server_stonehengelt_id.rec",
      "                         Server/map names match only when that text appears in the key",
      "  --dry-run              List demos needing checkpoints without writing anything",
      "  --force                Regenerate even compatible sidecars",
      "  --concurrency=N        Parallel replay workers (default: 1)",
      "  --asset-root=PATH      Collision asset folder (default: docs/base)",
      "",
      "DEMO_CHECKPOINT_HEAP_MB sets each worker's old-space heap cap in MiB (default: 256).",
    ].join("\n"),
  );
  process.exit(0);
}
const concurrency = Number(values.concurrency);
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  console.error("--concurrency must be a positive integer");
  process.exit(1);
}
let checkpointCount: number;
try {
  checkpointCount = loadDemoCheckpointCount(
    values.count,
    values.count !== undefined ? "--count" : "DEMO_CHECKPOINT_COUNT",
  );
} catch (error) {
  console.error((error as Error).message);
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
      checkpointCount,
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

import { parseArgs } from "node:util";
import { listAllObjects, r2Client } from "./lib/r2.js";
import {
  isPublishedDemoMetadataKey,
  normalizeDemoMetadataCache,
} from "./lib/demoMetadataCache.js";

const { values } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    concurrency: { type: "string", default: "8" },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (values.help) {
  console.log(
    "Usage: node --env-file-if-exists=.env.development.local --import=tsx/esm scripts/normalize-demo-metadata-cache.ts [--apply] [--concurrency 8]",
  );
  console.log(
    "Dry-run by default. --apply conditionally changes only published metadata Cache-Control to no-cache.",
  );
  process.exit(0);
}
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32)
  throw new Error("--concurrency must be an integer from 1 to 32");

const { client, config } = r2Client();
try {
  const keys = (await listAllObjects(client, config))
    .map((object) => object.key)
    .filter((key) => isPublishedDemoMetadataKey(key, config.prefix))
    .sort();
  const counts = { current: 0, "needs-update": 0, updated: 0, failed: 0 };
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= keys.length) return;
        const key = keys[index];
        try {
          const result = await normalizeDemoMetadataCache(
            client,
            config,
            key,
            values.apply,
          );
          counts[result.status]++;
          if (result.status !== "current")
            console.log(`${result.status}: ${key}`);
        } catch (error) {
          counts.failed++;
          console.error(
            `failed: ${key} (${error instanceof Error ? error.name : "request failed"})`,
          );
        }
      }
    }),
  );
  console.log(
    `${values.apply ? "Apply" : "Dry run"}: ${keys.length} metadata objects; ${counts.current} current, ${counts["needs-update"]} need updates, ${counts.updated} updated, ${counts.failed} failed.`,
  );
  if (counts.failed) process.exitCode = 1;
} finally {
  client.destroy();
}

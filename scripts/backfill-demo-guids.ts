/** Write private GUID sidecars for demos already in R2. */
import path from "node:path";
import { parseArgs } from "node:util";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { readDemoNamesByGuid } from "../relay/demoAnalysis.js";
import { DEMO_GUIDS_SUFFIX } from "../relay/demoGuids.js";
import {
  PrivateDemoStore,
  loadPrivateDemoStorageConfig,
} from "../relay/privateDemoStore.js";
import { isPublishedDemoKey } from "../relay/demoKeys.js";
import type { DemoUploadConfig } from "../relay/demoUpload.js";
import { listAllObjects, r2Client } from "./lib/r2.js";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    prune: { type: "boolean", default: false },
    concurrency: { type: "string", default: "2" },
    filter: { type: "string" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    [
      "Usage: npm run demos:backfill-guids -- [options]",
      "",
      `Writes <demo>${DEMO_GUIDS_SUFFIX} (tag-less names by player GUID) to DEMO_PRIVATE_R2_BUCKET`,
      "for every published recording (relay demos and user uploads) that lacks one.",
      "",
      "  --filter=TEXT          Case-sensitive substring of the full R2 key, including the demo filename",
      "  --force                Rewrite existing sidecars",
      "  --prune                Delete sidecars whose recording is no longer in the demo bucket",
      "  --dry-run              List the work without writing or deleting anything",
      "  --concurrency=N        Demos processed at once (default: 2)",
    ].join("\n"),
  );
  process.exit(0);
}
const concurrency = Number(values.concurrency);
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  console.error("--concurrency must be a positive integer");
  process.exit(1);
}

const { client, config } = r2Client("npm run demos:backfill-guids");
let privateConfig: DemoUploadConfig | null;
try {
  privateConfig = loadPrivateDemoStorageConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
if (!privateConfig) {
  console.error("Missing DEMO_PRIVATE_R2_BUCKET.");
  process.exit(1);
}
const store = new PrivateDemoStore(privateConfig);

// Published recordings only; external-source caches are not part of the gallery.
const recordings = (await listAllObjects(client, config))
  .map(({ key }) => key)
  .filter((key) => isPublishedDemoKey(key.slice(config.prefix.length)));
const existing = new Set(await store.listDemoKeys(DEMO_GUIDS_SUFFIX));
const demos = recordings.filter(
  (key) => !values.filter || key.includes(values.filter),
);
const counts = {
  written: 0,
  current: 0,
  planned: 0,
  pruned: 0,
  failed: 0,
};

let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, demos.length) }, async () => {
    while (next < demos.length) {
      const key = demos[next++];
      const demoKey = key.slice(config.prefix.length);
      if (!values.force && existing.has(demoKey)) {
        counts.current++;
        continue;
      }
      if (values["dry-run"]) {
        counts.planned++;
        console.log(JSON.stringify({ key, action: "write" }));
        continue;
      }
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(5 * 60_000) },
        );
        if (!object.Body) throw new Error("Demo has no body");
        const namesByGuid = await readDemoNamesByGuid(
          await object.Body.transformToByteArray(),
          path.posix.basename(demoKey),
        );
        await store.put(demoKey, DEMO_GUIDS_SUFFIX, { namesByGuid });
        counts.written++;
        console.log(
          JSON.stringify({
            key,
            result: "written",
            guids: Object.keys(namesByGuid).length,
          }),
        );
      } catch (error) {
        counts.failed++;
        console.error(key, error);
      }
    }
  }),
);

if (values.prune) {
  const published = new Set(
    recordings.map((key) => key.slice(config.prefix.length)),
  );
  for (const demoKey of existing) {
    if (published.has(demoKey)) continue;
    if (values["dry-run"]) {
      counts.planned++;
      console.log(JSON.stringify({ demoKey, action: "prune" }));
      continue;
    }
    try {
      await store.delete(demoKey, DEMO_GUIDS_SUFFIX);
      counts.pruned++;
      console.log(JSON.stringify({ demoKey, result: "pruned" }));
    } catch (error) {
      counts.failed++;
      console.error(demoKey, error);
    }
  }
}

console.log(JSON.stringify({ demos: demos.length, ...counts }));
if (counts.failed) process.exitCode = 1;

/** Merge every private GUID sidecar into one GUID → tag-less names mapping. */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  DEMO_GUIDS_SUFFIX,
  withoutReconnectNames,
} from "../relay/demoGuids.js";
import {
  PrivateDemoStore,
  loadPrivateDemoStorageConfig,
} from "../relay/privateDemoStore.js";
import type { DemoUploadConfig } from "../relay/demoUpload.js";
import { collectDemoGuidInventory } from "../relay/demoGuidInventory.js";

const { values } = parseArgs({
  options: {
    output: { type: "string", short: "o" },
    "drop-reconnect-names": { type: "boolean", default: false },
    concurrency: { type: "string", default: "16" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    [
      "Usage: npm run demos:merge-guids -- [options]",
      "",
      `Reads every <demo>${DEMO_GUIDS_SUFFIX} in DEMO_PRIVATE_R2_BUCKET and prints`,
      '{ "namesByGuid": { "<guid>": ["<name>", …] } } with each GUID\'s unique',
      "tag-less names across all demos. Progress goes to stderr.",
      "",
      "  -o, --output=FILE      Write the JSON to FILE (owner-only permissions) instead of stdout",
      "  --drop-reconnect-names Omit NAME.1–NAME.9 when the GUID also used NAME: the server's",
      "                         rename of a lingering old connection when its player reconnects",
      "  --concurrency=N        Sidecars fetched at once (default: 16)",
    ].join("\n"),
  );
  process.exit(0);
}
const concurrency = Number(values.concurrency);
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  console.error("--concurrency must be a positive integer");
  process.exit(1);
}

let config: DemoUploadConfig | null;
try {
  config = loadPrivateDemoStorageConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
if (!config) {
  console.error(
    "Missing DEMO_PRIVATE_R2_BUCKET or DEMO_R2_* env vars. Run via `npm run demos:merge-guids` to load .env.development.local.",
  );
  process.exit(1);
}
const store = new PrivateDemoStore(config);

const {
  namesByGuid: merged,
  failed,
  sidecarCount,
} = await collectDemoGuidInventory(store, {
  concurrency,
  onError: (demoKey, error) => console.error(demoKey, error),
});
const namesByGuid = values["drop-reconnect-names"]
  ? withoutReconnectNames(merged)
  : merged;
const json = JSON.stringify({ namesByGuid }, null, 2);
if (values.output) {
  const output = path.resolve(values.output);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${json}\n`, { mode: 0o600 });
  // The mode above applies only to a new file.
  await fs.chmod(output, 0o600);
} else {
  process.stdout.write(`${json}\n`);
}
console.error(
  JSON.stringify({
    sidecars: sidecarCount,
    failed,
    guids: Object.keys(namesByGuid).length,
    names: Object.values(namesByGuid).flat().length,
    ...(values.output && { output: path.resolve(values.output) }),
  }),
);
if (failed) process.exitCode = 1;

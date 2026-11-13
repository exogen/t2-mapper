/** Store representative profiles for every GUID known to private demo sidecars. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  hasPendingAccountSchemaMigrations,
  openAccountDatabase,
  saveT2PlayerProfile,
} from "../relay/accountDatabase.js";
import type { DemoMetadata } from "../relay/demoMetadata.js";
import {
  PrivateDemoStore,
  loadPrivateDemoStorageConfig,
} from "../relay/privateDemoStore.js";
import { collectDemoGuidInventory } from "./lib/demoGuidInventory.js";
import { updatePlayerProfiles } from "../relay/playerProfileStore.js";
import { r2Client } from "./lib/r2.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      concurrency: { type: "string", default: "16" },
      demos: { type: "string", default: "10" },
      "suit-ups": { type: "string", default: "100" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(
      [
        "Usage: npm run demos:backfill-profiles -- [options]",
        "",
        "Collects every GUID from the same private sidecars as demos:merge-guids,",
        "then inserts or updates its representative profile in AUTH_DATABASE_PATH.",
        "Uses the same recent-demo selection and profile computation as",
        "demos:player-loadouts --store, including GUIDs without a linked account.",
        "GUIDs without usable current stats are skipped; their existing profiles remain.",
        "Each needed stats sidecar is read once for all its selected players.",
        "",
        "  --dry-run              Compute and report profiles without opening or writing SQLite",
        "  --concurrency=N        Sidecars fetched at once (default: 16)",
        "  --demos=N              Maximum recent demos per player (default: 10)",
        "  --suit-ups=N           Suit-up sample per player (default: 100)",
        "",
        "Reads DEMO_R2_*, DEMO_PRIVATE_R2_BUCKET and AUTH_DATABASE_PATH.",
        "Requires existing GUID and current stats sidecars; fill gaps with",
        "demos:backfill-guids and demos:backfill-stats first.",
        "Writes progress and a final count as JSON lines; errors go to stderr.",
      ].join("\n"),
    );
    return;
  }
  const concurrency = Number(values.concurrency);
  const demoCount = Number(values.demos);
  const suitUps = Number(values["suit-ups"]);
  for (const [name, value] of [
    ["--concurrency", concurrency],
    ["--demos", demoCount],
    ["--suit-ups", suitUps],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer`);
  }
  const computedAt = Date.now();

  const filename = path.resolve(
    process.env.AUTH_DATABASE_PATH || ".relay/accounts/app.sqlite",
  );
  let database: ReturnType<typeof openAccountDatabase> | undefined;
  try {
    if (!values["dry-run"]) {
      // Opening SQLite creates a file, so reject a missing or empty path first.
      if (!fs.existsSync(filename))
        throw new Error(`Account database not found: ${filename}`);
      const stat = fs.statSync(filename);
      if (!stat.isFile() || stat.size === 0)
        throw new Error(
          "Account database must be an existing nonempty SQLite file",
        );
      database = openAccountDatabase(filename);
      if (hasPendingAccountSchemaMigrations(database))
        throw new Error(
          "Account database has not been migrated yet. Start the relay with Discord sign-in enabled first.",
        );
    }

    const { client, config } = r2Client("npm run demos:backfill-profiles");
    const privateConfig = loadPrivateDemoStorageConfig();
    if (!privateConfig) throw new Error("Missing DEMO_PRIVATE_R2_BUCKET.");
    const store = new PrivateDemoStore(privateConfig);
    const inventory = await collectDemoGuidInventory(store, {
      concurrency,
      onError: (demoKey, error) => console.error(demoKey, error),
    });
    if (inventory.failed)
      throw new Error(
        `Could not read ${inventory.failed} GUID sidecars; no profiles were written.`,
      );
    const guids = Object.keys(inventory.namesByGuid);
    console.error(
      `Collected ${guids.length} GUIDs from ${inventory.sidecarCount} private sidecars.`,
    );

    const indexObject = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: `${config.prefix}index.json`,
      }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
    if (!indexObject.Body) throw new Error("Demo index has no body");
    const index = JSON.parse(
      await indexObject.Body.transformToString(),
    ) as DemoMetadata[];
    const missingGuids = index.filter(
      (record) => !inventory.sidecars.has(record.filename),
    ).length;
    if (missingGuids)
      console.error(
        `${missingGuids} demos have no GUID sidecar yet; run npm run demos:backfill-guids.`,
      );
    const counts = await updatePlayerProfiles({
      store,
      index,
      guids,
      guidSidecars: inventory.sidecars,
      demoCount,
      suitUps,
      concurrency,
      saveProfile: database
        ? (profile) => saveT2PlayerProfile(database!, profile)
        : undefined,
      onResult: (result) => console.log(JSON.stringify(result)),
      onError: (key, error) => console.error(key, error),
      computedAt,
    });
    if (counts.missingStats)
      console.error(
        `${counts.missingStats} demos have no current player stats yet; run npm run demos:backfill-stats.`,
      );
    console.log(JSON.stringify({ guids: guids.length, ...counts }));
    if (counts.failed) process.exitCode = 1;
  } finally {
    database?.close();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

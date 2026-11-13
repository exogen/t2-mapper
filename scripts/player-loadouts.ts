/**
 * A player's most common inventory loadouts, recent skins, kills, held
 * weapons and outfits, and their representative profile, from the private
 * stats of their most recent demos (found by GUID through the private GUID
 * sidecars). `--store` saves the profile to the account database.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { DEMO_GUIDS_SUFFIX, readDemoGuidSidecar } from "../relay/demoGuids.js";
import type { DemoMetadata } from "../relay/demoMetadata.js";
import {
  hasPendingAccountSchemaMigrations,
  openAccountDatabase,
  saveT2PlayerProfile,
} from "../relay/accountDatabase.js";
import {
  KILL_WEAPON_NAMES,
  PACK_NAMES,
  WEAPON_NAMES,
  describeLoadout,
  describeOutfit,
} from "../relay/demoPlayerStatsModel.js";
import { DEMO_STATS_SUFFIX, readCurrentDemoStats } from "../relay/demoStats.js";
import type { DemoUploadConfig } from "../relay/demoUpload.js";
import {
  PrivateDemoStore,
  loadPrivateDemoStorageConfig,
} from "../relay/privateDemoStore.js";
import { normalizePlayerGuid } from "../relay/shared.js";
import { r2Client } from "./lib/r2.js";
import {
  createProfileDemoSelector,
  isCTFDemo,
  summarizePlayerProfile,
  type PlayerProfileDemo,
} from "../relay/playerProfiles.js";

/** GUID sidecars read at once while searching for the player's demos. */
const SEARCH_BATCH = 16;
const RECENT_SKINS = 3;
const DEFAULT_SKIN = "base";

const { values } = parseArgs({
  options: {
    guid: { type: "string" },
    demos: { type: "string", default: "10" },
    "suit-ups": { type: "string", default: "100" },
    top: { type: "string", default: "15" },
    json: { type: "boolean", default: false },
    store: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
const guid = normalizePlayerGuid(values.guid);
const demoCount = Number(values.demos);
const suitUps = Number(values["suit-ups"]);
const top = Number(values.top);
if (values.help || !guid) {
  console.log(
    [
      "Usage: npm run demos:player-loadouts -- --guid <GUID> [options]",
      "",
      "Reads the private stats of the player's most recent Capture the Flag demos",
      "(LCTF has no inventory stations), filling any shortfall with their most",
      "recent other demos. Reports their recent custom skins across those demos,",
      "and kills by weapon, weapons held, outfits worn, and loadouts bought at",
      "full and deployable inventory stations from the newest demos until the",
      "suit-up sample is complete, plus the representative profile built from",
      "them. A loadout's weapons are the ones seen held before the next purchase",
      "or death.",
      "",
      "  --demos=N              Demos to read at most (default: 10)",
      "  --suit-ups=N           Stop adding demos once this many loadouts are in (default: 100)",
      "  --top=N                Rows listed per table (default: 15)",
      "  --json                 Print every tally as JSON",
      "  --store                Save the profile to the account database (AUTH_DATABASE_PATH)",
    ].join("\n"),
  );
  process.exit(values.help ? 0 : 1);
}
for (const [name, value] of [
  ["--demos", demoCount],
  ["--suit-ups", suitUps],
  ["--top", top],
] as const) {
  if (!Number.isSafeInteger(value) || value < 1) {
    console.error(`${name} must be a positive integer`);
    process.exit(1);
  }
}

const computedAt = Date.now();
const { client, config } = r2Client("npm run demos:player-loadouts");
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

const names = new Set<string>();
const withoutGuids = new Set<string>();

const guidSidecars = new Map<string, Promise<unknown>>();
function readGuids(filename: string): Promise<unknown> {
  let read = guidSidecars.get(filename);
  if (!read)
    guidSidecars.set(
      filename,
      (read = store.read(filename, DEMO_GUIDS_SUFFIX)),
    );
  return read;
}

/** The first `wanted` demos in `candidates` whose GUID sidecar lists the player. */
async function findAppearances(
  candidates: DemoMetadata[],
  wanted: number,
): Promise<DemoMetadata[]> {
  const found: DemoMetadata[] = [];
  for (
    let offset = 0;
    offset < candidates.length && found.length < wanted;
    offset += SEARCH_BATCH
  ) {
    const batch = candidates.slice(offset, offset + SEARCH_BATCH);
    const sidecars = await Promise.all(
      batch.map((record) => readGuids(record.filename)),
    );
    for (const [i, value] of sidecars.entries()) {
      if (value == null) {
        withoutGuids.add(batch[i].filename);
        continue;
      }
      const playerNames = readDemoGuidSidecar(value).namesByGuid[guid!];
      if (!playerNames || found.length >= wanted) continue;
      found.push(batch[i]);
      for (const name of playerNames) names.add(name);
    }
  }
  return found;
}

const indexObject = await client.send(
  new GetObjectCommand({
    Bucket: config.bucket,
    Key: `${config.prefix}index.json`,
  }),
  { abortSignal: AbortSignal.timeout(60_000) },
);
const index = JSON.parse(
  await indexObject.Body!.transformToString(),
) as DemoMetadata[];
const { selected, lastSeen } = await createProfileDemoSelector(index)(
  findAppearances,
  demoCount,
);
if (!selected.length) {
  console.error(`No published demos include GUID ${guid}.`);
  process.exit(1);
}
if (withoutGuids.size)
  console.error(
    `${withoutGuids.size} demos have no GUID sidecar yet; run npm run demos:backfill-guids.`,
  );

const sidecars = await Promise.all(
  selected.map(async (record) => {
    const value = await store.read(record.filename, DEMO_STATS_SUFFIX);
    return readCurrentDemoStats(value);
  }),
);
const missingStats: string[] = [];
const playerDemos: PlayerProfileDemo[] = [];
for (const [i, record] of selected.entries()) {
  const sidecar = sidecars[i];
  if (!sidecar) missingStats.push(record.filename);
  else if (sidecar.statsByGuid[guid])
    playerDemos.push({
      record,
      recordedAt: record.recordedAt,
      stats: sidecar.statsByGuid[guid],
    });
}
if (missingStats.length)
  console.error(
    `${missingStats.length} demos have no current player stats yet; run npm run demos:backfill-stats.`,
  );
const result = summarizePlayerProfile(
  guid,
  playerDemos,
  lastSeen,
  suitUps,
  computedAt,
);
if (!result) process.exit(1);
const { stats, used, profile } = result;

if (values.store) {
  const filename = path.resolve(
    process.env.AUTH_DATABASE_PATH || ".relay/accounts/app.sqlite",
  );
  // Never create a fresh database for a mistyped path.
  if (!fs.existsSync(filename)) {
    console.error(`Account database not found: ${filename}`);
    process.exit(1);
  }
  const database = openAccountDatabase(filename);
  const migrated = !hasPendingAccountSchemaMigrations(database);
  if (migrated) saveT2PlayerProfile(database, profile);
  database.close();
  if (!migrated) {
    console.error(
      "Account database has not been migrated yet. Start the relay with Discord sign-in enabled first.",
    );
    process.exit(1);
  }
  console.error(`Stored the profile for GUID ${guid} in ${filename}.`);
}

const sorted = (counts: Map<string, number>) =>
  Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
const usedCTF = used.filter(isCTFDemo).length;
const summary = {
  guid,
  names: [...names].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  ),
  demos: {
    selected: selected.length,
    sampled: used.length,
    ctf: usedCTF,
    other: used.length - usedCTF,
    newest: used[0].recordedAt,
    oldest: used[used.length - 1].recordedAt,
    missingStats,
  },
  suitUps: stats.suitUps,
  skins: stats.looks
    .filter(({ skin }) => skin.toLowerCase() !== DEFAULT_SKIN)
    .slice(0, RECENT_SKINS),
  kills: sorted(stats.kills),
  weaponsHeldSec: sorted(stats.weaponsHeldSec),
  wornSec: sorted(stats.wornSec),
  loadouts: {
    inventory: sorted(stats.invLoadouts),
    deployable: sorted(stats.deployInvLoadouts),
  },
  profile,
};

if (values.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const table = (
    counts: Record<string, number>,
    label: (key: string) => string,
    format = (n: number) => String(n),
  ) => {
    const rows = Object.entries(counts).map(
      ([key, n]) => [label(key), n] as const,
    );
    if (!rows.length) return ["  (none)"];
    const width = Math.max(
      ...rows.slice(0, top).map(([, n]) => format(n).length),
    );
    return [
      ...rows
        .slice(0, top)
        .map(([key, n]) => `  ${format(n).padStart(width)}  ${key}`),
      ...(rows.length > top ? [`  … ${rows.length - top} more`] : []),
    ];
  };
  const total = (counts: Record<string, number>) =>
    Object.values(counts).reduce((a, b) => a + b, 0);
  const day = (iso: string) => iso.slice(0, 10);
  const minutes = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const sources = {
    inv: "bought at full stations",
    deployInv: "bought at deployable stations",
    worn: "worn; no station purchases seen",
  };
  console.log(
    [
      `GUID ${guid}: ${summary.names.join(", ")}`,
      `Demos: sampled ${used.length} of ${selected.length} (${usedCTF} CTF, ${summary.demos.other} other), ${day(summary.demos.oldest)} to ${day(summary.demos.newest)}`,
      `Last seen: ${profile.lastSeenAt == null ? "unknown" : day(new Date(profile.lastSeenAt).toISOString())}`,
      `Suit-ups: ${stats.suitUps}`,
      "",
      "Representative profile",
      `  Body: ${profile.bodyType ?? "unknown"}, skin: ${profile.skin ?? "unknown"}`,
      `  Loadout: ${profile.armor ?? "unknown"} · ${profile.pack ? (PACK_NAMES.get(profile.pack) ?? profile.pack) : "No Pack"} · ${profile.weapon ? (WEAPON_NAMES.get(profile.weapon) ?? profile.weapon) : "unknown"}${profile.loadoutSource ? ` (${sources[profile.loadoutSource]})` : ""}`,
      "",
      "Recent custom skins (newest first)",
      ...(summary.skins.length
        ? summary.skins.map(
            ({ raceGender, skin, recordedAt }) =>
              `  ${raceGender ? `${raceGender} • ` : ""}${skin} (${day(recordedAt)})`,
          )
        : ["  (none)"]),
      "",
      `Kills by weapon (${total(summary.kills)})`,
      ...table(
        summary.kills,
        (weapon) => KILL_WEAPON_NAMES.get(weapon.toLowerCase()) ?? weapon,
      ),
      "",
      "Weapons held (m:ss)",
      ...table(
        summary.weaponsHeldSec,
        (shape) => WEAPON_NAMES.get(shape) ?? shape,
        minutes,
      ),
      "",
      "Outfits worn (m:ss)",
      ...table(summary.wornSec, describeOutfit, minutes),
      "",
      `Inventory station loadouts (${total(summary.loadouts.inventory)})`,
      ...table(summary.loadouts.inventory, describeLoadout),
      "",
      `Deployable inventory loadouts (${total(summary.loadouts.deployable)})`,
      ...table(summary.loadouts.deployable, describeLoadout),
    ].join("\n"),
  );
}

/**
 * Backfill the per-game `tournament` flag onto demos already uploaded to
 * R2. For each entry in `index.json`, download its `.rec`, detect whether
 * any mission ran in tournament mode (the "Server is Running in
 * Tournament Mode" BottomPrint — the same signal the live relay uses),
 * and write the flag onto the sidecar (`.rec.json`) and the aggregated
 * `index.json`.
 *
 * Reads R2 config from the DEMO_R2_* env vars (same as the relay). Dry
 * run by default — set APPLY=1 to actually write. Optional LIMIT=N and
 * FILTER=<substring> narrow the set (handy for verifying detection).
 *
 * Usage (locally or on the relay box, both have creds + t2-demo-parser):
 *   APPLY=1 npx tsx scripts/backfill-demo-tournament.ts
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { DemoParser, BlockTypeMove, BlockTypePacket } from "t2-demo-parser";
import type { DemoMetadata } from "../relay/demoRecorder.js";

const endpoint = process.env.DEMO_R2_ENDPOINT;
const bucket = process.env.DEMO_R2_BUCKET;
const accessKeyId = process.env.DEMO_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.DEMO_R2_SECRET_ACCESS_KEY;
const prefix = process.env.DEMO_R2_PREFIX ?? "demos/";
if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  console.error(
    "Missing DEMO_R2_ENDPOINT / DEMO_R2_BUCKET / DEMO_R2_ACCESS_KEY_ID / DEMO_R2_SECRET_ACCESS_KEY",
  );
  process.exit(1);
}
const apply = process.env.APPLY === "1" || process.env.APPLY === "true";
const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const filter = process.env.FILTER ?? "";

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

/** Mirror of streamHelpers.resolveNetString / watchState.resolveNetString. */
function resolveNet(s: string, netStrings: Map<number, string>): string {
  if (s.length >= 2 && s.charCodeAt(0) === 1) {
    const id = parseInt(s.slice(1), 10);
    if (Number.isFinite(id)) return netStrings.get(id) ?? s;
  }
  return s;
}

/** True if the recording carries the tournament-mode join banner. */
async function detectTournament(bytes: Uint8Array): Promise<boolean> {
  const parser = new DemoParser(bytes);
  const { initialBlock } = await parser.load();
  const netStrings = new Map<number, string>();
  for (const [id, value] of initialBlock.taggedStrings) netStrings.set(id, value);
  const registry = parser.getRegistry();
  while (true) {
    let block;
    try {
      block = parser.nextBlock();
    } catch {
      break; // Parser cursor unknown after a throw — stop.
    }
    if (!block) break;
    if (block.type === BlockTypeMove) continue;
    if (block.type !== BlockTypePacket || !block.parsed) continue;
    const packet = block.parsed as {
      events?: Array<{ classId: number; parsedData?: Record<string, unknown> }>;
    };
    if (!packet.events) continue;
    for (const evt of packet.events) {
      const pd = evt.parsedData;
      if (!pd) continue;
      if (pd.type === "NetStringEvent") {
        if (pd.value != null) netStrings.set(pd.id as number, pd.value as string);
        continue;
      }
      const eventName = registry.getEventParser(evt.classId)?.name;
      if (pd.type !== "RemoteCommandEvent" && eventName !== "RemoteCommandEvent")
        continue;
      const funcName = resolveNet((pd.funcName as string) ?? "", netStrings);
      const args = pd.args as string[] | undefined;
      if (funcName === "BottomPrint" && args && args.length >= 1) {
        if (
          /Server is Running in Tournament Mode/i.test(
            resolveNet(args[0], netStrings),
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

async function getBytes(key: string): Promise<Uint8Array> {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return res.Body!.transformToByteArray();
}

async function main(): Promise<void> {
  const indexText = await (
    await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: `${prefix}index.json` }),
    )
  ).Body!.transformToString();
  const index = JSON.parse(indexText) as DemoMetadata[];
  console.log(
    `${index.length} demos in index — ${apply ? "APPLY" : "dry run"}${
      filter ? `, filter="${filter}"` : ""
    }`,
  );

  let scanned = 0;
  let changed = 0;
  const results = new Map<string, boolean>();
  for (const entry of index) {
    if (scanned >= limit) break;
    if (filter && !entry.filename.includes(filter)) continue;
    scanned++;
    let tournament: boolean;
    try {
      tournament = await detectTournament(await getBytes(`${prefix}${entry.filename}`));
    } catch (err) {
      console.warn(`  SKIP ${entry.filename}: ${(err as Error).message}`);
      continue;
    }
    const before = entry.games.some((g) => g.tournament);
    if (tournament !== before) changed++;
    console.log(
      `  ${tournament ? "🏅" : "  "} ${before === tournament ? " " : "*"} ${entry.filename}`,
    );
    for (const g of entry.games) g.tournament = tournament;
    results.set(entry.filename, tournament);
    if (apply && tournament !== before) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${prefix}${entry.filename}.json`,
          Body: JSON.stringify(entry, null, 2),
          ContentType: "application/json",
        }),
      );
    }
  }

  console.log(`Scanned ${scanned}, ${changed} changed.`);
  if (apply && changed > 0) {
    // Re-fetch and merge by filename so any entry the relay's uploader
    // appended while we were scanning survives our write.
    const freshText = await (
      await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: `${prefix}index.json` }),
      )
    ).Body!.transformToString();
    const fresh = JSON.parse(freshText) as DemoMetadata[];
    for (const entry of fresh) {
      const t = results.get(entry.filename);
      if (t === undefined) continue;
      for (const g of entry.games) g.tournament = t;
    }
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}index.json`,
        Body: JSON.stringify(fresh, null, 2),
        ContentType: "application/json",
        CacheControl: "no-cache",
      }),
    );
    console.log("index.json updated.");
  }
}

await main();

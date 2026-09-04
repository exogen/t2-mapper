/**
 * List the demos in the bucket, newest last, optionally filtered by a
 * substring of the key.
 *
 *   node --env-file-if-exists=.env.development.local --import=tsx/esm scripts/list-demos.ts [<substring>] [--last N]
 */
import { arg, positionals } from "./lib/args";
import { listAllObjects, r2Client } from "./lib/r2";

const [needle] = positionals();
const last = Number(arg("last", "0"));
const { client, config } = r2Client();
const recs = (await listAllObjects(client, config))
  .filter((o) => o.key.endsWith(".rec") && (!needle || o.key.includes(needle)))
  .sort((a, b) => a.key.localeCompare(b.key));
for (const o of last > 0 ? recs.slice(-last) : recs) {
  console.log(`${(o.size / 1e6).toFixed(1).padStart(6)} MB  ${o.key}`);
}

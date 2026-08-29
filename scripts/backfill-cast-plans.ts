/**
 * Backfill CastGenius auto-director plans for the demos in R2: for each
 * `.rec` without a `<key>.cast.json` sidecar, run the director scan +
 * planner and upload the plan (shots, coverage, and the per-shot
 * commentary scenes) as JSON.
 *
 * The SCAN needs the app: mid-air kill detection raycasts the mission's
 * terrain/interior collision world, which only exists once the app has
 * loaded the map — a bare-node scan would silently mark every death
 * airborne. So this drives a headless browser against a running app
 * (dev server or preview build) per demo, stages the .rec into public/,
 * and harvests demoDirectorStore's plan — the same code path the
 * CastGenius button runs, scenes included.
 *
 * R2 credentials come from the same DEMO_R2_* env vars as the relay:
 *   npm run backfill-casts [-- --dry-run --force --app http://localhost:3000]
 * Run from the repository root with the dev server up. Idempotent:
 * existing sidecars are skipped unless --force.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import puppeteer, { type Browser } from "puppeteer";
import { loadUploadConfig } from "../relay/demoUpload.js";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    app: { type: "string", default: "http://localhost:3000" },
    "fix-headers": { type: "boolean", default: false },
    limit: { type: "string" },
    /** Only process .rec keys containing this substring (use with
     *  --force to regenerate one demo's sidecar). */
    only: { type: "string" },
    /** Write the sidecar to this local file INSTEAD of uploading — for
     *  staging a synchronized multi-sidecar upload later. */
    out: { type: "string" },
    help: { type: "boolean", default: false, short: "h" },
  },
});

if (values.help) {
  console.error(
    "Usage: npm run backfill-casts [-- --dry-run --force --app <url> --limit <n>]",
  );
  process.exit(1);
}

const config = loadUploadConfig();
if (!config) {
  console.error(
    "Missing DEMO_R2_* env vars (endpoint, bucket, access key, secret).",
  );
  console.error(
    "Run via `npm run backfill-casts` to load .env.development.local.",
  );
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: config.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

/** The sidecar format version — bump when the plan/scene schema changes
 *  incompatibly so consumers and re-backfills can tell them apart. */
const CAST_FORMAT_VERSION = 1;

/** Browsers/CDNs may cache sidecars for 15 minutes — long enough to be
 *  cheap, short enough that regenerated plans propagate quickly. */
const CAST_CACHE_CONTROL = "public, max-age=900";

async function listKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config!.bucket,
        Prefix: config!.prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const item of res.Contents ?? []) {
      if (item.Key) keys.add(item.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function planInBrowser(
  browser: Browser,
  appUrl: string,
  recName: string,
): Promise<string> {
  const page = await browser.newPage();
  try {
    page.on("pageerror", (e) =>
      console.error(`  [page] ${e instanceof Error ? e.message : e}`),
    );
    await page.goto(`${appUrl}/?mode=demo`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 2000));
    // Passed as a source STRING: tsx's transpile of an inline callback
    // injects esbuild helpers (__name) that don't exist in the page.
    const script = `(async () => {
      const urls = performance.getEntriesByType("resource").map((r) => r.name);
      const resolve = (p) => urls.find((n) => n.includes(p)) ?? p;
      const loader = await import(resolve("/src/stream/demoFileLoader"));
      const director = await import(resolve("/src/state/demoDirectorStore"));
      const engine = await import(resolve("/src/state/engineStore"));
      await loader.loadDemoUrl(${JSON.stringify(`/${recName}`)});
      await new Promise((res, rej) => {
        const t0 = Date.now();
        const poll = () => {
          if (engine.engineStore.getState().playback.recording != null) res();
          else if (Date.now() - t0 > 180000) rej(new Error("load timeout"));
          else setTimeout(poll, 250);
        };
        poll();
      });
      void director.startDirector();
      await new Promise((res, rej) => {
        const t0 = Date.now();
        const poll = () => {
          const st = director.demoDirectorStore.getState();
          if (st.status === "playing" || st.status === "ready") res();
          else if (st.status === "error") rej(new Error(st.error ?? "scan failed"));
          else if (Date.now() - t0 > 1200000) rej(new Error("scan timeout"));
          else setTimeout(poll, 500);
        };
        poll();
      });
      return JSON.stringify(director.demoDirectorStore.getState().plan);
    })()`;
    return (await page.evaluate(script)) as string;
  } finally {
    await page.close();
  }
}

/** Re-stamp Cache-Control on existing sidecars (self-copy with
 *  metadata replace) — for sidecars written before the header existed. */
async function fixHeaders(): Promise<void> {
  const keys = await listKeys();
  const sidecars = [...keys].filter((k) => k.endsWith(".cast.json")).sort();
  console.log(`${sidecars.length} sidecars to re-stamp`);
  for (const key of sidecars) {
    await client.send(
      new CopyObjectCommand({
        Bucket: config!.bucket,
        CopySource: `${config!.bucket}/${encodeURIComponent(key)}`,
        Key: key,
        MetadataDirective: "REPLACE",
        ContentType: "application/json",
        CacheControl: CAST_CACHE_CONTROL,
      }),
    );
    console.log(`  stamped ${key}`);
  }
}

async function main(): Promise<void> {
  if (values["fix-headers"]) {
    await fixHeaders();
    return;
  }
  const keys = await listKeys();
  const recs = [...keys]
    .filter((k) => k.endsWith(".rec"))
    .filter((k) => !values.only || k.includes(values.only))
    .sort();
  const todo = recs.filter((k) => values.force || !keys.has(`${k}.cast.json`));
  const limit = values.limit ? parseInt(values.limit, 10) : Infinity;
  console.log(
    `${recs.length} demos, ${todo.length} without cast plans${
      Number.isFinite(limit) ? `, limiting to ${limit}` : ""
    }`,
  );
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--no-sandbox"],
  });
  let done = 0;
  let failed = 0;
  try {
    for (const key of todo.slice(0, limit)) {
      const staged = path.join(
        "public",
        `cast-backfill-${process.pid}${path.extname(key) || ".rec"}`,
      );
      try {
        console.log(
          `[${done + failed + 1}/${Math.min(todo.length, limit)}] ${key}`,
        );
        const object = await client.send(
          new GetObjectCommand({ Bucket: config!.bucket, Key: key }),
        );
        const bytes = await object.Body!.transformToByteArray();
        await fs.writeFile(staged, bytes);
        const planJson = await planInBrowser(
          browser,
          values.app!,
          path.basename(staged),
        );
        if (planJson === "null") throw new Error("no plan produced");
        const sidecar = JSON.stringify({
          format: "castgenius-plan",
          version: CAST_FORMAT_VERSION,
          demo: path.basename(key),
          plan: JSON.parse(planJson),
        });
        if (values.out) {
          await fs.writeFile(values.out, sidecar);
          console.log(`  staged ${values.out} (${sidecar.length} bytes)`);
        } else if (values["dry-run"]) {
          console.log(
            `  dry-run: would write ${key}.cast.json (${sidecar.length} bytes)`,
          );
        } else {
          await client.send(
            new PutObjectCommand({
              Bucket: config!.bucket,
              Key: `${key}.cast.json`,
              Body: sidecar,
              ContentType: "application/json",
              // Short-lived cache: regenerating after director changes
              // must propagate within minutes, not until a CDN expiry.
              CacheControl: CAST_CACHE_CONTROL,
            }),
          );
          console.log(`  wrote ${key}.cast.json (${sidecar.length} bytes)`);
        }
        done++;
      } catch (err) {
        failed++;
        console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
      } finally {
        await fs.rm(staged, { force: true });
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`done: ${done} written, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();

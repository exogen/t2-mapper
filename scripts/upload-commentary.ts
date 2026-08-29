/**
 * Upload a rendered commentary track to R2 as a demo sidecar:
 * `<recKey>.commentary.mp3`, next to the `.cast.json` plan — plus the
 * cue transcript as `<recKey>.commentary.json` (the app reads the
 * first cue's atSec to start the broadcast where the intro begins,
 * and it's the future source for captions).
 *
 *   npm run upload-commentary -- <audio.mp3> <recKeyOrSuffix>
 *
 * The cue JSON is expected next to the audio (<audio minus .mp3>.json,
 * the render script's input). The second argument may be the full .rec
 * key or any unique suffix of one (e.g. "raindance-nef_d8841a.rec");
 * the bucket is listed to resolve and verify it. Same DEMO_R2_* env
 * vars as the relay.
 */
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadUploadConfig } from "../relay/demoUpload.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    /** Also upload this local cast plan as <recKey>.cast.json — LAST,
     *  as the commit point: consumers read the cast first, so the tiny
     *  plan flipping after the big audio minimizes the window where a
     *  new cast could pair with old commentary. */
    cast: { type: "string" },
  },
});
if (positionals.length !== 2) {
  console.error(
    "usage: npm run upload-commentary -- <audio.mp3> <recKeyOrSuffix>",
  );
  process.exit(1);
}
const [audioPath, keyArg] = positionals;

const config = loadUploadConfig();
if (!config) {
  console.error(
    "Missing DEMO_R2_* env vars — run via `npm run upload-commentary`.",
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

async function main(): Promise<void> {
  const keys: string[] = [];
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
      if (item.Key?.endsWith(".rec")) keys.push(item.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  const matches = keys.filter((k) => k === keyArg || k.endsWith(keyArg));
  if (matches.length !== 1) {
    console.error(
      matches.length === 0
        ? `no .rec key matches "${keyArg}"`
        : `"${keyArg}" is ambiguous: ${matches.join(", ")}`,
    );
    process.exit(1);
  }

  const body = await fs.readFile(audioPath);
  const key = `${matches[0]}.commentary.mp3`;
  await client.send(
    new PutObjectCommand({
      Bucket: config!.bucket,
      Key: key,
      Body: body,
      ContentType: "audio/mpeg",
      // no-cache = cache but revalidate (ETag 304 when unchanged), so a
      // regenerated track is heard immediately — a stale 40MB audio
      // file mid-iteration is far more noticeable than a stale plan.
      CacheControl: "no-cache",
    }),
  );
  console.log(`wrote ${key} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);

  const cuePath = audioPath.replace(/\.mp3$/, ".json");
  try {
    const cues = await fs.readFile(cuePath);
    const cueKey = `${matches[0]}.commentary.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: config!.bucket,
        Key: cueKey,
        Body: cues,
        ContentType: "application/json",
        CacheControl: "no-cache",
      }),
    );
    console.log(`wrote ${cueKey} (${cues.length} bytes)`);
  } catch {
    console.warn(`no cue transcript at ${cuePath} — skipped .commentary.json`);
  }

  if (values.cast) {
    const cast = await fs.readFile(values.cast);
    const castKey = `${matches[0]}.cast.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: config!.bucket,
        Key: castKey,
        Body: cast,
        ContentType: "application/json",
        CacheControl: "public, max-age=900",
      }),
    );
    console.log(`wrote ${castKey} (${cast.length} bytes) — sidecar set live`);
  }
}

void main();

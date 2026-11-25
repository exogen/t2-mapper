import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { expect, it } from "vitest";
import { backfillClipCheckpoint } from "./backfillClipCheckpoint.js";
import { prepareClipCheckpoint } from "../../relay/clipCheckpoint.js";
import {
  DemoFileWriter,
  buildInitialBlock,
  buildDemoValues,
} from "../../relay/demoWriter.js";

it("produces the same exact-start bytes as Save clip and repairs only unusable artifacts", async () => {
  const config = {
    prefix: "demos/",
    bucket: "public",
    endpoint: "https://storage.invalid",
    accessKeyId: "key",
    secretAccessKey: "secret",
  };
  const timelineKey = "demos/clips/clip/timeline.json";
  const checkpointKey = "demos/clips/clip/checkpoint.json";
  const objects = new Map<
    string,
    { body: Buffer; etag: string; metadata?: Record<string, string> }
  >();
  let writes = 0;
  const client = {
    send: async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        const { Key, IfMatch, IfNoneMatch, Metadata, Body } = command.input;
        const old = objects.get(Key!);
        expect(old ? IfMatch : IfNoneMatch).toBe(old?.etag ?? "*");
        const etag = `"saved-${++writes}"`;
        objects.set(Key!, {
          body: Buffer.from(String(Body)),
          etag,
          metadata: Metadata,
        });
        return { ETag: etag };
      }
      if (!(
        command instanceof HeadObjectCommand ||
        command instanceof GetObjectCommand
      ))
        throw new Error("Unexpected storage operation");
      const object = objects.get(command.input.Key!);
      if (!object)
        throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
      if (command.input.IfMatch)
        expect(command.input.IfMatch).toBe(object.etag);
      return {
        ETag: object.etag,
        Metadata: object.metadata,
        ContentLength: object.body.length,
        Body: Object.assign(Readable.from([object.body]), {
          transformToByteArray: async () => object.body,
          transformToString: async () => object.body.toString(),
          transformToWebStream: () =>
            new Blob([Uint8Array.from(object.body)]).stream(),
        }),
      };
    },
  } as unknown as S3Client;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "backfill-clip-check-"));
  try {
    const writeRecording = async (recorderName: string) => {
      const file = path.join(dir, `${recorderName}.rec`);
      const writer = new DemoFileWriter(file, { flushIntervalMs: 0 });
      writer.begin(
        buildInitialBlock({
          connectSequence: 1,
          missionName: "Katabatic",
          demoValues: buildDemoValues({
            recorderName,
            serverName: "Test",
            serverAddress: "127.0.0.1:28000",
            date: new Date(0),
            missionDisplayName: "Katabatic",
            mod: "base",
            gameType: "Capture the Flag",
          }),
        }),
      );
      for (let i = 0; i < 8; i++) writer.writeMove();
      await writer.finalize(256);
      return fs.readFile(file);
    };
    const sourceDemo = "sample.rec",
      sourceETag = '"source"',
      startSec = 0.065,
      endSec = 0.201;
    const sourceKey = "demos/" + sourceDemo;
    const source = { etag: sourceETag, body: await writeRecording("Observer") };
    objects.set(sourceKey, source);
    const live = await prepareClipCheckpoint({
      config,
      client,
      sourceDemo,
      sourceETag,
      startSec,
      endSec,
      assetRoot: dir,
    });
    const samples = [startSec, endSec].map((demoTimeSec, i) => ({
      timeMs: 1000 * i,
      demoTimeSec,
      position: [0, 0, 10],
      quaternion: [0, 0, 0, 1],
      fov: 60,
      aspect: 16 / 9,
      projection: "perspective",
      cameraMode: "freeFly",
      targetId: null,
      flagSlot: null,
      rate: 1,
      playing: true,
    }));
    objects.set(timelineKey, {
      etag: '"timeline"',
      body: Buffer.from(JSON.stringify({ version: 1, sourceDemo, samples })),
    });
    const options = {
      config,
      client,
      timelineKey,
      assetRoot: dir,
      force: false,
      dryRun: false,
    };
    expect(
      await backfillClipCheckpoint({ ...options, filter: "other.rec" }),
    ).toBe("filtered");
    expect(await backfillClipCheckpoint({ ...options, dryRun: true })).toBe(
      "planned",
    );
    expect(writes).toBe(0);
    expect(
      await backfillClipCheckpoint({ ...options, filter: sourceDemo }),
    ).toBe("published");
    const saved = objects.get(checkpointKey)!;
    expect(saved.body.toString()).toBe(live.text);
    expect(await backfillClipCheckpoint(options)).toBe("current");
    delete saved.metadata;
    expect(await backfillClipCheckpoint(options)).toBe("current");
    const stale = JSON.parse(live.text);
    stale.version--;
    saved.body = Buffer.from(JSON.stringify(stale));
    expect(await backfillClipCheckpoint({ ...options, dryRun: true })).toBe(
      "planned",
    );
    // The old version cannot restore, but its source identity is still binding.
    objects.set(sourceKey, {
      etag: '"replacement"',
      body: await writeRecording("Recorder"),
    });
    for (const force of [false, true]) {
      await expect(
        backfillClipCheckpoint({ ...options, force }),
      ).rejects.toThrow("The clip source recording changed");
    }
    expect(writes).toBe(1);
    objects.set(sourceKey, source);
    saved.body = Buffer.from('{"incomplete"');
    expect(await backfillClipCheckpoint(options)).toBe("published");
    expect(objects.get(checkpointKey)!.body.toString()).toBe(live.text);
    expect(writes).toBe(2);

    const wrongDigest = "0".repeat(64);
    objects.get(checkpointKey)!.metadata!["demo-sha256"] = wrongDigest;
    await expect(
      backfillClipCheckpoint({ ...options, force: true }),
    ).rejects.toThrow("The clip source recording changed");
    expect(writes).toBe(2);

    objects.get(timelineKey)!.metadata = { "demo-etag": sourceETag };
    expect(await backfillClipCheckpoint({ ...options, force: true })).toBe(
      "published",
    );
    const repaired = objects.get(checkpointKey)!;
    expect(repaired.metadata?.["demo-sha256"]).toBe(live.sourceSha256);

    delete repaired.metadata;
    const mismatched = JSON.parse(live.text);
    mismatched.demoSha256 = wrongDigest;
    repaired.body = Buffer.from(JSON.stringify(mismatched));
    expect(await backfillClipCheckpoint(options)).toBe("published");
    expect(objects.get(checkpointKey)!.body.toString()).toBe(live.text);
    expect(writes).toBe(4);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}, 20_000);

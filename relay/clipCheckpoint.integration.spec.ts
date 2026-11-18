import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { expect, it, vi } from "vitest";
import { prepareClipCheckpoint } from "./clipCheckpoint.js";
import {
  DemoFileWriter,
  buildDemoValues,
  buildInitialBlock,
} from "./demoWriter.js";
import { readDemoCheckpoints } from "../src/stream/demoCheckpoints";

it.each([0.065, 0.09])(
  "prepares and restores a real clip checkpoint through the isolated worker (end=%s)",
  async (endSec) => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "clip-checkpoint-integration-"),
    );
    try {
      const input = path.join(directory, "source.rec");
      const writer = new DemoFileWriter(input, { flushIntervalMs: 0 });
      writer.begin(
        buildInitialBlock({
          connectSequence: 1,
          missionName: "Katabatic",
          demoValues: buildDemoValues({
            recorderName: "Observer",
            serverName: "Test",
            serverAddress: "127.0.0.1:28000",
            date: new Date(),
            missionDisplayName: "Katabatic",
            mod: "base",
            gameType: "Capture the Flag",
          }),
        }),
      );
      for (let tick = 0; tick < 5; tick++) writer.writeMove();
      await writer.finalize(160);
      const bytes = await fs.readFile(input);
      const etag = '"integration"';
      const send = vi.fn(async (command: unknown) => {
        if (command instanceof HeadObjectCommand)
          return { ETag: etag, ContentLength: bytes.length };
        if (command instanceof GetObjectCommand)
          return { ETag: etag, Body: Readable.from([bytes]) };
        throw new Error("Unexpected storage operation");
      });
      const checkpoint = await prepareClipCheckpoint({
        config: {
          endpoint: "https://storage.invalid",
          bucket: "public",
          prefix: "demos/",
          accessKeyId: "key",
          secretAccessKey: "secret",
        },
        client: { send } as unknown as S3Client,
        sourceDemo: "source.rec",
        sourceETag: etag,
        startSec: 0.065,
        endSec,
        assetRoot: "/absent-assets",
      });
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const loaded = await readDemoCheckpoints(checkpoint.text, buffer);
      expect(loaded[0].cursor.latency?.sendTicks).toHaveLength(32);
      expect(loaded.map((entry) => entry.cursor.moveTicks)).toEqual([2]);
      expect(checkpoint.sourceBytes).toBe(bytes.length);
      expect(checkpoint.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
  20_000,
);

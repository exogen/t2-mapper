import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateDemoCheckpoints } from "./demoCheckpointGenerator";
import {
  DemoFileWriter,
  buildDemoValues,
  buildInitialBlock,
} from "./demoWriter";
import { readDemoCheckpoints } from "../src/stream/demoCheckpoints";

let dir: string;
let file: string;
let output: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "checkpoint-generator-test-"));
  file = path.join(dir, "midmatch.rec");
  output = `${file}.checkpoints.json`;
  const writer = new DemoFileWriter(file, { flushIntervalMs: 0 });
  writer.begin(
    buildInitialBlock({
      connectSequence: 1,
      missionName: "Katabatic",
      demoValues: buildDemoValues({
        recorderName: "Observer",
        serverName: "test",
        serverAddress: "1.2.3.4:28000",
        date: new Date(),
        missionDisplayName: "Katabatic",
        mod: "classic",
        gameType: "Capture the Flag",
      }),
    }),
  );
  for (let i = 0; i < 3; i++) writer.writeMove();
  await writer.finalize(96);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("offline checkpoint generation", () => {
  it.each([false, true])(
    "preserves the recording if it conflicts with the output or temporary path (temporary=%s)",
    async (temporary) => {
      const input = temporary ? `${file}.tmp` : file;
      if (temporary) await fs.copyFile(file, input);
      const original = await fs.readFile(input);
      await expect(
        generateDemoCheckpoints(input, file, "/absent-assets"),
      ).rejects.toThrow("must not overwrite");
      expect(await fs.readFile(input)).toEqual(original);
    },
  );

  it("creates a valid empty sidecar without collision assets when no kickoff exists", async () => {
    const result = await generateDemoCheckpoints(
      file,
      output,
      "/absent-assets",
    );
    expect(result).toMatchObject({ count: 0, reused: false });
    const bytes = await fs.readFile(file);
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    expect(
      await readDemoCheckpoints(await fs.readFile(output, "utf8"), buffer),
    ).toEqual([]);
    expect(await fs.readdir(dir)).toEqual([
      "midmatch.rec",
      "midmatch.rec.checkpoints.json",
    ]);
  });

  it("reuses valid completed output and regenerates stale/corrupt local sidecars", async () => {
    await generateDemoCheckpoints(file, output, "/absent-assets");
    const original = await fs.readFile(output, "utf8");
    expect(
      await generateDemoCheckpoints(file, output, "/absent-assets"),
    ).toMatchObject({ reused: true });
    const stale = JSON.parse(original);
    stale.version = 0;
    await fs.writeFile(output, JSON.stringify(stale));
    expect(
      await generateDemoCheckpoints(file, output, "/absent-assets"),
    ).toMatchObject({ reused: false });
    expect(await fs.readFile(output, "utf8")).toBe(original);
    await fs.writeFile(output, "partial output");
    expect(
      await generateDemoCheckpoints(file, output, "/absent-assets"),
    ).toMatchObject({ reused: false });
  });

  it("rejects truncated compressed streams without publishing a partial sidecar", async () => {
    const bytes = await fs.readFile(file);
    await fs.writeFile(file, bytes.subarray(0, bytes.length - 2));
    await expect(
      generateDemoCheckpoints(file, output, "/absent-assets"),
    ).rejects.toThrow();
    await expect(fs.access(output)).rejects.toThrow();
  });
});

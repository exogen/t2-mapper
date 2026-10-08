import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateDemoCheckpoints } from "./demoCheckpointGenerator";
import {
  DemoFileWriter,
  buildDemoValues,
  buildInitialBlock,
} from "./demoWriter";
import { readDemoCheckpoints } from "../src/stream/demoCheckpoints";
import * as checkpoints from "../src/stream/demoCheckpoints";
import * as demoStreaming from "../src/stream/demoStreaming";
import * as headlessWorld from "../src/world/headlessWorld";
import * as timelineScanner from "../src/stream/demoTimelineScanner";

let dir: string;
let file: string;
let output: string;
beforeEach(async () => {
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", undefined);
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "checkpoint-generator-test-"));
  file = path.join(dir, "midmatch.rec");
  output = `${file}.checkpoints.json`;
  await writeDemo(3);
});

async function writeDemo(ticks: number, durationMS = ticks * 32) {
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
  for (let i = 0; i < ticks; i++) writer.writeMove();
  await writer.finalize(durationMS);
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

  it("reuses compatible v11 output without rescanning or rewriting it", async () => {
    await generateDemoCheckpoints(file, output, "/absent-assets");
    const sidecar = JSON.parse(await fs.readFile(output, "utf8"));
    sidecar.version = 11;
    const text = JSON.stringify(sidecar);
    await fs.writeFile(output, text);
    const scan = vi.spyOn(timelineScanner, "scanDemoTimelineParser");
    expect(
      await generateDemoCheckpoints(file, output, "/absent-assets"),
    ).toMatchObject({ version: 11, reused: true });
    expect(scan).not.toHaveBeenCalled();
    expect(await fs.readFile(output, "utf8")).toBe(text);
  });

  it("regenerates when the requested count changes and then reuses short-demo output", async () => {
    await generateDemoCheckpoints(file, output, "/absent-assets");
    const validate = vi.spyOn(checkpoints, "validateDemoCheckpoints");
    vi.stubEnv("DEMO_CHECKPOINT_COUNT", "3");
    expect(
      await generateDemoCheckpoints(file, output, "/absent-assets"),
    ).toMatchObject({ count: 0, reused: false });
    expect(validate).not.toHaveBeenCalled();
    expect(JSON.parse(await fs.readFile(output, "utf8")).requestedCount).toBe(
      3,
    );
    expect(
      await generateDemoCheckpoints(file, output, "/absent-assets"),
    ).toMatchObject({ count: 0, reused: true });
    expect(validate).toHaveBeenCalledOnce();
    expect(
      await generateDemoCheckpoints(
        file,
        output,
        "/absent-assets",
        undefined,
        true,
        0,
      ),
    ).toMatchObject({ count: 0, reused: false });
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid numeric override %s before reading or writing files",
    async (count) => {
      await expect(
        generateDemoCheckpoints(
          "/missing.rec",
          output,
          "/absent-assets",
          undefined,
          true,
          count,
        ),
      ).rejects.toThrow("Checkpoint count must be a non-negative integer");
      await expect(fs.access(output)).rejects.toThrow();
    },
  );

  it.each([0, 3])(
    "avoids replay setup when count %i yields no targets",
    async (count) => {
      const scan = vi.spyOn(timelineScanner, "scanDemoTimelineParser");
      const recording = vi.spyOn(demoStreaming, "createRecordingFromParser");
      const world = vi.spyOn(headlessWorld, "HeadlessWorld");
      expect(
        await generateDemoCheckpoints(
          file,
          output,
          "/absent-assets",
          undefined,
          true,
          count,
        ),
      ).toMatchObject({ count: 0, reused: false });
      expect(scan).toHaveBeenCalledTimes(count === 0 ? 0 : 1);
      expect(recording).not.toHaveBeenCalled();
      expect(world).not.toHaveBeenCalled();
    },
  );

  it.each([
    [22_502, [2]],
    [22_503, [2, 22_502]],
  ])(
    "captures only ticks before the actual last tick %i, regardless of header duration",
    async (lastTick, ticks) => {
      // Keep the replay real while supplying a deterministic kickoff marker.
      vi.spyOn(timelineScanner, "scanDemoTimelineParser").mockResolvedValue({
        events: [
          {
            type: "match-start",
            timeSec: 60.064,
            description: "Match started",
          },
        ],
        observerPerspective: true,
        killEvents: [],
      });
      await writeDemo(lastTick, 1_000_000);
      const result = await generateDemoCheckpoints(
        file,
        output,
        "/absent-assets",
        undefined,
        true,
        3,
      );
      expect(result).toMatchObject({ count: ticks.length, reused: false });
      const bytes = await fs.readFile(file);
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      expect(
        (
          await readDemoCheckpoints(await fs.readFile(output, "utf8"), buffer)
        ).map((checkpoint) => checkpoint.cursor.moveTicks),
      ).toEqual(ticks);
      expect(
        await generateDemoCheckpoints(
          file,
          output,
          "/absent-assets",
          undefined,
          true,
          3,
        ),
      ).toMatchObject({ count: ticks.length, reused: true });
      const sidecar = JSON.parse(await fs.readFile(output, "utf8"));
      sidecar.checkpoints.at(-1).data = "corrupt";
      await fs.writeFile(output, JSON.stringify(sidecar));
      expect(
        await generateDemoCheckpoints(
          file,
          output,
          "/absent-assets",
          undefined,
          true,
          3,
        ),
      ).toMatchObject({ count: ticks.length, reused: false });
    },
  );
});

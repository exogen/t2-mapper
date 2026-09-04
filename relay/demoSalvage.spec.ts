import { beforeEach, describe, expect, it, vi } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  DemoParser,
  type DemoBlock,
} from "t2-demo-parser";
import { BitStreamWriter } from "./BitStreamWriter.js";
import { FAILED_SUFFIX, salvagePartialDemo } from "./demoSalvage.js";
import {
  DemoFileWriter,
  buildDemoValues,
  buildHeader,
  buildInitialBlock,
} from "./demoWriter.js";
import type { DemoMetadata } from "./demoRecorder.js";

const CONNECT_SEQUENCE = 0x0badf00d;

function buildPingPacket(seq: number): Uint8Array {
  const bs = new BitStreamWriter(16);
  bs.writeFlag(true);
  bs.writeInt(CONNECT_SEQUENCE & 1, 1);
  bs.writeInt(seq & 0x1ff, 9);
  bs.writeInt(0, 9);
  bs.writeInt(1, 2);
  bs.writeInt(0, 3);
  return bs.getBuffer();
}

const initialBlock = buildInitialBlock({
  connectSequence: CONNECT_SEQUENCE,
  missionName: "Katabatic",
  demoValues: buildDemoValues({
    recorderName: "Observer",
    serverName: "| the cut |",
    serverAddress: "45.76.24.91:28000",
    date: new Date("2026-09-03T12:00:00Z"),
    missionDisplayName: "Katabatic",
    mod: "classic",
    gameType: "Capture the Flag",
  }),
});
const prefixLength =
  buildHeader(initialBlock.length).length + initialBlock.length;

/**
 * A crashed recording's spool: `flushedMoves` ticks of packets reached
 * the disk through a sync flush, `unflushedMoves` more were still in
 * deflate's buffer when the process died.
 */
async function writeCrashedSpool(
  finalPath: string,
  flushedMoves: number,
  unflushedMoves: number,
): Promise<Uint8Array> {
  const writer = new DemoFileWriter(finalPath, { flushIntervalMs: 0 });
  writer.begin(initialBlock);
  let seq = 0;
  const tick = () => {
    writer.writeMove();
    writer.writePacket(buildPingPacket(++seq));
    writer.writeInfo();
  };
  for (let i = 0; i < flushedMoves; i++) tick();
  writer.flush();
  await vi.waitFor(() => {
    expect(writer.bytesWritten).toBeGreaterThan(prefixLength);
  });
  const snapshot = new Uint8Array(await fsp.readFile(writer.partialPath));
  for (let i = 0; i < unflushedMoves; i++) tick();
  await writer.abort();
  await fsp.writeFile(writer.partialPath, snapshot);
  return snapshot;
}

async function parseDemoFile(filePath: string) {
  const parser = new DemoParser(new Uint8Array(await fsp.readFile(filePath)));
  const loadResult = await parser.load();
  const blocks: DemoBlock[] = [];
  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    blocks.push(block);
  }
  return { ...loadResult, blocks };
}

describe("salvagePartialDemo", () => {
  let dir: string;
  let finalPath: string;
  let partialPath: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "demo-salvage-"));
    finalPath = path.join(dir, "the-cut_20260903T1200_katabatic_abc123.rec");
    partialPath = `${finalPath}.partial`;
  });

  it("recovers everything up to the last sync flush as a parseable demo", async () => {
    await writeCrashedSpool(finalPath, 5, 3);

    const result = await salvagePartialDemo(partialPath, { minLengthMs: 0 });
    expect(result).toEqual({
      kind: "kept",
      path: finalPath,
      durationMs: 5 * 32,
    });
    expect(await fsp.readdir(dir)).toEqual(
      expect.arrayContaining([
        path.basename(finalPath),
        `${path.basename(finalPath)}.json`,
      ]),
    );
    await expect(fsp.access(partialPath)).rejects.toThrow();

    const {
      header,
      initialBlock: parsedInitial,
      blocks,
    } = await parseDemoFile(finalPath);
    expect(header.demoLengthMs).toBe(5 * 32);
    expect(parsedInitial.demoValues).toContain("NewDemoData");
    expect(blocks.map((b) => b.type)).toEqual(
      Array(5).fill([BlockTypeMove, BlockTypePacket, BlockTypeInfo]).flat(),
    );
    expect(blocks[4].data).toEqual(buildPingPacket(2));
    expect(blocks[13].data).toEqual(buildPingPacket(5));

    const record = JSON.parse(
      await fsp.readFile(`${finalPath}.json`, "utf-8"),
    ) as DemoMetadata;
    expect(record).toMatchObject({
      filename: path.basename(finalPath),
      server: "| the cut |",
      address: "45.76.24.91:28000",
      games: [
        {
          mission: "Katabatic",
          gameType: "Capture the Flag",
          startMs: 0,
          tournament: false,
        },
      ],
      mod: "classic",
      recorder: "Observer",
      durationMs: 5 * 32,
      players: [],
    });
    expect(record.bytes).toBe((await fsp.stat(finalPath)).size);
    expect(record.reason).toMatch(/salvaged/);
  });

  it("drops a torn tail written mid-crash and keeps the whole blocks", async () => {
    const snapshot = await writeCrashedSpool(finalPath, 6, 0);
    // The process died partway through writing the last deflate output.
    await fsp.writeFile(partialPath, snapshot.subarray(0, -3));

    const result = await salvagePartialDemo(partialPath, { minLengthMs: 0 });
    expect(result.kind).toBe("kept");
    const { header, blocks } = await parseDemoFile(finalPath);
    // Whatever survived is a prefix of the written stream, in order.
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.length).toBeLessThanOrEqual(18);
    expect(blocks.length % 3).toBe(0);
    expect(header.demoLengthMs).toBe((blocks.length / 3) * 32);
    for (let i = 0; i < blocks.length; i += 3) {
      expect(blocks[i + 1].data).toEqual(buildPingPacket(i / 3 + 1));
    }
  });

  it("discards a spool shorter than the keep gate", async () => {
    await writeCrashedSpool(finalPath, 2, 0);
    const result = await salvagePartialDemo(partialPath, {
      minLengthMs: 30_000,
    });
    expect(result).toEqual({ kind: "dropped" });
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("keeps an unreadable spool aside instead of deleting it", async () => {
    await fsp.writeFile(partialPath, new Uint8Array([1, 2, 3]));
    const result = await salvagePartialDemo(partialPath, { minLengthMs: 0 });
    expect(result).toEqual({ kind: "failed", path: finalPath + FAILED_SUFFIX });
    expect(await fsp.readdir(dir)).toEqual([
      `${path.basename(finalPath)}${FAILED_SUFFIX}`,
    ]);
  });

  it("drops the spool when its demo already exists (salvage died before unlink)", async () => {
    await writeCrashedSpool(finalPath, 3, 0);
    await fsp.writeFile(finalPath, new Uint8Array([9]));
    const result = await salvagePartialDemo(partialPath, { minLengthMs: 0 });
    expect(result).toEqual({ kind: "dropped" });
    expect(await fsp.readdir(dir)).toEqual([path.basename(finalPath)]);
    expect(new Uint8Array(await fsp.readFile(finalPath))).toEqual(
      new Uint8Array([9]),
    );
  });
});

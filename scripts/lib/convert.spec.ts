import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { outputSampleRate, wavSampleRate } from "./convert";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true })));
});

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "convert-spec-"));
  dirs.push(dir);
  return dir;
}

/** A minimal RIFF/WAVE header, optionally preceded by another chunk. */
function wavHeader(
  sampleRate: number,
  { lead }: { lead?: string } = {},
): Buffer {
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "latin1");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8); // PCM
  fmt.writeUInt16LE(1, 10); // mono
  fmt.writeUInt32LE(sampleRate, 12);
  const before = lead
    ? (() => {
        // An odd-sized chunk is followed by a pad byte; use one to prove the
        // walk realigns rather than drifting into the middle of `fmt `.
        const body = Buffer.from("x", "latin1");
        const chunk = Buffer.alloc(8 + body.length + 1);
        chunk.write(lead, 0, "latin1");
        chunk.writeUInt32LE(body.length, 4);
        body.copy(chunk, 8);
        return chunk;
      })()
    : Buffer.alloc(0);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "latin1");
  riff.writeUInt32LE(4 + before.length + fmt.length, 4);
  riff.write("WAVE", 8, "latin1");
  return Buffer.concat([riff, before, fmt, Buffer.alloc(64)]);
}

describe("outputSampleRate", () => {
  it("leaves rates AAC can represent alone", () => {
    for (const rate of [8000, 11025, 22050, 44100, 48000]) {
      expect(outputSampleRate(rate)).toBeUndefined();
    }
  });

  it("moves rates AAC cannot represent to a rate CoreAudio decodes", () => {
    // The game ships one 4,500 Hz effect and 21 files at ~11,127 Hz. Left to
    // itself ffmpeg picks 7,350 and 11,025 for these, and CoreAudio then
    // refuses to decode the result.
    expect(outputSampleRate(4500)).toBe(22050);
    expect(outputSampleRate(11127)).toBe(22050);
    expect(outputSampleRate(11128)).toBe(22050);
  });

  it("leaves a nonsense rate alone rather than guessing", () => {
    expect(outputSampleRate(0)).toBeUndefined();
    expect(outputSampleRate(Number.NaN)).toBeUndefined();
  });
});

describe("wavSampleRate", () => {
  it("reads the rate out of the fmt chunk", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "a.wav");
    await fs.writeFile(file, wavHeader(11127));
    expect(await wavSampleRate(file)).toBe(11127);
  });

  it("finds fmt after a leading chunk of odd size", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "b.wav");
    await fs.writeFile(file, wavHeader(22050, { lead: "LIST" }));
    expect(await wavSampleRate(file)).toBe(22050);
  });

  it("gives up rather than throwing on a file that is not a WAV", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "c.wav");
    await fs.writeFile(file, Buffer.alloc(128));
    expect(await wavSampleRate(file)).toBeUndefined();
    expect(await wavSampleRate(path.join(dir, "missing.wav"))).toBeUndefined();
  });
});

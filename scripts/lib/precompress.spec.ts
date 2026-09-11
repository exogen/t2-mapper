import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  BROTLI_QUALITY,
  isPrecompressedKey,
  shouldPrecompress,
  writeBrotli,
} from "./precompress";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "precompress-spec-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("shouldPrecompress", () => {
  it("takes shapes, interiors, terrain and sequences, and leaves everything else alone", () => {
    expect(shouldPrecompress("shapes/x.dts")).toBe(true);
    expect(shouldPrecompress("interiors/x.dif")).toBe(true);
    expect(shouldPrecompress("terrains/x.ter")).toBe(true);
    expect(shouldPrecompress("shapes/x.dsq")).toBe(true);
    expect(shouldPrecompress("shapes/X.DTS")).toBe(true);
    expect(shouldPrecompress("interiors/X.DIF")).toBe(true);
    expect(shouldPrecompress("terrains/X.TER")).toBe(true);
    expect(shouldPrecompress("shapes/X.DSQ")).toBe(true);
    // Binary asset types that were measured and left out (see the module).
    expect(shouldPrecompress("textures/x.bm8")).toBe(false);
    expect(shouldPrecompress("missions/x.spn")).toBe(false);
    expect(shouldPrecompress("textures/x.png")).toBe(false);
    expect(shouldPrecompress("shapes/x.glb")).toBe(false);
    // Already compressed: a .br of a .br would be pointless.
    expect(shouldPrecompress("shapes/x.dts.br")).toBe(false);
  });
});

describe("isPrecompressedKey", () => {
  it("matches only siblings of precompressed formats", () => {
    expect(isPrecompressedKey("shapes/x.dts.br")).toBe(true);
    expect(isPrecompressedKey("shapes/x.dts")).toBe(false);
    expect(isPrecompressedKey("readme.txt.br")).toBe(false);
  });
});

describe("writeBrotli", () => {
  it("writes a stream the browser's decoder reads back exactly", async () => {
    const dir = await tempDir();
    const source = path.join(dir, "shape.dts");
    // Repetitive, like real geometry, so there is something to compress.
    const original = Buffer.from("DTS\0".repeat(4096) + "x".repeat(1024));
    await fs.writeFile(source, original);

    const dest = path.join(dir, "nested/shape.dts.br");
    const packed = await writeBrotli(source, dest);

    expect(packed).toBeLessThan(original.length);
    const roundTrip = zlib.brotliDecompressSync(await fs.readFile(dest));
    expect(roundTrip.equals(original)).toBe(true);
  });

  it("compresses at the quality the pipeline promises", async () => {
    const dir = await tempDir();
    const source = path.join(dir, "s.dts");
    const original = Buffer.from(
      Array.from({ length: 20000 }, (_, i) => (i * 37) % 251),
    );
    await fs.writeFile(source, original);
    const packed = await writeBrotli(source, path.join(dir, "s.dts.br"));
    const atQuality = zlib.brotliCompressSync(original, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
    }).length;
    // Size hint can shave a byte or two; anything larger means a lower level.
    expect(packed).toBeLessThanOrEqual(atQuality);
  });
});

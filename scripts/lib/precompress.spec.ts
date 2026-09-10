import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  BROTLI_QUALITY,
  compressAll,
  isPrecompressedKey,
  orphanedSiblings,
  precompressedPath,
  precompressionTargets,
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

describe("precompressionTargets", () => {
  const sourcePaths = ["a.dts", "b.dts", "c.dts", "keep.png"];

  it("covers interiors on the same rules as shapes", () => {
    expect(
      precompressionTargets({
        sourcePaths: ["s.dts", "i.dif", "t.png"],
        uploadedPaths: new Set(["i.dif"]),
        existingKeys: new Set(["s.dts.br", "i.dif.br"]),
      }),
    ).toEqual(["i.dif"]);
  });

  it("takes files this run uploaded", () => {
    expect(
      precompressionTargets({
        sourcePaths,
        uploadedPaths: new Set(["b.dts"]),
        existingKeys: new Set(["a.dts.br", "b.dts.br", "c.dts.br"]),
      }),
    ).toEqual(["b.dts"]);
  });

  it("takes files whose sibling is missing, so it self-heals", () => {
    expect(
      precompressionTargets({
        sourcePaths,
        uploadedPaths: new Set(),
        existingKeys: new Set(["a.dts.br"]),
      }),
    ).toEqual(["b.dts", "c.dts"]);
  });

  it("does nothing when everything is already compressed and unchanged", () => {
    expect(
      precompressionTargets({
        sourcePaths,
        uploadedPaths: new Set(),
        existingKeys: new Set(["a.dts.br", "b.dts.br", "c.dts.br"]),
      }),
    ).toEqual([]);
  });

  it("never targets a non-shape", () => {
    const targets = precompressionTargets({
      sourcePaths,
      uploadedPaths: new Set(["keep.png"]),
      existingKeys: new Set(),
    });
    expect(targets).not.toContain("keep.png");
  });
});

describe("orphanedSiblings", () => {
  it("finds siblings whose shape is gone", () => {
    expect(
      orphanedSiblings({
        sourcePaths: ["a.dts", "b.dts"],
        existingKeys: ["a.dts", "a.dts.br", "b.dts", "b.dts.br", "gone.dts.br"],
      }),
    ).toEqual(["gone.dts.br"]);
  });

  it("leaves .br files this pipeline did not make alone", () => {
    expect(
      orphanedSiblings({
        sourcePaths: ["a.dts"],
        existingKeys: ["a.dts.br", "notes.txt.br", "archive.br"],
      }),
    ).toEqual([]);
  });

  it("removes an interior's sibling on the same rules", () => {
    expect(
      orphanedSiblings({
        sourcePaths: ["kept.dif"],
        existingKeys: ["kept.dif.br", "gone.dif.br", "gone.dts.br"],
      }),
    ).toEqual(["gone.dif.br", "gone.dts.br"]);
  });

  it("returns nothing when every shape is still present", () => {
    expect(
      orphanedSiblings({
        sourcePaths: ["a.dts", "b.dts"],
        existingKeys: ["a.dts.br", "b.dts.br"],
      }),
    ).toEqual([]);
  });

  it("would flag everything if the source went missing, which the caller guards", () => {
    // The sync refuses to act on this; the pure function still reports it so
    // the guard has something to check.
    expect(
      orphanedSiblings({
        sourcePaths: [],
        existingKeys: ["a.dts.br", "b.dts.br"],
      }),
    ).toEqual(["a.dts.br", "b.dts.br"]);
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

describe("compressAll", () => {
  it("compresses every target into the staging tree, mirroring paths", async () => {
    const source = await tempDir();
    const staging = await tempDir();
    const names = ["shapes/a.dts", "interiors/b.dif", "shapes/deep/c.dts"];
    for (const name of names) {
      await fs.mkdir(path.join(source, path.dirname(name)), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(source, name),
        Buffer.from(`${name}\0`.repeat(2048)),
      );
    }

    const { rawBytes, packedBytes } = await compressAll(names, {
      sourceDir: source,
      stagingDir: staging,
      concurrency: 3,
    });

    expect(packedBytes).toBeLessThan(rawBytes);
    for (const name of names) {
      const packed = await fs.readFile(path.join(staging, `${name}.br`));
      expect(zlib.brotliDecompressSync(packed).toString()).toContain(name);
    }
  });

  it("totals correctly under concurrency", async () => {
    // Regression: `total += await f()` reads the total before awaiting, so
    // concurrent lanes lost each other's updates and the reported sizes
    // drifted between runs of identical input.
    const source = await tempDir();
    const staging = await tempDir();
    const names: string[] = [];
    let expectedRaw = 0;
    for (let i = 0; i < 24; i++) {
      const name = `f${i}.dts`;
      const bytes = Buffer.from(`payload-${i}\n`.repeat(500 + i * 25));
      await fs.writeFile(path.join(source, name), bytes);
      expectedRaw += bytes.length;
      names.push(name);
    }

    const result = await compressAll(names, {
      sourceDir: source,
      stagingDir: staging,
      concurrency: 8,
    });

    expect(result.rawBytes).toBe(expectedRaw);
    let onDisk = 0;
    for (const name of names) {
      onDisk += (await fs.stat(path.join(staging, `${name}.br`))).size;
    }
    expect(result.packedBytes).toBe(onDisk);
  });

  it("is safe with more lanes than files", async () => {
    const source = await tempDir();
    const staging = await tempDir();
    await fs.writeFile(path.join(source, "one.dts"), Buffer.alloc(4096, 7));
    const result = await compressAll(["one.dts"], {
      sourceDir: source,
      stagingDir: staging,
      concurrency: 16,
    });
    expect(result.rawBytes).toBe(4096);
  });

  it("does nothing with no targets", async () => {
    const staging = await tempDir();
    expect(
      await compressAll([], { sourceDir: staging, stagingDir: staging }),
    ).toEqual({ rawBytes: 0, packedBytes: 0 });
  });
});

describe("precompressedPath", () => {
  it("appends rather than replacing the extension", () => {
    expect(precompressedPath("shapes/x.dts")).toBe("shapes/x.dts.br");
  });
});

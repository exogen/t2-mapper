import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildManifest } from "./manifest";
import { derivedPath } from "./assets";
import { createDIFTestBuffer } from "../../src/dif/difTestFixtures";
import {
  createDTSTestBuffer,
  createDTSTestShape,
} from "../../src/dts/dtsTestFixtures";
import { extractMountTransforms } from "./mounts";

it("accepts a DIF-only archive without a converted GLB", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "dif-manifest-"));
  try {
    const dir = path.join(baseDir, "@vl2", "native.vl2", "interiors");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "test.dif"),
      new Uint8Array(createDIFTestBuffer().buffer),
    );
    const { manifest } = await buildManifest({ baseDir });
    expect(manifest.resources["interiors/test.dif"]).toEqual([
      "interiors/test.dif",
      ["native.vl2"],
    ]);
    expect(derivedPath("interiors/test.dif")).toBeNull();
    expect(derivedPath("shapes/test.dts")).toBeNull();
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

it("accepts a DTS-only archive and extracts authored mounts without GLB extras", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "dts-manifest-"));
  try {
    const dir = path.join(baseDir, "@vl2", "native.vl2", "shapes");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "test.dts"),
      new Uint8Array(createDTSTestBuffer()),
    );
    const { manifest } = await buildManifest({ baseDir });
    expect(manifest.resources["shapes/test.dts"]).toEqual([
      "shapes/test.dts",
      ["native.vl2"],
    ]);
    const shape = createDTSTestShape();
    shape.names[shape.nodes[0].nameIndex] = "Mount0";
    shape.defaultTranslations.set([1, 2, 3]);
    expect(extractMountTransforms(shape)?.mount0.position).toEqual([2, 3, 1]);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

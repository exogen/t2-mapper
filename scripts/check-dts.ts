/** Audit native DTS and DSQ assets without Blender, textures, or WebGL. */
import { glob, readFile } from "node:fs/promises";
import path from "node:path";
import { AnimationMixer, PerspectiveCamera } from "three";
import { parseDTS } from "../src/dts/dts";
import { buildDTS } from "../src/dts/dtsBuilder";
import { mergeDSQ, parseDSQ } from "../src/dts/dsq";

const base = process.argv[2] ?? "docs/base";
const files: string[] = [];
for await (const file of glob(path.join(base, "**/*.{dts,dsq}")))
  files.push(file);
files.sort();
async function buffer(file: string) {
  const bytes = await readFile(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}
const sequences = new Map<string, ReturnType<typeof parseDSQ>>();
let emptySequences = 0;
for (const file of files.filter((file) => /\.dsq$/i.test(file))) {
  const bytes = await buffer(file);
  if (!bytes.byteLength) {
    emptySequences++;
    continue;
  }
  sequences.set(file, parseDSQ(bytes));
}
const versions: Record<number, number> = {};
let shapes = 0,
  clips = 0,
  meshes = 0;
const camera = new PerspectiveCamera();
camera.position.set(5, 4, 3);
camera.updateMatrixWorld();
for (const file of files.filter((file) => /\.dts$/i.test(file))) {
  try {
    const prefix = file.slice(0, -4) + "_";
    const extras = [...sequences]
      .filter(([name]) => name.toLowerCase().startsWith(prefix.toLowerCase()))
      .map(([name, data]) => ({ name: name.slice(prefix.length, -4), data }));
    const data = mergeDSQ(parseDTS(await buffer(file)), extras),
      model = buildDTS(data);
    const mixer = new AnimationMixer(model.scene);
    for (const clip of model.animations) {
      for (const animation of [clip, clip.groundMotion]) {
        if (!animation) continue;
        for (const track of animation.tracks)
          if (
            !track.validate() ||
            !Array.from(track.values).every(
              (value) => typeof value !== "number" || Number.isFinite(value),
            )
          )
            throw new Error(
              `Invalid animation track: ${animation.name}/${track.name}`,
            );
      }
      const action = mixer.clipAction(clip);
      action.play();
      mixer.setTime(clip.duration * 0.4);
      model.scene.updateMatrixWorld(true);
      model.scene.update(camera);
      action.stop();
    }
    model.scene.ignoreDetailSize = true;
    model.scene.intraDetailLevel = 0.5;
    for (let detail = 0; detail < data.details.length; detail++) {
      model.scene.detailLevel = detail;
      model.scene.update(camera);
    }
    model.scene.update(camera);
    model.scene.traverse((node) => {
      if ((node as any).isMesh) meshes++;
    });
    versions[data.version] = (versions[data.version] ?? 0) + 1;
    shapes++;
    clips += model.animations.length;
  } catch (error) {
    throw new Error(`${file}: ${String(error)}`, { cause: error });
  }
}
console.log({
  shapes,
  sequences: sequences.size,
  emptySequences,
  clips,
  meshes,
  versions,
});

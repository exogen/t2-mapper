/** Compare eager and lazy native scenes using every installed asset/DSQ. */
import { glob, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AnimationMixer, PerspectiveCamera, SkinnedMesh } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { parseDTS } from "../src/dts/dts";
import { parseDSQ, mergeDSQ } from "../src/dts/dsq";
import { buildDTS } from "../src/dts/dtsBuilder";
import {
  DTSAnimationTransform,
  isDTSMesh,
  type DTSShape,
} from "../src/dts/dtsModel";

async function buffer(file: string) {
  const bytes = await readFile(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}
const files: string[] = [];
for await (const file of glob("docs/base/**/*.{dts,dsq}")) files.push(file);
files.sort();
const sequences = new Map<string, ReturnType<typeof parseDSQ>>();
for (const file of files.filter((file) => file.endsWith(".dsq"))) {
  const bytes = await buffer(file);
  if (bytes.byteLength) sequences.set(file, parseDSQ(bytes));
}
const camera = new PerspectiveCamera();
camera.position.set(30, 12, -70);
camera.updateMatrixWorld();
function snapshot(scene: DTSShape) {
  scene.updateMatrixWorld(true);
  scene.update(camera);
  const meshes = new Map<string, string>();
  scene.traverseVisible((node) => {
    if (!isDTSMesh(node)) return;
    const binding = node.binding!;
    const key = `${binding.objectIndex}/${scene.data.meshes.indexOf(binding.source)}/${binding.decalIndex}/${binding.materialIndex}`;
    const hash = createHash("sha256");
    const bytes = (array: ArrayBufferView) =>
      hash.update(
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
      );
    for (const name of Object.keys(node.geometry.attributes).sort()) {
      hash.update(name);
      bytes(node.geometry.getAttribute(name).array);
    }
    if (node.geometry.index) bytes(node.geometry.index.array);
    if (node instanceof SkinnedMesh) {
      node.skeleton.update();
      bytes(node.skeleton.boneMatrices!);
    }
    hash.update(
      JSON.stringify([
        node.matrixWorld.elements,
        node.geometry.groups,
        node.geometry.drawRange,
      ]),
    );
    meshes.set(key, hash.digest("hex"));
  });
  return JSON.stringify([...meshes].sort(([a], [b]) => a.localeCompare(b)));
}
let shapes = 0,
  comparisons = 0;
for (const file of files.filter((file) => file.endsWith(".dts"))) {
  const prefix = file.slice(0, -4) + "_";
  const extras = [...sequences]
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, data]) => ({ name: name.slice(prefix.length, -4), data }));
  const data = mergeDSQ(parseDTS(await buffer(file)), extras);
  const eager = buildDTS(data, { lazy: false }),
    lazy = buildDTS(data);
  // Exercise deferred skeleton remapping on an instance, not only the source.
  const a = clone(eager.scene) as DTSShape,
    b = clone(lazy.scene) as DTSShape;
  // Reference path recomposes every pose helper using native auto-update.
  a.traverse((node) => {
    if (node instanceof DTSAnimationTransform) node.matrixAutoUpdate = true;
  });
  a.position.set(4, 5, 6);
  b.position.copy(a.position);
  a.rotation.set(0.2, -0.4, 0.3);
  b.rotation.copy(a.rotation);
  a.scale.set(2, 3, 4);
  b.scale.copy(a.scale);
  const compare = (state: string) => {
    if (snapshot(a) !== snapshot(b))
      throw new Error(`${file}: ${state} mismatch`);
    comparisons++;
  };
  compare("default");
  const mixers = [new AnimationMixer(a), new AnimationMixer(b)];
  for (const clip of eager.animations) {
    for (const mixer of mixers) {
      mixer.clipAction(clip).play();
      mixer.setTime(clip.duration * 0.45);
    }
    compare(clip.name);
    for (const mixer of mixers) mixer.stopAllAction();
  }
  a.ignoreDetailSize = b.ignoreDetailSize = true;
  for (let detail = 0; detail < data.details.length; detail++) {
    a.detailLevel = b.detailLevel = detail;
    compare(`detail ${detail}`);
    a.decalFrames.fill(0);
    b.decalFrames.fill(0);
    compare(`detail ${detail} with decals`);
    a.decalFrames.fill(-1);
    b.decalFrames.fill(-1);
  }
  shapes++;
}
console.log({ shapes, comparisons });

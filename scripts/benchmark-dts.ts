/** Native DTS CPU benchmark; run with node --import=tsx scripts/benchmark-dts.ts. */
import fs from "node:fs/promises";
import path from "node:path";
import { AnimationMixer, PerspectiveCamera, SkinnedMesh } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { parseDTS } from "../src/dts/dts";
import { buildDTS } from "../src/dts/dtsBuilder";
import { isDTSMesh, isDTSMeshBatch, type DTSShape } from "../src/dts/dtsModel";

import { mergeDSQ, parseDSQ } from "../src/dts/dsq";
import { batchDTSRigidMeshes } from "../src/dts/dtsRigidBatch";

const names = process.argv.slice(2);
async function readBuffer(file: string) {
  const bytes = await fs.readFile(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}
if (!names.length)
  names.push(
    "light_male",
    "heavy_male",
    "borg18",
    "borg19",
    "vehicle_grav_tank",
    "disc",
    "mortar_explosion",
  );
const camera = new PerspectiveCamera();
camera.position.set(5, 4, 3);
camera.updateMatrixWorld();
const rows = [];
for (const name of names) {
  const file = name.endsWith(".dts")
    ? name
    : path.join("docs/base/@vl2/shapes.vl2/shapes", `${name}.dts`);
  const bytes = await fs.readFile(file);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  let start = performance.now();
  for (let i = 0; i < 10; i++) parseDTS(buffer);
  const parseMS = (performance.now() - start) / 10;
  const prefix = path.basename(file, ".dts") + "_";
  const extras = [];
  for (const name of (await fs.readdir(path.dirname(file))).sort()) {
    if (!name.startsWith(prefix) || !name.endsWith(".dsq")) continue;
    const bytes = await readBuffer(path.join(path.dirname(file), name));
    if (bytes.byteLength)
      extras.push({
        name: name.slice(prefix.length, -4),
        data: parseDSQ(bytes),
      });
  }
  const data = mergeDSQ(parseDTS(buffer), extras);
  for (const lazy of [false, true]) {
    start = performance.now();
    const model = buildDTS(data, { lazy });
    batchDTSRigidMeshes(model.scene);
    const buildMS = performance.now() - start;
    start = performance.now();
    const instances = Array.from(
      { length: 24 },
      () => clone(model.scene) as DTSShape,
    );
    const cloneMS = (performance.now() - start) / instances.length;
    const mixers = instances.map((scene) => {
      const mixer = new AnimationMixer(scene);
      const clip =
        model.animations.find((clip) => clip.name.toLowerCase() === "run") ??
        model.animations[0];
      if (clip) mixer.clipAction(clip).play();
      return mixer;
    });
    let gpuSkins = 0,
      cpuSkins = 0,
      vertices = 0,
      drawCalls = 0;
    let objects = 0,
      meshes = 0;
    instances[0].traverse((node) => {
      objects++;
      if (isDTSMesh(node) || isDTSMeshBatch(node)) meshes++;
    });
    instances[0].updateMatrixWorld(true);
    instances[0].update(camera);
    instances[0].traverseVisible((node) => {
      if (!isDTSMesh(node) && !isDTSMeshBatch(node)) return;
      vertices += node.geometry.getAttribute("position").count;
      if (isDTSMesh(node) && node.binding?.source.skin) {
        if (node instanceof SkinnedMesh) gpuSkins++;
        else cpuSkins++;
      }
      drawCalls += Array.isArray(node.material)
        ? node.geometry.groups.length
        : 1;
    });
    // Warm V8 and lazy instance caches before measuring steady-state updates.
    const update = (frame: number) => {
      camera.position.x = 5 + Math.sin(frame / 60);
      camera.updateMatrixWorld();
      for (let i = 0; i < instances.length; i++) {
        mixers[i].update(1 / 60);
        instances[i].updateMatrixWorld(true);
        instances[i].update(camera);
      }
    };
    for (let i = 0; i < 30; i++) update(i);
    start = performance.now();
    for (let i = 0; i < 120; i++) update(i);
    const frameMS = (performance.now() - start) / 120;
    rows.push({
      name: path.basename(file),
      lazy,
      objects,
      meshes,
      parseMS,
      buildMS,
      cloneMS,
      frameMS,
      instances: instances.length,
      gpuSkins,
      cpuSkins,
      vertices,
      drawCalls,
    });
  }
}
console.log(JSON.stringify(rows, null, 2));

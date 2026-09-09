/** Compare batched and authored draws across every DTS and animation clip.
 * Outputs per-asset results as JSON; accepts an optional asset directory. */
import fs from "node:fs/promises";
import path from "node:path";
import {
  AnimationMixer,
  Matrix3,
  Matrix4,
  PerspectiveCamera,
  Vector3,
} from "three";
import { parseDTS } from "../src/dts/dts";
import { parseDSQ, mergeDSQ } from "../src/dts/dsq";
import { buildDTS } from "../src/dts/dtsBuilder";
import { batchDTSRigidMeshes } from "../src/dts/dtsRigidBatch";
import { DTSMesh, DTSRigidMeshBatch } from "../src/dts/dtsModel";

const base = process.argv[2] ?? "docs/base";
const files: string[] = [];
for await (const file of fs.glob("**/*.{dts,dsq}", { cwd: base }))
  files.push(file);
files.sort();
const rows = [];
const camera = new PerspectiveCamera();
const a = new Vector3(),
  b = new Vector3(),
  skin = new Matrix4(),
  normal = new Matrix3();
async function buffer(file: string) {
  const bytes = await fs.readFile(path.join(base, file));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}
for (const file of files.filter((file) => file.endsWith(".dts"))) {
  const prefix = file.slice(0, -4) + "_";
  const extras = [];
  for (const sequence of files.filter(
    (name) => name.startsWith(prefix) && name.endsWith(".dsq"),
  )) {
    const bytes = await buffer(sequence);
    if (bytes.byteLength)
      extras.push({
        name: sequence.slice(prefix.length, -4),
        data: parseDSQ(bytes),
      });
  }
  const model = buildDTS(mergeDSQ(parseDTS(await buffer(file)), extras));
  const { scene } = model;
  const meshes: DTSMesh[] = [];
  scene.traverse((node) => {
    if (node instanceof DTSMesh) meshes.push(node);
  });
  const batches = batchDTSRigidMeshes(scene);
  const byBinding = new Map(meshes.map((mesh) => [mesh.binding!, mesh]));
  const mixer = new AnimationMixer(scene);
  let positions = 0,
    maxPositionError = 0,
    maxNormalError = 0;
  scene.position.set(40, -70, 15);
  scene.rotation.set(0.2, 0.7, -0.4);
  scene.scale.set(2, 3, 4);
  for (const clip of [null, ...model.animations]) {
    if (clip) mixer.clipAction(clip).play();
    for (const fraction of [0.1, 0.5, 0.9]) {
      mixer.setTime((clip?.duration ?? 0) * fraction);
      scene.updateMatrixWorld(true);
      scene.update(camera);
      for (const batch of batches) {
        if (batch instanceof DTSRigidMeshBatch) batch.skeleton.update();
        let offset = 0;
        for (const binding of batch.bindings) {
          const part = byBinding.get(binding)!;
          part.parent!.updateWorldMatrix(true, true, true);
          const position = part.geometry.getAttribute("position");
          const skinNormal = new Matrix3();
          if (batch instanceof DTSRigidMeshBatch) {
            const bone = batch.geometry.getAttribute("skinIndex").getX(offset);
            skin
              .fromArray(batch.skeleton.boneMatrices!, bone * 16)
              .premultiply(batch.bindMatrixInverse);
            skinNormal.setFromMatrix4(skin);
          }
          for (let i = 0; i < position.count; i++) {
            a.fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld);
            batch
              .getVertexPosition(offset + i, b)
              .applyMatrix4(batch.matrixWorld);
            if (a.distanceTo(b) > 1e-4)
              throw new Error(
                `${file}/${clip?.name ?? "rest"}/${part.name}: position mismatch at ${fraction}`,
              );
            maxPositionError = Math.max(maxPositionError, a.distanceTo(b));
            a.fromBufferAttribute(
              part.geometry.getAttribute("normal"),
              i,
            ).applyNormalMatrix(normal.getNormalMatrix(part.matrixWorld));
            b.fromBufferAttribute(
              batch.geometry.getAttribute("normal"),
              offset + i,
            )
              .applyMatrix3(skinNormal)
              .applyNormalMatrix(normal.getNormalMatrix(batch.matrixWorld));
            maxNormalError = Math.max(maxNormalError, a.distanceTo(b));
            positions++;
          }
          offset += position.count;
        }
      }
    }
    mixer.stopAllAction();
  }
  // Activating damage decal frames still selects the original decal meshes.
  scene.decalFrames.fill(0);
  scene.updateMatrixWorld(true);
  scene.update(camera);
  const decals = meshes.filter(
    (mesh) =>
      mesh.binding!.decalIndex !== undefined &&
      mesh.binding!.detailIndices.includes(0),
  );
  if (
    decals.some(
      (mesh) =>
        mesh.binding!.source.decal!.startPrimitive.length &&
        !mesh.parent!.visible &&
        scene.data.details[0]?.size >= 0,
    )
  )
    throw new Error(`${file}: hidden damage decal`);
  if (maxPositionError > 1e-4 || maxNormalError > 1e-5)
    throw new Error(
      `${file}: pose mismatch ${maxPositionError}/${maxNormalError}`,
    );
  // Exercise fallbacks and lower levels too, including collision-only details.
  scene.ignoreDetailSize = true;
  scene.intraDetailLevel = 0.5;
  for (let detail = 0; detail < scene.data.details.length; detail++) {
    scene.detailLevel = detail;
    scene.update(camera);
    if (batches.some((batch) => batch.visible))
      throw new Error(`${file}: batch active during a merge transition`);
  }
  rows.push({
    file,
    clips: model.animations.length,
    positions,
    maxPositionError,
    maxNormalError,
    parts: batches.reduce((n, batch) => n + batch.bindings.length, 0),
    batches: batches.length,
    staticBatches: batches.filter(
      (batch) => !(batch instanceof DTSRigidMeshBatch),
    ).length,
    damageDecals: decals.length,
  });
}
console.log(JSON.stringify(rows, null, 2));

import { Matrix4, Quaternion, Vector3 } from "three";
import { dtsQuaternion, dtsVector } from "./dtsGeometry";
import { getDTSNodeLookup } from "./dtsNodeLookup";
import type { DTSShapeData } from "./dtsTypes";

/** Image datablock offset/rotation, converted to DTS model space. */
export interface DTSImageOffset {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

interface MountTransforms {
  correction: Matrix4;
  offsets: WeakMap<DTSImageOffset, Matrix4>;
}
const mounts = new WeakMap<DTSShapeData, MountTransforms>();

/** Shared immutable matrix: ShapeBaseImageData::preload, FUN_005f45c0.
 * The binary accumulates defaults from mountPoint toward the root, then
 * inverts that product. This is deliberately not the animated world matrix. */
export function getDTSImageMountTransform(
  data: DTSShapeData,
  offset?: DTSImageOffset,
): Matrix4 {
  let mount = mounts.get(data);
  if (!mount) {
    const correction = new Matrix4(),
      local = new Matrix4(),
      position = new Vector3(),
      rotation = new Quaternion(),
      unitScale = new Vector3(1, 1, 1);
    for (
      let index = getDTSNodeLookup(data).names.get("mountpoint") ?? -1;
      index >= 0;
      index = data.nodes[index].parentIndex
    ) {
      local.compose(
        dtsVector(data.defaultTranslations, index * 3, position),
        dtsQuaternion(data.defaultRotations, index * 4, rotation),
        unitScale,
      );
      correction.multiply(local);
    }
    correction.invert();
    mount = { correction, offsets: new WeakMap() };
    mounts.set(data, mount);
  }
  if (!offset) return mount.correction;
  let transform = mount.offsets.get(offset);
  if (!transform) {
    transform = new Matrix4().makeRotationFromQuaternion(
      new Quaternion().fromArray(offset.quaternion),
    );
    transform.setPosition(...offset.position).multiply(mount.correction);
    mount.offsets.set(offset, transform);
  }
  return transform;
}

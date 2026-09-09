/** Authored mount-node transforms from DTS, in entity-local Three space. */
import { Matrix4, Quaternion, Vector3 } from "three";
import type { MountTransform } from "@/src/manifest";
import { dtsQuaternion, dtsVector } from "../../src/dts/dtsGeometry";
import type { DTSShapeData } from "../../src/dts/dtsTypes";
export type { MountTransform };
const unit = new Vector3(1, 1, 1);
const placement = new Matrix4().makeRotationY(Math.PI / 2);
const inversePlacement = placement.clone().invert();
function round(values: number[]): number[] {
  return values.map((v) => Math.round(v * 1e5) / 1e5 || 0);
}

export function extractMountTransforms(
  shape: DTSShapeData,
): Record<string, MountTransform> | null {
  const transforms: Matrix4[] = [];
  let mounts: Record<string, MountTransform> | null = null;
  for (let i = 0; i < shape.nodes.length; i++) {
    const node = shape.nodes[i];
    const matrix = new Matrix4().compose(
      dtsVector(shape.defaultTranslations, i * 3),
      dtsQuaternion(shape.defaultRotations, i * 4),
      unit,
    );
    if (node.parentIndex >= 0) matrix.premultiply(transforms[node.parentIndex]);
    transforms.push(matrix);
    const name = shape.names[node.nameIndex];
    if (!/^(mount\d+|mountpoint)$/i.test(name)) continue;
    const entity = matrix
      .clone()
      .premultiply(placement)
      .multiply(inversePlacement);
    const position = new Vector3(),
      rotation = new Quaternion(),
      scale = new Vector3();
    entity.decompose(position, rotation, scale);
    (mounts ??= {})[name.toLowerCase()] = {
      position: round(position.toArray()),
      rotation: round(rotation.toArray()),
    };
  }
  return mounts;
}

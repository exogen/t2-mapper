import { Box3, Vector3 } from "three";
import { DTSShape, isDTSMesh, type DTSModel } from "../dts/dtsModel";
import { DTS_BASIS } from "../dts/dtsGeometry";

export interface DebrisPart {
  index: number;
  radius: number;
  template: DTSShape;
}
const cache = new WeakMap<DTSModel, DebrisPart[]>();

/** TSPartInstance::breakShape with null probabilities: one visible authored
 * object per part. Keep lazy branches and shared geometry, not whole clones. */
export function debrisParts(model: DTSModel): DebrisPart[] {
  const cached = cache.get(model);
  if (cached) return cached;
  const parts: DebrisPart[] = [],
    data = model.data;
  const root = data.subShapes[0]?.firstNode;
  model.scene.ensureDetail(0);
  model.scene.updateMatrixWorld(true);
  for (let index = 0; index < data.objects.length; index++) {
    if ((data.objectStates[index]?.visibility ?? 1) < 0.01) continue;
    let node = data.objects[index].nodeIndex;
    while (node >= 0 && node !== root) node = data.nodes[node].parentIndex;
    if (node < 0) continue;
    const object = model.scene.getShapeObject(index);
    if (!object) continue;
    const box = new Box3();
    object.traverse((mesh) => {
      if (!isDTSMesh(mesh) || !mesh.binding?.detailIndices.includes(0)) return;
      mesh.geometry.computeBoundingBox();
      box.union(
        mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld),
      );
    });
    if (box.isEmpty()) continue;
    box.applyMatrix4(DTS_BASIS); // Local Three -> Torque, an involution.
    const radius = box.getSize(new Vector3()).length() * 0.5;
    const template = new DTSShape();
    template.data = {
      ...data,
      radius,
      center: box.getCenter(new Vector3()).toArray(),
      bounds: { min: box.min.toArray(), max: box.max.toArray() },
    };
    template.branches = model.scene.branches.filter(
      (branch) => branch.objectIndex === index,
    );
    template.decalFrames = model.scene.decalFrames.slice();
    template.iflTimes = model.scene.iflTimes.slice();
    template.iflLoops = model.scene.iflLoops.slice();
    template.imageAnimations = model.scene.imageAnimations;
    parts.push({ index, radius: radius * 0.5, template });
  }
  cache.set(model, parts);
  return parts;
}

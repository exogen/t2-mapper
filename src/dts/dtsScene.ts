import { Mesh, type Object3D } from "three";
import { DTSObject, DTSShape } from "./dtsModel";

export function getDTSShape(object: Object3D): DTSShape | undefined {
  for (let node: Object3D | null = object; node; node = node.parent)
    if (node instanceof DTSShape) return node;
}
export function getDTSObject(object: Object3D): DTSObject | undefined {
  for (let node: Object3D | null = object; node; node = node.parent)
    if (node instanceof DTSObject) return node;
}

/** Visit current meshes and initialize lazy DTS parts before their first draw.
 * Register material processing before lighting or other material overrides. */
export function observeShapeMeshes(
  root: Object3D,
  initialize: (mesh: Mesh) => void,
): () => void {
  const unsubscribe: (() => void)[] = [];
  root.traverse((node) => {
    if (node instanceof DTSShape)
      unsubscribe.push(node.onMeshAdded(initialize));
    if (node instanceof Mesh) initialize(node);
  });
  return () => unsubscribe.forEach((stop) => stop());
}

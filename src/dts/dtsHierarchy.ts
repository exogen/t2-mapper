import type { Object3D } from "three";
import { objectName, scaleName, transformName } from "./dtsAnimation";
import { dtsQuaternion, dtsVector } from "./dtsGeometry";
import {
  DTSAnimationTransform,
  DTSNode,
  DTSObject,
  DTSShape,
} from "./dtsModel";
import { DTSSequenceFlags, type DTSShapeData } from "./dtsTypes";
import { getDTSNodeLookup } from "./dtsNodeLookup";

interface Layout {
  animatedNodes: Set<number>;
  animatedObjects: Set<number>;
}
const layouts = new WeakMap<DTSShapeData, Layout>();
function layout(data: DTSShapeData): Layout {
  let result = layouts.get(data);
  if (result) return result;
  result = {
    animatedNodes: new Set(
      data.sequences.flatMap((s) => [
        ...s.rotationMatters,
        ...s.translationMatters,
        ...s.scaleMatters,
      ]),
    ),
    animatedObjects: new Set(
      data.sequences.flatMap((s) => [
        ...s.visibilityMatters,
        ...s.frameMatters,
        ...s.materialFrameMatters,
      ]),
    ),
  };
  layouts.set(data, result);
  return result;
}

/** Instance-owned controls with asset-owned topology. Native animation targets
 * are eager; geometry, collision and named-node lookups request other branches. */
export class DTSHierarchy {
  private indexed = false;
  private nodes = new Map<number, DTSNode>();
  private controls = new Map<number, DTSObject>();
  private targets: Record<string, Object3D> = Object.create(null);
  private readonly shape: DTSShape;
  constructor(shape: DTSShape) {
    this.shape = shape;
  }

  private index(): void {
    if (this.indexed) return;
    this.indexed = true;
    const visit = (node: Object3D) => {
      if (node !== this.shape && node instanceof DTSShape) return;
      if (node instanceof DTSNode) this.nodes.set(node.nodeIndex, node);
      if (node instanceof DTSObject) this.controls.set(node.objectIndex, node);
      if (node instanceof DTSAnimationTransform || node instanceof DTSObject)
        this.targets[node.name] = node;
      for (const child of node.children) visit(child);
    };
    visit(this.shape);
  }

  get objects(): Map<number, DTSObject> {
    this.index();
    return this.controls;
  }

  get animationTargets(): Record<string, Object3D> {
    this.index();
    return this.targets;
  }

  node(index: number): DTSNode | undefined {
    this.index();
    const existing = this.nodes.get(index);
    if (existing) return existing;
    const data = this.shape.data,
      source = data.nodes[index];
    if (!source) return;
    const parent = this.node(source.parentIndex) ?? this.shape;
    const node = new DTSNode();
    node.nodeIndex = index;
    node.name = data.names[source.nameIndex];
    const transform = new DTSAnimationTransform();
    transform.name = transformName(index);
    this.targets[transform.name] = transform;
    dtsVector(data.defaultTranslations, index * 3, transform.position);
    dtsQuaternion(data.defaultRotations, index * 4, transform.quaternion);
    let tail = transform;
    // Scale precedes each blend transform: baseMatrix * blendMatrix.
    const addScale = (blend: boolean) => {
      if (
        !data.sequences.some(
          (s) =>
            !!(s.flags & DTSSequenceFlags.Blend) === blend &&
            s.scaleMatters.includes(index),
        )
      )
        return;
      const orient = new DTSAnimationTransform(),
        scale = new DTSAnimationTransform(),
        inverse = new DTSAnimationTransform();
      orient.name = `${scaleName(index, blend)}_rotation`;
      scale.name = scaleName(index, blend);
      inverse.name = `${scaleName(index, blend)}_inverse`;
      for (const target of [orient, scale, inverse])
        this.targets[target.name] = target;
      tail.add(orient);
      orient.add(scale);
      scale.add(inverse);
      tail = inverse;
    };
    addScale(false);
    if (
      data.sequences.some(
        (s) =>
          !!(s.flags & DTSSequenceFlags.Blend) &&
          (s.rotationMatters.includes(index) ||
            s.translationMatters.includes(index) ||
            s.scaleMatters.includes(index)),
      )
    ) {
      const blend = new DTSAnimationTransform();
      blend.name = transformName(index, true);
      this.targets[blend.name] = blend;
      tail.add(blend);
      tail = blend;
      addScale(true);
    }
    tail.add(node);
    this.nodes.set(index, node);
    parent.add(transform);
    // Preserve authored traversal order even when branches arrive out of order.
    const before = parent.children.findIndex(
      (child) =>
        child !== transform &&
        (!(child instanceof DTSAnimationTransform) ||
          Number(child.name.slice("__dts_transform_".length)) > index),
    );
    if (before >= 0) {
      parent.children.pop();
      parent.children.splice(before, 0, transform);
    }
    transform.updateWorldMatrix(true, true, true);
    return node;
  }

  object(index: number): DTSObject | undefined {
    this.index();
    const existing = this.controls.get(index);
    if (existing) return existing;
    const data = this.shape.data,
      source = data.objects[index];
    if (!source) return;
    const object = new DTSObject();
    object.name = objectName(index);
    this.targets[object.name] = object;
    object.objectIndex = index;
    const state = data.objectStates[index];
    object.frame = state?.frame ?? 0;
    object.materialFrame = state?.materialFrame ?? 0;
    object.defaultVisibility = state?.visibility ?? 1;
    object.opacity = object.defaultVisibility;
    this.controls.set(index, object);
    const parent = this.node(source.nodeIndex) ?? this.shape;
    parent.add(object);
    const before = parent.children.findIndex(
      (child) =>
        child !== object &&
        !(child instanceof DTSAnimationTransform) &&
        (!(child instanceof DTSObject) ||
          child.objectIndex < 0 ||
          child.objectIndex > index),
    );
    if (before >= 0) {
      parent.children.pop();
      parent.children.splice(before, 0, object);
    }
    object.updateWorldMatrix(true, false);
    return object;
  }

  prepareAnimations(): void {
    const targets = layout(this.shape.data);
    for (const index of targets.animatedNodes) this.node(index);
    for (const index of targets.animatedObjects) this.object(index);
  }

  ensureNodes(accept: (name: string) => boolean = () => true): void {
    for (let index = 0; index < this.shape.data.nodes.length; index++) {
      const name =
        this.shape.data.names[this.shape.data.nodes[index].nameIndex];
      if (accept(name.toLowerCase())) this.node(index);
    }
  }

  findNode(name: string, exact = false): DTSNode | undefined {
    const lookup = getDTSNodeLookup(this.shape.data);
    const index = exact
      ? lookup.exactNames.get(name)
      : lookup.names.get(name.toLowerCase());
    return index === undefined ? undefined : this.node(index);
  }

  findObject(name: string): Object3D | undefined {
    const node = this.findNode(name, true);
    if (node) return node;
    const object = /^__dts_object_(\d+)$/.exec(name);
    if (object) return this.object(Number(object[1]));
    const helper =
      /^__dts_(?:transform|blend|scale|blendScale)_(\d+)(?:_rotation|_inverse)?$/.exec(
        name,
      );
    if (helper) {
      for (
        let parent = this.node(Number(helper[1]))?.parent;
        parent instanceof DTSAnimationTransform;
        parent = parent.parent
      ) {
        if (parent.name === name) return parent;
      }
    }
    return undefined;
  }
}

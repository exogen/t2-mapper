import { BufferGeometry, Mesh, Object3D, Plane, Vector3 } from "three";
import { buildDTSGeometry, shareDTSGeometry } from "./dtsGeometry";
import { DTSObject, DTSShape } from "./dtsModel";
import { DTSMeshType, type DTSMeshData, type DTSShapeData } from "./dtsTypes";

/** TSStatic::onAdd and ShapeBaseData::preload (Tribes2.exe 0x68f5a0,
 * 0x5e42b0). Missing LOS slots fall back individually, never to render LODs. */
export function getDTSCollisionDetails(
  data: DTSShapeData,
  type: "TSStatic" | "ShapeBase",
  query: "collision" | "ray" = "ray",
): number[] {
  const find = (name: string) =>
    data.details.findIndex(
      (detail) => data.names[detail.nameIndex].toLowerCase() === name,
    );
  return Array.from({ length: 8 }, (_, i) => {
    const collision = find(`collision-${i + 1}`);
    if (type === "TSStatic" || query === "collision") return collision;
    const los = find(`los-${i + 9}`);
    return los < 0 ? collision : los;
  });
}

const geometryCache = new WeakMap<DTSMeshData, BufferGeometry[]>();
function collisionGeometries(source: DTSMeshData): BufferGeometry[] {
  let geometries = geometryCache.get(source);
  if (!geometries) {
    const { geometry, frames } = buildDTSGeometry(source);
    geometries = frames.positions.map((position) => {
      const frame = shareDTSGeometry(geometry);
      frame.setAttribute("position", position);
      frame.clearGroups();
      frame.computeBoundingBox();
      frame.computeBoundingSphere();
      return frame;
    });
    geometryCache.set(source, geometries);
  }
  return geometries;
}

/** A collision-only view of a complete DTS mesh, independent of rendering's
 * material partitions, hidden detail groups, billboards, and merge vertices. */
export class DTSCollisionMesh extends Mesh {
  readonly source: DTSMeshData;
  readonly object: DTSObject;
  private readonly frames: BufferGeometry[];

  constructor(source: DTSMeshData, object: DTSObject) {
    const frames = collisionGeometries(source);
    super(frames[0]);
    this.frames = frames;
    this.source = source;
    this.object = object;
    this.name = object.name;
    this.updateForCollision();
  }

  updateForCollision(): boolean {
    // MeshObjectInstance::castRay tests animated object visibility, not the
    // renderer's detail-group visibility. Negative-size details stay hidden.
    this.visible = this.object.opacity > 0.01;
    this.geometry =
      this.frames[
        Math.max(
          0,
          Math.min(this.frames.length - 1, Math.floor(this.object.frame)),
        )
      ];
    this.object.updateWorldMatrix(true, false);
    this.matrixWorld.copy(this.object.matrixWorld);
    return this.visible;
  }
}

export function getDTSCollisionMeshes(
  root: Object3D,
  type: "TSStatic" | "ShapeBase",
  query: "collision" | "ray" = "ray",
): DTSCollisionMesh[] {
  const meshes: DTSCollisionMesh[] = [];
  const visit = (node: Object3D) => {
    if (!(node instanceof DTSShape)) {
      for (const child of node.children) visit(child);
      return;
    }
    // Collision uses the authored mesh table, never material partitions or
    // render LODs. Mounted shapes have their own collision owner.
    const { data } = node;
    const seen = new Set<string>();
    for (const index of getDTSCollisionDetails(data, type, query)) {
      const detail = data.details[index];
      const subShape = detail && data.subShapes[detail.subShape];
      if (!subShape) continue;
      for (
        let i = subShape.firstObject;
        i < subShape.firstObject + subShape.numObjects;
        i++
      ) {
        const object = data.objects[i];
        if (detail.objectDetail < 0 || detail.objectDetail >= object.numMeshes)
          continue;
        const meshIndex = object.startMeshIndex + detail.objectDetail;
        const key = `${i}:${meshIndex}`;
        if (seen.has(key)) continue;
        const source = data.meshes[meshIndex];
        if (
          !source ||
          source.type === DTSMeshType.Null ||
          source.decal ||
          source.skin ||
          !source.primitives.length
        )
          continue;
        const owner = node.getShapeObject(i);
        if (!owner) continue;
        seen.add(key);
        meshes.push(new DTSCollisionMesh(source, owner));
      }
    }
  };
  visit(root);
  return meshes;
}

const hullCache = new WeakMap<BufferGeometry, Plane[]>();
/** TSMesh::buildConvexHull uses the authored face planes, not a hull inferred
 * from the render mesh's vertices. Preserve whole-mesh plane intersections. */
export function getDTSHullPlanes(geometry: BufferGeometry): readonly Plane[] {
  let planes = hullCache.get(geometry);
  if (planes) return planes;
  planes = [];
  const position = geometry.getAttribute("position"),
    index = geometry.index;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    normal = new Vector3();
  const count = index?.count ?? position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i);
    b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2);
    normal.crossVectors(b.sub(a), c.sub(a));
    if (normal.lengthSq() < 0.001) continue;
    normal.normalize();
    const constant = -normal.dot(a);
    if (
      !planes.some(
        (p) =>
          p.normal.dot(normal) > 0.99 && Math.abs(p.constant - constant) < 0.01,
      )
    )
      planes.push(new Plane(normal.clone(), constant));
  }
  hullCache.set(geometry, planes);
  return planes;
}

/** TSMesh::castRay clips a segment against convex face planes. Rays starting
 * inside the hull do not report an exit hit. Returns the entry fraction. */
export function castDTSHullRay(
  planes: readonly Plane[],
  start: Vector3,
  end: Vector3,
  normal: Vector3,
): number | null {
  let enter = -0.01,
    exit = 1.01;
  let entryPlane: Plane | undefined;
  for (const plane of planes) {
    const a = plane.distanceToPoint(start),
      b = plane.distanceToPoint(end);
    if (a > 0 && b > 0) return null;
    if (a * b > 0 || a === b) continue;
    const t = a / (a - b);
    if (a > 0) {
      if (t > enter) {
        enter = t;
        entryPlane = plane;
      }
    } else exit = Math.min(exit, t);
    if (enter > exit) return null;
  }
  if (!entryPlane) return null;
  normal.copy(entryPlane.normal);
  return enter;
}

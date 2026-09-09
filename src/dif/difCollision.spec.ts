import { afterEach, describe, expect, it } from "vitest";
import { Box3, Color, Group, Matrix4, Texture, Vector3 } from "three";
import { parseDIF } from "./dif";
import { DIFCollision, DIFCollisionMesh, type DIFRayHit } from "./difCollision";
import { createDIFModel } from "./difLoader";
import { createDIFTestBuffer } from "./difTestFixtures";
import { interiorColliderMeshes } from "../world/colliderPolicy";
import {
  castInteriorRay,
  castWorldRay,
  clearWorldColliders,
  firstInteriorFace,
  interiorTrianglesInBox,
  pointInsideInterior,
  pointObstructed,
  registerInteriorCollider,
} from "../collision/worldCollision";
import { collisionState } from "../collision/collisionContext";
import { sampleInteriorLightmap } from "../shapeLighting";

const v = (...[x, y, z]: number[]) => new Vector3(y, z, x);
const hit = (): DIFRayHit => ({
  t: 0,
  point: new Vector3(),
  normal: new Vector3(),
  surfaceIndex: -1,
  startedSolid: false,
});
function fixture() {
  return createDIFModel(createDIFTestBuffer({ collision: true }).buffer);
}
afterEach(() => clearWorldColliders());

describe("native DIF collision", () => {
  it("retains BSP, null surfaces, hulls and coordinate bins", () => {
    const {
      collision: { interior },
    } = fixture();
    expect(interior.bspNodes).toHaveLength(6);
    expect(interior.bspNodes[5].backIndex).toBe(0xc000);
    expect(interior.solidLeaves).toEqual([
      { surfaceStart: 0, surfaceCount: 6 },
    ]);
    expect(interior.nullSurfaces[0].planeIndex).toBe(1);
    expect(interior.convexHulls[0]).toMatchObject({
      min: [0, 0, -2],
      max: [3, 2, 0],
      hullCount: 8,
      surfaceCount: 6,
    });
    expect(interior.hullSurfaceIndices).toContain(0x80000000);
    expect(interior.coordBins).toHaveLength(256);
    expect(interior.coordBinIndices).toEqual([0]);
  });

  it("rejects malformed BSP children, cycles, and collision surface references", () => {
    for (const kind of ["child", "cycle", "surface"]) {
      const { buffer, offsets } = createDIFTestBuffer({ collision: true });
      const view = new DataView(buffer);
      if (kind === "surface")
        view.setUint32(offsets.solidLeafSurfaces, 100, true);
      else
        view.setUint16(offsets.bspNodes + 4, kind === "cycle" ? 0 : 100, true);
      expect(() => parseDIF(buffer)).toThrow(
        kind === "cycle" ? /cyclic BSP/ : /invalid .*index/,
      );
    }
  });

  it.each([
    [[1, 1, 2], [1, 1, -1], [0, 0, 1], 0],
    [[1, 1, -4], [1, 1, -1], [0, 0, -1], -1],
    [[-2, 1, -1], [1, 1, -1], [-1, 0, 0], 1],
    [[5, 1, -1], [2, 1, -1], [1, 0, 0], 2],
    [[1, -2, -1], [1, 1, -1], [0, -1, 0], 3],
    [[1, 4, -1], [1, 1, -1], [0, 1, 0], 4],
  ] as const)(
    "hits the nearest solid boundary from %j",
    (start, end, normal, surfaceIndex) => {
      const { collision } = fixture(),
        out = hit();
      expect(collision.castRay(v(...start), v(...end), out)).toBe(true);
      expect(out.t).toBeCloseTo(2 / 3);
      expect(out.normal.toArray()).toEqual(v(...normal).toArray());
      expect(out.surfaceIndex).toBe(surfaceIndex);
      expect(out.startedSolid).toBe(false);
      expect(
        collision.castRay(v(...start), v(...start).lerp(v(...end), 0.5), out),
      ).toBe(false);
    },
  );

  it("reports solid starts at zero and follows the executable's coplanar rules", () => {
    const { collision } = fixture(),
      out = hit();
    const start = v(1, 1, -1);
    expect(collision.castRay(start, v(10, 1, -1), out)).toBe(true);
    expect(out).toMatchObject({ t: 0, surfaceIndex: -1, startedSolid: true });
    expect(collision.castRay(start, start, out)).toBe(true);
    expect(out.normal.toArray()).toEqual([0, 1, 0]);
    // The last partition has two leaf children, which castRay_r skips on-plane.
    expect(collision.castRay(v(1, 2, -1), v(2, 2, -1), out)).toBe(false);
    expect(collision.containsPoint(start)).toBe(true);
    expect(collision.containsPoint(v(1, 3, -1))).toBe(false);
  });

  it("unfans strips before applying fanMask, while null fans stay intact", () => {
    const data = fixture().collision.interior;
    data.surfaces[0].fanMask = 0b1101;
    const collision = new DIFCollision(data);
    expect(collision.winding(0)).toEqual([0, 3, 2]);
    expect(collision.winding(0x80000000)).toEqual([4, 6, 7, 5]);
  });

  it("uses detail 0 and never promotes unreferenced render surfaces into colliders", () => {
    const model = createDIFModel(
      createDIFTestBuffer({ details: 2, collision: true }).buffer,
      1,
    );
    expect(model.interior.detailLevel).toBe(1);
    expect(model.collision.interior.detailLevel).toBe(0);
    model.interior.bspNodes.length = 0;
    expect(model.collision.castRay(v(1, 1, 2), v(1, 1, -1), hit())).toBe(true);
    const renderOnly = createDIFModel(createDIFTestBuffer().buffer);
    registerInteriorCollider(
      "render-only",
      interiorColliderMeshes(new Group(), renderOnly),
    );
    expect(castWorldRay([1, 1, 2], [1, 1, -1])).toBeNull();
  });

  it("uses native queries in the registry without building a triangle BVH", () => {
    const model = fixture();
    registerInteriorCollider("box", interiorColliderMeshes(new Group(), model));
    const collider = collisionState().interiors.get("box")!.colliders[0];
    Object.defineProperty(collider, "bvh", {
      get() {
        throw new Error("unexpected BVH query");
      },
    });
    expect(castWorldRay([1, 1, 2], [1, 1, -1])?.t).toBeCloseTo(2 / 3);
    expect(castWorldRay([1, 1, -1], [1, 1, -1])?.t).toBe(0);
    expect(pointInsideInterior([1, 1, -1])).toBe(true);
    expect(firstInteriorFace([1, 1, -1], [0, 0, 1], 10)).toEqual({
      dist: 0,
      front: false,
    });
    expect(pointObstructed([1, 1, -2.2], 0.3)).toBe(true);
    expect(pointObstructed([1, 1, -2.4], 0.3)).toBe(false);
  });

  it("measures sphere clearance exactly across corners and nonuniform scale", () => {
    const { collision } = fixture();
    const matrix = new Matrix4().makeScale(1, 3, 2),
      inverse = matrix.clone().invert();
    const nearCorner = v(-0.1, -0.2, -1).applyMatrix4(matrix);
    expect(collision.intersectsSphere(nearCorner, 0.25, matrix, inverse)).toBe(
      false,
    );
    expect(collision.intersectsSphere(nearCorner, 0.29, matrix, inverse)).toBe(
      true,
    );
    const belowNullFace = v(1, 1, -2.1).applyMatrix4(matrix);
    expect(
      collision.intersectsSphere(belowNullFace, 0.29, matrix, inverse),
    ).toBe(false);
    expect(
      collision.intersectsSphere(belowNullFace, 0.31, matrix, inverse),
    ).toBe(true);
  });

  it("treats an authored hull as a solid even without matching BSP render volume", () => {
    const model = fixture();
    model.collision.interior.bspNodes.length = 0;
    registerInteriorCollider(
      "hull",
      interiorColliderMeshes(new Group(), model),
    );
    expect(pointObstructed([1, 1, -1], 0.1)).toBe(true);
    expect(pointObstructed([1, 3, -1], 0.1)).toBe(false);
  });

  it("transforms instance rays and normals, and shares immutable geometry between instances", () => {
    const model = fixture(),
      a = new Group(),
      b = new Group();
    a.position.set(7, 8, 9);
    a.rotation.set(0.2, 0.3, -0.4);
    a.scale.set(2, 3, 4);
    const [first] = interiorColliderMeshes(a, model),
      [second] = interiorColliderMeshes(b, model);
    expect(first).toBeInstanceOf(DIFCollisionMesh);
    expect(first.geometry).toBe(second.geometry);
    expect(a.children).toHaveLength(0);
    registerInteriorCollider("a", [first]);
    const start = v(1, 1, 2).applyMatrix4(a.matrixWorld),
      end = v(1, 1, -1).applyMatrix4(a.matrixWorld);
    const result = castWorldRay(
      [start.z, start.x, start.y],
      [end.z, end.x, end.y],
    )!;
    expect(result.t).toBeCloseTo(2 / 3);
    const expected = v(1, 1, 0).applyMatrix4(a.matrixWorld);
    expect(v(...result.point).distanceTo(expected)).toBeLessThan(1e-6);
    expect(v(...result.normal).dot(start.sub(end).normalize())).toBeCloseTo(1);
  });

  it("returns authored surface hits for analytic lightmap UVs; null hits have no lightmap", () => {
    const model = fixture();
    model.lightMaps[0] = new Texture({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([51, 102, 153, 255]),
    });
    registerInteriorCollider("box", interiorColliderMeshes(new Group(), model));
    const result = castInteriorRay([1, 1, 2], [1, 1, -1])!,
      color = new Color();
    expect(result.faceIndex).toBe(0);
    expect(sampleInteriorLightmap(result, color)).toBe(true);
    expect(color.toArray()).toEqual([0.2, 0.4, 0.6]);
    const nullHit = castInteriorRay([1, 1, -4], [1, 1, -1])!;
    expect(nullHit.faceIndex).toBe(-1);
    expect(sampleInteriorLightmap(nullHit, color)).toBe(false);
  });

  it("emits authored hull triangles, including null faces, only once across bins", () => {
    const model = fixture();
    registerInteriorCollider("box", interiorColliderMeshes(new Group(), model));
    const points: number[] = [];
    const count = interiorTrianglesInBox(
      new Box3(v(-1, -1, -3), v(4, 3, 1)),
      points,
    );
    expect(count).toBe(12 * 9);
    expect(model.collision.geometry.attributes.position.count).toBe(36);
  });
});

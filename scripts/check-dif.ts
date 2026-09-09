/** Validate every local native DIF's rendering and collision. No Blender needed. */
import { glob, readFile } from "node:fs/promises";
import { Matrix4, Vector3 } from "three";
import { createDIFModel, disposeDIFModel } from "../src/dif/difLoader";

let files = 0;
let surfaces = 0;
let triangles = 0;
let lightMaps = 0;
let failed = 0;
let bspNodes = 0;
let hulls = 0;
let collisionTriangles = 0;
let vehicleFiles = 0;
let vehicleHulls = 0;
let vehicleTriangles = 0;
const identity = new Matrix4();
const rayHit = {
  t: 0,
  point: new Vector3(),
  normal: new Vector3(),
  surfaceIndex: -1,
  startedSolid: false,
};
const a = new Vector3(),
  b = new Vector3(),
  c = new Vector3(),
  n = new Vector3();
for await (const file of glob(process.argv[2] ?? "docs/base/**/*.dif")) {
  try {
    const bytes = await readFile(file);
    const model = createDIFModel(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    );
    try {
      const collision = model.collision;
      bspNodes += collision.interior.bspNodes.length;
      hulls += collision.interior.convexHulls.length;
      collisionTriangles += collision.geometry.attributes.position.count / 3;
      if (!collision.geometry.attributes.position.array.every(Number.isFinite))
        throw new Error("collision contains non-finite positions");
      // Probe real partitions from both directions, including solid starts.
      collision.bounds.getCenter(a);
      for (let axis = 0; axis < 3; axis++) {
        b.copy(a).setComponent(
          axis,
          collision.bounds.min.getComponent(axis) - 1,
        );
        c.copy(a).setComponent(
          axis,
          collision.bounds.max.getComponent(axis) + 1,
        );
        for (const [start, end] of [
          [b, c],
          [c, b],
          [a, c],
        ]) {
          if (
            collision.castRay(start, end, rayHit) &&
            (!Number.isFinite(rayHit.t) ||
              rayHit.t < 0 ||
              rayHit.t > 1 ||
              !rayHit.normal.toArray().every(Number.isFinite))
          )
            throw new Error("invalid BSP ray hit");
        }
      }
      collision.intersectsSphere(a, 0.5, identity, identity);
      const vehicle = collision.vehicleHulls;
      if (vehicle) {
        vehicleFiles++;
        vehicleHulls += vehicle.data.convexHulls.length;
        let surfaceIndex = 0;
        for (const [index, hull] of vehicle.data.convexHulls.entries()) {
          a.set(0, 0, 0);
          for (let i = 0; i < hull.hullCount; i++)
            a.add(vehicle.points[vehicle.data.hullIndices[hull.hullStart + i]]);
          a.divideScalar(hull.hullCount);
          for (const polygon of vehicle.data.hullPolygons[index]) {
            const plane = vehicle.planes[surfaceIndex++];
            if (
              !Number.isFinite(plane.constant) ||
              Math.abs(plane.normal.lengthSq() - 1) > 1e-5
            )
              throw new Error(`invalid vehicle plane in hull ${index}`);
            for (let i = 0; i < hull.hullCount; i++) {
              const point =
                vehicle.points[vehicle.data.hullIndices[hull.hullStart + i]];
              if (plane.distanceToPoint(point) > 0.01)
                throw new Error(`vehicle face is not outward in hull ${index}`);
            }
            vehicleTriangles += polygon.length - 2;
          }
          if (!vehicle.containsPoint(a))
            throw new Error(
              `vehicle hull ${index} excludes its vertex centroid`,
            );
          if (
            !collision.intersectsSphere(a, 0.01, identity, identity, "vehicle")
          )
            throw new Error(`vehicle hull ${index} misses a contained sphere`);
        }
        collision.visitHullTriangles(
          vehicle.bounds,
          (a, b, c) => {
            if (
              ![a, b, c].every((point) =>
                point.toArray().every(Number.isFinite),
              )
            )
              throw new Error(
                "vehicle collision contains non-finite positions",
              );
            return false;
          },
          "vehicle",
        );
      }
      for (const mesh of model.surfaceMeshes) {
        const geometry = mesh.geometry;
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
          if (!attribute.array.every(Number.isFinite))
            throw new Error(`${name} contains non-finite values`);
        }
        const position = geometry.getAttribute("position");
        const normal = geometry.getAttribute("normal");
        const index = geometry.index!;
        for (let i = 0; i < index.count; i += 3) {
          a.fromBufferAttribute(position, index.getX(i));
          b.fromBufferAttribute(position, index.getX(i + 1));
          c.fromBufferAttribute(position, index.getX(i + 2));
          n.fromBufferAttribute(normal, index.getX(i));
          const longestEdgeSquared = Math.max(
            a.distanceToSquared(b),
            a.distanceToSquared(c),
            b.distanceToSquared(c),
          );
          const cross = b.sub(a).cross(c.sub(a));
          // Near-degenerate export seams have no reliable geometric normal.
          if (
            cross.length() > 1e-4 + longestEdgeSquared * 1e-6 &&
            cross.normalize().dot(n) < -0.01
          ) {
            throw new Error(
              `triangle ${i / 3} winding opposes its plane normal`,
            );
          }
        }
        triangles += index.count / 3;
      }
      surfaces += model.interior.surfaces.length;
      lightMaps += model.lightMaps.length;
      files++;
    } finally {
      disposeDIFModel(model);
    }
  } catch (error) {
    console.error(`${file}: ${(error as Error).message}`);
    failed++;
  }
}
console.log(
  `${files} DIFs, ${surfaces} surfaces, ${triangles} render triangles, ${lightMaps} lightmaps, ${bspNodes} BSP nodes, ${hulls} hulls, ${collisionTriangles} collision triangles; ${vehicleFiles} vehicle DIFs, ${vehicleHulls} vehicle hulls, ${vehicleTriangles} vehicle triangles; ${failed} failed`,
);
if (failed || !files) process.exitCode = 1;

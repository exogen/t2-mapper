import { describe, expect, it } from "vitest";
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { buildDTS } from "./dtsBuilder";
import { buildDTSGeometry } from "./dtsGeometry";
import { DTSMesh, DTSObject } from "./dtsModel";
import { createDTSTestShape } from "./dtsTestFixtures";

describe("DTS culling bounds", () => {
  it.each([0, new Float32Array(new Int32Array([1]).buffer)[0], 1, 100])(
    "bounds actual vertices independently of the stored radius %s",
    (radius) => {
      const source = createDTSTestShape().meshes[0];
      source.radius = radius;
      source.center = [100, 100, 100];
      source.bounds = { min: [0, 0, 0], max: [0, 0, 0] };
      const { geometry, frames } = buildDTSGeometry(source);
      const point = new Vector3();
      for (const position of frames.positions)
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i);
          expect(geometry.boundingBox!.containsPoint(point)).toBe(true);
          expect(
            point.distanceTo(geometry.boundingSphere!.center),
          ).toBeLessThanOrEqual(geometry.boundingSphere!.radius);
        }
      expect(geometry.boundingSphere!.radius).toBeCloseTo(Math.sqrt(2));
    },
  );

  it.each([
    ["left", -5.5, 0, -5],
    ["right", 5.5, 0, -5],
    ["top", 0, 5.5, -5],
    ["bottom", 0, -5.5, -5],
    ["camera inside mesh", 0, 0, 0.2],
  ] as const)("retains visible geometry at the %s", (label, x, y, z) => {
    const data = createDTSTestShape();
    const source = data.meshes[0];
    source.vertices = new Float32Array([-2, 0, -2, 2, 0, -2, 0, 0, 2]);
    // Tribes 2 writes a truncated integer radius; the add-on reads its bits
    // as a float. Neither encoding is a reliable enclosing sphere.
    source.radius = new Float32Array(new Int32Array([2]).buffer)[0];
    const { scene } = buildDTS(data);
    scene.position.set(x, y, z);
    if (label === "camera inside mesh") {
      scene.rotation.x = Math.PI / 2;
      scene.scale.x = 0.5;
    }
    scene.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(90, 1, 0.1, 100);
    camera.updateMatrixWorld();
    scene.update(camera);
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    let mesh!: DTSMesh;
    scene.traverse((node) => {
      if (node instanceof DTSMesh) mesh = node;
    });
    const position = mesh.geometry.getAttribute("position");
    expect(frustum.containsPoint(scene.position)).toBe(false);
    expect(
      Array.from({ length: position.count }, (_, i) =>
        frustum.containsPoint(
          new Vector3()
            .fromBufferAttribute(position, i)
            .applyMatrix4(mesh.matrixWorld),
        ),
      ).some(Boolean),
    ).toBe(true);
    expect(mesh.parent!.visible).toBe(true);
    expect(mesh.frustumCulled).toBe(true);
    expect(frustum.intersectsObject(mesh)).toBe(true);

    scene.position.set(50, 0, -5);
    scene.updateMatrixWorld(true);
    expect(frustum.intersectsObject(mesh)).toBe(false);
  });

  it.each([false, true])(
    "covers every animated frame (sorted: %s)",
    (sorted) => {
      const data = createDTSTestShape();
      const source = data.meshes[0];
      source.numFrames = 2;
      source.vertices = new Float32Array([
        ...source.vertices,
        ...source.vertices.map((v, i) => (i % 3 === 0 ? v + 10 : v)),
      ]);
      source.normals = new Float32Array([...source.normals, ...source.normals]);
      if (sorted) {
        source.type = 3;
        source.sorted = {
          clusters: [
            {
              startPrimitive: 0,
              endPrimitive: 1,
              normal: [0, 0, 0],
              k: 0,
              frontCluster: -1,
              backCluster: -1,
            },
          ],
          startCluster: new Int32Array([0, 0]),
          firstVerts: new Int32Array([0, 3]),
          numVerts: new Int32Array([3, 3]),
          firstTVerts: new Int32Array([0, 0]),
          alwaysWriteDepth: false,
        };
      }
      const { scene } = buildDTS(data);
      const object = scene.getObjectByName("__dts_object_0") as DTSObject;
      const camera = new PerspectiveCamera();
      let mesh!: DTSMesh;
      scene.traverse((node) => {
        if (node instanceof DTSMesh) mesh = node;
      });
      // Dynamic instances allocate a geometry view on their first update.
      scene.update(camera);
      const sphere = mesh.geometry.boundingSphere!;
      for (const frame of [0, 1, 0]) {
        object.frame = frame;
        scene.update(camera);
        const position = mesh.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          const point = new Vector3().fromBufferAttribute(position, i);
          expect(mesh.geometry.boundingBox!.containsPoint(point)).toBe(true);
          expect(point.distanceTo(sphere.center)).toBeLessThanOrEqual(
            sphere.radius,
          );
        }
        expect(mesh.geometry.boundingSphere).toBe(sphere);
      }
    },
  );
});

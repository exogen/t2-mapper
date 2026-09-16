import { describe, expect, it, vi } from "vitest";
import {
  Bone,
  Box3,
  BufferAttribute,
  BufferGeometry,
  DetachedBindMode,
  Frustum,
  Group,
  Matrix4,
  MeshLambertMaterial,
  PerspectiveCamera,
  Skeleton,
  Vector3,
  type SkinnedMesh,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { DTSRigidMeshBatch } from "./dtsModel";
import { computeDTSSkinBounds } from "./dtsSkinBounds";
import { buildDTS } from "./dtsBuilder";
import { batchDTSRigidMeshes } from "./dtsRigidBatch";
import { createDTSRigidTestShape } from "./dtsTestFixtures";

function fixture() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), 3),
  );
  geometry.setAttribute(
    "skinIndex",
    new BufferAttribute(
      new Uint16Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
      4,
    ),
  );
  geometry.setAttribute(
    "skinWeight",
    new BufferAttribute(
      new Float32Array([1, 0, 0, 0, 0.3, 0.7, 0, 0, 0.6, 0.4, 0, 0]),
      4,
    ),
  );
  const root = new Group(),
    mount = new Bone(),
    a = new Bone(),
    b = new Bone();
  root.add(mount);
  mount.add(a);
  a.add(b);
  b.position.set(1, 2, 3);
  const mesh = new DTSRigidMeshBatch(geometry, new MeshLambertMaterial());
  mount.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([a, b]), new Matrix4());
  return { root, mount, a, b, mesh };
}

function cameraFrustum(camera = new PerspectiveCamera(60, 1, 0.1, 100)) {
  camera.updateMatrixWorld(true);
  return new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
  );
}

function containsPose(mesh: SkinnedMesh) {
  const bounds = new Box3();
  expect(computeDTSSkinBounds(mesh, bounds)).toBe(true);
  for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++)
    expect(bounds.containsPoint(mesh.getVertexPosition(i, new Vector3()))).toBe(
      true,
    );
}

describe("conservative DTS skin culling", () => {
  it.each([false, true])(
    "contains actual posed vertices, with detached binding: %s",
    (detached) => {
      const { root, mount, a, b, mesh } = fixture();
      if (detached) {
        mesh.bindMode = DetachedBindMode;
        mesh.bind(mesh.skeleton, new Matrix4().makeTranslation(2, -3, 4));
      }
      for (let i = 0; i < 40; i++) {
        const t = i * 0.37;
        root.position.set(1000 + i, -200, 300);
        root.scale.set(2, 3, -1.5);
        mount.rotation.set(t, t * 0.5, -t);
        a.rotation.set(-t * 0.3, t, 0.4);
        b.position.set(Math.sin(t) * 20, 2, Math.cos(t) * 5);
        b.scale.set(1.5, 0.7, 2);
        root.updateMatrixWorld(true);
        containsPose(mesh);
      }
    },
  );

  it("culls distant poses but retains geometry at either edge or around the camera", () => {
    const { root, mount, mesh } = fixture();
    const frustum = cameraFrustum();
    for (const [x, z, visible] of [
      [100, -10, false],
      [-100, -10, false],
      [0, 10, false],
      [5.8, -10, true],
      [-5.8, -10, true],
      [0, -0.2, true],
    ] as const) {
      mount.position.set(x, 0, z);
      root.updateMatrixWorld(true);
      expect(mesh.intersectsFrustum(frustum)).toBe(visible);
    }
    // Same bones, a different camera/pass: no stale visibility decision.
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.x = 100;
    expect(mesh.intersectsFrustum(cameraFrustum(camera))).toBe(false);
  });

  it("bounds articulated batches and independent cloned mount hierarchies", () => {
    const { scene, nodes } = buildDTS(createDTSRigidTestShape());
    const [batch] = batchDTSRigidMeshes(scene);
    expect(batch).toBeInstanceOf(DTSRigidMeshBatch);
    nodes[1].position.set(200, 2, 3);
    scene.updateMatrixWorld(true);
    containsPose(batch as DTSRigidMeshBatch);
    const copy = clone(scene);
    const mount = new Group();
    mount.position.set(800, 900, 1000);
    mount.rotation.set(0.3, 1.7, -0.2);
    mount.scale.set(3, 1, 2);
    mount.add(copy);
    mount.updateMatrixWorld(true);
    const copiedBatch = copy.children.find(
      (n) => n instanceof DTSRigidMeshBatch,
    )!;
    containsPose(copiedBatch);
    expect(copiedBatch.geometry).toBe(batch.geometry);
    expect(copiedBatch.skeleton).not.toBe(
      (batch as DTSRigidMeshBatch).skeleton,
    );
  });

  it("shares rest bounds, reads only bones for later poses, and invalidates changed attributes", () => {
    const { root, mesh, a } = fixture();
    root.updateMatrixWorld(true);
    const bounds = new Box3();
    computeDTSSkinBounds(mesh, bounds);
    const position = mesh.geometry.getAttribute("position");
    const read = vi.spyOn(position, "getX");
    a.position.x = 10;
    root.updateMatrixWorld(true);
    computeDTSSkinBounds(mesh, bounds);
    expect(read).not.toHaveBeenCalled();
    position.setX(0, 200);
    position.needsUpdate = true;
    containsPose(mesh);
    expect(read).toHaveBeenCalled();
    mesh.geometry.setAttribute("position", position.clone());
    containsPose(mesh);
  });

  it("leaves transparent sorting centers unchanged", () => {
    const { root, mesh } = fixture();
    root.position.z = -10;
    root.updateMatrixWorld(true);
    (mesh.material as MeshLambertMaterial).transparent = true;
    mesh.computeBoundingSphere();
    const sphere = mesh.boundingSphere!.clone();
    expect(mesh.intersectsFrustum(cameraFrustum())).toBe(true);
    expect(mesh.boundingSphere).toEqual(sphere);
  });

  it.each([
    "negative weight",
    "unnormalized weight",
    "missing bone",
    "morph",
    "nonfinite",
  ])("keeps uncertain %s data visible", (kind) => {
    const { root, mesh } = fixture();
    root.position.set(1000, 0, 0);
    root.updateMatrixWorld(true);
    if (kind === "negative weight")
      mesh.geometry.getAttribute("skinWeight").setX(0, -1);
    if (kind === "unnormalized weight")
      mesh.geometry.getAttribute("skinWeight").setX(0, 2);
    if (kind === "missing bone")
      mesh.geometry.getAttribute("skinIndex").setX(0, 99);
    if (kind === "morph")
      mesh.geometry.morphAttributes.position = [
        mesh.geometry.getAttribute("position").clone(),
      ];
    if (kind === "nonfinite")
      mesh.geometry.getAttribute("position").setX(0, NaN);
    expect(mesh.intersectsFrustum(cameraFrustum())).toBe(true);
  });
});

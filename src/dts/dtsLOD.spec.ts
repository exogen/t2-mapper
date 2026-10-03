import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  AnimationMixer,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  QuaternionKeyframeTrack,
  Raycaster,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import {
  DTSDetail,
  DTSMesh,
  DTSNode,
  DTSObject,
  DTSRigidMeshBatch,
  DTSStaticMeshBatch,
  isDTSMeshBatch,
  setDTSRenderSettings,
  type DTSShape,
} from "./dtsModel";
import { batchDTSRigidMeshes } from "./dtsRigidBatch";
import { createDTSRigidTestShape, createDTSTestShape } from "./dtsTestFixtures";

function lodShape() {
  const data = createDTSTestShape();
  data.radius = 1;
  data.details[0].size = 60;
  data.details.push({ ...data.details[0], size: 10, objectDetail: 1 });
  data.smallestVisibleSize = 5;
  data.smallestVisibleDetail = 1;
  data.objects[0].numMeshes = 2;
  data.meshes.push({ ...data.meshes[0] });
  const { scene } = buildDTS(data);
  scene.detailLevel = null;
  scene.viewportHeight = 1000;
  return scene;
}

describe("automatic DTS LOD", () => {
  it("toggles existing and newly loaded shapes without overwriting explicit details", () => {
    const shape = lodShape();
    const camera = new PerspectiveCamera(90, 1, 0.1, 10000);
    camera.position.z = 10;
    camera.updateMatrixWorld();
    const activeDetail = (target = shape, view = camera) => {
      target.update(view);
      const visible: number[] = [];
      target.traverseVisible((node) => {
        if (node instanceof DTSMesh)
          visible.push(...node.binding!.detailIndices);
      });
      return visible;
    };
    expect(activeDetail()).toEqual([1]);
    setDTSRenderSettings(camera, 1000, false);
    expect(activeDetail()).toEqual([0]);
    expect(shape.detailLevel).toBeNull();
    expect(activeDetail(lodShape())).toEqual([0]);
    // A separate camera retains its own automatic LOD configuration.
    expect(activeDetail(shape, camera.clone())).toEqual([1]);
    expect(activeDetail()).toEqual([0]);
    shape.detailLevel = 1;
    shape.intraDetailLevel = 0.4;
    expect(activeDetail()).toEqual([1]);
    expect(shape.intraDetailLevel).toBe(0.4);
    shape.detailLevel = null;
    expect(activeDetail()).toEqual([0]);
    expect(shape.intraDetailLevel).toBe(1);
    // Re-enabling at a boundary starts a fresh selection, without stale hysteresis.
    camera.position.z = 500 / 65;
    camera.updateMatrixWorld();
    setDTSRenderSettings(camera, 1000, true);
    expect(activeDetail()).toEqual([0]);
    camera.position.z = 1000;
    camera.updateMatrixWorld();
    expect(activeDetail()).toEqual([]);
    setDTSRenderSettings(camera, 1000, false);
    expect(activeDetail()).toEqual([0]);
  });

  it("raycasts only the active detail after multiple levels have been realized", () => {
    const shape = lodShape();
    shape.ensureDetail(1);
    const ray = new Raycaster(new Vector3(0, -5, 0), new Vector3(0, 1, 0));
    for (const detail of [0, 1, 0]) {
      shape.detailLevel = detail;
      shape.updateMatrixWorld(true);
      shape.update(new PerspectiveCamera());
      const hits = ray.intersectObject(shape, true);
      expect(hits).toHaveLength(1);
      expect((hits[0].object as DTSMesh).binding!.detailIndices).toEqual([
        detail,
      ]);
    }
  });
  it("switches discretely, with hysteresis when approaching or reappearing", () => {
    const shape = lodShape();
    const camera = new PerspectiveCamera(90, 1, 0.1, 10000);
    const atPixels = (pixels: number) => {
      camera.position.z = 500 / pixels;
      camera.updateMatrixWorld();
      shape.update(camera);
      expect(shape.intraDetailLevel).toBe(1);
      return shape.selectDetail(camera);
    };
    expect(atPixels(50)).toBe(1);
    expect(atPixels(65)).toBe(1);
    expect(atPixels(70)).toBe(0);
    expect(atPixels(61)).toBe(0);
    expect(atPixels(59)).toBe(1);
    expect(atPixels(4)).toBe(-1);
    expect(atPixels(5.1)).toBe(-1);
    expect(atPixels(6)).toBe(1);
    // Seeking/teleporting can cross any number of boundaries at once.
    expect(atPixels(500)).toBe(0);
    expect(atPixels(1)).toBe(-1);
  });

  it("uses each camera's viewport, projection and object scale", () => {
    const shape = lodShape();
    shape.viewportHeight = null;
    const camera = new PerspectiveCamera(90, 1, 0.1, 10000);
    camera.position.z = 10;
    camera.updateMatrixWorld();
    setDTSRenderSettings(camera, 1000);
    expect(shape.selectDetail(camera)).toBe(1);
    setDTSRenderSettings(camera, 2000);
    expect(shape.selectDetail(camera)).toBe(0);
    setDTSRenderSettings(camera, 1000);
    camera.zoom = 2;
    camera.updateProjectionMatrix();
    expect(shape.selectDetail(camera)).toBe(0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    shape.scale.setScalar(2);
    shape.updateMatrixWorld();
    expect(shape.selectDetail(camera)).toBe(0);
    shape.scale.setScalar(1);
    shape.updateMatrixWorld();
    const ortho = new OrthographicCamera(-10, 10, 10, -10, 0.1, 10000);
    setDTSRenderSettings(ortho, 1000);
    ortho.position.z = 1000;
    ortho.updateMatrixWorld();
    expect(shape.selectDetail(ortho)).toBe(1);
    ortho.position.z = 10;
    ortho.updateMatrixWorld();
    expect(shape.selectDetail(ortho)).toBe(1);
  });

  it("preserves explicit detail/merge controls and negative-size effect details", () => {
    const shape = lodShape();
    const camera = new PerspectiveCamera();
    camera.position.z = 10000;
    camera.updateMatrixWorld();
    shape.detailLevel = 0;
    shape.intraDetailLevel = 0.4;
    shape.update(camera);
    expect(shape.intraDetailLevel).toBe(0.4);
    shape.detailLevel = null;
    shape.data.details[0].size = -1;
    shape.ignoreDetailSize = true;
    shape.update(camera);
    const visible: DTSMesh[] = [];
    shape.traverseVisible((node) => {
      if (node instanceof DTSMesh) visible.push(node);
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].binding!.detailIndices).toEqual([0]);
  });
});

function rigidLOD(animated: boolean) {
  const data = createDTSRigidTestShape();
  if (!animated) data.sequences = [];
  data.meshes = data.meshes.flatMap((mesh) => [
    mesh,
    { ...mesh, vertices: mesh.vertices.map((n) => n * 0.5) },
  ]);
  data.objects.forEach((object, i) => {
    object.startMeshIndex = i * 2;
    object.numMeshes = 2;
  });
  data.details.push({ ...data.details[0], size: 0.1, objectDetail: 1 });
  data.smallestVisibleDetail = 1;
  return buildDTS(data).scene;
}

describe("lazy DTS LOD batches", () => {
  it.each([false, true])(
    "returns to the current pose after LOD changes, culling and rewinds (batched: %s)",
    (batched) => {
      const source = rigidLOD(true);
      if (batched) batchDTSRigidMeshes(source);
      const actual = clone(source) as DTSShape;
      const reference = clone(source) as DTSShape;
      reference.ensureAllDetails();
      // The reference eagerly refreshes even hidden branches using Three's
      // ordinary matrix path; it cannot inherit a stale hidden-LOD transform.
      reference.traverse((node) => {
        if (
          node instanceof DTSNode ||
          node instanceof DTSObject ||
          node instanceof DTSDetail
        )
          node.updateMatrixWorld = Object3D.prototype.updateMatrixWorld;
      });
      const rotations = [0, 1.4, -0.7].flatMap((angle) =>
        new Quaternion()
          .setFromAxisAngle(new Vector3(0, 1, 0), angle)
          .toArray(),
      );
      const clip = new AnimationClip("pose", 2, [
        new VectorKeyframeTrack(
          ".animationTargets[__dts_transform_0].position",
          [0, 1, 2],
          [0, 0, 0, 3, -2, 1, -1, 4, 2],
        ),
        new QuaternionKeyframeTrack(
          ".animationTargets[__dts_transform_1].quaternion",
          [0, 1, 2],
          rotations,
        ),
      ]);
      const models = [actual, reference].map((shape) => {
        const mixer = new AnimationMixer(shape);
        mixer.clipAction(clip).play();
        const mount = new Group();
        mount.position.set(3, 1, -2);
        shape.getNode(1)!.add(mount);
        return { shape, mixer, mount };
      });
      const camera = new PerspectiveCamera();
      const surfaceKey = (mesh: Mesh) =>
        isDTSMeshBatch(mesh) ? mesh.bindings : (mesh as DTSMesh).binding;
      for (const [time, detail] of [
        [0, 0],
        [0.2, 1],
        [0.8, 1],
        [1.2, -1],
        [1.7, -1],
        [0.3, 0],
        [1.8, 1],
        [0.1, 0],
      ]) {
        for (const { shape, mixer } of models) {
          mixer.setTime(time);
          shape.position.set(7 * time, -2 * time, 4);
          shape.rotation.set(0.2 * time, 0.7 * time, -0.1);
          shape.scale.set(2, 3, 4);
          // Direct bone/control edits must also survive an identity reset.
          shape.getNode(1)!.rotation.z = time > 1 ? 0.4 : 0;
          shape.getShapeObject(0)!.position.x = time > 1 ? 0.2 : 0;
          shape.detailLevel = detail;
          shape.updateMatrixWorld(true);
          shape.update(camera);
        }
        expect(models[0].mount.matrixWorld.elements).toEqual(
          models[1].mount.matrixWorld.elements,
        );
        const expected = new Map<ReturnType<typeof surfaceKey>, Mesh>();
        reference.traverseVisible((node) => {
          if (node instanceof Mesh) expected.set(surfaceKey(node), node);
        });
        let surfaces = 0;
        actual.traverseVisible((node) => {
          if (!(node instanceof Mesh)) return;
          const other = expected.get(surfaceKey(node))!;
          expect(other).toBeDefined();
          surfaces++;
          for (let i = 0; i < node.geometry.attributes.position.count; i++) {
            const actualPosition = node
              .getVertexPosition(i, new Vector3())
              .applyMatrix4(node.matrixWorld);
            const expectedPosition = other
              .getVertexPosition(i, new Vector3())
              .applyMatrix4(other.matrixWorld);
            expect(actualPosition.distanceTo(expectedPosition)).toBeLessThan(
              1e-8,
            );
          }
        });
        expect(surfaces).toBe(detail < 0 ? 0 : batched ? 1 : 2);
      }
    },
  );

  for (const animated of [false, true])
    it(`shares lower-detail geometry while retaining instance poses and materials (${animated ? "animated" : "static"})`, () => {
      const source = rigidLOD(animated);
      batchDTSRigidMeshes(source);
      const left = clone(source) as DTSShape,
        right = clone(source) as DTSShape;
      const skin = new MeshLambertMaterial({ color: "red" });
      let initialized = 0;
      left.onMeshAdded((mesh) => {
        mesh.material = skin;
        initialized++;
      });
      const camera = new PerspectiveCamera();
      if (animated) left.getNode(1)!.rotation.y = 0.7;
      left.position.set(3, 4, 5);
      left.detailLevel = right.detailLevel = 1;
      left.updateMatrixWorld(true);
      left.update(camera);
      right.updateMatrixWorld(true);
      right.update(camera);
      const batches = (shape: DTSShape) =>
        shape.children.filter(
          (n) =>
            n instanceof DTSRigidMeshBatch || n instanceof DTSStaticMeshBatch,
        );
      expect(batches(source)).toHaveLength(1);
      expect(batches(left)).toHaveLength(2);
      const a = batches(left)[1],
        b = batches(right)[1];
      expect(a.visible).toBe(true);
      expect(batches(left)[0].visible).toBe(false);
      expect(a.material).toBe(skin);
      expect(b.material).not.toBe(skin);
      expect(a.geometry).toBe(b.geometry);
      expect(initialized).toBe(3); // Two native parts, then their batch.
      if (a instanceof DTSRigidMeshBatch && b instanceof DTSRigidMeshBatch) {
        expect(a.skeleton.bones).toContain(left.getNode(1));
        expect(a.skeleton.bones).not.toContain(right.getNode(1));
      }
      const native: DTSMesh[] = [];
      left.traverse((n) => {
        if (n instanceof DTSMesh && n.binding!.detailIndices.includes(1))
          native.push(n);
      });
      let offset = 0;
      for (const part of native) {
        part.updateWorldMatrix(true, false);
        for (let i = 0; i < part.geometry.getAttribute("position").count; i++) {
          const expected = part
            .getVertexPosition(i, new Vector3())
            .applyMatrix4(part.matrixWorld);
          const actual = a
            .getVertexPosition(offset++, new Vector3())
            .applyMatrix4(a.matrixWorld);
          expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
        }
      }
      left.getShapeObject(0)!.opacity = 0.5;
      left.update(camera);
      expect(a.visible).toBe(false);
      expect(native.every((part) => part.parent!.visible)).toBe(true);
      left.getShapeObject(0)!.opacity = 1;
      left.detailLevel = 0;
      left.update(camera);
      expect(a.visible).toBe(false);
      left.detailLevel = 1;
      left.update(camera);
      expect(a.visible).toBe(true);
      expect(initialized).toBe(3);
      const copied = clone(left) as DTSShape;
      copied.updateMatrixWorld(true);
      copied.update(camera);
      expect(batches(copied)).toHaveLength(2);
      expect(batches(copied)[1].visible).toBe(true);
    });
});

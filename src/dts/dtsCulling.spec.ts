import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Group,
  Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
} from "three";
import { DTSNode, DTSShape, setDTSCullCamera } from "./dtsModel";
import type { DTSShapeData } from "./dtsTypes";
import { isShownInHierarchy, isVisibleInHierarchy } from "../objectUtils";

// At the origin, looking down -Z.
const camera = new PerspectiveCamera(60, 1, 0.1, 100);

function shapeScene() {
  const scene = new Scene();
  scene.matrixAutoUpdate = false;
  const shape = new DTSShape();
  shape.data = { center: [0, 0, 0], radius: 1 } as unknown as DTSShapeData;
  shape.position.set(0, 0, -10);
  const node = new DTSNode();
  node.position.set(0, 1, 0);
  shape.add(node);
  scene.add(shape);
  return { scene, shape, node };
}

function renderPass(scene: Scene) {
  setDTSCullCamera(camera);
  scene.updateMatrixWorld();
  setDTSCullCamera(null);
}

/** A reach (a shadow, say) around this point on the view axis. */
const reachAt = (z: number) => (_: unknown, target: Sphere) =>
  target.set(new Vector3(0, 0, z), 2);

const worldY = (object: Object3D) =>
  new Vector3().setFromMatrixPosition(object.matrixWorld).y;

afterEach(() => setDTSCullCamera(null));

describe("DTS shape frustum culling", () => {
  it("hides a shape outside the view and skips its nodes until it returns", () => {
    const { scene, shape, node } = shapeScene();
    renderPass(scene);
    expect(shape.visible).toBe(true);
    expect(worldY(node)).toBe(1);

    shape.position.set(0, 0, 10);
    node.position.set(0, 2, 0);
    renderPass(scene);
    expect(shape.culled).toBe(true);
    expect(shape.visible).toBe(false);
    expect(worldY(node)).toBe(1);

    shape.position.set(0, 0, -10);
    renderPass(scene);
    expect(shape.visible).toBe(true);
    expect(worldY(node)).toBe(2);
  });

  it("keeps a culled shape's sounds and mounts current", () => {
    const { scene, shape, node } = shapeScene();
    const sound = new Object3D();
    shape.add(sound);
    const mount = new Group();
    mount.matrixAutoUpdate = false;
    node.add(mount);
    shape.keepMountCurrent(mount);
    renderPass(scene);

    shape.position.set(0, 3, 10);
    node.position.set(0, 2, 0);
    renderPass(scene);
    expect(shape.culled).toBe(true);
    expect(worldY(sound)).toBe(3);
    expect(worldY(mount)).toBe(5);
  });

  it("catches up deferred animation before posing a shape back in view", () => {
    const { scene, shape, node } = shapeScene();
    shape.position.set(0, 0, 10);
    renderPass(scene);
    let catchUps = 0;
    shape.catchUpPose = () => {
      catchUps++;
      node.position.set(0, 3, 0);
    };
    renderPass(scene);
    expect(catchUps).toBe(0);
    shape.position.set(0, 0, -10);
    renderPass(scene);
    expect(catchUps).toBe(1);
    expect(worldY(node)).toBe(3);
    renderPass(scene);
    expect(catchUps).toBe(1);
  });

  it("keeps a shape posed, but not drawn, while its reach is in view", () => {
    const { scene, shape, node } = shapeScene();
    // Behind the camera, with its reach in view.
    shape.position.set(0, 0, 10);
    shape.reachBounds = reachAt(-5);
    const selectDetail = vi.spyOn(shape, "update").mockImplementation(() => {});
    node.position.set(0, 2, 0);
    renderPass(scene);
    expect(shape.culled).toBe(true);
    expect(shape.visible).toBe(false);
    expect(shape.dormant).toBe(false);
    expect(worldY(node)).toBe(2);
    // The renderer selects details only for what it draws.
    expect(selectDetail).toHaveBeenCalledWith(camera);
  });

  it("goes dormant once its reach is out of view too", () => {
    const { scene, shape, node } = shapeScene();
    renderPass(scene);
    shape.position.set(0, 0, 10);
    shape.reachBounds = reachAt(12);
    node.position.set(0, 2, 0);
    renderPass(scene);
    expect(shape.culled).toBe(true);
    expect(shape.dormant).toBe(true);
    expect(worldY(node)).toBe(1);
  });

  it("keeps what a shape posed for its reach carries posed", () => {
    const { scene, shape, node } = shapeScene();
    vi.spyOn(shape, "update").mockImplementation(() => {});
    const mounted = new DTSShape();
    mounted.data = { center: [0, 0, 0], radius: 1 } as unknown as DTSShapeData;
    vi.spyOn(mounted, "update").mockImplementation(() => {});
    const mountedNode = new DTSNode();
    mounted.add(mountedNode);
    node.add(mounted);
    shape.keepMountCurrent(mounted);
    shape.position.set(0, 0, 10);
    shape.reachBounds = reachAt(-5);
    mountedNode.position.set(0, 3, 0);
    renderPass(scene);
    expect(mounted.culled).toBe(true);
    expect(mounted.dormant).toBe(false);
    expect(worldY(mountedNode)).toBe(4);

    // Without the carrier's reach, the mounted shape goes dormant itself.
    shape.reachBounds = null;
    mountedNode.position.set(0, 5, 0);
    renderPass(scene);
    expect(mounted.dormant).toBe(true);
    expect(worldY(mountedNode)).toBe(4);
  });

  it("doesn't draw a shape for its reach alone", () => {
    const { scene, shape } = shapeScene();
    shape.reachBounds = reachAt(-5);
    renderPass(scene);
    expect(shape.visible).toBe(true);
    shape.position.set(0, 0, 10);
    vi.spyOn(shape, "update").mockImplementation(() => {});
    renderPass(scene);
    expect(shape.visible).toBe(false);
  });

  it("draws every shape in passes without a cull camera", () => {
    const { scene, shape, node } = shapeScene();
    shape.position.set(0, 0, 10);
    renderPass(scene);
    expect(shape.visible).toBe(false);
    node.position.set(0, 2, 0);
    scene.updateMatrixWorld();
    expect(shape.visible).toBe(true);
    expect(worldY(node)).toBe(2);
  });

  it("still counts a culled shape as shown for light registration", () => {
    const { scene, shape } = shapeScene();
    shape.position.set(0, 0, 10);
    renderPass(scene);
    expect(isVisibleInHierarchy(shape)).toBe(false);
    expect(isShownInHierarchy(shape)).toBe(true);
    shape.parent!.visible = false;
    expect(isShownInHierarchy(shape)).toBe(false);
  });
});

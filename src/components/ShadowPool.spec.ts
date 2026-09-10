import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  type WebGLRenderer,
  type Object3D,
} from "three";
import { ShadowPoolRuntime } from "./shadowPoolRuntime";
import { buildDTS } from "../dts/dtsBuilder";
import { DTSMesh } from "../dts/dtsModel";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import {
  createDTSTestShape,
  createDTSRigidTestShape,
} from "../dts/dtsTestFixtures";
import { DTSMeshType, DTSPrimitiveFlags } from "../dts/dtsTypes";
import {
  addShadowCaster,
  removeShadowCaster,
  type ShadowCaster,
} from "./shadowCasters";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import {
  registerInteriorCollider,
  unregisterInteriorCollider,
} from "../collision/worldCollision";

const scene = new Scene();
const camera = new PerspectiveCamera(60, 1, 0.1, 2000);
const root = new Mesh(new PlaneGeometry(1, 1));
const caster: ShadowCaster = {
  root,
  center: new Vector3(),
  radius: 2,
  enabled: true,
  alpha: 1,
};
let runtime: ShadowPoolRuntime;

function setup(casterRoot: Object3D = root) {
  runtime = new ShadowPoolRuntime();
  caster.root = casterRoot;
  casterRoot.position.set(0, 2, 0);
  casterRoot.visible = true;
  casterRoot.updateMatrixWorld(true);
  camera.position.set(0, 5, 20);
  caster.enabled = true;
  caster.radius = 2;
  addShadowCaster(caster);
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256),
    squareSize: 8,
  });
  const render = vi.fn();
  const renderer = {
    getDrawingBufferSize: (v: Vector2) => v.set(1000, 1000),
    getRenderTarget: () => null,
    getClearAlpha: () => 1,
    getClearColor: vi.fn(),
    setClearColor: vi.fn(),
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    autoClear: true,
    render,
  } as unknown as WebGLRenderer;
  const frame = () => {
    runtime.update(renderer, scene, camera);
    runtime.renderPending(renderer);
  };
  const depthDraws = () =>
    render.mock.calls.filter(([s]) => s === runtime.depthScene).length;
  const positions = () =>
    (runtime.decals.children[0] as Mesh).geometry.getAttribute(
      "position",
    ) as BufferAttribute;
  return { frame, depthDraws, positions };
}

afterEach(() => {
  runtime?.dispose();
  removeShadowCaster(caster);
  setTerrainCollisionData(null);
  unregisterInteriorCollider("shadow-test");
});

describe("shadow receiver reuse", () => {
  it("reuses stationary receivers and depth, including after temporary hiding", () => {
    const { frame, depthDraws, positions } = setup();
    frame();
    const version = positions().version;
    expect(positions().count).toBeGreaterThan(0);
    expect(depthDraws()).toBe(1);
    for (let i = 0; i < 120; i++) frame();
    expect(positions().version).toBe(version);
    expect(depthDraws()).toBe(1);
    root.visible = false;
    frame();
    expect(runtime.decals.children[0].visible).toBe(false);
    root.visible = true;
    frame();
    expect(runtime.decals.children[0].visible).toBe(true);
    expect(depthDraws()).toBe(1);
  });

  it("refreshes for caster motion, scale and camera-dependent projection changes", () => {
    const { frame, depthDraws } = setup();
    frame();
    root.position.x += 1;
    root.updateMatrixWorld(true);
    frame();
    expect(depthDraws()).toBe(2);
    caster.radius = 3;
    frame();
    expect(depthDraws()).toBe(3);
    camera.position.z = 150;
    frame();
    expect(depthDraws()).toBe(4);
    frame();
    expect(depthDraws()).toBe(4);
  });

  it("refreshes when terrain or interiors arrive and disappear", () => {
    const { frame, depthDraws } = setup();
    setTerrainCollisionData(null);
    frame();
    expect(depthDraws()).toBe(0);
    setTerrainCollisionData({
      heightMap: new Uint16Array(256 * 256),
      squareSize: 8,
    });
    frame();
    expect(depthDraws()).toBe(1);
    const floor = new Mesh(new PlaneGeometry(30, 30).rotateX(-Math.PI / 2));
    floor.position.y = 1;
    floor.updateMatrixWorld(true);
    registerInteriorCollider("shadow-test", [floor]);
    frame();
    expect(depthDraws()).toBe(2);
    unregisterInteriorCollider("shadow-test");
    frame();
    expect(depthDraws()).toBe(3);
    setTerrainCollisionData(null);
    frame();
    expect(runtime.decals.children[0].visible).toBe(false);
    floor.geometry.dispose();
  });
});

describe("DTS shadow silhouettes", () => {
  const proxies = () => runtime.silhouetteScene.children[0].children as Mesh[];

  it.each([false, true])(
    "excludes flare meshes, including after lazy activation (%s)",
    (lazy) => {
      const data = createDTSRigidTestShape();
      data.materials[0].flags = 0x63; // Opaque self-illuminating engine panels cast.
      data.materials.push({ ...data.materials[0], flags: 0x6f }); // Tank jet flare.
      data.meshes[1].primitives = [
        {
          ...data.meshes[0].primitives[0],
          material: DTSPrimitiveFlags.Indexed | 1,
        },
      ];
      data.objectStates[1].visibility = lazy ? 0 : 1;
      const shape = buildDTS(data).scene;
      const { frame } = setup(shape);
      shape.update(camera);
      frame();
      shape.getShapeObject(1)!.opacity = 1;
      shape.update(camera);
      const meshes: DTSMesh[] = [];
      shape.traverse((node) => {
        if (node instanceof DTSMesh) {
          // Material replacement/fading must not change authored shadow eligibility.
          node.material = new MeshBasicMaterial({
            transparent: true,
            opacity: 0.5,
          });
          meshes.push(node);
        }
      });
      frame();
      expect(meshes).toHaveLength(2);
      expect(proxies()).toHaveLength(1);
      expect(proxies()[0].geometry).toBe(
        meshes.find((mesh) => mesh.binding!.objectIndex === 0)!.geometry,
      );
      expect(meshes.every((mesh) => !mesh.castShadow)).toBe(true);
    },
  );

  it.each([
    [0, 2],
    [1, 0],
    [DTSPrimitiveFlags.NoMaterial, 2],
  ])(
    "uses the original first primitive across material partitions (%i)",
    (first, count) => {
      const data = createDTSTestShape();
      data.materials[0].flags = 0x43;
      data.materials.push({ ...data.materials[0], flags: 0x6f });
      const primitive = data.meshes[0].primitives[0];
      data.meshes[0].primitives = [
        { ...primitive, material: DTSPrimitiveFlags.Indexed | first },
        {
          ...primitive,
          material: DTSPrimitiveFlags.Indexed | (first === 0 ? 1 : 0),
        },
      ];
      const shape = buildDTS(data).scene;
      const { frame } = setup(shape);
      shape.update(camera);
      frame();
      expect(proxies()).toHaveLength(count);
    },
  );

  it("keeps batched bodies and reads mounted shapes' own material tables", () => {
    const shape = buildDTS(createDTSRigidTestShape()).scene;
    const [batch] = batchDTSRigidMeshes(shape);
    const data = createDTSTestShape();
    data.materials[0].flags = 0x6f;
    const mounted = buildDTS(data).scene;
    shape.add(mounted);
    const { frame } = setup(shape);
    shape.update(camera);
    mounted.update(camera);
    frame();
    expect(batch.visible).toBe(true);
    expect(proxies().some((proxy) => proxy.geometry === batch.geometry)).toBe(
      true,
    );
    expect(proxies()).toHaveLength(3); // Two hidden original body parts + their batch.
    expect(batch.castShadow).toBe(false); // Main-view instancing remains eligible.
  });

  it("leaves damage decals out of the silhouette even with an opaque material", () => {
    const data = createDTSTestShape();
    data.decals = [
      { nameIndex: 1, objectIndex: 0, numMeshes: 1, startMeshIndex: 1 },
    ];
    data.subShapes[0].numDecals = 1;
    data.decalStates = new Int32Array([0]);
    data.meshes.push({
      ...data.meshes[0],
      type: DTSMeshType.Decal,
      decal: {
        startPrimitive: new Int32Array([0]),
        texgenS: new Float32Array([1, 0, 0, 0]),
        texgenT: new Float32Array([0, 1, 0, 0]),
        materialIndex: 0,
      },
    });
    const shape = buildDTS(data).scene;
    const { frame } = setup(shape);
    shape.update(camera);
    frame();
    expect(proxies()).toHaveLength(1);
  });
});

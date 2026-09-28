import { afterEach, describe, expect, it, vi } from "vitest";
import { Mesh, PerspectiveCamera, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "../dts/dtsBuilder";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import { DTSMesh, type DTSShape } from "../dts/dtsModel";
import { createDTSRigidTestShape } from "../dts/dtsTestFixtures";
import { createChestDeformation } from "./chestDeformation";

const name = "light_female.dts";
const zero = new Vector3();
afterEach(() => vi.restoreAllMocks());
function fixture(
  vertices = [0.025, 0.29, -0.135, 0.025, 0.29, -0.135, 0.025, -0.13, 0.135],
) {
  const data = createDTSRigidTestShape();
  data.names[data.objects[0].nameIndex] = "Submesh_torso";
  // Torque -> Three: (-x,z,y). A chest point, its UV seam duplicate,
  // and a point on the back, all in the authored torso coordinate system.
  data.meshes[0].vertices = new Float32Array(vertices);
  return buildDTS(data).scene;
}
function torso(scene: DTSShape) {
  let result: DTSMesh | undefined;
  scene.traverse((node) => {
    if (node instanceof DTSMesh && node.binding?.objectIndex === 0)
      result = node;
  });
  return result!;
}

describe("chest mesh deformation", () => {
  it.each([false, true])(
    "does not turn a rigid lobe translation into a lighting pulse (batched=%s)",
    (batched) => {
      const data = createDTSRigidTestShape();
      data.names[data.objects[0].nameIndex] = "Submesh_torso";
      // Inside the right lobe's constant translation mask. Short normals
      // occur naturally when subdivision interpolates different directions.
      data.meshes[0].vertices = new Float32Array([
        0.025, 0.29, 0.14, 0.02, 0.29, 0.145, 0.03, 0.29, 0.145,
      ]);
      data.meshes[0].normals = new Float32Array([
        0, 0.6, 0, 0, 0.8, 0, 0, 1, 0,
      ]);
      const scene = buildDTS(data).scene;
      if (batched) batchDTSRigidMeshes(scene);
      const chest = createChestDeformation(scene, name)!;
      chest.apply(3, zero, new Vector3(0.03, -0.02, 0.04));
      let checked = 0;
      scene.traverse((node) => {
        if (
          !(node instanceof Mesh) ||
          !node.geometry.morphAttributes.normal?.length
        )
          return;
        for (let target = 1; target <= 6; target++) {
          for (let i = 0; i < 3; i++) {
            const delta = new Vector3().fromBufferAttribute(
              node.geometry.morphAttributes.normal[target],
              i,
            );
            expect(delta.length()).toBeLessThan(1e-5);
            checked++;
          }
        }
      });
      expect(checked).toBeGreaterThan(0);
      chest.dispose();
    },
  );

  it("keeps inner collar points in front of the torso when expanding", () => {
    const scene = fixture([
      0.2265, 0.19, -0.1258, 0.2257, 0.2257, -0.17, 0.0964, 0.3202, -0.0963,
    ]);
    const mesh = torso(scene);
    const original = [0, 1, 2].map((i) =>
      mesh.getVertexPosition(i, new Vector3()),
    );
    const chest = createChestDeformation(scene, "heavy_male.dts")!;
    chest.apply(3, zero, zero);
    for (let i = 0; i < 3; i++)
      expect(mesh.getVertexPosition(i, new Vector3()).z).toBeGreaterThanOrEqual(
        original[i].z,
      );
    chest.dispose();
  });

  it("rounds a heavy armor panel instead of extending its flat face", () => {
    // Nearly coplanar center, upper corner, and outer edge of a chest panel.
    const scene = fixture([0.1, 0.33, 0.21, 0.27, 0.32, 0.3, 0.1, 0.28, 0.4]);
    const mesh = torso(scene);
    const chest = createChestDeformation(scene, "heavy_male.dts")!;
    chest.apply(3, zero, zero);
    const center = mesh.getVertexPosition(0, new Vector3());
    const corner = mesh.getVertexPosition(1, new Vector3());
    const edge = mesh.getVertexPosition(2, new Vector3());
    expect(center.z - corner.z).toBeGreaterThan(0.1);
    expect(center.z - edge.z).toBeGreaterThan(0.2);
    expect(edge.y).toBeGreaterThan(0.4);
    chest.dispose();
  });

  it("grows the lobe sides and height as well as projecting forward", () => {
    // Two outer chest vertices and an upper lobe vertex in Torque coordinates.
    const scene = fixture([
      0.025, 0.2, -0.21, 0.025, 0.2, 0.21, 0.12, 0.205, 0.135,
    ]);
    const mesh = torso(scene);
    const original = [0, 1, 2].map((i) =>
      mesh.getVertexPosition(i, new Vector3()),
    );
    const chest = createChestDeformation(scene, name)!;
    chest.apply(1, zero, zero);
    expect(mesh.getVertexPosition(0, new Vector3())).toEqual(original[0]);
    chest.apply(3, zero, zero);
    const grown = [0, 1, 2].map((i) =>
      mesh.getVertexPosition(i, new Vector3()),
    );
    expect(grown[1].y - grown[0].y).toBeGreaterThan(
      (original[1].y - original[0].y) * 1.8,
    );
    expect(grown[0].x - grown[2].x).toBeGreaterThan(
      (original[0].x - original[2].x) * 1.6,
    );
    expect(grown[2].z).toBeGreaterThan(original[2].z);
    expect(grown[0].y).toBeCloseTo(-grown[1].y);
    chest.dispose();
  });

  it("grows and shrinks the chest, preserves seam duplicates and leaves the back fixed", () => {
    const scene = fixture(),
      mesh = torso(scene),
      original = mesh.geometry;
    const chest = createChestDeformation(scene, name)!;
    const base = new Vector3().fromBufferAttribute(
      original.getAttribute("position"),
      0,
    );
    chest.apply(2, zero, zero);
    expect(mesh.getVertexPosition(0, new Vector3()).z).toBeGreaterThan(base.z);
    expect(mesh.getVertexPosition(0, new Vector3())).toEqual(
      mesh.getVertexPosition(1, new Vector3()),
    );
    expect(mesh.getVertexPosition(2, new Vector3())).toEqual(
      new Vector3().fromBufferAttribute(original.getAttribute("position"), 2),
    );
    chest.apply(0, zero, zero);
    expect(mesh.getVertexPosition(0, new Vector3()).z).toBeLessThan(base.z);
    chest.apply(1, new Vector3(0.05, -0.02, 0.01), zero);
    expect(
      mesh
        .getVertexPosition(0, new Vector3())
        .distanceTo(base.clone().add(new Vector3(0.05, -0.02, 0.01))),
    ).toBeLessThan(1e-6);
    scene.updateMatrixWorld(true);
    scene.update(new PerspectiveCamera());
    expect(mesh.morphTargetInfluences).toEqual([
      0, 0.05, -0.02, 0.01, 0, 0, 0, 0,
    ]);
    chest.dispose();
    expect(mesh.geometry.getAttribute("position")).toBe(
      original.getAttribute("position"),
    );
    expect(mesh.geometry.morphAttributes.position).toBeUndefined();
    expect(mesh.morphTargetInfluences).toBeUndefined();
  });

  it("shares buffers while keeping player weights independent and releasing the last user", () => {
    const source = fixture(),
      a = clone(source) as DTSShape,
      b = clone(source) as DTSShape;
    const ca = createChestDeformation(a, name)!,
      cb = createChestDeformation(b, name)!;
    ca.apply(3, zero, zero);
    cb.apply(2, zero, zero);
    expect(torso(a).geometry.morphAttributes).toBe(
      torso(b).geometry.morphAttributes,
    );
    expect(torso(source).geometry.morphAttributes.position).toBeUndefined();
    expect(torso(a).morphTargetInfluences![0]).toBe(2);
    expect(torso(b).morphTargetInfluences![0]).toBe(1);
    const dispose = vi.spyOn(
      Object.getPrototypeOf(torso(a).geometry),
      "dispose",
    );
    ca.dispose();
    expect(dispose).not.toHaveBeenCalled();
    cb.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    dispose.mockRestore();
  });

  it.each([false, true])(
    "matches original meshes in %s static batching",
    (staticBatch) => {
      const scene = fixture();
      if (staticBatch) scene.data.sequences = [];
      const [batch] = batchDTSRigidMeshes(scene);
      expect(batch).toBeInstanceOf(Mesh);
      const mesh = torso(scene);
      const chest = createChestDeformation(scene, name)!;
      chest.apply(2, new Vector3(0.01, 0.02, -0.03), zero);
      scene.updateMatrixWorld(true);
      scene.update(new PerspectiveCamera());
      if ("skeleton" in batch) batch.skeleton.update();
      mesh.parent!.updateWorldMatrix(true, true, true);
      const native = mesh
        .getVertexPosition(0, new Vector3())
        .applyMatrix4(mesh.matrixWorld);
      const combined = batch
        .getVertexPosition(
          batch.bindings
            .slice(
              0,
              batch.bindings.findIndex((binding) => binding.objectIndex === 0),
            )
            .reduce((n, binding) => n + binding.frames.positions[0].count, 0),
          new Vector3(),
        )
        .applyMatrix4(batch.matrixWorld);
      expect(combined.distanceTo(native)).toBeLessThan(1e-6);
      chest.dispose();
    },
  );

  it("ignores unknown models", () => {
    expect(createChestDeformation(fixture(), "weapon.dts")).toBeUndefined();
  });

  it.each(["position", "normal", "color"] as const)(
    "preserves existing %s morph targets instead of mixing incompatible target counts",
    (attribute) => {
      const scene = fixture(),
        mesh = torso(scene),
        geometry = mesh.geometry;
      geometry.morphAttributes[attribute] = [
        geometry.getAttribute("position").clone(),
      ];
      mesh.updateMorphTargets();
      mesh.morphTargetInfluences![0] = 0.5;
      const chest = createChestDeformation(scene, name)!;
      chest.apply(3, zero, zero);
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.morphTargetInfluences).toEqual([0.5]);
      expect(Object.keys(mesh.geometry.morphAttributes)).toEqual([attribute]);
      chest.dispose();
    },
  );

  it("keeps changing damage decals on the subdivided surface with their own UVs", () => {
    const data = createDTSRigidTestShape();
    data.names[data.objects[0].nameIndex] = "Submesh_torso";
    const source = data.meshes[0];
    source.vertices = new Float32Array([
      0.025, 0.29, -0.135, 0.025, 0.2, -0.21, 0.12, 0.205, 0.135,
    ]);
    data.decals = [
      {
        nameIndex: 1,
        objectIndex: 0,
        numMeshes: 1,
        startMeshIndex: data.meshes.length,
      },
    ];
    data.subShapes[0].numDecals = 1;
    data.decalStates = new Int32Array([-1]);
    data.meshes.push({
      ...source,
      type: 2,
      decal: {
        startPrimitive: new Int32Array([0, 2]),
        texgenS: new Float32Array([1, 0, 0, 0, 1, 0, 0, 1]),
        texgenT: new Float32Array([0, 1, 0, 0, 0, 1, 0, 0]),
        materialIndex: 0,
      },
      primitives: [
        ...source.primitives,
        ...source.primitives,
        ...source.primitives,
      ],
    });
    const scene = buildDTS(data).scene,
      mesh = torso(scene),
      camera = new PerspectiveCamera();
    scene.detailLevel = 0;
    const chest = createChestDeformation(scene, name)!;
    chest.apply(3, new Vector3(0.01, 0.02, 0.03), zero);
    scene.decalFrames[0] = 0;
    scene.update(camera);
    let decal: DTSMesh | undefined;
    scene.traverse((node) => {
      if (node instanceof DTSMesh && node.binding?.decalIndex === 0)
        decal = node;
    });
    expect(decal).toBeDefined();
    const geometry = decal!.geometry,
      count = geometry.drawRange.count;
    expect(count).toBeGreaterThan(6);
    expect(
      decal!
        .getVertexPosition(0, new Vector3())
        .distanceTo(mesh.getVertexPosition(0, new Vector3())),
    ).toBeLessThan(1e-6);
    expect(geometry.morphAttributes.position).not.toBe(
      mesh.geometry.morphAttributes.position,
    );
    const originalU = geometry.getAttribute("uv").getX(0);
    scene.update(camera);
    expect(decal!.geometry).toBe(geometry);
    scene.decalFrames[0] = 1;
    scene.update(camera);
    expect(decal!.geometry.drawRange.count).toBe(count / 2);
    expect(decal!.geometry.getAttribute("uv").getX(0)).toBeCloseTo(
      originalU + 1,
    );
    scene.decalFrames[0] = -1;
    scene.update(camera);
    expect(decal!.parent!.visible).toBe(false);
    chest.dispose();
  });

  it("does not copy an instance's processed topology into another native mesh", () => {
    const scene = fixture([0.1, 0.33, 0.21, 0.27, 0.32, 0.3, 0.1, 0.28, 0.4]);
    const chest = createChestDeformation(scene, "heavy_male.dts")!;
    chest.apply(3, zero, zero);
    const copy = clone(scene) as DTSShape;
    expect(torso(copy).geometry.getAttribute("position").count).toBe(3);
    expect(torso(copy).geometry.morphAttributes).toEqual({});
    chest.dispose();
    copy.update(new PerspectiveCamera());
    expect(torso(copy).geometry.getAttribute("position").count).toBe(3);
  });

  it("adds curved surface points only when growing and restores the exact default surface", () => {
    const scene = fixture([0.1, 0.33, 0.21, 0.27, 0.32, 0.3, 0.1, 0.28, 0.4]);
    const mesh = torso(scene),
      source = mesh.geometry;
    const chest = createChestDeformation(scene, "heavy_male.dts")!;
    expect(mesh.morphTargetInfluences).toBeUndefined();
    chest.apply(3, zero, zero);
    const expanded = mesh.geometry;
    expect(mesh.geometry.getAttribute("position").count).toBeGreaterThan(3);
    expect(mesh.geometry.index!.count).toBeGreaterThan(source.index!.count);
    for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++) {
      const point = mesh.getVertexPosition(i, new Vector3());
      expect(point.toArray().every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.boundingBox!.containsPoint(point)).toBe(true);
    }
    chest.apply(1, zero, zero);
    expect(mesh.geometry.attributes).toEqual(source.attributes);
    expect(mesh.geometry.index).toBe(source.index);
    expect(mesh.geometry.morphAttributes).toEqual({});
    expect(mesh.morphTargetInfluences).toBeUndefined();
    chest.apply(3, zero, zero);
    expect(mesh.geometry).toBe(expanded);
    chest.dispose();
  });

  it("restores all native surfaces if a lazy mesh update fails, without retrying", () => {
    const scene = fixture(),
      mesh = torso(scene);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chest = createChestDeformation(scene, name)!;
    chest.apply(3, zero, zero);
    const dispose = vi.fn();
    mesh.geometry.addEventListener("dispose", dispose);
    mesh.restoreNativeGeometry();
    const native = mesh.geometry;
    // Simulate a buffer allocation failure during the renderer's LOD update,
    // rather than inside chest.apply or the React frame callback.
    native.getAttribute("position").needsUpdate = true;
    const build = vi.spyOn(native, "clone").mockImplementation(() => {
      throw new Error("Allocation failed");
    });
    expect(() => scene.update(new PerspectiveCamera())).not.toThrow();
    expect(chest.disabled).toBe(true);
    expect(mesh.geometry).toBe(native);
    expect(mesh.morphTargetInfluences).toBeUndefined();
    expect(mesh.frustumCulled).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    chest.apply(2, zero, zero);
    scene.update(new PerspectiveCamera());
    chest.dispose();
    chest.dispose();
    expect(build).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("contains mesh setup failures and leaves other players unaffected", () => {
    const a = fixture(),
      b = fixture();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prepare = vi
      .spyOn(torso(a), "prepareGeometry")
      .mockImplementation(() => {
        throw new Error("Setup failed");
      });
    const ca = createChestDeformation(a, name)!;
    const cb = createChestDeformation(b, name)!;
    expect(ca.disabled).toBe(true);
    expect(torso(a).morphTargetInfluences).toBeUndefined();
    expect(torso(a).frustumCulled).toBe(true);
    cb.apply(3, zero, zero);
    expect(torso(b).morphTargetInfluences?.[0]).toBe(2);
    ca.apply(3, zero, zero);
    expect(prepare).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    ca.dispose();
    cb.dispose();
  });

  it("evaluates deformation after LOD vertices collapse, without separating merged seams", () => {
    const scene = fixture([
      0.025, 0.29, -0.135, 0.025, 0.2, -0.21, 0.12, 0.205, 0.135,
    ]);
    const mesh = torso(scene);
    mesh.binding!.source.mergeIndices = new Uint16Array([0]);
    scene.detailLevel = 0;
    const chest = createChestDeformation(scene, name)!;
    chest.apply(3, zero, zero);
    scene.intraDetailLevel = 0;
    scene.update(new PerspectiveCamera());
    expect(mesh.getVertexPosition(0, new Vector3())).toEqual(
      mesh.getVertexPosition(2, new Vector3()),
    );
    scene.intraDetailLevel = 1;
    scene.update(new PerspectiveCamera());
    expect(mesh.getVertexPosition(0, new Vector3())).not.toEqual(
      mesh.getVertexPosition(2, new Vector3()),
    );
    chest.dispose();
  });

  it("preserves native geometry ownership and procedural weights through a fade fallback", () => {
    const scene = fixture(),
      mesh = torso(scene);
    mesh.binding!.source.mergeIndices = new Uint16Array([0]);
    const source = mesh.geometry;
    const sourceDisposed = vi.fn();
    source.addEventListener("dispose", sourceDisposed);
    const chest = createChestDeformation(scene, name)!;
    chest.apply(2, new Vector3(0.01, 0.02, 0), zero);
    scene.updateMatrixWorld(true);
    scene.update(new PerspectiveCamera());
    expect(mesh.ownsGeometry).toBe(true);
    expect(mesh.morphTargetInfluences).toEqual([1, 0.01, 0.02, 0, 0, 0, 0, 1]);
    chest.dispose();
    mesh.disposeGeometry();
    expect(sourceDisposed).not.toHaveBeenCalled();
    expect(source.morphAttributes.position).toBeUndefined();
    expect(mesh.geometry.getAttribute("position")).toBe(
      source.getAttribute("position"),
    );
  });
});

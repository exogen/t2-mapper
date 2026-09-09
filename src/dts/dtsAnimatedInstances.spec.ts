import { describe, expect, it, vi } from "vitest";
import {
  Color,
  BoxGeometry,
  AdditiveBlending,
  MeshBasicMaterial,
  BufferAttribute,
  Mesh,
  DataTexture,
  Matrix3,
  Matrix4,
  Group,
  MeshLambertMaterial,
  RepeatWrapping,
  PerspectiveCamera,
  Scene,
  ShaderLib,
  Vector3,
  type InstancedMesh,
  type WebGLRenderer,
} from "three";
import { WebGLRenderLists } from "three/src/renderers/webgl/WebGLRenderLists.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  DTSAnimatedInstancePool,
  installDTSAnimatedInstances,
} from "./dtsAnimatedInstances";
import { buildDTS } from "./dtsBuilder";
import { DTSMesh, DTSRigidMeshBatch, DTSShape } from "./dtsModel";
import { batchDTSRigidMeshes } from "./dtsRigidBatch";
import { createDTSRigidTestShape } from "./dtsTestFixtures";
import { applyDTSMaterialMaps } from "./dtsMaterialMaps";
import { applyShapeShaderModifications } from "../shapeMaterial";

function fixture(count = 2) {
  const renderer = {
    capabilities: { maxTextureSize: 1024 },
    renderLists: new WebGLRenderLists(undefined!),
    getContext: () => ({
      MAX_ARRAY_TEXTURE_LAYERS: 0x88ff,
      getParameter: () => 128,
    }),
    initTexture: vi.fn(),
    copyTextureToTexture: vi.fn((source, target, _region, position) => {
      expect(source.image.width).toBeLessThanOrEqual(target.image.width);
      expect(source.image.height).toBeLessThanOrEqual(target.image.height);
      expect(position.z).toBeLessThan(target.image.depth);
    }),
  } as unknown as WebGLRenderer;
  const world = new Scene(),
    camera = new PerspectiveCamera();
  const model = buildDTS(createDTSRigidTestShape());
  batchDTSRigidMeshes(model.scene);
  const shapes: DTSShape[] = [],
    bodies: DTSRigidMeshBatch[] = [];
  for (let i = 0; i < count; i++) {
    const shape = clone(model.scene) as DTSShape;
    const body = shape.children.find((n) => n instanceof DTSRigidMeshBatch)!;
    const map = new DataTexture(new Uint8Array([200, i, 17, 0]), 1, 1);
    const material = new MeshLambertMaterial({ map });
    applyShapeShaderModifications(material, { reflectionAmount: 0.4 });
    material.userData.shapeLight = {
      shapeLightColor: { value: new Color(i ? 0.4 : 0.8, 0.5, 0.1) },
      shapeLightMode: { value: i },
      shapeBoundRadius: { value: 2 + i },
    };
    body.material = material;
    shape.position.set(i * 10, 3, -5);
    shape.rotation.set(0.1, i * 0.2, 0.4);
    shape.scale.set(2, 3, 4);
    body.skeleton.bones[1].rotation.set(0.2, i * 0.7, -0.3);
    shapes.push(shape);
    bodies.push(body);
    world.add(shape);
  }
  const pool = new DTSAnimatedInstancePool(renderer);
  world.add(pool.root);
  const prepare = () => {
    world.updateMatrixWorld(true);
    pool.prepare(world, camera);
    project(world, camera, pool, renderer);
  };
  return { renderer, world, camera, shapes, bodies, pool, prepare };
}

function project(
  world: Scene,
  camera: PerspectiveCamera,
  pool: DTSAnimatedInstancePool,
  renderer: WebGLRenderer,
) {
  const list = renderer.renderLists.get(world, 0);
  list.init();
  const visit = (node: import("three").Object3D) => {
    if (!node.visible) return;
    if (node instanceof DTSShape) node.update(camera);
    if (node === pool.root) pool.flush();
    if (node instanceof Mesh && node.layers.test(camera.layers)) {
      const materials = node.material;
      if (Array.isArray(materials)) {
        for (const group of node.geometry.groups)
          if (materials[group.materialIndex!]?.visible)
            list.push(
              node,
              node.geometry,
              materials[group.materialIndex!],
              0,
              -node.matrixWorld.elements[14],
              group as any,
            );
      } else if (materials.visible)
        list.push(
          node,
          node.geometry,
          materials,
          0,
          -node.matrixWorld.elements[14],
          null,
        );
    }
    for (const child of node.children) visit(child);
  };
  visit(world);
  list.sort(undefined!, undefined!, false);
}

describe("animated DTS instancing", () => {
  it("allocates enough array layers for many skins arriving in one frame", () => {
    const { pool, renderer, prepare } = fixture(20);
    prepare();
    expect(pool.stats.instances).toBe(20);
    expect(pool.stats.skinLayers).toBe(20);
    expect(renderer.copyTextureToTexture).toHaveBeenCalledTimes(20);
    pool.dispose();
  });
  it("preserves independent poses, normals, skins and lighting in one draw", () => {
    const { pool, bodies, renderer, prepare } = fixture();
    prepare();
    expect(pool.stats.instances).toBe(2);
    expect(pool.stats.draws).toBe(1);
    expect(pool.stats.skinLayers).toBe(2);
    const draw = pool.root.children[0] as InstancedMesh;
    expect(draw.frustumCulled).toBe(false);
    const shader = { ...ShaderLib.lambert, uniforms: {} };
    (draw.material as MeshLambertMaterial).onBeforeCompile(
      shader as Parameters<MeshLambertMaterial["onBeforeCompile"]>[0],
      renderer,
    );
    const uniforms = shader.uniforms as Record<string, { value: any }>;
    const boneData = uniforms.boneTexture.value.image.data;
    const normals = draw.geometry.getAttribute("normal");
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const instance = new Matrix4();
      draw.getMatrixAt(i, instance);
      for (let v = 0; v < draw.geometry.getAttribute("position").count; v++) {
        const boneIndex = draw.geometry.getAttribute("skinIndex").getX(v);
        const bone = new Matrix4().fromArray(
          boneData,
          (i * body.skeleton.bones.length + boneIndex) * 16,
        );
        const actual = new Vector3()
          .fromBufferAttribute(draw.geometry.getAttribute("position"), v)
          .applyMatrix4(bone)
          .applyMatrix4(instance);
        const expected = body
          .getVertexPosition(v, new Vector3())
          .applyMatrix4(body.matrixWorld);
        expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
        const actualNormal = new Vector3()
          .fromBufferAttribute(normals, v)
          .applyMatrix3(new Matrix3().setFromMatrix4(bone))
          .applyNormalMatrix(new Matrix3().getNormalMatrix(instance));
        const expectedSkin = body.skeleton.bones[boneIndex].matrixWorld
          .clone()
          .multiply(body.skeleton.boneInverses[boneIndex])
          .premultiply(body.bindMatrixInverse)
          .multiply(body.bindMatrix);
        const expectedNormal = new Vector3()
          .fromBufferAttribute(normals, v)
          .applyMatrix3(new Matrix3().setFromMatrix4(expectedSkin))
          .applyNormalMatrix(new Matrix3().getNormalMatrix(body.matrixWorld));
        expect(actualNormal.distanceTo(expectedNormal)).toBeLessThan(1e-6);
      }
      const light = draw.geometry.getAttribute("dtsInstanceLight");
      expect(light.getW(i)).toBe(i);
      expect(light.getX(i)).toBeCloseTo(i ? 0.4 : 0.8);
      const state = draw.geometry.getAttribute("dtsInstanceState");
      expect(state.getX(i)).toBe(2 + i);
      expect(state.getY(i)).toBe(i);
    }
    expect(renderer.copyTextureToTexture).toHaveBeenCalledTimes(2);
    expect(vi.mocked(renderer.copyTextureToTexture).mock.calls[0][0]).toBe(
      (bodies[0].material as MeshLambertMaterial).map,
    );
    prepare();
    expect(renderer.copyTextureToTexture).toHaveBeenCalledTimes(2);
    expect(bodies.every((b) => b.layers.mask === 1)).toBe(true);
    pool.dispose();
    expect(bodies.every((b) => b.layers.mask === 1)).toBe(true);
  });

  it("falls back for fades, visibility, LOD changes, shadows and incompatible samplers", () => {
    const { pool, shapes, bodies, prepare } = fixture(3);
    prepare();
    expect(pool.stats.instances).toBe(3);
    const material = bodies[0].material as MeshLambertMaterial;
    material.transparent = true;
    prepare();
    expect(pool.stats.instances).toBe(2);
    expect(bodies[0].layers.mask).toBe(1);
    shapes[1].detailLevel = -1;
    prepare();
    expect(pool.stats.draws).toBe(0);
    material.transparent = false;
    shapes[1].detailLevel = 0;
    bodies[0].castShadow = true;
    prepare();
    expect(pool.stats.instances).toBe(2);
    shapes[1].visible = false;
    prepare();
    expect(pool.stats.draws).toBe(0);
    shapes[1].visible = true;
    bodies[0].castShadow = false;
    material.map!.offset.x = 0.5;
    prepare();
    expect(pool.stats.instances).toBe(3);
    expect(bodies[0].layers.mask).toBe(1);
    pool.dispose();
  });

  it("grows buffers, reuses slots after despawns and restores draws when disabled", () => {
    const { pool, world, shapes, bodies, prepare } = fixture(2);
    prepare();
    for (let i = 0; i < 20; i++) {
      const shape = clone(shapes[0]) as DTSShape;
      const batch = shape.children.find((n) => n instanceof DTSRigidMeshBatch)!;
      // Copy while the pool has suppressed the source draw; restore its layer
      // as a host normally would by cloning the cached template instead.
      batch.layers.mask = 1;
      batch.material = bodies[0].material;
      world.add(shape);
    }
    prepare();
    expect(pool.stats.instances).toBe(22);
    expect(
      (pool.root.children[0] as InstancedMesh).instanceMatrix.count,
    ).toBeGreaterThanOrEqual(22);
    world.remove(shapes[0]);
    prepare();
    expect(pool.stats.instances).toBe(21);
    expect(bodies[0].layers.mask).toBe(1);
    pool.enabled = false;
    prepare();
    expect(pool.stats.instances).toBe(0);
    expect(pool.root.visible).toBe(false);
    expect(bodies[1].layers.mask).toBe(1);
    pool.dispose();
  });

  it("keeps shared geometry alive when disposing the pool and excludes shear", () => {
    const { pool, bodies, shapes, prepare } = fixture(3);
    const geometry = bodies[0].geometry;
    const position = geometry.getAttribute("position");
    const dispose = vi.fn();
    geometry.addEventListener("dispose", dispose);
    shapes[0].scale.set(-1, 1, 1);
    prepare();
    expect(pool.stats.instances).toBe(2);
    expect(bodies[0].layers.mask).toBe(1);
    pool.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(geometry.getAttribute("position")).toBe(position);
  });

  it("refreshes changed skin images and restores scene callbacks on teardown", () => {
    const { pool, renderer, world, camera, bodies } = fixture();
    pool.dispose();
    const before = vi.fn(),
      after = vi.fn();
    world.onBeforeRender = before;
    world.onAfterRender = after;
    const adapter = installDTSAnimatedInstances(world, renderer);
    world.add(new Group()); // A shape may mount after the pool component.
    const frame = () => {
      world.updateMatrixWorld(true);
      Reflect.apply(world.onBeforeRender, world, [renderer, world, camera]);
      expect(world.children.at(-1)).toBe(adapter.pool.root);
      project(world, camera, adapter.pool, renderer);
    };
    frame();
    expect(before).toHaveBeenCalledTimes(1);
    const copies = vi.mocked(renderer.copyTextureToTexture);
    expect(copies).toHaveBeenCalledTimes(2);
    Reflect.apply(world.onAfterRender, world, [renderer, world, camera]);
    expect(after).toHaveBeenCalledTimes(1);
    expect(bodies.every((body) => body.layers.mask === 1)).toBe(true);
    (bodies[0].material as MeshLambertMaterial).map!.needsUpdate = true;
    frame();
    expect(copies).toHaveBeenCalledTimes(3);
    adapter.dispose();
    expect(world.onBeforeRender).toBe(before);
    expect(world.onAfterRender).toBe(after);
    expect(bodies.every((body) => body.layers.mask === 1)).toBe(true);
    installDTSAnimatedInstances(world, renderer).dispose();
  });
});

function rigidFixture(count = 3) {
  const result = fixture(0);
  const geometry = new BoxGeometry();
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 128]), 1, 1);
  const meshes = Array.from({ length: count }, (_, i) => {
    const material = new MeshBasicMaterial({ map: texture.clone() });
    applyShapeShaderModifications(material);
    const mesh = new DTSMesh(geometry, material);
    mesh.position.set(i, 0, -i);
    result.world.add(mesh);
    return mesh;
  });
  return { ...result, meshes };
}

describe("shared DTS shape draws", () => {
  it("reuses registrations and uploads only changed instance attributes", () => {
    const { pool, meshes, prepare } = rigidFixture();
    prepare();
    expect(pool.stats.registrations).toBe(3);
    const draw = pool.root.children[0] as InstancedMesh;
    const version = draw.instanceMatrix.version;
    prepare();
    expect(pool.stats.registrations).toBe(0);
    expect(pool.stats.membershipChanges).toBe(0);
    expect(pool.stats.attributeBytes).toBe(0);
    expect(draw.instanceMatrix.version).toBe(version);
    meshes[1].position.x += 0.1;
    const material = meshes[1].material as MeshBasicMaterial;
    material.color.setRGB(0.1, 0.2, 0.3);
    material.map!.offset.x += 0.1;
    prepare();
    expect(pool.stats.membershipChanges).toBe(0);
    expect(draw.instanceMatrix.updateRanges).toEqual([
      { start: 16, count: 16 },
    ]);
    expect(draw.instanceColor!.updateRanges).toEqual([{ start: 3, count: 3 }]);
    expect(pool.stats.attributeBytes).toBe((16 + 3 + 3) * 4);
    prepare(); // Float32 rounding must not make these dirty forever.
    expect(pool.stats.attributeBytes).toBe(0);
    pool.dispose();
  });

  it("invalidates membership for sampler, geometry, render-state and skin-size changes", () => {
    const { pool, meshes, prepare } = rigidFixture();
    prepare();
    const material = meshes[0].material as MeshBasicMaterial;
    material.map!.wrapS = RepeatWrapping; // No needsUpdate/version bump required.
    prepare();
    expect(pool.stats.membershipChanges).toBe(1);
    expect(pool.stats.instances).toBe(2);
    meshes[0].material = (meshes[1].material as MeshBasicMaterial).clone();
    applyShapeShaderModifications(meshes[0].material as MeshBasicMaterial);
    prepare();
    expect(pool.stats.registrations).toBe(0);
    expect(pool.stats.instances).toBe(3);
    meshes[0].geometry = meshes[0].geometry.clone();
    prepare();
    expect(pool.stats.membershipChanges).toBe(1);
    expect(pool.stats.instances).toBe(2);
    meshes[0].geometry = meshes[1].geometry;
    meshes[0].renderOrder = 1;
    prepare();
    expect(pool.stats.instances).toBe(2);
    meshes[0].renderOrder = 0;
    (meshes[0].material as MeshBasicMaterial).map = new DataTexture(
      new Uint8Array(16),
      2,
      2,
    );
    prepare();
    expect(pool.stats.instances).toBe(2);
    (meshes[0].material as MeshBasicMaterial).map = (
      meshes[1].material as MeshBasicMaterial
    ).map;
    prepare();
    expect(pool.stats.instances).toBe(3);
    pool.dispose();
  });

  it("handles singleton transparent runs, changing depth order and retired draws", () => {
    const { pool, world, meshes, prepare } = rigidFixture(3);
    for (const mesh of meshes)
      (mesh.material as MeshBasicMaterial).transparent = true;
    const barrier = new Mesh(
      new BoxGeometry(),
      new MeshBasicMaterial({ transparent: true }),
    );
    barrier.position.z = -1.5;
    world.add(barrier);
    prepare(); // The farthest DTS is a singleton; the second run is pooled.
    expect(pool.stats.instances).toBe(2);
    const oldDraw = pool.root.children.find((n) => n.visible)!;
    meshes[0].position.z = -3;
    prepare();
    expect(pool.stats.registrations).toBe(0);
    expect(pool.stats.membershipChanges).toBe(0);
    expect(pool.stats.instances).toBe(2);
    for (const mesh of meshes) mesh.visible = false;
    for (let i = 0; i < 660; i++) prepare();
    expect(oldDraw.parent).toBeNull();
    expect(pool.root.children).toHaveLength(0);
    for (const mesh of meshes) mesh.visible = true;
    prepare();
    expect(pool.stats.registrations).toBe(0);
    expect(pool.stats.membershipChanges).toBe(3);
    expect(pool.stats.instances).toBe(2);
    pool.dispose();
  });

  it("uses native rigid instances with one shared texture, independent colors and UV animation", () => {
    const { pool, renderer, meshes, prepare } = rigidFixture();
    const material = meshes[1].material as MeshBasicMaterial;
    material.color.setRGB(0.2, 0.4, 0.8);
    material.map!.offset.set(0.5, 0.25);
    meshes[1].scale.set(2, 3, 4);
    prepare();
    expect(pool.stats.instances).toBe(3);
    expect(pool.stats.draws).toBe(1);
    expect(pool.stats.boneBytes).toBe(0);
    expect(renderer.copyTextureToTexture).not.toHaveBeenCalled();
    const draw = pool.root.children.find((n) => n.visible) as InstancedMesh;
    expect(draw.geometry.getAttribute("dtsInstanceUV0").getZ(1)).toBe(0.5);
    expect(draw.geometry.getAttribute("dtsInstanceUV1").getZ(1)).toBe(0.25);
    expect(draw.instanceColor!.getX(1)).toBeCloseTo(0.2);
    expect(draw.material).not.toBe(material);
    pool.dispose();
  });

  it("preserves transparent order around intervening non-DTS draws and independent fades", () => {
    const { pool, world, camera, renderer, meshes, prepare } = rigidFixture(4);
    for (const [i, mesh] of meshes.entries()) {
      mesh.position.z = -(i + 1);
      const material = mesh.material as MeshBasicMaterial;
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = 0.1 * (i + 1);
    }
    const barrier = new Mesh(
      new BoxGeometry(),
      new MeshBasicMaterial({ transparent: true, opacity: 0.5 }),
    );
    barrier.position.z = -2.5;
    world.add(barrier);
    prepare();
    expect(pool.stats.instances).toBe(4);
    expect(pool.stats.draws).toBe(2);
    const items = renderer.renderLists.get(world, 0).transparent;
    expect(items).toHaveLength(3);
    expect(items[1].object).toBe(barrier);
    expect(items.map((i) => i.z)).toEqual([4, 2.5, 2]);
    expect(
      (items[0].object as InstancedMesh).geometry
        .getAttribute("dtsInstanceState")
        .getZ(0),
    ).toBeCloseTo(0.4);
    // A custom sort gets the unmodified logical render items.
    world.updateMatrixWorld(true);
    pool.prepare(world, camera);
    project(world, camera, pool, renderer);
    renderer.renderLists
      .get(world, 0)
      .sort(undefined!, (a, b) => a.id - b.id, false);
    expect(
      renderer.renderLists.get(world, 0).transparent.map((i) => i.object),
    ).toEqual([...meshes, barrier]);
    pool.dispose();
  });

  it("separates blend modes and texture sizes but shares independent IFL frames", () => {
    const { pool, renderer, meshes, prepare } = rigidFixture(6);
    for (const [i, mesh] of meshes.entries()) {
      const material = mesh.material as MeshBasicMaterial;
      const size = i < 4 ? 1 : 2;
      material.map = new DataTexture(
        new Uint8Array(size * size * 4).fill(i * 20),
        size,
        size,
      );
      if (i === 2 || i === 3) {
        material.blending = AdditiveBlending;
        material.transparent = true;
        material.depthWrite = false;
        applyShapeShaderModifications(material);
      }
    }
    prepare();
    expect(pool.stats.draws).toBe(3);
    expect(pool.stats.instances).toBe(6);
    expect(renderer.copyTextureToTexture).toHaveBeenCalledTimes(6);
    pool.dispose();
  });

  it("keeps authored mipmaps and additional shared maps on native samplers", () => {
    const { pool, renderer, meshes, prepare } = rigidFixture(2);
    const map = (meshes[0].material as MeshBasicMaterial).map!;
    map.mipmaps = [{ data: new Uint8Array(4), width: 1, height: 1 }];
    for (const mesh of meshes) {
      const material = mesh.material as MeshBasicMaterial;
      material.map = map;
      material.alphaMap = map;
    }
    prepare();
    expect(pool.stats.draws).toBe(1);
    expect(renderer.copyTextureToTexture).not.toHaveBeenCalled();
    const draw = pool.root.children[0] as InstancedMesh<
      BoxGeometry,
      MeshBasicMaterial
    >;
    expect(draw.material.map).toBe(map);
    expect(draw.material.alphaMap).toBe(map);
    pool.dispose();
  });

  it("retains native morph influences and detail-map shader configuration", () => {
    const { pool, renderer, meshes, prepare } = rigidFixture(3);
    const geometry = meshes[0].geometry;
    geometry.morphAttributes.position = [
      geometry.getAttribute("position").clone(),
    ];
    const detailMap = new DataTexture(
      new Uint8Array([100, 120, 130, 255]),
      1,
      1,
    );
    for (const [i, mesh] of meshes.entries()) {
      mesh.morphTargetInfluences = [i * 0.5];
      applyDTSMaterialMaps(mesh.material as MeshBasicMaterial, {
        detailMap,
        detailScale: 2,
        bumpMap: null,
        specularMap: null,
      });
    }
    prepare();
    expect(pool.stats.instances).toBe(3);
    const draw = pool.root.children[0] as InstancedMesh<
      BoxGeometry,
      MeshBasicMaterial
    >;
    expect(draw.morphTexture!.image.height).toBeGreaterThanOrEqual(3);
    expect(Array.from(draw.morphTexture!.image.data!.slice(0, 6))).toEqual([
      1, 0, 0.5, 0.5, 0, 1,
    ]);
    const shader = { ...ShaderLib.basic, uniforms: {} };
    draw.material.onBeforeCompile(shader as any, renderer);
    expect((shader.uniforms as any).dtsDetailMap.value).toBe(detailMap);
    expect(shader.fragmentShader).toContain("dtsDetailMap");
    pool.dispose();
  });

  it("groups geometry views by their current shared frame buffers and honors material groups", () => {
    const { pool, meshes, prepare } = rigidFixture(4);
    const shared = meshes[0].geometry;
    const nextFrame = new BufferAttribute(
      new Float32Array(shared.getAttribute("position").array),
      3,
    );
    for (const [i, mesh] of meshes.entries()) {
      mesh.geometry = new BoxGeometry();
      mesh.geometry.attributes = { ...shared.attributes };
      mesh.geometry.index = shared.index;
      mesh.geometry.setAttribute(
        "position",
        i < 2 ? shared.getAttribute("position") : nextFrame,
      );
      mesh.geometry.clearGroups();
      mesh.geometry.addGroup(0, 6, 0);
      mesh.geometry.addGroup(6, 6, 1);
      const base = mesh.material as MeshBasicMaterial;
      mesh.material = [base, base.clone()];
    }
    prepare();
    expect(pool.stats.draws).toBe(4);
    expect(pool.stats.instances).toBe(8);
    expect(
      pool.root.children
        .filter((n) => n.visible)
        .map((n) => (n as InstancedMesh).geometry.drawRange.count),
    ).toEqual([6, 6, 6, 6]);
    pool.dispose();
  });
});

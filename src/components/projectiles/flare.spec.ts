import { afterEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import {
  PerspectiveCamera,
  Vector3,
  Triangle,
  FrontSide,
  Group,
  Texture,
  type Sprite,
  type Mesh,
} from "three";
import { DTSLoader } from "../../dts/dtsLoader";
import { buildDTS } from "../../dts/dtsBuilder";
import {
  createDTSSequence,
  createDTSTestShape,
} from "../../dts/dtsTestFixtures";
import { DTSSequenceFlags } from "../../dts/dtsTypes";
import type { DTSShape } from "../../dts/dtsModel";
import type { FlareEntity } from "../../state/gameEntityTypes";
import { streamClock } from "../../state/streamPlaybackStore";
import { createFlareView } from "./flare";
import { createShapeProjectileView } from "./shape";

afterEach(() => {
  streamClock.time = 0;
});

it("keeps flare projectiles without DTS on the two-sprite path", () => {
  const visual = {
    kind: "flare",
    faceViewer: false,
    shapeScale: [1, 1, 1],
    numFlares: 0,
    sizes: [0.2, 0.5, 0.1],
    color: { r: 0.1, g: 0.3, b: 1 },
    baseTexture: "flarebase",
    modTexture: "flaremod",
  } as const;
  const base = new Texture(),
    mod = new Texture();
  const view = createFlareView(
    { ...visual, shapeScale: [...visual.shapeScale], sizes: [...visual.sizes] },
    { base, mod },
    undefined,
    1,
  );
  try {
    const sprites: Sprite[] = [];
    view.root.traverse((node) => {
      if ((node as Sprite).isSprite) sprites.push(node as Sprite);
    });
    expect(sprites).toHaveLength(2);
    expect(sprites.every((sprite) => sprite.material.map === base)).toBe(true);
  } finally {
    view.dispose();
    base.dispose();
    mod.dispose();
  }
});

it("uses ordinary DTS model orientation for flares that do not face the viewer", () => {
  const model = buildDTS(createDTSTestShape());
  const flare: FlareEntity = {
    id: "flare",
    className: "LinearFlareProjectile",
    renderType: "Flare",
    visual: {
      kind: "flare",
      shapeScale: [1, 1, 1],
      faceViewer: false,
      numFlares: 0,
      sizes: [1, 1, 1],
      color: { r: 1, g: 1, b: 1 },
      baseTexture: "",
      modTexture: "",
    },
  };
  const flareView = createFlareView(flare.visual, {}, model, 1);
  const shapeView = createShapeProjectileView(
    model,
    { id: "shape", className: "LinearProjectile", renderType: "Shape" },
    1,
    false,
    () => true,
  );
  const world = new Group();
  world.add(flareView.root, shapeView.root);
  flareView.root.rotation.set(0.3, 0.7, -0.4);
  shapeView.root.quaternion.copy(flareView.root.quaternion);
  flareView.reset(flare);
  const camera = new PerspectiveCamera();
  camera.position.set(4, 3, 10);
  flareView.update(flare, camera, 0);
  world.updateMatrixWorld(true);
  try {
    const flareShape = flareView.root.children[1].children[0].children[0];
    const ordinaryShape = shapeView.root.children[0].children[0];
    expect(flareShape.matrixWorld.elements).toEqual(
      ordinaryShape.matrixWorld.elements,
    );
  } finally {
    flareView.dispose();
    shapeView.dispose();
  }
});

it("keeps the stock plasma quad's front face toward the viewer from every direction", async () => {
  const bytes = await fs.readFile(
    "docs/base/@vl2/shapes.vl2/shapes/plasmabolt.dts",
  );
  const model = new DTSLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const entity = {
    id: "plasma",
    className: "LinearFlareProjectile",
    renderType: "Flare",
    visual: {
      kind: "flare",
      shapeName: "plasmabolt.dts",
      shapeScale: [2, 2, 2],
      faceViewer: true,
      numFlares: 0,
      sizes: [0.2, 0.5, 0.1],
      color: { r: 1, g: 0.75, b: 0.25 },
      baseTexture: "",
      modTexture: "",
    },
  } satisfies FlareEntity;
  const view = createFlareView(entity.visual, {}, model, 1);
  const scene = view.root.children[1].children[0].children[0] as DTSShape;
  view.root.position.set(10, 20, 30);
  view.root.rotation.set(0.4, 1.2, 0.2);
  view.reset(entity);
  const camera = new PerspectiveCamera();
  for (const offset of [
    [0, 0, 5],
    [4, 3, 2],
    [-4, 1, -3],
  ]) {
    camera.position.copy(view.root.position).add(new Vector3(...offset));
    camera.updateMatrixWorld();
    view.update(entity, camera, 0);
    view.root.updateMatrixWorld(true);
    scene.update(camera);
    let checked = 0;
    scene.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute("position"),
        index = mesh.geometry.index!;
      const triangle = new Triangle(
        ...[0, 1, 2].map((i) =>
          new Vector3()
            .fromBufferAttribute(position, index.getX(i))
            .applyMatrix4(mesh.matrixWorld),
        ),
      );
      const toward = camera.position
        .clone()
        .sub(triangle.getMidpoint(new Vector3()))
        .normalize();
      expect(triangle.getNormal(new Vector3()).dot(toward)).toBeGreaterThan(
        0.99,
      );
      expect(
        (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).side,
      ).toBe(FrontSide);
      expect(mesh.visible && mesh.parent!.visible).toBe(true);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  }
  view.dispose();
});
it("samples a flare's DTS from its birth time after a late acquisition or backward seek", () => {
  const data = createDTSTestShape();
  data.objectStates.push(
    ...[0, 0.8].map((visibility) => ({
      visibility,
      frame: 0,
      materialFrame: 0,
    })),
  );
  data.sequences = [
    createDTSSequence({
      nameIndex: data.names.push("ambient") - 1,
      duration: 1,
      numKeyframes: 2,
      baseObjectState: 1,
      visibilityMatters: [0],
      flags: DTSSequenceFlags.Cyclic,
    }),
  ];
  const model = buildDTS(data);
  const entity: FlareEntity = {
    id: "plasma",
    className: "LinearFlareProjectile",
    renderType: "Flare",
    spawnTime: 10,
    visual: {
      kind: "flare",
      numFlares: 0,
      sizes: [0, 0, 0],
      color: { r: 1, g: 1, b: 1 },
      baseTexture: "",
      modTexture: "",
      shapeScale: [1, 1, 1],
      faceViewer: false,
    },
  };
  const view = createFlareView(entity.visual, {}, model, 1);
  const scene = view.root.children[1].children[0].children[0] as DTSShape;
  const object = scene.getShapeObject(0)!;
  const camera = new PerspectiveCamera();
  streamClock.time = 10.25;
  view.reset(entity);
  view.update(entity, camera, 0);
  expect(object.opacity).toBeCloseTo(0.4);
  streamClock.time = 10;
  view.update(entity, camera, 0);
  expect(object.opacity).toBe(0);
  streamClock.time = 10.25;
  view.update(entity, camera, 0);
  expect(object.opacity).toBeCloseTo(0.4);
  view.dispose();
});

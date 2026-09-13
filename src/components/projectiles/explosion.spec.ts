import fs from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import { PerspectiveCamera, Triangle, Vector3, type Mesh } from "three";
import { DTSLoader } from "../../dts/dtsLoader";
import type { DTSShape } from "../../dts/dtsModel";
import type { ExplosionEntity } from "../../state/gameEntityTypes";
import { streamClock } from "../../state/streamPlaybackStore";
import { createExplosionView } from "./explosion";

afterEach(() => {
  streamClock.time = 0;
});

it("keeps plasma explosion surfaces front-facing using the engine's opposite-to-projectiles orientation", async () => {
  const bytes = await fs.readFile(
    "docs/base/@vl2/shapes.vl2/shapes/effect_plasma_explosion.dts",
  );
  const model = new DTSLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const entity: ExplosionEntity = {
    id: "explosion",
    className: "Explosion",
    renderType: "Explosion",
    spawnTime: 0,
    faceViewer: true,
  };
  const view = createExplosionView(
    model,
    "effect_plasma_explosion.dts",
    undefined,
    1,
  );
  const scene = view.root.children[0].children[0].children[0] as DTSShape;
  const camera = new PerspectiveCamera();
  view.root.position.set(10, 20, 30);
  view.root.rotation.set(0.3, 0.7, -0.4);
  view.reset(entity);
  streamClock.time = 0.05;
  try {
    for (const offset of [
      [0, 0, 10],
      [4, 3, 10],
      [-4, 1, -10],
    ]) {
      camera.position.copy(view.root.position).add(new Vector3(...offset));
      camera.updateMatrixWorld();
      view.update(entity, camera, 0);
      view.root.updateMatrixWorld(true);
      scene.update(camera);
      let area = 0;
      scene.traverse((node) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        const p = mesh.geometry.getAttribute("position"),
          index = mesh.geometry.index!;
        for (let i = 0; i < index.count; i += 3) {
          const triangle = new Triangle(
            ...[0, 1, 2].map((j) =>
              new Vector3()
                .fromBufferAttribute(p, index.getX(i + j))
                .applyMatrix4(mesh.matrixWorld),
            ),
          );
          if (triangle.getArea() < 1e-8) continue;
          expect(
            triangle
              .getNormal(new Vector3())
              .dot(
                camera.position
                  .clone()
                  .sub(triangle.getMidpoint(new Vector3())),
              ),
          ).toBeGreaterThan(0);
          area += triangle.getArea();
        }
      });
      expect(area).toBeGreaterThan(1);
    }
  } finally {
    view.dispose();
  }
});

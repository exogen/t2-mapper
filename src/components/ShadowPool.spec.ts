import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BufferAttribute,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from "three";
import { ShadowPoolRuntime } from "./shadowPoolRuntime";
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

function setup() {
  runtime = new ShadowPoolRuntime();
  root.position.set(0, 2, 0);
  root.visible = true;
  root.updateMatrixWorld(true);
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

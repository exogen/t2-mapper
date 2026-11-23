import { expect, it, vi } from "vitest";
import {
  Group,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  Texture,
  Vector2,
  type BufferGeometry,
} from "three";
import type { SceneSky } from "../scene/types";
import type { GameEngine } from "./gameEngine";
import { startCloudLayers } from "./cloudLayers";

vi.mock("./detailMapList", () => ({
  loadSharedDetailMapList: () =>
    Promise.resolve(["", "", "", "", "", "", "", "cloud.png"]),
}));
vi.mock("../loaders", () => ({ textureToUrl: (url: string) => url }));
vi.mock("../state/engineStore", () => ({
  worldDeltaSec: (delta: number) => delta,
}));
vi.mock("../state/settingsStore", () => ({
  settingsStore: {
    getState: () => ({ animationEnabled: true }),
    subscribe: () => () => {},
  },
  selectDebugMode: () => false,
}));

it("preserves cloud scrolling across host replacement while releasing old mesh resources", async () => {
  let frame!: (frame: { camera: PerspectiveCamera; delta: number }) => void;
  let install!: () => void;
  let release: (() => void) | undefined;
  const texture = new Texture();
  const engine = {
    invalidate: vi.fn(),
    scheduler: {
      add: (_priority: number, callback: typeof frame) => {
        frame = callback;
        return () => {};
      },
    },
    prepareWithHost: (
      _load: unknown,
      adopt: (textures: Texture[]) => () => void,
    ) => {
      install = () => {
        release = adopt([texture]);
      };
      return () => {
        release?.();
        release = undefined;
      };
    },
  } as unknown as GameEngine;
  const parent = new Group();
  const scene: SceneSky = {
    className: "Sky",
    ghostIndex: 1,
    materialList: "cloud.dml",
    visibleDistance: 500,
    fogDistance: 0,
    fogVolumes: [],
    fogColor: { r: 0, g: 0, b: 0 },
    skySolidColor: { r: 0, g: 0, b: 0 },
    useSkyTextures: true,
    windVelocity: { x: 1, y: 0, z: 0 },
    cloudLayers: [{ texture: "cloud.png", heightPercent: 0.3, speed: 0.25 }],
  };
  const stop = startCloudLayers(
    engine,
    parent,
    scene,
    () => undefined,
    () => scene,
    () => 0,
  );
  await Promise.resolve();
  install();
  const group = parent.children[0];
  const old = group.children[0] as Mesh<BufferGeometry, ShaderMaterial>;
  const disposeGeometry = vi.spyOn(old.geometry, "dispose");
  const disposeMaterial = vi.spyOn(old.material, "dispose");
  frame({ camera: new PerspectiveCamera(), delta: 0.032 });
  const offset = (old.material.uniforms.uvOffset.value as Vector2).clone();
  expect(offset.length()).toBeGreaterThan(0);
  release?.();
  expect(disposeGeometry).toHaveBeenCalledOnce();
  expect(disposeMaterial).toHaveBeenCalledOnce();
  install();
  const next = group.children[0] as Mesh<BufferGeometry, ShaderMaterial>;
  expect(next.material.uniforms.uvOffset.value).toEqual(offset);
  stop();
  texture.dispose();
});

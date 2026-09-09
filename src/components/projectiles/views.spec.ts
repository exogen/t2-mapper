import { afterEach, describe, expect, it } from "vitest";
import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  Texture,
} from "three";
import { createTracerView, createSpriteView } from "./tracer";
import { createBeamView } from "./beam";
import { effectLights } from "../effectLights";
import { streamClock } from "../../state/streamPlaybackStore";
import { applyStreamEntityPose } from "../../stream/interpolateEntity";
import type { TracerEntity, BeamEntity } from "../../state/gameEntityTypes";
import type { StreamEntity } from "../../stream/types";

const camera = new PerspectiveCamera();
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
afterEach(() => {
  streamClock.time = 0;
});
const tracer: TracerEntity = {
  id: "bolt",
  className: "TracerProjectile",
  renderType: "Tracer",
  direction: [1, 0, 0],
  keyframes: [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] }],
  visual: {
    kind: "tracer",
    texture: "test",
    tracerLength: 2,
    tracerWidth: 0.1,
    crossViewAng: 0.9,
    crossSize: 0.2,
    renderCross: true,
    blur: { lifetime: 0.2, width: 0.1, color: { r: 1, g: 0, b: 0 } },
    light: { radius: 4, color: { r: 1, g: 0, b: 0 } },
  },
};

describe("projectile views", () => {
  it("reuses tracer buffers, bounds blur history, clears the old trail and unregisters light on release", () => {
    const before = effectLights().size,
      view = createTracerView(tracer.visual, [new Texture(), new Texture()]);
    view.reset(tracer);
    expect(effectLights().size).toBe(before + 1);
    const blur = view.root.children[0] as Mesh,
      positions = blur.geometry.getAttribute("position").array;
    for (let i = 0; i < 80; i++) {
      streamClock.time = i / 120;
      view.root.position.x = i * 0.1;
      view.update(tracer, camera, 1 / 120);
    }
    expect(blur.geometry.drawRange.count).toBeGreaterThan(0);
    expect(blur.geometry.drawRange.count).toBeLessThanOrEqual(31 * 6);
    expect(blur.geometry.getAttribute("position").array).toBe(positions);
    expect([...positions].every(Number.isFinite)).toBe(true);
    const body = view.root.children[1] as Mesh;
    expect((body.material as MeshBasicMaterial).blending).toBe(
      AdditiveBlending,
    );
    view.release();
    expect(effectLights().size).toBe(before);
    view.reset(tracer);
    expect(blur.geometry.drawRange.count).toBe(0);
    view.dispose();
    expect(effectLights().size).toBe(before);
  });
  it("keeps sniper alpha blending, fades the endpoint light and rewinds its texture/opacity", () => {
    const e: BeamEntity = {
      id: "laser",
      renderType: "Beam",
      className: "SniperProjectile",
      spawnTime: 0,
      beamStart: [0, 0, 0],
      beamEnd: [10, 0, 0],
      visual: {
        kind: "beam",
        textures: [],
        color: { r: 1, g: 0, b: 0 },
        fadeTime: 1,
        startWidth: 0.1,
        endWidth: 0.3,
        pulseSpeed: 2,
        pulseLength: 0.5,
        light: { radius: 4, color: { r: 1, g: 0, b: 0 } },
      },
    };
    const view = createBeamView(
      e.visual,
      Array.from({ length: 11 }, () => new Texture()),
    );
    view.reset(e);
    streamClock.time = 0.5;
    view.update(e, camera, 0);
    const mat = (view.root.children[0] as Mesh).material as MeshBasicMaterial;
    expect(mat.blending).toBe(NormalBlending);
    expect(mat.opacity).toBe(0.5);
    const light = [...effectLights()].find((l) => l.anchor === view.root)!;
    expect(light.intensity).toBe(0.5);
    expect(light.offset.toArray()).toEqual([0, 0, 10]);
    streamClock.time = 1;
    view.update(e, camera, 0);
    expect(view.root.visible).toBe(false);
    expect(light.intensity).toBe(0);
    view.release();
    view.reset(e);
    streamClock.time = 0.1;
    view.update(e, camera, 0);
    expect(view.root.visible).toBe(true);
    expect(mat.opacity).toBe(0.9);
    view.dispose();
  });
  it("uses the same interpolated Torque-to-Three pose for a newly acquired view", () => {
    const group = new Group();
    const a = {
      id: "a",
      position: [10, 20, 30],
      rotation: [0, 0, 0, 1],
    } as StreamEntity;
    const b = { ...a, position: [30, 40, 50] } as StreamEntity;
    applyStreamEntityPose(group, undefined, b, a, 0.25, camera);
    expect(group.position.toArray()).toEqual([25, 35, 15]);
    const view = createSpriteView(
      { kind: "sprite", texture: "test", size: 2, color: { r: 1, g: 0, b: 0 } },
      new Texture(),
    );
    expect(view.root.children[0].scale.toArray()).toEqual([2, 2, 1]);
    view.dispose();
  });
});

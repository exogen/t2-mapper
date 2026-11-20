import { afterEach, expect, it, vi } from "vitest";
import {
  Box3,
  type BufferGeometry,
  Matrix4,
  Mesh,
  type MeshBasicMaterial,
  PerspectiveCamera,
  Sprite,
  Texture,
  Vector3,
} from "three";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import {
  registerForceFieldCollider,
  unregisterForceFieldCollider,
} from "../collision/worldCollision";
import type { BeamEntity } from "../state/gameEntityTypes";
import { streamClock } from "../state/streamPlaybackStore";
import { resolveBeamVisual } from "../stream/streamHelpers";
import { TestLiveStream } from "../stream/streamTestFixtures";
import { createBeamView } from "./beam";

function sniperBeam() {
  const visual = resolveBeamVisual("SniperProjectile", {
    textures: Array.from({ length: 12 }, (_, index) => `texture-${index}`),
    beamFlareAngle: 4,
    minFlareSize: 20,
    maxFlareSize: 300,
    fadeTime: 1,
  });
  if (visual?.kind !== "beam") throw new Error("Missing sniper beam");
  const entity: BeamEntity = {
    id: "shot",
    className: "SniperProjectile",
    renderType: "Beam",
    beamStart: [0, 0, 0],
    beamEnd: [10, 0, 0],
    visual,
    spawnTime: 1,
  };
  const textures = Array.from({ length: 11 }, () => new Texture());
  const view = createBeamView(visual, textures, new Texture(), () => 720);
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  streamClock.time = 1.25;
  const [core, pulse, first, second] = view.root.children;
  return {
    entity,
    camera,
    view,
    core: core as Mesh,
    pulse: pulse as Mesh<BufferGeometry, MeshBasicMaterial>,
    first: first as Sprite,
    second: second as Sprite,
    textures,
  };
}

afterEach(() => {
  streamClock.time = 0;
  unregisterForceFieldCollider("sniper-flare-occluder");
  vi.restoreAllMocks();
});

it("draws the two fading muzzle flares at the authored screen size head on", () => {
  const { entity, camera, view, core, pulse, first, second } = sniperBeam();
  try {
    view.update(entity, camera, 0);
    expect(core.visible).toBe(false);
    expect(pulse.visible).toBe(false);
    expect(first.visible).toBe(true);
    expect(second.visible).toBe(true);
    expect(first.position.toArray()).toEqual([0, 0, 0]);
    for (const sprite of [first, second])
      expect(sprite.material.opacity).toBe(0.75);
    expect(first.material.rotation).toBe(0.25);
    expect(second.material.rotation).toBe(-0.25);
    expect(second.scale.x).toBeCloseTo(first.scale.x * 0.75);

    for (const distance of [20, 40]) {
      camera.position.z = distance;
      view.update(entity, camera, 0);
      const width =
        (first.scale.x * camera.projectionMatrix.elements[5] * 720) /
        (2 * distance);
      expect(width).toBeCloseTo(300);
    }

    camera.position.set(4, 0, 20);
    camera.lookAt(0, 0, 0);
    view.update(entity, camera, 0);
    const minWidth =
      (first.scale.x * camera.projectionMatrix.elements[5] * 720) /
      (2 * camera.position.length());
    expect(minWidth).toBeCloseTo(20);

    streamClock.time = 2;
    view.update(entity, camera, 0);
    expect(view.root.visible).toBe(false);
  } finally {
    view.dispose();
  }
});

it("moves the nearly edge-on ribbon outward and hides the flare behind cover", () => {
  const { entity, camera, view, core, first, second } = sniperBeam();
  entity.linkSourceId = "shooter";
  const cast = vi.spyOn(renderShapeRaycast, "targetBeamHit");
  try {
    camera.position.x = 0.1;
    camera.lookAt(0, 0, 0);
    view.update(entity, camera, 0);
    expect(core.visible).toBe(true);
    expect(first.visible).toBe(true);
    expect(cast).toHaveBeenCalledWith(
      expect.any(Vector3),
      first.position,
      "shooter",
    );
    const positions = core.geometry.getAttribute("position");
    const adjusted = new Vector3()
      .fromBufferAttribute(positions, 2)
      .lerp(new Vector3().fromBufferAttribute(positions, 3), 0.5);
    expect(adjusted.distanceTo(new Vector3(0, 0, 10))).toBeGreaterThan(0.15);

    registerForceFieldCollider(
      "sniper-flare-occluder",
      new Matrix4(),
      new Box3(new Vector3(-1, -1, 5), new Vector3(1, 1, 6)),
      true,
    );
    view.update(entity, camera, 0);
    expect(first.visible).toBe(false);
    expect(second.visible).toBe(false);

    cast.mockClear();
    camera.lookAt(50, 0, 20);
    view.update(entity, camera, 0);
    expect(cast).not.toHaveBeenCalled();
  } finally {
    view.dispose();
  }
});

it("keeps the flare's shooter exclusion tied to the original ghost lifetime", () => {
  const stream = new TestLiveStream("watch", (id) =>
    id === 1 ? "SniperProjectile" : "Player",
  );
  stream.createGhost(8, 2, {});
  stream.createGhost(9, 1, {
    initialPosition: { x: 0, y: 0, z: 0 },
    endPos: { x: 10, y: 0, z: 0 },
    sourceObject: 8,
  });
  expect(stream.entityAt(9)?.linkSourceId).toBe(stream.entityAt(8)?.id);

  stream.roundTripCheckpoint();
  expect(stream.entityAt(9)?.linkSourceId).toBe(stream.entityAt(8)?.id);

  // A contestant entering the old shooter's slot still occludes the flare.
  stream.createGhost(8, 2, {});
  expect(stream.entityAt(9)?.linkSourceId).toBeUndefined();

  // A fresh scoped packet can explicitly bind its shooter, and a swing
  // carrying the muzzle position releases the exclusion again.
  const endPos = { x: 10, y: 0, z: 0 };
  stream.updateGhost(9, { endPos, sourceObject: 8, sourceSlot: 0 });
  expect(stream.entityAt(9)?.linkSourceId).toBe(stream.entityAt(8)?.id);
  stream.updateGhost(9, { endPos, initialPosition: { x: 1, y: 0, z: 0 } });
  expect(stream.entityAt(9)?.linkSourceId).toBeUndefined();
  expect(stream.entityAt(9)?.sourceSlot).toBeUndefined();
});

it("holds each pulse texture for a full tenth of the beam lifetime", () => {
  const { entity, camera, view, pulse, textures } = sniperBeam();
  camera.position.x = 4;
  camera.lookAt(0, 0, 0);
  try {
    for (const [time, index] of [
      [1.075, 0],
      [1.125, 1],
      [1.975, 9],
    ]) {
      streamClock.time = time;
      view.update(entity, camera, 0);
      expect(pulse.material.map).toBe(textures[index]);
    }
  } finally {
    view.dispose();
  }
});

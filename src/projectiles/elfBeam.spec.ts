import { expect, it } from "vitest";
import {
  Group,
  PerspectiveCamera,
  Sprite,
  Texture,
  type Object3D,
} from "three";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import { buildDTS } from "../dts/dtsBuilder";
import { createDTSCollisionTestShape } from "../dts/dtsTestFixtures";
import { nodeEmitters, readNodeEmitterTransform } from "../engine/nodeEmitters";
import type { LinkBeamEntity } from "../state/gameEntityTypes";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import type { StreamingPlayback } from "../stream/types";
import { createLinkBeamView } from "./beam";

it("places ELF sparks at the target and its three flares at the visible hull contact", () => {
  const source = new Group();
  source.position.set(-5, 1.15, 0);
  const target = buildDTS(createDTSCollisionTestShape()).scene;
  target.position.x = 5;
  const removeTarget = renderShapeRaycast.register("target", target, "Player");
  const { playback, cameraMode } = streamPlaybackStore.getState();
  const previousCamera = streamRenderFrame.camera;
  streamPlaybackStore.setState({
    cameraMode: "original",
    playback: {
      getDataBlockData: (id: number) =>
        id === 12 ? { emitter: 42 } : undefined,
    } as StreamingPlayback,
  });
  const camera = new PerspectiveCamera();
  camera.position.set(-8, 1.5, 4);
  const entity: LinkBeamEntity = {
    id: "elf",
    className: "ELFProjectile",
    renderType: "LinkBeam",
    dataBlockId: 12,
    linkSourceId: "source",
    linkTargetId: "target",
    spawnTime: 0.2,
    visual: {
      kind: "linkBeam",
      variant: "elf",
      texture: "wave",
      flareTexture: "contact",
      lightningTexture: "lightning",
      width: 0.2,
      alpha: 1,
      scrollSpeed: 9,
      texRepeat: 0.25,
      flareSize: 0.5,
    },
  };
  const roots = new Map<string, Object3D>([
    ["source", source],
    ["target", target],
  ]);
  const view = createLinkBeamView(
    entity.visual,
    [new Texture(), new Texture(), new Texture()],
    (id) => {
      const root = id && roots.get(id);
      return root ? { root } : undefined;
    },
  );
  const previousTime = streamClock.time;
  try {
    view.reset(entity);
    const sparks = [...nodeEmitters()].find(
      ({ ownerId }) => ownerId === "elf",
    )!;
    streamClock.time = 0.19;
    view.update(entity, camera, 0.016);
    expect(view.root.visible).toBe(false);
    expect(sparks.frame.dtScale).toBe(0);

    streamClock.time = 0.5;
    view.update(entity, camera, 0.016);
    expect(sparks).toMatchObject({
      dataBlockId: 42,
      emitAtPoint: true,
      frame: { dtScale: 1, velocity: [0, 0, 0] },
    });
    const origin: [number, number, number] = [0, 0, 0];
    const axis: [number, number, number] = [0, 0, 0];
    readNodeEmitterTransform(sparks.anchor, origin, axis);
    expect(origin[1]).toBeCloseTo(5);
    expect(origin[2]).toBeCloseTo(1.15);
    expect(axis[2]).toBeCloseTo(1);
    const flares = view.root.children.filter(
      (child) => child instanceof Sprite,
    );
    expect(flares).toHaveLength(3);
    for (const sprite of flares) {
      expect(sprite.visible).toBe(true);
      expect(sprite.position.x).toBeCloseTo(4.5);
    }
    expect(new Set(flares.map((sprite) => sprite.material.rotation)).size).toBe(
      3,
    );

    const blocker = buildDTS(createDTSCollisionTestShape()).scene;
    const removeBlocker = renderShapeRaycast.register(
      "blocker",
      blocker,
      "Player",
    );
    try {
      view.update(entity, camera, 0.016);
      expect(view.root.visible).toBe(false);
      readNodeEmitterTransform(sparks.anchor, origin, axis);
      expect(origin[1]).toBeCloseTo(5);
    } finally {
      removeBlocker();
    }

    const shooter = buildDTS(createDTSCollisionTestShape()).scene;
    shooter.position.x = -5;
    const removeShooter = renderShapeRaycast.register(
      "source",
      shooter,
      "Player",
    );
    try {
      camera.position.set(-8, 1.15, 0);
      streamRenderFrame.camera = {
        mode: "first-person",
        controlEntityId: "source",
        time: 0.5,
        fov: 90,
        position: [0, -8, 1.15],
        rotation: [0, 0, 0, 1],
      };
      view.update(entity, camera, 0.016);
      expect(flares.every((sprite) => sprite.visible)).toBe(true);
      streamRenderFrame.camera.mode = "third-person";
      view.update(entity, camera, 0.016);
      expect(view.root.visible).toBe(true);
      expect(flares.every((sprite) => !sprite.visible)).toBe(true);
    } finally {
      removeShooter();
    }

    view.update({ ...entity, linkTargetId: undefined }, camera, 0.016);
    expect(view.root.visible).toBe(false);
    expect(sparks.frame.dtScale).toBe(0);
    view.release();
    expect(nodeEmitters().has(sparks)).toBe(false);
  } finally {
    view.dispose();
    removeTarget();
    streamPlaybackStore.setState({ playback, cameraMode });
    streamRenderFrame.camera = previousCamera;
    streamClock.time = previousTime;
  }
});

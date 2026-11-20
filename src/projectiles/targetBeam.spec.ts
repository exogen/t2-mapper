import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Box3,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Texture,
  Vector3,
} from "three";
import type { ParsedData } from "t2-demo-parser";
import {
  registerForceFieldCollider,
  unregisterForceFieldCollider,
} from "../collision/worldCollision";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import { DTSShape } from "../dts/dtsModel";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import { MountPoints } from "../engine/shapeMountPoints";
import { registerImageMuzzle } from "../engine/weaponMuzzle";
import { streamClock } from "../state/streamPlaybackStore";
import type { TargetBeamEntity } from "../state/gameEntityTypes";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "../stream/entityBridge";
import {
  isTrackableProjectile,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { TestLiveStream } from "../stream/streamTestFixtures";
import { TARGET_BEAM_PLAYER_WARP_SEC } from "../stream/streamHelpers";
import { ProjectilePool } from "./ProjectilePool";
import { createTargetBeamView } from "./targetBeam";
import type { ProjectileEntityLookup } from "./types";

function mountedSource(
  sourceId: string,
  model: DTSShape,
): ProjectileEntityLookup {
  const mounts = new MountPoints();
  mounts.setScene(model);
  const view = { root: model, mounts };
  return (id) => (id === sourceId ? view : undefined);
}

class TargetBeamStream extends TestLiveStream {
  time = 0;

  constructor(mode: "play" | "watch" = "watch") {
    super(mode, (id) => (id === 1 ? "TargetProjectile" : "Player"));
  }

  protected getTimeSec() {
    return this.time;
  }

  getDataBlockData(id: number): ParsedData | undefined {
    if (id !== 513) return undefined;
    return {
      startBeamWidth: 0.2,
      pulseBeamWidth: 0.15,
      textures: [
        "special/nonlingradient",
        "special/flare",
        "special/pulse",
        "special/expFlare",
      ],
    };
  }
}

const initialBeam = {
  dataBlockId: 513,
  initialPosition: { x: 0, y: 0, z: 0 },
  endPos: { x: 0, y: 10, z: 0 },
  sourceObject: 8,
  sourceSlot: 2,
  clientOwned: false,
};

function createBeam(stream: TargetBeamStream): TargetBeamEntity {
  stream.createGhost(9, 1, initialBeam);
  const ghost = stream.entityAt(9)!;
  const beam = streamEntityToGameEntity(ghost, 0);
  expect(beam.renderType).toBe("TargetBeam");
  return beam as TargetBeamEntity;
}

afterEach(() => {
  streamClock.time = 0;
  streamRenderFrame.current = null;
  streamRenderFrame.firstPersonPlayerId = null;
  streamRenderFrame.maskFirstPersonPose = false;
  unregisterForceFieldCollider("beam-hit");
  unregisterForceFieldCollider("beam-blocker");
});

describe("targeting laser", () => {
  it("casts through the followed player's current crosshair on the same frame", () => {
    const stream = new TargetBeamStream();
    stream.createGhost(8, 2, {});
    const beam = createBeam(stream);
    const shooter = stream.entityAt(8)!;
    const source = new DTSShape();
    source.data = createDTSTestShape();
    const carrier = new Group();
    carrier.position.y = 0.75;
    const image = new Group();
    image.position.set(0, 0.5, 0.25);
    carrier.add(source);
    source.add(image);
    const unregisterMuzzle = registerImageMuzzle(shooter.id, 2, image);
    const unregister = renderShapeRaycast.register(
      shooter.id,
      source,
      "Player",
    );
    streamRenderFrame.current = new Map([[shooter.id, shooter]]);
    streamRenderFrame.firstPersonPlayerId = shooter.id;
    streamRenderFrame.maskFirstPersonPose = true;
    registerForceFieldCollider(
      "beam-hit",
      new Matrix4(),
      new Box3(new Vector3(20, 1.5, -1), new Vector3(21, 2.5, 1)),
      true,
    );
    registerForceFieldCollider(
      "beam-blocker",
      new Matrix4(),
      new Box3(new Vector3(-1, 1.5, 20), new Vector3(1, 2.5, 21)),
      true,
    );
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, 0);
    const view = createTargetBeamView(
      beam.visual,
      [],
      () => 720,
      mountedSource(shooter.id, source),
    );
    const impact = view.root.children[2];
    const core = view.root.children[4] as Mesh;
    const positions = core.geometry.getAttribute("position");
    const muzzle = new Vector3();
    try {
      // The laser is remote, its recorded endpoint stays at x=10, and its
      // muzzle is offset from the eye. Both aim changes must hit the center.
      for (const expected of [new Vector3(20, 2, 0), new Vector3(0, 2, 20)]) {
        camera.lookAt(expected);
        view.update(beam, camera, 0);
        expect(impact.position.distanceTo(expected)).toBeLessThan(1e-6);
        muzzle
          .fromBufferAttribute(positions, 0)
          .lerp(new Vector3().fromBufferAttribute(positions, 1), 0.5);
        expect(muzzle.distanceTo(new Vector3(0, 1.25, 0.25))).toBeLessThan(
          1e-6,
        );
      }
    } finally {
      unregister();
      unregisterMuzzle();
      view.dispose();
    }
  });

  it.each([3, 7, 15])(
    "reconciles a remote player's recorded aim %i degrees from the muzzle",
    (degrees) => {
      const stream = new TargetBeamStream();
      stream.createGhost(8, 2, {});
      const beam = createBeam(stream);
      const shooter = stream.entityAt(8)!;
      const source = new DTSShape();
      source.data = createDTSTestShape();
      source.rotation.y = Math.PI / 2;
      const unregister = renderShapeRaycast.register(
        shooter.id,
        source,
        "Player",
      );
      streamRenderFrame.current = new Map([[shooter.id, shooter]]);
      const angle = (degrees * Math.PI) / 180;
      const packetEnd = new Vector3(
        Math.cos(angle) * 100,
        0,
        Math.sin(angle) * 100,
      );
      beam.beamEnd = [packetEnd.z, packetEnd.x, packetEnd.y];
      beam.targetBeam = {
        clientOwned: false,
        warp: { from: [0, 10, 0], startedAtSec: 0 },
      };
      streamClock.time = TARGET_BEAM_PLAYER_WARP_SEC / 2;
      const view = createTargetBeamView(
        beam.visual,
        [],
        () => 720,
        mountedSource(shooter.id, source),
      );
      const camera = new PerspectiveCamera();
      // A third-person spectator looking away from the shot is never the aim.
      camera.position.set(0, 2, 10);
      camera.lookAt(0, 2, 0);
      try {
        view.update(beam, camera, 0);
        const localEnd = new Vector3(beam.visual.range, 0, 0);
        const warpFrom = new Vector3(10, 0, 0);
        const expected =
          degrees === 3
            ? warpFrom.lerp(packetEnd, 0.5)
            : degrees === 7
              ? warpFrom.lerp(localEnd, 0.5)
              : localEnd;
        expect(
          view.root.children[2].position.distanceTo(expected),
        ).toBeLessThan(1e-6);
      } finally {
        unregister();
        view.dispose();
      }
    },
  );

  it("keeps the pooled ribbon in world coordinates", async () => {
    const beam = createBeam(new TargetBeamStream());
    beam.position = [9, 2, 5];
    beam.rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    beam.scale = [2, 2, 2];
    const camera = new PerspectiveCamera();
    camera.position.set(20, 2, 0);
    camera.lookAt(0, 0, 0);
    const view = createTargetBeamView(
      beam.visual,
      [],
      () => 720,
      () => undefined,
    );
    const pool = new ProjectilePool(new Group(), async () => () => view);
    pool.sync(new Map([[beam.id, beam]]));
    await Promise.resolve();
    pool.prepare(0);
    pool.update(camera, 0);

    const core = view.root.children[4];
    if (!(core instanceof Mesh)) throw new Error("Expected the core ribbon");
    expect(view.root.parent).toBeTruthy();
    const vertices = core.geometry.getAttribute("position");
    const endpoint = new Vector3()
      .fromBufferAttribute(vertices, 2)
      .lerp(new Vector3().fromBufferAttribute(vertices, 3), 0.5);
    core.localToWorld(endpoint);
    expect(endpoint.toArray()).toEqual([10, 0, 0]);
    pool.dispose();
  });

  it.each([false, true])(
    "does not attach to a reused shooter slot (explicit delete: %s)",
    (deleteSource) => {
      const stream = new TargetBeamStream("play");
      stream.feedDecoded({
        ghosts: [
          { index: 9, type: "create", classId: 1, parsedData: initialBeam },
          { index: 8, type: "create", classId: 2, parsedData: {} },
        ],
      });
      const sourceId = stream.entityAt(8)?.id;
      expect(sourceId).toBeDefined();
      expect(stream.entityAt(9)?.linkSourceId).toBe(sourceId);
      if (deleteSource) stream.ghost({ index: 8, type: "delete" });
      stream.createGhost(8, 2, {});

      expect(stream.entityAt(9)?.linkSourceId).toBeUndefined();
      stream.roundTripCheckpoint();
      expect(stream.entityAt(9)?.linkSourceId).toBeUndefined();

      stream.updateGhost(9, {
        sourceObject: 8,
        sourceSlot: 3,
        endPos: { x: 0, y: 20, z: 0 },
      });
      expect(stream.entityAt(9)).toMatchObject({
        linkSourceId: stream.entityAt(8)?.id,
        sourceSlot: 3,
      });
    },
  );

  it("keeps the scoped source slot and warps to swing endpoints across checkpoints", () => {
    const stream = new TargetBeamStream();
    stream.createGhost(8, 2, {});
    const beam = createBeam(stream);
    expect(beam.linkSourceId).toBe(stream.entityAt(8)?.id);
    expect(beam.sourceSlot).toBe(2);
    expect(isTrackableProjectile(stream.entityAt(9))).toBe(false);

    stream.time = 1;
    stream.updateGhost(9, {
      sourceObject: 8,
      sourceSlot: 2,
      clientOwned: false,
      endPos: { x: 0, y: 20, z: 0 },
    });
    stream.roundTripCheckpoint();
    const updated = stream.entityAt(9)!;
    updateGameEntityFromStream(beam, updated);
    expect(beam.targetBeam?.warp?.from).toEqual([0, 10, 0]);
    expect(beam.beamEnd).toEqual([0, 20, 0]);
    expect(beam.linkSourceId).toBe(stream.entityAt(8)?.id);

    stream.time += TARGET_BEAM_PLAYER_WARP_SEC / 2;
    stream.updateGhost(9, {
      initialPosition: { x: 0, y: 1, z: 0 },
      endPos: { x: 0, y: 30, z: 0 },
    });
    updateGameEntityFromStream(beam, stream.entityAt(9)!);
    expect(beam.targetBeam?.warp?.from[1]).toBeCloseTo(15);
    expect(beam.beamStart).toEqual([0, 1, 0]);
    expect(beam.linkSourceId).toBeUndefined();
    expect(beam.sourceSlot).toBeUndefined();
  });

  it("recovers a beam from an old checkpoint when its next endpoint arrives", () => {
    const stream = new TargetBeamStream();
    stream.addEntity({
      id: "old-target",
      ghostIndex: 9,
      className: "TargetProjectile",
      type: "Ghost",
      dataBlockId: 513,
      position: [0, 1, 2],
    });
    stream.roundTripCheckpoint();
    expect(streamEntityToGameEntity(stream.entityAt(9)!).renderType).toBe(
      "Shape",
    );
    stream.time = 1;
    stream.updateGhost(9, {
      endPos: { x: 0, y: 10, z: 0 },
      sourceObject: 8,
      sourceSlot: 2,
    });
    const ghost = stream.entityAt(9)!;
    expect(streamEntityToGameEntity(ghost)).toMatchObject({
      renderType: "TargetBeam",
      beamStart: [0, 1, 2],
      beamEnd: [0, 10, 0],
      sourceSlot: 2,
    });
    expect(isTrackableProjectile(ghost)).toBe(false);
  });

  it("scrolls the pulse in stream time and hides the impact behind a separate collider", () => {
    const stream = new TargetBeamStream();
    const beam = createBeam(stream);
    const camera = new PerspectiveCamera();
    camera.position.set(20, 2, 0);
    camera.lookAt(0, 0, 0);
    const view = createTargetBeamView(
      beam.visual,
      Array.from({ length: 4 }, () => new Texture()),
      () => 720,
      () => undefined,
    );
    const [, , impact, pulse, core] = view.root.children;
    if (!(pulse instanceof Mesh)) throw new Error("Expected the pulse ribbon");
    const uv = pulse.geometry.getAttribute("uv");
    const targetBox = new Box3(new Vector3(10, -1, -1), new Vector3(11, 1, 1));
    registerForceFieldCollider("beam-hit", new Matrix4(), targetBox, true);
    streamClock.time = 0.5;
    view.update(beam, camera, 0);
    expect(impact.visible).toBe(true);
    expect(core.visible).toBe(true);
    expect(uv.getX(0)).toBeCloseTo(-3);
    expect(uv.getX(2)).toBeCloseTo(-1.5);

    registerForceFieldCollider(
      "beam-blocker",
      new Matrix4().makeTranslation(5, 1, 0),
      targetBox,
      true,
    );
    view.update(beam, camera, 0);
    expect(impact.visible).toBe(false);
    view.dispose();
  });

  it("reuses the muzzle cast's hit when testing a locally aimed end flare", () => {
    const muzzle = new Vector3();
    const aim = new Vector3(20, 0, 0);
    const camera = new Vector3(20, 2, 0);
    const direction = new Vector3(1, 0, 0);
    const targetBox = new Box3(new Vector3(10, -1, -1), new Vector3(11, 1, 1));
    registerForceFieldCollider("beam-hit", new Matrix4(), targetBox, true);
    const hit = renderShapeRaycast.targetBeamHit(muzzle, aim, undefined)!;
    const end = aim.lerp(muzzle, 1 - hit.t);
    const cast = vi.spyOn(renderShapeRaycast, "targetBeamHit");
    const visible = renderShapeRaycast.targetBeamFlareVisible(
      camera,
      muzzle,
      end,
      direction,
      undefined,
      hit,
    );
    const rayCount = cast.mock.calls.length;
    cast.mockRestore();
    expect(visible).toBe(true);
    expect(rayCount).toBe(1);
  });
});

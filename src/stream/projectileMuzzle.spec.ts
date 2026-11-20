import { describe, expect, it, vi } from "vitest";
import {
  prepareProjectileShapes,
  type ProjectileShapePoses,
} from "../collision/projectileShapeAssets";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import type { MutableEntity } from "./StreamEngine";
import type { ProjectileMuzzleFrame } from "./projectileMuzzle";
import { TestLiveStream } from "./streamTestFixtures";
import { STREAM_TICK_SEC } from "./streamHelpers";
import type { ParsedData } from "t2-demo-parser";

const body = "test-firing-turret.dts";
const weapon = "test-firing-weapon.dts";
const replacement = "test-replacement-weapon.dts";
const dataBlocks = new Map<number, ParsedData>([
  [1, { dryVelocity: 100, lifetimeMS: 640 }],
  [2, { shapeName: body }],
  [3, { shapeName: weapon, mountPoint: 0, projectile: 1 }],
  [4, { shapeName: replacement, mountPoint: 0, projectile: 5 }],
]);
const muzzleShape = (node: string, y: number) => {
  const shape = createDTSTestShape();
  shape.names[shape.nodes[0].nameIndex] = node;
  shape.defaultTranslations.set([0, y, 0]);
  return shape;
};

class FiringStream extends TestLiveStream {
  constructor() {
    super("play", (id) => (id === 1 ? "LinearProjectile" : "Turret"));
    this.createGhost(3, 2, {
      dataBlockId: 2,
      position: { x: 0, y: 0, z: 100 },
      images: [{ index: 2, dataBlockId: 3 }],
    });
  }

  override getDataBlockData(id: number) {
    return dataBlocks.get(id);
  }

  aim(phi: number) {
    this.processControlObject({
      controlObjectGhostIndex: 0,
      controlObjectData: {
        rotationZ: 0,
        headX: 0,
        headZ: 0,
        controlObjectGhost: 3,
        controlObjectData: { turretState: 2, rotationValues: [1, phi, 90] },
      },
      compressionPoint: { x: 0, y: 0, z: 100 },
    });
  }

  fire() {
    this.createGhost(4, 1, {
      dataBlockId: 1,
      sourceObject: 3,
      sourceSlot: 2,
      position: { x: 0, y: 0, z: 100 },
      direction: { x: 1, y: 0, z: 0 },
      currTick: 0,
    });
  }

  readonly launchPose = vi.fn<(frame?: ProjectileMuzzleFrame) => void>();

  protected override resolveProjectileMuzzle(
    source: MutableEntity,
    slot: number,
    poses: ProjectileShapePoses,
    launch?: ProjectileMuzzleFrame,
  ) {
    this.launchPose(launch);
    return super.resolveProjectileMuzzle(source, slot, poses, launch);
  }
}

describe("projectile muzzle at fire time", () => {
  it("keeps the firing image when another weapon mounts before the tick", () => {
    prepareProjectileShapes([body, weapon, replacement], (name) => {
      if (name === body) return muzzleShape("Mount0", 0);
      return muzzleShape("Muzzlepoint", name === weapon ? 5 : -5);
    });
    const stream = new FiringStream();
    stream.fire();
    stream.updateGhost(3, { images: [{ index: 2, dataBlockId: 4 }] });
    stream.roundTripCheckpoint();
    stream.stepToTime(STREAM_TICK_SEC);
    expect(stream.entityAt(3)?.imageSlots?.[2]?.dataBlockId).toBe(4);
    const origin = stream.entityAt(4)?.linearTickStart;
    expect(origin?.[0]).toBeCloseTo(0);
    expect(origin?.slice(1)).toEqual([5, 100]);
  });

  it("samples the latest control-packet turret aim at the launch", () => {
    const stream = new FiringStream();
    stream.aim(30);
    stream.stepToTime(STREAM_TICK_SEC);
    stream.aim(90);
    stream.fire();
    stream.aim(180);
    stream.stepToTime(STREAM_TICK_SEC * 2);
    expect(stream.launchPose).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        turretAim: { activation: 1, phi: 90, theta: 90 },
      }),
    );
  });
});

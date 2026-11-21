import { afterEach, describe, expect, it, vi } from "vitest";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import {
  accelerateSeeker,
  advanceSeekerWarp,
  createSeekerWarp,
  seekerTuning,
  steerSeeker,
} from "./seekerProjectile";
import { TestLiveStream } from "./streamTestFixtures";

const missile = {
  useFlechette: true,
  flechetteDelayMs: 550,
  maxVelocity: 80,
  acceleration: 200,
  turningSpeed: 110,
  exhaustEmitter: 2,
  exhaustTimeMs: 300,
  casingDebris: 4,
  delayEmitter: 5,
  emitterDelay: -1,
};
const tuning = seekerTuning(missile);

afterEach(() => setTerrainCollisionData(null));

const launch = {
  dataBlockId: 1,
  position: { x: 0, y: 0, z: 100 },
  velocity: { x: 10, y: 0, z: 0 },
  orientation: { x: 0, y: 0, z: 0 },
  timeoutReset: true,
  targetMode: 2,
};

function createStream(
  data: typeof missile & { puffEmitter?: number } = missile,
) {
  const stream = new TestLiveStream("play", (classId) =>
    classId === 1 ? "SeekerProjectile" : "Player",
  );
  vi.spyOn(stream, "getDataBlockData").mockImplementation((id) =>
    id === 1 ? data : id === 4 ? { lifetime: 1 } : undefined,
  );
  return stream;
}

describe("seeker missile prediction", () => {
  it("turns at the authored degrees per second and applies the last turn when passing the target", () => {
    const radians = (110 * 0.032 * Math.PI) / 180;
    const velocity: [number, number, number] = [10, 0, 0];
    const ahead = steerSeeker(
      [0, 0, 0],
      velocity,
      { position: [10, 10, 0] },
      tuning,
    );
    const behind = steerSeeker(
      [0, 0, 0],
      velocity,
      { position: [-10, 10, 0] },
      tuning,
    );
    expect(ahead.passedTarget).toBe(false);
    expect(behind.passedTarget).toBe(true);
    expect(ahead.velocity[0]).toBeCloseTo(Math.cos(radians) * 10);
    expect(ahead.velocity[1]).toBeCloseTo(Math.sin(radians) * 10);
    expect(behind.velocity[1]).toBeCloseTo(ahead.velocity[1]);
    expect(
      steerSeeker(
        [0, 0, 0],
        velocity,
        { position: [10, 10, 0], heat: 0 },
        tuning,
      ).velocity,
    ).toBe(velocity);
  });

  it("accelerates after the flechette phase along the missile's own velocity", () => {
    const inherited: [number, number, number] = [0, 8, 0];
    const initial: [number, number, number] = [10, 8, 0];
    expect(accelerateSeeker(initial, inherited, tuning, 16)).toBe(initial);
    expect(accelerateSeeker(initial, inherited, tuning, 17)).toEqual([
      16.4, 8, 0,
    ]);
    expect(accelerateSeeker([79, 8, 0], inherited, tuning, 17)[0]).toBeCloseTo(
      85.4,
    );
    expect(accelerateSeeker([80, 8, 0], inherited, tuning, 17)).toEqual([
      80, 8, 0,
    ]);
  });

  it("steers away from terrain except for a nearby target with a clear shot", () => {
    setTerrainCollisionData({
      heightMap: new Uint16Array(256 * 256),
      squareSize: 8,
    });
    const avoidance = seekerTuning({
      ...missile,
      terrainAvoidanceRadius: 10,
      terrainAvoidanceSpeed: 180,
      terrainScanAhead: 15,
      terrainHeightFail: 2,
    });
    const start: [number, number, number] = [1, 1, 0.5];
    const velocity: [number, number, number] = [10, 0, 0];
    const far = steerSeeker(
      start,
      velocity,
      { position: [100, 1, 0.5] },
      avoidance,
    );
    const near = steerSeeker(
      start,
      velocity,
      { position: [6, 1, 0.5] },
      avoidance,
    );
    expect(far.velocity[2]).toBeCloseTo(
      10 * Math.sin((180 * 0.032 * Math.PI) / 180),
    );
    expect(near.velocity).toBe(velocity);
  });

  it("extrapolates a correction by five ticks and restores server speed when the warp ends", () => {
    const { warp } = createSeekerWarp(
      [0, 0, 0],
      [10, 0, 0],
      [5, 0, 0],
      undefined,
      tuning,
    );
    for (let tick = 1; tick <= 5; tick++) {
      const sample = advanceSeekerWarp(warp);
      expect(sample.position[0]).toBeCloseTo(tick * 2.16);
      expect(sample.velocity[0]).toBeCloseTo(tick === 5 ? 5 : 67.5);
    }
  });

  it.each([3, undefined])(
    "separates the casing before ignition across a checkpoint with puff datablock %s",
    (puffEmitter) => {
      const stream = createStream({ ...missile, puffEmitter });
      stream.createGhost(1, 1, launch);
      stream.stepToTime(0.224);
      expect(stream.entityAt(1)?.seekerCasing).toBe(true);
      const effects = stream.entityAt(1)?.seekerLaunch;
      expect(effects?.exhaustUntilSec).toBeCloseTo(0.256);
      expect(effects?.trailStartsAtSec).toBeCloseTo(0.544);
      expect(effects?.delayEmitterStartsAtSec).toBeCloseTo(0.544);
      stream.roundTripCheckpoint();
      stream.stepToTime(0.256);
      expect(stream.entityAt(1)?.seekerCasing).toBe(false);
      expect(stream.entityAt(1)?.seekerLaunch?.casingSplitAtSec).toBe(0.256);
      expect(stream.entityAt(1)?.seekerLaunch?.puffEmitterId).toBe(puffEmitter);
      const debris = stream.debrisHistory.events;
      expect(debris).toHaveLength(4);
      expect(debris.map(({ spin }) => spin)).toEqual([
        [450, -450],
        [450, 450],
        [-450, 450],
        [-450, -450],
      ]);
      stream.roundTripCheckpoint();
      stream.stepToTime(0.544);
      expect(stream.debrisHistory.events).toHaveLength(4);
      expect(stream.entityAt(1)?.velocity).toEqual([16.4, 0, 0]);
    },
  );

  it("remaps a scoped target on restore and keeps its last position after slot reuse", () => {
    const stream = createStream();
    stream.createGhost(2, 2, { position: { x: 100, y: 100, z: 100 } });
    stream.createGhost(1, 1, { ...launch, targetMode: 0, targetGhost: 2 });
    stream.stepToTime(0.032);
    const targetId = stream.entityAt(2)?.id;
    stream.roundTripCheckpoint();
    expect(stream.entityAt(2)?.id).not.toBe(targetId);
    stream.ghost({ index: 2, type: "delete" });
    stream.createGhost(2, 2, { position: { x: 100, y: -100, z: 100 } });
    const velocity = stream.entityAt(1)?.velocity;
    stream.stepToTime(0.064);
    expect(stream.entityAt(1)!.velocity![1]).toBeGreaterThan(velocity![1]);
  });

  it("binds the target when the packet creates it after the missile", () => {
    const stream = createStream();
    stream.feedDecoded({
      ghosts: [
        {
          index: 1,
          type: "create",
          classId: 1,
          parsedData: { ...launch, targetMode: 0, targetGhost: 2 },
        },
        {
          index: 2,
          type: "create",
          classId: 2,
          parsedData: { position: { x: 100, y: 100, z: 100 } },
        },
      ],
    });
    stream.stepToTime(0.032);
    expect(stream.entityAt(1)!.velocity![1]).toBeGreaterThan(0);
  });

  it("publishes only the scoped targets of airborne missiles", () => {
    const stream = createStream();
    stream.createGhost(2, 2, { position: { x: 100, y: 100, z: 100 } });
    stream.createGhost(1, 1, { ...launch, targetMode: 0, targetGhost: 2 });
    stream.createGhost(3, 1, {
      ...launch,
      targetMode: 1,
      targetDirection: { x: 100, y: 100, z: 100 },
    });
    stream.createGhost(4, 1, { ...launch, targetMode: 0, targetGhost: 42 });
    expect(stream.getSnapshot().inboundMissileTargetIds).toEqual([
      stream.entityAt(2)?.id,
    ]);

    stream.feedDecoded({
      ghosts: [
        {
          type: "update",
          index: 1,
          parsedData: {
            explodePosition: launch.position,
            explodeNormal: { x: 0, y: 0, z: 1 },
          },
        },
      ],
    });
    expect(stream.entityAt(1)?.hasExploded).toBe(true);
    expect(stream.getSnapshot().inboundMissileTargetIds).toBeUndefined();
  });

  it("does not replay launch effects for a mature missile at late scope-in", () => {
    const stream = createStream({ ...missile, exhaustTimeMs: 1000 });
    stream.createGhost(1, 1, { ...launch, timeoutReset: false });
    stream.stepToTime(0.32);
    expect(stream.entityAt(1)?.seekerCasing).toBe(false);
    expect(stream.entityAt(1)?.seekerLaunch?.casingSplitAtSec).toBeUndefined();
    expect(stream.entityAt(1)?.seekerLaunch?.exhaustUntilSec).toBeUndefined();
    expect(stream.debrisHistory.events).toHaveLength(0);
  });

  it("skips exhaust when its duration is one tick or shorter", () => {
    const stream = createStream({ ...missile, exhaustTimeMs: 32 });
    stream.createGhost(1, 1, launch);
    expect(stream.entityAt(1)?.seekerLaunch?.exhaustUntilSec).toBeUndefined();
  });

  it("keeps the saved position and skips launch effects when a full update follows an older checkpoint", () => {
    const stream = createStream();
    stream.createGhost(1, 1, launch);
    stream.stepToTime(0.224);
    const saved = stream.checkpoint();
    const [entity] = saved.state.entities.values();
    delete entity.seekerFlight;
    delete entity.seekerLaunch;
    delete entity.seekerCasing;
    stream.restore(saved);

    const position = stream.entityAt(1)?.position;
    stream.updateGhost(1, { ...launch, position: { x: 8, y: 0, z: 100 } });
    expect(stream.entityAt(1)?.position).toEqual(position);
    expect(stream.entityAt(1)?.projectileAgeMS).toBe(224);
    expect(stream.entityAt(1)?.seekerCasing).toBe(false);
    expect(stream.entityAt(1)?.seekerLaunch?.exhaustUntilSec).toBeUndefined();
    stream.stepToTime(0.256);
    expect(stream.debrisHistory.events).toHaveLength(0);
    expect(stream.entityAt(1)!.position![0]).toBeLessThan(8);
    expect(stream.entityAt(1)?.projectileAgeMS).toBe(256);
  });
});

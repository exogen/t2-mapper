import { describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { TestLiveStream } from "./streamTestFixtures";
import { EmitterInstance } from "../particles/ParticleSystem";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "./entityBridge";

const blocks: Record<number, ParsedData> = {
  1: { timeMultiple: 0.5 },
  2: { particles: [3], ejectionVelocity: 500, ejectionPeriodMS: 2 },
  3: {
    textures: ["energyHaze"],
    lifetimeMS: 100,
    keys: [{ size: 0.5, time: 0 }],
  },
  4: { particles: [5], ejectionVelocity: 1000 },
  5: { textures: ["smoke"] },
};

class AmbientStream extends TestLiveStream {
  readonly dataBlocks = { ...blocks };
  constructor() {
    super("watch", "ParticleEmissionDummy");
  }
  override getDataBlockData(id: number) {
    return this.dataBlocks[id];
  }
  clearWorld() {
    this.clearAllEntities();
  }
}

describe("streamed ambient particle emitters", () => {
  it("changes world generation only when replacing the world, without restoring an old generation", () => {
    const stream = new AmbientStream();
    const initial = stream.worldGeneration;
    stream.createGhost(0, 1, { emitterDatablockId: 2 });
    stream.updateGhost(0, { emitterDatablockId: 2 });
    expect(stream.worldGeneration).toBe(initial);
    const checkpoint = stream.checkpoint();
    stream.clearWorld();
    expect(stream.worldGeneration).toBe(initial + 1);
    stream.restore(checkpoint);
    expect(stream.worldGeneration).toBe(initial + 2);
    stream.reset();
    expect(stream.worldGeneration).toBe(initial + 3);
    stream.restore(checkpoint);
    expect(stream.worldGeneration).toBe(initial + 4);
  });

  it("keeps one emission clock across repeated emitter ids and transform updates", () => {
    const stream = new AmbientStream();
    stream.dataBlocks[2] = { ...blocks[2], ejectionPeriodMS: 100 };
    stream.createGhost(0, 1, { emitterDatablockId: 2 });
    const initialData = stream.entityAt(0)!.particleEmitter!;
    let emission = new EmitterInstance(initialData);
    const initialEmission = emission;
    for (let frame = 0; frame < 4; frame++) {
      stream.updateGhost(0, {
        emitterDatablockId: 2,
        transform: {
          elements: [1, 0, 0, frame, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
      });
      const data = stream.entityAt(0)!.particleEmitter!;
      expect(data).toBe(initialData);
      if (data !== emission.data) emission = new EmitterInstance(data);
      emission.emitPeriodic([frame, 0, 0], [frame, 0, 0], 30, [0, 0, 1]);
    }
    expect(emission).toBe(initialEmission);
    expect(emission.particles).toHaveLength(1);
    expect(stream.entityAt(0)!.position).toEqual([3, 0, 0]);
  });

  it("refreshes replaced emitter and particle sources, including late particle datablocks", () => {
    const stream = new AmbientStream();
    const particle = stream.dataBlocks[3];
    delete stream.dataBlocks[3];
    stream.createGhost(0, 1, { emitterDatablockId: 2 });
    expect(stream.entityAt(0)!.particleEmitter).toBeUndefined();
    stream.dataBlocks[3] = particle;
    stream.updateGhost(0, { emitterDatablockId: 2 });
    const initial = stream.entityAt(0)!.particleEmitter;
    expect(initial?.particles.textureName).toBe("energyHaze");
    stream.dataBlocks[2] = { ...blocks[2], ejectionVelocity: 900 };
    stream.updateGhost(0, { emitterDatablockId: 2 });
    const emitterChanged = stream.entityAt(0)!.particleEmitter;
    expect(emitterChanged).not.toBe(initial);
    expect(emitterChanged?.ejectionVelocity).toBe(9);
    stream.dataBlocks[3] = { ...particle, textures: ["newSmoke"] };
    stream.updateGhost(0, { emitterDatablockId: 2 });
    expect(stream.entityAt(0)!.particleEmitter).not.toBe(emitterChanged);
    expect(stream.entityAt(0)!.particleEmitter?.particles.textureName).toBe(
      "newSmoke",
    );
  });

  it("rebuilds canonical data for restored and new worlds, then keeps it stable", () => {
    const stream = new AmbientStream();
    stream.createGhost(0, 1, { emitterDatablockId: 2 });
    const initial = stream.entityAt(0)!.particleEmitter;
    const saved = [...stream.checkpoint().state.entities.values()][0];
    expect(saved.particleEmitterDataBlockId).toBe(2);
    expect(saved).not.toHaveProperty("particleEmitter");
    stream.roundTripCheckpoint();
    const restored = stream.entityAt(0)!.particleEmitter;
    expect(restored).toEqual(initial);
    expect(restored).not.toBe(initial);
    stream.updateGhost(0, { emitterDatablockId: 2 });
    expect(stream.entityAt(0)!.particleEmitter).toBe(restored);
    stream.clearWorld();
    stream.createGhost(0, 1, { emitterDatablockId: 2 });
    expect(stream.entityAt(0)!.particleEmitter).toEqual(initial);
    expect(stream.entityAt(0)!.particleEmitter).not.toBe(restored);
  });

  it("resolves native emitter references, publishes canonical data, and refreshes sparse updates", () => {
    const stream = new AmbientStream();
    stream.createGhost(0, 1, {
      dataBlockId: 1,
      emitterDatablockId: 2,
      transform: {
        elements: [1, 0, 0, 10, 0, -1, 0, 20, 0, 0, -1, 30, 0, 0, 0, 1],
      },
      scale: { x: 2, y: 3, z: 4 },
    });
    const initial = stream.entityAt(0)!;
    expect(initial).toMatchObject({
      className: "ParticleEmissionDummy",
      position: [10, 20, 30],
      scale: [3, 4, 2],
      timeMultiple: 0.5,
      emissionVelocity: 1,
      particleEmitter: {
        ejectionVelocity: 5,
        ejectionPeriodMS: 2,
        particles: { textureName: "energyHaze", lifetimeMS: 3200 },
      },
    });
    const rendered = streamEntityToGameEntity(initial);
    expect(rendered.renderType).toBe("ParticleEmissionDummy");
    expect(rendered).toMatchObject({
      particleEmitter: initial.particleEmitter,
      position: initial.position,
    });
    stream.updateGhost(0, {});
    expect(stream.entityAt(0)!.particleEmitter).toBe(initial.particleEmitter);
    stream.updateGhost(0, {
      emitterDatablockId: 4,
      velocity: { x: 0, y: 0, z: 7 },
    });
    const changed = stream.entityAt(0)!;
    expect(changed).toMatchObject({
      emissionVelocity: 1,
      timeMultiple: 0.5,
      particleEmitter: {
        ejectionVelocity: 10,
        particles: { textureName: "smoke" },
      },
    });
    expect(updateGameEntityFromStream(rendered, changed)).toBe(false);
    expect(rendered).toMatchObject({
      emissionVelocity: 1,
      particleEmitter: changed.particleEmitter,
    });
    expect(initial.particleEmitter!.particles.textureName).toBe("energyHaze");
    stream.roundTripCheckpoint();
    expect(stream.entityAt(0)).toMatchObject({
      emissionVelocity: changed.emissionVelocity,
      timeMultiple: changed.timeMultiple,
      particleEmitter: changed.particleEmitter,
      position: changed.position,
    });
    stream.updateGhost(0, { emitterDatablockId: 0 });
    expect(stream.entityAt(0)!.particleEmitter).toBeUndefined();
    stream.ghost({ index: 0, type: "delete" });
    expect(stream.entityAt(0)).toBeUndefined();
  });

  it("defaults absent settings and resets them when a ghost slot is reused", () => {
    const stream = new AmbientStream();
    stream.createGhost(0, 1, { emitterDatablockId: 2 });
    const first = stream.entityAt(0)!;
    expect(first.timeMultiple).toBe(1);
    stream.createGhost(0, 1, {});
    expect(stream.entityAt(0)).toMatchObject({
      timeMultiple: 1,
      emissionVelocity: 1,
    });
    expect(stream.entityAt(0)!.id).not.toBe(first.id);
    expect(stream.entityAt(0)!.particleEmitter).toBeUndefined();
  });
});

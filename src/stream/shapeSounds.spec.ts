import { describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { TestLiveStream } from "./streamTestFixtures";

class SoundStream extends TestLiveStream {
  station = this.addEntity({
    id: "station",
    ghostIndex: 0,
    className: "StaticShape",
    type: "StaticShape",
  });

  constructor() {
    super("watch", "StaticShape");
  }

  update(data: ParsedData) {
    this.applyGhostData(this.station, data);
  }

  /**
   * The server reuses the ghost slot: a create starts a new entity.
   */
  recreate() {
    this.createGhost(0, 1, {});
    this.station = this.entities.get(this.entityIdByGhostIndex.get(0)!)!;
  }

  setTick(tick: number) {
    this.tickCount = tick;
  }

  restoreCheckpoint() {
    this.roundTripCheckpoint();
    this.station = this.entities.values().next().value!;
  }
}

describe("ShapeBase sound updates", () => {
  it("preserves the station hum and previous snapshots across sparse activation updates", () => {
    const stream = new SoundStream();
    const hum = { index: 0, playing: true, profileId: 10 };
    const activation = { index: 1, playing: true, profileId: 11 };
    stream.update({ sounds: [hum] });
    const previous = stream.station.soundSlots;
    const initialHum = previous![0];
    stream.setTick(100);
    stream.update({ sounds: [activation] });
    expect(stream.station.soundSlots).toEqual([
      { ...hum, revision: 1, changedAtSec: 0 },
      { ...activation, revision: 1, changedAtSec: 3.2 },
    ]);
    expect(stream.station.soundSlots![0]).toBe(initialHum);
    expect(previous).toEqual([{ ...hum, revision: 1, changedAtSec: 0 }]);

    // Reusing a parser record still represents another wire command.
    stream.setTick(200);
    stream.update({ sounds: [activation] });
    expect(stream.station.soundSlots![0]).toBe(initialHum);
    expect(stream.station.soundSlots![1]).toEqual({
      ...activation,
      revision: 2,
      changedAtSec: 6.4,
    });
    expect(activation).toEqual({ index: 1, playing: true, profileId: 11 });
    const current = stream.station.soundSlots;
    stream.update({ damageLevel: 0.5 });
    expect(stream.station.soundSlots).toBe(current);
  });

  it("stops only the updated slot and clears all slots when a ghost is recreated", () => {
    const stream = new SoundStream();
    const hum = { index: 0, playing: true, profileId: 10 };
    const activation = { index: 1, playing: true, profileId: 11 };
    stream.update({ sounds: [hum, activation] });
    const previousActivation = stream.station.soundSlots![1];
    stream.update({ sounds: [{ index: 0, playing: false }] });
    expect(stream.station.soundSlots).toEqual([
      { index: 0, playing: false, revision: 2, changedAtSec: 0 },
      { ...activation, revision: 1, changedAtSec: 0 },
    ]);
    expect(stream.station.soundSlots![1]).toBe(previousActivation);
    stream.recreate();
    expect(stream.station.soundSlots).toBeUndefined();
  });

  it("preserves sound trigger revisions through serialized checkpoint restore", () => {
    const stream = new SoundStream();
    const activation = { index: 1, playing: true, profileId: 11 };
    stream.update({ sounds: [activation] });
    stream.setTick(100);
    stream.update({ sounds: [activation] });
    const before = stream.station.soundSlots![0];
    stream.restoreCheckpoint();
    expect(stream.station.soundSlots![0]).toEqual(before);
    expect(stream.station.soundSlots![0]).not.toBe(before);
    stream.setTick(200);
    stream.update({ sounds: [activation] });
    expect(stream.station.soundSlots![0]).toEqual({
      ...activation,
      revision: 3,
      changedAtSec: 6.4,
    });
  });
});

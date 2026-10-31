import { describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { TestLiveStream } from "./streamTestFixtures";

class VisibilityStream extends TestLiveStream {
  player = this.addEntity({
    id: "player",
    ghostIndex: 0,
    className: "Player",
    type: "Player",
  });

  constructor() {
    super("watch", "Player");
  }

  update(data: ParsedData) {
    this.applyGhostData(this.player, data);
  }

  ticks(count: number) {
    for (let i = 0; i < count; i++) this.advanceFades();
  }

  /**
   * The server reuses the ghost slot: a create starts a new entity.
   */
  recreate(data: ParsedData) {
    this.createGhost(0, 1, data);
    this.player = this.entities.get(this.entityIdByGhostIndex.get(0)!)!;
  }
}

describe("ShapeBase cloak updates", () => {
  it("animates an initially uncloaked player into and out of station cloak", () => {
    const stream = new VisibilityStream();
    stream.update({ cloaked: false, fading: false, fadeVal: true });
    stream.update({ cloaked: true, fading: false, fadeVal: true });
    stream.ticks(4);
    expect(stream.player.cloakLevel).toBeCloseTo(0.256);
    // Repeated CloakMask data must not restart the transition.
    stream.update({ cloaked: true, fading: false, fadeVal: true });
    stream.ticks(4);
    expect(stream.player.cloakLevel).toBeCloseTo(0.512);
    stream.update({ cloaked: false, fading: false, fadeVal: true });
    stream.ticks(4);
    expect(stream.player.cloakLevel).toBeCloseTo(0.256);
    stream.ticks(4);
    expect(stream.player.cloakLevel).toBe(0);
    expect(stream.player.fadeVal).toBe(1);
  });

  it("honors the MPB station's recorded whole-player fade after cloaking", () => {
    const stream = new VisibilityStream();
    stream.update({ cloaked: false, fading: false, fadeVal: true });
    // Magnum 1509.632 → 1510.432 → 1510.560: Classic hides cloakers
    // after 800 ms, then the MPB station ends its cloak at ~900 ms.
    stream.update({ cloaked: true, fading: false, fadeVal: true });
    stream.ticks(25);
    expect(stream.player.cloakLevel).toBe(1);
    stream.update({ cloaked: true, fading: false, fadeVal: false });
    expect(stream.player.fadeVal).toBe(0);
    stream.ticks(4);
    stream.update({
      cloaked: false,
      fading: true,
      fadeOut: false,
      fadeTime: 0,
    });
    expect(stream.player.fadeVal).toBe(1);
    stream.ticks(16);
    expect(stream.player.cloakLevel).toBe(0);
  });

  it("snaps the first ghost state but resets cloak when a ghost slot is reused", () => {
    const stream = new VisibilityStream();
    stream.update({ cloaked: true });
    expect(stream.player.cloakLevel).toBe(1);
    stream.recreate({ cloaked: false });
    expect(stream.player.cloakLevel).toBe(0);
    stream.update({ cloaked: true });
    stream.ticks(1);
    expect(stream.player.cloakLevel).toBeCloseTo(0.064);
  });
});

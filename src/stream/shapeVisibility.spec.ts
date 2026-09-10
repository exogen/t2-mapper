import { describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { LiveStreamAdapter } from "./liveStreaming";
import type { MutableEntity } from "./StreamEngine";
import type { RelayClient } from "./relayClient";

class VisibilityStream extends LiveStreamAdapter {
  readonly player: MutableEntity = {
    id: "player",
    ghostIndex: 0,
    className: "Player",
    type: "Player",
    spawnTick: 0,
    rotation: [0, 0, 0, 1],
  };

  constructor() {
    super({} as RelayClient, { mode: "watch" });
    this.entities.set(this.player.id, this.player);
  }

  update(data: ParsedData) {
    this.applyGhostData(this.player, data);
  }

  ticks(count: number) {
    for (let i = 0; i < count; i++) this.advanceFades();
  }

  recreate(data: ParsedData) {
    this.resetEntity(this.player);
    this.update(data);
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

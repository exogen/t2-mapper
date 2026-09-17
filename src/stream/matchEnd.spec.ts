import { afterEach, describe, expect, it } from "vitest";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import type { MutableEntity } from "./StreamEngine";
import { STREAM_TICK_SEC } from "./streamHelpers";
import { engineStore, effectDeltaSec } from "../state/engineStore";
import { resetStreamPlayback, streamClock } from "../state/streamPlaybackStore";

class MatchStream extends LiveStreamAdapter {
  constructor() {
    super({} as RelayClient);
    this.entities.set("projectile", {
      id: "projectile",
      ghostIndex: 1,
      className: "LinearProjectile",
      spawnTick: 0,
      type: "Projectile",
      rotation: [0, 0, 0, 1],
      position: [0, 0, 100],
      simulatedVelocity: [10, 0, 0],
      projAgeTicks: 0,
    });
    this.entities.set("explosion", {
      id: "explosion",
      ghostIndex: 2,
      className: "Explosion",
      type: "Explosion",
      spawnTick: 0,
      rotation: [0, 0, 0, 1],
      position: [0, 0, 100],
      isExplosion: true,
      expiryTick: 10,
    });
    this.entities.set("shape", {
      id: "shape",
      ghostIndex: 3,
      className: "StaticShape",
      type: "StaticShape",
      spawnTick: 0,
      rotation: [0, 0, 0, 1],
      position: [0, 0, 100],
      fadeVal: 1,
      fadeState: { elapsed: 0, fadeTime: 2, fadeOut: true },
      mountObjectGhostIndex: 1,
    });
    for (const entity of this.entities.values())
      this.entityIdByGhostIndex.set(entity.ghostIndex, entity.id);
  }
  override getDataBlockData() {
    return undefined;
  }
  command(funcName: string, ...args: string[]) {
    this.processEvent(
      {
        classId: 0,
        parsedData: { type: "RemoteCommandEvent", funcName, args },
      },
      undefined,
    );
  }
  message(...args: string[]) {
    this.command("ServerMessage", ...args);
  }
  tick(count = 1) {
    return this.stepToTime(this.getTimeSec() + count * STREAM_TICK_SEC + 1e-8);
  }
  mutable(id: string): MutableEntity {
    return this.entities.get(id)!;
  }
  remove(id: string) {
    this.entities.delete(id);
  }
  checkpoint() {
    return this.captureSimulationState();
  }
  restore(checkpoint: ReturnType<MatchStream["checkpoint"]>) {
    this.restoreSimulationState(checkpoint);
  }
}

describe("match-end world pause", () => {
  afterEach(() => {
    resetStreamPlayback();
    engineStore.getState().setPlaybackStatus("stopped");
    engineStore.getState().setPlaybackRate(1);
  });

  it.each(["MissionEnd", "MsgClearDebrief", "MsgDebriefResult"])(
    "%s freezes physics and expiry while the stream and HUD continue",
    (signal) => {
      const stream = new MatchStream();
      stream.message("MsgSystemClock", "", "20", "1200000");
      const before = stream.tick(4);
      expect(before.entities[0].position?.[0]).toBeCloseTo(1.28);
      expect(
        before.entities.find((e) => e.id === "shape")?.fadeVal,
      ).toBeLessThan(1);
      if (signal === "MissionEnd") stream.command(signal, "1");
      else stream.message(signal, "");
      const stopped = stream.tick(100);
      expect(stopped.timeSec).toBeGreaterThan(before.timeSec);
      expect(stopped.matchEndedAtSec).toBe(before.timeSec);
      expect(stopped.matchClockMs).toBe(before.matchClockMs);
      expect(stopped.entities).toEqual(before.entities);
      expect(stream.mutable("projectile").projAgeTicks).toBe(4);
      expect(stream.mutable("explosion")).toBeDefined();

      // The rest of the debrief must neither move the boundary nor stop HUD input.
      stream.message("MsgDebriefResult", "");
      stream.message("MsgTeamScoreIs", "", "Storm", "3", "1");
      const later = stream.tick(20);
      expect(later.matchEndedAtSec).toBe(before.timeSec);
      expect(later.matchClockMs).toBe(before.matchClockMs);
      expect(later.serverEvents.at(-1)?.args[0]).toBe("MsgTeamScoreIs");
      expect(later.entities).toBe(stopped.entities);
    },
  );

  it("preserves the final world across late updates and checkpoint restoration", () => {
    const stream = new MatchStream();
    const beforeEnd = stream.checkpoint();
    stream.tick(4);
    stream.command("MissionEnd", "1");
    const stopped = stream.tick();
    stream.mutable("projectile").position![0] = 999;
    stream.remove("explosion");
    const checkpoint = stream.checkpoint();
    expect(stream.tick(20).entities).toEqual(stopped.entities);

    stream.restore(checkpoint);
    const restored = stream.tick();
    expect(restored.matchEndedAtSec).toBe(stopped.matchEndedAtSec);
    expect(restored.entities.map((e) => e.position)).toEqual(
      stopped.entities.map((e) => e.position),
    );
    expect(restored.entities[0].id).not.toBe(stopped.entities[0].id);
    expect(
      restored.entities.find((e) => e.ghostIndex === 3)?.mountObjectId,
    ).toBe(restored.entities[0].id);
    expect(restored.entities).toHaveLength(3);

    stream.restore(beforeEnd);
    const rewound = stream.tick();
    expect(rewound.matchEnded).toBe(false);
    expect(rewound.matchEndedAtSec).toBeNull();
    expect(rewound.entities[0].position?.[0]).toBeCloseTo(0.32);
  });

  it.each(["before", "after"])(
    "resumes with a clock update %s ClientReady",
    (order) => {
      const stream = new MatchStream();
      stream.message("MsgSystemClock", "", "0", "0");
      stream.tick(4);
      stream.command("MissionEnd", "1");
      stream.tick(100);
      if (order === "before") {
        stream.message("MsgSystemClock", "", "10", "600000");
        stream.tick(20);
      }
      stream.message("MsgClientReady", "", "CTFGame");
      if (order === "after")
        stream.message("MsgSystemClock", "", "10", "600000");
      const resumed = stream.tick();
      expect(resumed.matchEnded).toBe(false);
      expect(resumed.matchEndedAtSec).toBeNull();
      expect(resumed.matchClockMs).toBeCloseTo(-599968);
      expect(resumed.entities[0].position?.[0]).toBeCloseTo(1.6);
    },
  );

  it("keeps transport time moving while effect deltas and world time are frozen", () => {
    engineStore.getState().setPlaybackStatus("playing");
    engineStore.getState().setPlaybackRate(8);
    streamClock.time = 5;
    expect(effectDeltaSec(0.01)).toBe(0.08);
    streamClock.matchEndedAtSec = 5;
    streamClock.time = 20;
    expect(streamClock.worldTime).toBe(5);
    expect(effectDeltaSec(0.01)).toBe(0);
    streamClock.matchEndedAtSec = null;
    expect(streamClock.worldTime).toBe(20);
    expect(effectDeltaSec(0.01)).toBe(0.08);
  });
});

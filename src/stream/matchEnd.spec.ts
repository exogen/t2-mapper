import { afterEach, describe, expect, it } from "vitest";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import type { MutableEntity } from "./StreamEngine";
import { STREAM_TICK_SEC } from "./streamHelpers";
import { engineStore, effectDeltaSec } from "../state/engineStore";
import { resetStreamPlayback, streamClock } from "../state/streamPlaybackStore";
import { DirectorTrackers } from "../director/directorTrackers";
import { groupScoreboard } from "../components/useScoreboard";
import { matchClockAt } from "../components/useMatchClock";

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

  it("MissionEnd freezes physics and expiry while the stream and HUD continue", () => {
    const stream = new MatchStream();
    stream.message("MsgSystemClock", "", "20", "1200000");
    const before = stream.tick(4);
    expect(before.entities[0].position?.[0]).toBeCloseTo(1.28);
    expect(before.entities.find((e) => e.id === "shape")?.fadeVal).toBeLessThan(
      1,
    );
    stream.command("MissionEnd", "1");
    const stopped = stream.tick(100);
    expect(stopped.timeSec).toBeGreaterThan(before.timeSec);
    expect(stopped.matchEndedAtSec).toBe(before.timeSec);
    expect(stopped.matchClockMs).toBe(before.matchClockMs);
    expect(stopped.entities).toEqual(before.entities);
    expect(stream.mutable("projectile").projAgeTicks).toBe(4);
    expect(stream.mutable("explosion")).toBeDefined();

    // The rest of the debrief must neither move the boundary nor stop HUD input.
    stream.message("MsgDebriefResult", "");
    stream.message("MsgTeamScoreIs", "", "1", "3");
    const later = stream.tick(20);
    expect(later.matchEndedAtSec).toBe(before.timeSec);
    expect(later.matchClockMs).toBe(before.matchClockMs);
    expect(later.serverEvents.at(-1)?.args[0]).toBe("MsgTeamScoreIs");
    expect(later.entities).toBe(stopped.entities);
  });

  it("keeps simulating when Classic sends its welcome credits through the debrief UI", () => {
    const stream = new MatchStream();
    stream.message("MsgClientReady", "", "CTFGame");
    // Late joiners already have matchStarted set, so that flag cannot
    // distinguish the welcome burst from an actual game-over notification.
    stream.message("MsgCTFAddTeam", "", "1", "Storm", "<At Base>", "0");
    stream.message("MsgTeamScoreIs", "", "1", "3");
    stream.message("MsgSystemClock", "", "30", "1180000");
    const before = stream.tick(4);
    expect(before.matchStarted).toBe(true);
    stream.message("MsgGameOver");
    stream.message("MsgClearDebrief");
    for (const line of [
      "<font:Sui Generis:22><Just:CENTER><color:29DEE7>CLASSIC",
      "<font:Sui Generis:12>",
      "<font:verdana bold:16><color:33CCCC>Version: <color:29DEE7>1.5.3",
      "<font:verdana bold:16><color:33CCCC>Developers: <color:29DEE7>z0dd <color:33CCCC>and <color:29DEE7>ZOD",
    ]) {
      stream.message("MsgDebriefResult", "", line);
    }
    const after = stream.tick(100);
    expect(after.matchEnded).toBe(false);
    expect(after.matchEndedAtSec).toBeNull();
    expect(after.entities[0].position?.[0]).toBeCloseTo(33.28);
    expect(after.matchClockMs).toBeCloseTo(-1176672);
    expect(stream.mutable("explosion")).toBeUndefined();
    expect(after.serverEvents.at(-1)?.msgType).toBe("MsgDebriefResult");

    stream.restore(stream.checkpoint());
    expect(stream.tick().matchEnded).toBe(false);
    stream.command("MissionEnd", "1");
    expect(stream.tick().matchEnded).toBe(true);
  });

  it("keeps director facts, scoreboard updates, and the HUD clock consistent across welcome and game over", () => {
    const stream = new MatchStream();
    const trackers = new DirectorTrackers({
      factStreamId: "match",
      stateStreamId: "match",
    });
    stream.message("MsgClientReady", "", "CTFGame");
    stream.message("MsgSystemClock", "", "10", "600000");
    stream.message("MsgMissionStart", "Match started!");
    stream.message(
      "MsgClientJoin",
      "",
      "Runner",
      "7",
      "32",
      "0",
      "0",
      "0",
      "0",
      "",
    );
    stream.message("MsgClientJoinTeam", "", "Runner", "Storm", "7", "1");
    stream.message("MsgCTFAddTeam", "", "1", "Storm", "<At Base>", "0");
    stream.message("MsgTeamScoreIs", "", "1", "1");
    const before = stream.tick(32);
    trackers.step(before, before.timeSec);
    stream.message("MsgGameOver");
    stream.message("MsgClearDebrief");
    stream.message("MsgDebriefResult", "", "CLASSIC");
    const welcome = stream.tick(32);
    trackers.step(welcome, welcome.timeSec);
    stream.message(
      "MsgCTFFlagCapped",
      "Runner captured the flag.",
      "Runner",
      "Inferno",
    );
    const active = stream.tick(32);
    trackers.step(active, active.timeSec);
    expect(matchClockAt(active, active.timeSec + 0.5)).toBeCloseTo(
      active.matchClockMs! + 500,
    );
    expect(trackers.drainStates().at(-1)?.match.ended).toBe(false);
    expect(
      trackers
        .drainFacts()
        .filter((fact) => fact.kind === "event")
        .map((fact) => fact.value),
    ).toEqual([
      expect.objectContaining({ type: "match-start" }),
      expect.objectContaining({ type: "flag-cap" }),
    ]);

    stream.command("MissionEnd", "1");
    stream.message(
      "MsgGameOver",
      "Match has ended.~wvoice/announcer/ann.gameover.wav",
    );
    stream.message("MsgPlayerScore", "", "7", "17", "31", "1");
    stream.message("MsgTeamScoreIs", "", "1", "3");
    const ended = stream.tick(32);
    trackers.step(ended, ended.timeSec);
    const debrief = stream.tick(32);
    trackers.step(debrief, debrief.timeSec);
    expect(debrief.entities).toEqual(active.entities);
    expect(debrief.matchClockMs).toBe(active.matchClockMs);
    expect(matchClockAt(debrief, debrief.timeSec + 10)).toBe(
      active.matchClockMs,
    );
    expect(
      groupScoreboard(debrief.playerRoster, debrief.teamScores).teamPlayers.get(
        1,
      )?.[0].score,
    ).toBe(17);
    expect(debrief.teamScores[0].score).toBe(3);
    expect(
      debrief.chatMessages.some(
        (message) => message.soundPath === "voice/announcer/ann.gameover.wav",
      ),
    ).toBe(true);
    expect(trackers.drainStates().at(-1)?.match.ended).toBe(true);
    const facts = trackers.drainFacts().filter((fact) => fact.kind === "event");
    expect(facts).toHaveLength(1);
    expect(facts[0].value).toMatchObject({ type: "match-end" });
  });

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

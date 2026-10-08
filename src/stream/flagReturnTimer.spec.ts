import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveParser,
  GhostStateAccumulator,
  type PacketData,
} from "t2-demo-parser";
import { WatchStateAccumulator } from "../../relay/watchState";
import { buildCatchupPayload } from "../../relay/watchCatchup";
import {
  deserializeCatchupPayload,
  serializeCatchupPayload,
} from "../../relay/watchSerialize";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import { decodeCheckpoint, encodeCheckpoint } from "./checkpointCodec";
import {
  flagReturnDelaySec,
  flagReturnSecondsRemaining,
} from "./flagReturnTimer";

class FlagStream extends LiveStreamAdapter {
  now = 0;
  constructor() {
    super({} as RelayClient, { mode: "watch" });
  }
  protected override getTimeSec() {
    return this.now;
  }
  message(...args: string[]) {
    this.handleServerMessage(args);
  }
  snapshot() {
    // Bypass the per-tick cache after directly injecting messages/restores.
    return this["buildSnapshot"]();
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
  checkpoint() {
    return this.captureSimulationState();
  }
  restore(state: ReturnType<FlagStream["checkpoint"]>) {
    this.restoreSimulationState(state);
  }
}

function packet(...messages: string[][]): PacketData {
  return {
    gameState: {},
    ghosts: [],
    events: messages.map((args) => ({
      parsedData: {
        type: "RemoteCommandEvent",
        funcName: "ServerMessage",
        args,
      },
    })),
  } as unknown as PacketData;
}

describe("flag return timers", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["CTFGame", null, 45],
    ["LCTFGame", null, 25],
    ["LakRabbitGame", null, 25],
    [null, "Capture the Flag", 45],
    ["CTFGame", "LCTF", 25],
    [null, "LAKRABBIT", 25],
    ["CTFGame", "Custom CTF", 45],
    ["HuntersGame", null, null],
    ["RabbitGame", "Rabbit", null],
    [null, null, null],
  ])(
    "uses the configured delay for %s / %s",
    (gameClass, displayName, delay) => {
      expect(flagReturnDelaySec(gameClass, displayName)).toBe(delay);
    },
  );

  it("starts at the observed drop, preserves snapshots and ignores duplicate notifications", () => {
    const stream = new FlagStream();
    stream.message("MsgClientReady", "", "CTFGame");
    stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
    const dropped = stream.snapshot();
    expect(dropped.flagDroppedAtSec).toEqual({ 1: 0 });
    expect(flagReturnSecondsRemaining(dropped, 1, 0)).toBe(45);
    expect(flagReturnSecondsRemaining(dropped, 1, 1)).toBe(44);
    expect(flagReturnSecondsRemaining(dropped, 1, 1.5)).toBe(44);
    expect(flagReturnSecondsRemaining(dropped, 1, 100)).toBe(0);

    stream.now = 12;
    stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
    expect(stream.snapshot().flagDroppedAtSec).toBe(dropped.flagDroppedAtSec);
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, stream.now)).toBe(
      33,
    );
    stream.message("MsgCTFFlagDropped", "", "Bob", "Inferno", "2");
    expect(stream.snapshot().flagDroppedAtSec).toEqual({ 1: 0, 2: 12 });
    expect(dropped.flagDroppedAtSec).toEqual({ 1: 0 });
  });

  it.each([
    {
      reason: "interpolation ahead of the playhead",
      drop: 10,
      snapshot: 10.032,
      time: 9.999,
      expected: 45,
    },
    {
      reason: "clock reset on disconnect",
      drop: 10,
      snapshot: 25,
      time: 0,
      expected: 30,
    },
    {
      reason: "fractional drop at a whole-second boundary",
      drop: 2.304,
      snapshot: 16.304,
      time: 16.304,
      expected: 31,
    },
  ])(
    "does not add countdown seconds from $reason",
    ({ drop, snapshot, time, expected }) => {
      const stream = new FlagStream();
      stream.message("MsgClientReady", "", "CTFGame");
      stream.now = drop;
      stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
      stream.now = snapshot;
      expect(flagReturnSecondsRemaining(stream.snapshot(), 1, time)).toBe(
        expected,
      );
    },
  );

  it.each(["MsgCTFFlagTaken", "MsgCTFFlagReturned", "MsgCTFFlagCapped"])(
    "%s clears only the affected flag and a new drop starts fresh",
    (event) => {
      const stream = new FlagStream();
      stream.message("MsgClientReady", "", "LCTFGame");
      stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
      stream.message("MsgCTFFlagDropped", "", "Bob", "Inferno", "2");
      stream.message(event, "", "Alice", "Storm", "1");
      expect(stream.snapshot().flagDroppedAtSec).toEqual({ 2: 0 });
      expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 0)).toBeNull();
      stream.now = 10;
      stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
      expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 10)).toBe(25);
    },
  );

  it("does not invent a drop time from initial status and preserves known ages on status refresh", () => {
    const stream = new FlagStream();
    stream.message("MsgClientReady", "", "CTFGame");
    const status = (text: string) =>
      stream.message("MsgCTFAddTeam", "", "1", "Storm", text, "0");
    status("<In the Field>");
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 0)).toBeNull();
    stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
    stream.now = 10;
    status("<In the Field>");
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 10)).toBe(35);
    status("Alice");
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 10)).toBeNull();
  });

  it("supports LakRabbit without team scores, including the actor-less personal drop message", () => {
    const stream = new FlagStream();
    stream.message("MsgClientReady", "", "LakRabbitGame");
    stream.message("MsgRabbitFlagStatus", "", "<In the Field>");
    expect(flagReturnSecondsRemaining(stream.snapshot(), null, 0)).toBeNull();
    for (const event of ["MsgRabbitFlagTaken", "MsgRabbitFlagReturned"]) {
      stream.message("MsgRabbitFlagDropped", "You dropped the flag!");
      stream.message("MsgRabbitFlagStatus", "", "<In the Field>");
      expect(stream.snapshot().teamScores).toEqual([]);
      expect(flagReturnSecondsRemaining(stream.snapshot(), null, 5)).toBe(20);
      stream.message(event, "", "Alice");
      expect(flagReturnSecondsRemaining(stream.snapshot(), null, 5)).toBeNull();
    }
    stream.message("MsgRabbitFlagDropped", "");
    stream.message("MsgRabbitFlagStatus", "", "<At Home>");
    expect(stream.snapshot().flagDroppedAtSec).toEqual({});
  });

  it("holds at match end and clears on mission changes and full resets", () => {
    const stream = new FlagStream();
    stream.message("MsgClientReady", "", "CTFGame");
    stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
    stream.now = 10;
    stream.command("MissionEnd", "1");
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 100)).toBe(35);
    stream.message("MsgClientReady", "", "CTFGame");
    expect(stream.snapshot().flagDroppedAtSec).toEqual({});
    stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
    stream.reset();
    expect(stream.snapshot().flagDroppedAtSec).toEqual({});
  });

  it("restores drop times from serialized checkpoints without retaining later flag changes", () => {
    const stream = new FlagStream();
    stream.message("MsgClientReady", "", "CTFGame");
    const beforeDrop = stream.checkpoint();
    stream.now = 10;
    stream.message("MsgCTFFlagDropped", "", "Alice", "Storm", "1");
    const checkpoint = decodeCheckpoint(
      encodeCheckpoint(stream.checkpoint()),
    ) as ReturnType<FlagStream["checkpoint"]>;
    stream.message("MsgCTFFlagReturned", "", "0", "Storm", "1");
    stream.restore(checkpoint);
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 20)).toBe(35);
    stream.restore(beforeDrop);
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 0)).toBeNull();
  });

  it("rebases relay drop ages onto a new viewer's playback clock and freezes them at match end", () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const watchState = new WatchStateAccumulator();
    watchState.applyPacket(
      packet(
        ["MsgClientReady", "", "CTFGame"],
        ["MsgCTFFlagDropped", "", "Alice", "Storm", "1"],
      ),
    );
    now += 12_000;
    expect(watchState.getHudState().flagDropElapsedSec).toEqual({ 1: 12 });
    const payload = buildCatchupPayload({
      watchState,
      packetParser: createLiveParser().packetParser,
      ghostState: new GhostStateAccumulator(),
      epoch: 1,
      serverAddress: "test:28000",
    });
    const stream = new FlagStream();
    stream.hydrate(deserializeCatchupPayload(serializeCatchupPayload(payload)));
    expect(stream.snapshot().flagDroppedAtSec).toEqual({ 1: -12 });
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 0)).toBe(33);
    expect(flagReturnSecondsRemaining(stream.snapshot(), 1, 5)).toBe(28);

    watchState.applyPacket({
      gameState: {},
      events: [
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "MissionEnd",
            args: ["1"],
          },
        },
      ],
    } as unknown as PacketData);
    now += 90_000;
    expect(watchState.getHudState().flagDropElapsedSec).toEqual({ 1: 12 });
    watchState.beginMissionChange();
    expect(watchState.getHudState().flagDropElapsedSec).toEqual({});
  });
});

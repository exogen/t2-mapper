import fs from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { setImmediate } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  createLiveParser,
  DemoParser,
  freshConnectionProtocolState,
  type Move,
} from "t2-demo-parser";
import { DemoReplaySource } from "./demoReplaySource.js";
import {
  buildDemoValues,
  buildHeader,
  buildInfoBlock,
  buildInitialBlock,
  ZERO_MOVE,
  type DemoStartState,
} from "./demoWriter.js";
import {
  cameraGhost,
  command,
  CONNECT_SEQUENCE,
  netString,
  serverMessagePacket,
  serverPacket,
  type ServerEvent,
} from "./serverPacketFixtures.js";
import { WatchStateAccumulator } from "./watchState.js";

function block(type: number, data: Uint8Array = new Uint8Array()): Uint8Array {
  const header = Buffer.alloc(2);
  header.writeUInt16LE((type << 12) | data.length);
  return Buffer.concat([header, data]);
}

function demo(
  blocks: Uint8Array[],
  values?: string[],
  start?: DemoStartState,
): Uint8Array {
  const initial = buildInitialBlock({
    connectSequence: CONNECT_SEQUENCE,
    missionName: "Katabatic",
    start,
    demoValues:
      values ??
      buildDemoValues({
        recorderName: "Observer",
        serverName: "Replay test",
        serverAddress: "example:28000",
        date: new Date("2026-01-01T00:00:00Z"),
        missionDisplayName: "Katabatic",
        mod: "classic",
        gameType: "Capture the Flag",
        gravity: -12,
        script: {
          voting: false,
          players: [["Alice", "42", "7", "32", "1", "5", "20", "0"]],
          clockMinutes: 2,
          chat: [],
        },
      }),
  });
  return Buffer.concat([
    buildHeader(initial.length),
    initial,
    deflateRawSync(Buffer.concat(blocks)),
  ]);
}

function payload(source: DemoReplaySource) {
  return source.catchup("session", 1, "paused");
}

const endGhosting = (seq: number): ServerEvent => ({
  seq,
  className: "GhostingMessageEvent",
  write(bs) {
    bs.writeU32(1);
    bs.writeInt(2, 3);
    bs.writeInt(0, 11);
  },
});

describe("DemoReplaySource", () => {
  it("cancels scene preparation between slices and restores the original source position", async () => {
    const source = await DemoReplaySource.load(
      demo(Array.from({ length: 30 }, () => block(BlockTypeMove, ZERO_MOVE))),
    );
    const original = payload(source);
    const abort = new AbortController();
    const cancellation = setImmediate().then(() =>
      abort.abort(new Error("Upload canceled")),
    );
    let time = 0;
    const clock = vi
      .spyOn(performance, "now")
      .mockImplementation(() => (time += 9));
    try {
      await expect(source.prepareScene(abort.signal)).rejects.toThrow(
        "Upload canceled",
      );
    } finally {
      clock.mockRestore();
    }
    await cancellation;
    expect(payload(source)).toEqual(original);
  });
  it("drops old control poses at mission boundaries and restores them only at earlier seek positions", async () => {
    const source = await DemoReplaySource.load(
      demo([
        block(BlockTypePacket, serverPacket(1, { events: [cameraGhost(0)] })),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypePacket, serverPacket(2, { camera: { pitch: 0.25 } })),
        block(BlockTypeMove, ZERO_MOVE),
        block(
          BlockTypePacket,
          serverPacket(3, {
            events: [
              netString(1, 1, "MissionStartPhase1"),
              command(2, 1, "2", "Riverdance"),
            ],
          }),
        ),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypePacket, serverPacket(4, { camera: { pitch: 0.75 } })),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypePacket, serverPacket(5, { events: [endGhosting(3)] })),
        block(BlockTypeMove, ZERO_MOVE),
      ]),
    );
    await source.seek(2);
    expect(payload(source)).toMatchObject({
      controlObjectGhostIndex: 0,
      controlObjectData: { rotX: 0.25 },
    });
    await source.seek(3);
    expect(payload(source)).toMatchObject({
      missionName: "Riverdance",
      controlObjectGhostIndex: -1,
    });
    expect(payload(source).controlObjectData).toBeUndefined();
    await source.seek(4);
    expect(payload(source)).toMatchObject({
      controlObjectGhostIndex: 0,
      controlObjectData: { rotX: 0.75 },
    });
    await source.seek(5);
    expect(payload(source).initialGhosts).toEqual([]);
    expect(payload(source).controlObjectGhostIndex).toBe(-1);
    expect(payload(source).controlObjectData).toBeUndefined();
    await source.seek(2);
    expect(payload(source)).toMatchObject({
      missionName: "Katabatic",
      controlObjectGhostIndex: 0,
      controlObjectData: { rotX: 0.25 },
    });
  });
  it("refuses compressed expansion beyond its byte budget before replaying blocks", async () => {
    const bytes = demo(
      Array.from({ length: 20_000 }, () => block(BlockTypeMove, ZERO_MOVE)),
    );
    expect(bytes.byteLength).toBeLessThan(128 * 1024);
    await expect(
      DemoReplaySource.load(bytes, { maxDecompressedBytes: 128 * 1024 }),
    ).rejects.toThrow("Replay decompressed data exceeds the 131072-byte limit");
  });

  it("rejects oversized initial blocks before invoking the parser", async () => {
    const load = vi.spyOn(DemoParser.prototype, "load");
    try {
      await expect(
        DemoReplaySource.load(buildHeader(1024 * 1024 + 1)),
      ).rejects.toThrow("Replay initial block exceeds the 1048576-byte limit");
      expect(load).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });

  it("rejects initial move queues larger than the native connection permits", async () => {
    const initial = buildInitialBlock({
      connectSequence: CONNECT_SEQUENCE,
      missionName: "Katabatic",
      demoValues: [],
      start: {
        taggedStrings: new Map(),
        lastMoveAck: 0,
        lastClientMove: 0,
        firstMoveIndex: 0,
        sensorGroup: 0,
        queuedMoves: 47,
        protocol: freshConnectionProtocolState(CONNECT_SEQUENCE),
        nextRecvEventSeq: 0,
      },
    });
    const bytes = Buffer.concat([
      buildHeader(initial.length),
      initial,
      deflateRawSync(new Uint8Array()),
    ]);
    await expect(DemoReplaySource.load(bytes)).rejects.toThrow(
      "Replay initial move queue exceeds the native 46-move limit",
    );
  });

  it("rejects invalid initial parser state instead of creating an empty room", async () => {
    const bytes = demo([]);
    const { header, byteLength } = DemoParser.peekHeader(bytes);
    const initial = bytes.subarray(
      byteLength,
      byteLength + header.initialBlockSize - 100,
    );
    const truncated = Buffer.concat([
      buildHeader(initial.length),
      initial,
      deflateRawSync(new Uint8Array()),
    ]);
    await expect(DemoReplaySource.load(truncated)).rejects.toThrow(
      "Replay initial state is invalid",
    );
  });

  it("checks the expansion budget exactly and keeps loaded buffers seekable", async () => {
    const bytes = demo([
      block(BlockTypeMove, ZERO_MOVE),
      block(BlockTypeMove, ZERO_MOVE),
    ]);
    // The initial block also has a budget, so use a larger exact block stream.
    const ticks = 100;
    const recording = demo(
      Array.from({ length: ticks }, () => block(BlockTypeMove, ZERO_MOVE)),
    );
    const source = await DemoReplaySource.load(recording, {
      maxDecompressedBytes: ticks * 66,
    });
    await source.seek(99);
    await source.seek(0);
    await source.seek(99);
    expect(source.tick).toBe(99);
    await expect(
      DemoReplaySource.load(recording, {
        maxDecompressedBytes: ticks * 66 - 1,
      }),
    ).rejects.toThrow("Replay decompressed data exceeds");
    await expect(
      DemoReplaySource.load(bytes, { maxDecompressedBytes: 1 }),
    ).rejects.toThrow("Replay initial block exceeds");
  });

  it("aborts loading before parsing and between inflation pushes", async () => {
    const bytes = demo(
      Array.from({ length: 20_000 }, () => block(BlockTypeMove, ZERO_MOVE)),
    );
    const before = new AbortController();
    before.abort(new Error("Cancelled before load"));
    await expect(
      DemoReplaySource.load(bytes, { signal: before.signal }),
    ).rejects.toThrow("Cancelled before load");

    const during = new AbortController();
    const cancellation = setImmediate().then(() => {
      during.abort(new Error("Cancelled during inflation"));
    });
    await expect(
      DemoReplaySource.load(bytes, { signal: during.signal }),
    ).rejects.toThrow("Cancelled during inflation");
    await cancellation;
  });

  it("bounds synchronous processing of a burst without Move blocks", async () => {
    const source = await DemoReplaySource.load(
      demo(
        Array.from({ length: 513 }, () =>
          block(BlockTypeInfo, buildInfoBlock()),
        ),
      ),
    );
    expect(() => source.advanceOneTick()).toThrow(
      "Too many demo blocks without a movement tick",
    );
  });

  it("rejects invalid limits and impossible variable HUD section counts", async () => {
    const bytes = demo([]);
    await expect(
      DemoReplaySource.load(bytes, { maxDecompressedBytes: 0 }),
    ).rejects.toThrow(RangeError);
    await expect(
      DemoReplaySource.load(demo([], ["Standard", "999999999999999999999999"])),
    ).rejects.toThrow("Invalid replay initial HUD section count");
  });

  it("keeps native packet order, Move boundaries and packet-only EOF", async () => {
    const first = serverPacket(1);
    const tail = serverPacket(2);
    const source = await DemoReplaySource.load(
      demo([
        block(BlockTypePacket, first),
        block(BlockTypeInfo, buildInfoBlock(false, 87)),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypePacket, tail),
      ]),
    );
    expect(source.durationTicks).toBe(1);
    expect(source.tick).toBe(0);
    const events = source.advanceOneTick();
    expect(events.map((event) => event.kind)).toEqual([
      "packet",
      "info",
      "move",
    ]);
    expect(events[0]).toEqual({ kind: "packet", data: first });
    expect(events[1]).toEqual({ kind: "info", firstPerson: false });
    expect(events[2]).toMatchObject({
      kind: "move",
      tick: 1,
      firstPerson: false,
    });
    expect(payload(source).replay).toMatchObject({
      tick: 1,
      firstPerson: false,
      fov: 87,
    });
    expect(source.complete).toBe(false);
    expect(source.advanceOneTick()).toEqual([{ kind: "packet", data: tail }]);
    expect(source.complete).toBe(true);
    expect(source.advanceOneTick()).toEqual([]);

    // Seeking to tick 1 restores the Move boundary before packet-only EOF.
    await source.seek(1);
    expect(source.complete).toBe(false);
    expect(source.advanceOneTick()).toEqual([{ kind: "packet", data: tail }]);
  });

  it("retains each move's recorded view mode when later Info blocks change it", async () => {
    const source = await DemoReplaySource.load(
      demo([
        block(BlockTypeInfo, buildInfoBlock(false)),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypeInfo, buildInfoBlock(true)),
        block(BlockTypeMove, ZERO_MOVE),
      ]),
    );
    const first = source.advanceOneTick();
    const second = source.advanceOneTick();
    expect(first).toEqual([
      { kind: "info", firstPerson: false },
      expect.objectContaining({ kind: "move", tick: 1, firstPerson: false }),
    ]);
    expect(second).toEqual([
      { kind: "info", firstPerson: true },
      expect.objectContaining({ kind: "move", tick: 2, firstPerson: true }),
    ]);
    expect(
      payload(source).replay!.pendingMoves.map(
        ({ firstPerson }) => firstPerson,
      ),
    ).toEqual([false, true]);
  });

  it("normalizes unacknowledged input modes at positional corrections, preserving Info-before-packet order", async () => {
    const correction = serverPacket(2, { camera: true, lastMoveAck: 0 });
    const source = await DemoReplaySource.load(
      demo([
        block(BlockTypePacket, serverPacket(1, { events: [cameraGhost(0)] })),
        block(BlockTypeInfo, buildInfoBlock(false)),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypeInfo, buildInfoBlock(true)),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypeInfo, buildInfoBlock(false)),
        block(BlockTypePacket, correction),
        block(BlockTypeMove, ZERO_MOVE),
      ]),
    );
    source.advanceOneTick();
    source.advanceOneTick();
    expect(
      payload(source).replay!.pendingMoves.map(
        ({ firstPerson }) => firstPerson,
      ),
    ).toEqual([false, true]);
    expect(source.advanceOneTick()).toEqual([
      { kind: "info", firstPerson: false },
      { kind: "packet", data: correction },
      expect.objectContaining({ kind: "move", tick: 3, firstPerson: false }),
    ]);
    expect(
      payload(source).replay!.pendingMoves.map(
        ({ firstPerson }) => firstPerson,
      ),
    ).toEqual([false, false, false]);
    await source.seek(2);
    expect(
      payload(source).replay!.pendingMoves.map(
        ({ firstPerson }) => firstPerson,
      ),
    ).toEqual([false, true]);
  });

  it.each([0, 2])(
    "distinguishes predicted header input from packet-pose input (initial last client move %s)",
    async (lastClientMove) => {
      const source = await DemoReplaySource.load(
        demo(
          [
            block(
              BlockTypePacket,
              serverPacket(1, { events: [cameraGhost(0)] }),
            ),
            block(BlockTypeMove, ZERO_MOVE),
            block(
              BlockTypePacket,
              serverPacket(2, { camera: true, lastMoveAck: 1 }),
            ),
            block(BlockTypeMove, ZERO_MOVE),
          ],
          undefined,
          {
            taggedStrings: new Map(),
            lastMoveAck: 0,
            lastClientMove,
            firstMoveIndex: 0,
            sensorGroup: 0,
            queuedMoves: 2,
            protocol: freshConnectionProtocolState(CONNECT_SEQUENCE),
            nextRecvEventSeq: 0,
          },
        ),
      );
      expect(payload(source).replay).toMatchObject({
        controlMoveReplayStartId: 2,
        pendingMoves: [{ id: 0 }, { id: 1 }],
      });
      source.advanceOneTick();
      expect(payload(source).replay!.controlMoveReplayStartId).toBe(
        lastClientMove,
      );
      source.advanceOneTick();
      expect(payload(source).replay!.controlMoveReplayStartId).toBe(1);
      await source.seek(0);
      expect(payload(source).replay!.controlMoveReplayStartId).toBe(2);
      await source.seek(1);
      expect(payload(source).replay!.controlMoveReplayStartId).toBe(
        lastClientMove,
      );
    },
  );

  it("seeds initial roster/gravity/clock and uses replay time instead of wall time", async () => {
    const source = await DemoReplaySource.load(
      demo(Array.from({ length: 3 }, () => block(BlockTypeMove, ZERO_MOVE))),
    );
    expect(source.recorderName).toBe("Observer");
    expect(source.recordingDate).toBe("Jan-1-2026 12:00AM");
    expect(payload(source)).toMatchObject({
      serverAddress: "replay:session",
      worldGravity: -12,
      hudState: {
        playerRoster: [{ clientId: 7, name: "Alice", teamId: 1, score: 5 }],
        clock: { durationMs: 120_000, elapsedMs: 0 },
      },
    });
    source.advanceOneTick();
    const paused = payload(source);
    await setImmediate();
    expect(payload(source).hudState.clock).toEqual(paused.hudState.clock);
    expect(paused.hudState.clock?.elapsedMs).toBe(32);
    await source.seek(3);
    expect(payload(source).hudState.clock?.elapsedMs).toBe(96);
    await source.seek(1);
    expect(payload(source).hudState.clock?.elapsedMs).toBe(32);
    expect(source.recorderName).toBe("Observer");
    expect(source.recordingDate).toBe("Jan-1-2026 12:00AM");
  });

  it("retains live clock/flag events at their original logical times across seeks", async () => {
    const clock = serverPacket(1, {
      events: [
        netString(0, 1, "ServerMessage"),
        command(1, 1, "MsgSystemClock", "", "20", "60000"),
        command(2, 1, "MsgCTFFlagDropped", "", "Alice", "Storm", "1"),
      ],
    });
    const source = await DemoReplaySource.load(
      demo([
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypePacket, clock),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypeMove, ZERO_MOVE),
      ]),
    );
    await source.seek(3);
    const atThree = payload(source);
    expect(atThree.hudState.clock).toEqual({
      durationMs: 60_000,
      elapsedMs: 64,
    });
    expect(atThree.hudState.flagDropElapsedSec?.[1]).toBeCloseTo(0.064);
    await source.seek(0);
    await source.seek(3);
    expect(payload(source)).toEqual(atThree);
  });

  it("exports passive ACK state while the native source processes SendPacket markers", async () => {
    const source = await DemoReplaySource.load(
      demo([
        block(BlockTypeSendPacket),
        block(BlockTypePacket, serverPacket(1, { ack: 1 })),
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypeSendPacket),
        block(BlockTypePacket, serverPacket(2, { ack: 2 })),
        block(BlockTypeMove, ZERO_MOVE),
      ]),
    );
    source.advanceOneTick();
    const seed = payload(source);
    const passive = createLiveParser({
      connectionProtocolState: seed.connectionState,
      nextRecvEventSeq: seed.nextRecvEventSeq,
      compressionPoint: seed.compressionPoint,
    }).packetParser;
    const events = source.advanceOneTick();
    const packet = events.find((event) => event.kind === "packet")!;
    if (packet.kind !== "packet") throw new Error("Expected a packet");
    passive.parsePacket(packet.data);
    expect(passive.protocolRejected).toBe(0);
    expect(passive.getConnectionProtocolState().lastSeqRecvd).toBe(2);
  });

  it("rejects malformed blocks and invalid seek ticks", async () => {
    const source = await DemoReplaySource.load(demo([block(BlockTypeMove)]));
    expect(() => source.advanceOneTick()).toThrow(
      "Invalid demo movement block",
    );
    await expect(source.seek(-1)).rejects.toThrow(RangeError);
    await expect(source.seek(0.5)).rejects.toThrow(RangeError);
    await expect(source.seek(10)).rejects.toThrow(RangeError);
  });

  it("bounds unusable recorded move queues instead of accumulating indefinitely", async () => {
    const source = await DemoReplaySource.load(
      demo(Array.from({ length: 100 }, () => block(BlockTypeMove, ZERO_MOVE))),
    );
    await source.seek(100);
    expect(payload(source).replay).toMatchObject({
      controlMovesAvailable: false,
      pendingMoves: [],
    });
  });

  it("keeps retained checkpoint data independent and rolls back cancelled reconstruction", async () => {
    const source = await DemoReplaySource.load(
      demo(
        Array.from({ length: 30_000 }, () => block(BlockTypeMove, ZERO_MOVE)),
      ),
    );
    await source.seek(2_100);
    const expected = payload(source);
    await source.seek(2_500);
    await source.seek(2_100);
    expect(payload(source)).toEqual(expected);

    const controller = new AbortController();
    const cancellation = setImmediate().then(() => {
      controller.abort(new Error("Superseded seek"));
    });
    const seeking = source.seek(30_000, controller.signal);
    await expect(seeking).rejects.toThrow("Superseded seek");
    await cancellation;
    expect(source.tick).toBe(2_100);
    expect(payload(source)).toEqual(expected);
  });

  it("finishes an aborted seek's rollback before a replacement seek reconstructs", async () => {
    const source = await DemoReplaySource.load(
      demo(
        Array.from({ length: 5_000 }, () => block(BlockTypeMove, ZERO_MOVE)),
      ),
    );
    const controller = new AbortController();
    const first = source.seek(5_000, controller.signal);
    const rejected = expect(first).rejects.toThrow("Replaced");
    await setImmediate();
    controller.abort(new Error("Replaced"));
    const replacement = source.seek(1_234);
    await rejected;
    await replacement;
    expect(source.tick).toBe(1_234);
    expect(payload(source).hudState.clock?.elapsedMs).toBe(1_234 * 32);
  });

  it("does not mistake a lone observer camera for a renderable scene", async () => {
    const source = await DemoReplaySource.load(
      demo([
        block(BlockTypeMove, ZERO_MOVE),
        block(BlockTypePacket, serverPacket(1, { events: [cameraGhost(0)] })),
        block(BlockTypeMove, ZERO_MOVE),
      ]),
    );
    await source.prepareScene();
    expect(source.tick).toBe(0);
    expect(source.complete).toBe(false);
  });

  it("restores real player recording state after seeking across a checkpoint", async (context) => {
    const file = path.resolve(
      import.meta.dirname,
      "../../t2-demo-parser/data/uploads_6_SterIO_2025_LT_Pub_SH.rec",
    );
    if (!fs.existsSync(file)) context.skip();
    const source = await DemoReplaySource.load(fs.readFileSync(file));
    await source.seek(2_100);
    const expected = payload(source);
    expect(expected.initialGhosts.length).toBeGreaterThan(0);
    expect(expected.hudState.playerRoster.length).toBeGreaterThan(0);
    await source.seek(2_300);
    await source.seek(2_100);
    expect(payload(source)).toEqual(expected);
    // A consumer must not mutate either the source move cursor or checkpoint.
    expected.replay!.pendingMoves.push({
      id: -1,
      move: {} as Move,
      firstPerson: true,
    });
    expect(payload(source).replay!.pendingMoves.some(({ id }) => id < 0)).toBe(
      false,
    );
  });

  it("keeps a real recording at its start when geometry/control state is already present", async (context) => {
    const file = path.resolve(
      import.meta.dirname,
      "../../t2-demo-parser/data/auto-capture_2025-05-16_05-04_DemoBot-Mia_CTFGame_Firestorm.rec",
    );
    if (!fs.existsSync(file)) context.skip();
    const source = await DemoReplaySource.load(fs.readFileSync(file));
    expect(source.tick).toBe(0);
    await source.prepareScene();
    expect(source.tick).toBe(0);
    expect(payload(source).initialGhosts.length).toBeGreaterThan(1);
    expect(payload(source).controlObjectGhostIndex).toBeGreaterThanOrEqual(0);
  });
});

describe("WatchStateAccumulator replay checkpoints", () => {
  it("uses injected time and restores detached retained state", () => {
    let now = 10;
    const state = new WatchStateAccumulator(undefined, { now: () => now });
    state.applyPacket(
      serverMessagePacket(["MsgSystemClock", "", "20", "60000"]),
    );
    now = 12;
    expect(state.getHudState().clock?.elapsedMs).toBe(2_000);
    const saved = state.save();
    state.applyPacket(
      serverMessagePacket(["MsgSystemClock", "", "20", "30000"]),
    );
    state.restore(saved);
    expect(state.getHudState().clock?.durationMs).toBe(60_000);
    state.applyPacket(
      serverMessagePacket(["MsgSystemClock", "", "20", "5000"]),
    );
    state.restore(saved);
    expect(state.getHudState().clock?.durationMs).toBe(60_000);
  });
});

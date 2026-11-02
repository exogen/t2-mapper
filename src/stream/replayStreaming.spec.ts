import { describe, expect, it, vi } from "vitest";
import {
  BlockTypeInfo,
  BlockTypeMove,
  createDefaultRegistry,
  type Move,
  type PacketData,
  type PacketParser,
} from "t2-demo-parser";
import type { ReplayCatchupState, ReplayState } from "../../relay/replayTypes";
import { testCatchupPayload } from "../../relay/serverPacketFixtures";
import { PlaybackClock } from "./PlaybackClock";
import type { RelayClient } from "./relayClient";
import { ReplayStreamAdapter } from "./replayStreaming";
import { STREAM_TICK_SEC } from "./streamHelpers";
import { DemoStreamAdapter } from "./demoStreaming";
import { fakeDemoParser, packetBlock } from "./streamTestFixtures";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import fs from "node:fs";
import path from "node:path";
import { DemoParser } from "t2-demo-parser";
import { DemoReplaySource } from "../../relay/demoReplaySource";

const move: Move = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0.1,
  pitch: 0,
  roll: 0,
  px: 16,
  py: 16,
  pz: 16,
  pyaw: 0,
  ppitch: 0,
  proll: 0,
  id: 0,
  sendCount: 0,
  freeLook: false,
  trigger: [],
};

function hydrate(
  adapter: ReplayStreamAdapter,
  tick: number,
  status: ReplayCatchupState["status"] = "paused",
  epoch = 1,
) {
  const payload = testCatchupPayload({ epoch });
  payload.replay = {
    sessionId: "room",
    epoch,
    tick,
    status,
    pendingMoves: [],
    nextMoveId: 5,
    lastClientMoveId: 5,
    controlMoveReplayStartId: 0,
    lastMoveAck: 5,
    controlMovesAvailable: true,
    firstPerson: true,
    fov: 100,
    absoluteYaw: 0,
    absolutePitch: 0,
  };
  adapter.hydrate(payload);
  return payload;
}

describe("replay authoritative playback boundaries", () => {
  it("matches a real demo's predicted header pose and first tick without replaying already-applied queued inputs", async (context) => {
    const file = path.resolve(
      import.meta.dirname,
      "../../../t2-demo-parser/data/uploads_6_SterIO_2025_LT_Pub_SH.rec",
    );
    if (!fs.existsSync(file)) context.skip();
    const bytes = fs.readFileSync(file);
    const parser = new DemoParser(bytes);
    await parser.load();
    const registry = createDefaultRegistry();
    const geometry = (ghost: { classId?: number }) =>
      ["TerrainBlock", "InteriorInstance"].includes(
        registry.getGhostParser(ghost.classId!)?.name ?? "",
      );
    // Both simulations use the same empty collision world for this cursor
    // comparison, independently of browser scene/asset loading.
    parser.initialBlock.initialGhosts =
      parser.initialBlock.initialGhosts.filter((ghost) => !geometry(ghost));
    const native = new DemoStreamAdapter(parser, {});
    native.setPlayerPredictionEnabled(true);
    native.reset();
    const source = await DemoReplaySource.load(bytes);
    const replay = new ReplayStreamAdapter({} as RelayClient);
    for (const tick of [0, 1]) {
      await source.seek(tick);
      const payload = source.catchup("room", tick + 1, "paused");
      payload.initialGhosts = payload.initialGhosts.filter(
        (ghost) => !geometry(ghost),
      );
      replay.hydrate(payload);
      const expected = native
        .stepToTime(tick * STREAM_TICK_SEC)
        .entities.find(
          (entity) => entity.ghostIndex === payload.controlObjectGhostIndex,
        )!;
      const actual = replay
        .getSnapshot()
        .entities.find(
          (entity) => entity.ghostIndex === payload.controlObjectGhostIndex,
        )!;
      expect(actual.position).toEqual(expected.position);
      expect(actual.rotation).toEqual(expected.rotation);
      expect(actual.headPitch).toBe(expected.headPitch);
    }
  });
  it("holds the exact hydrated tick despite the render clock's interpolation tick", () => {
    const adapter = new ReplayStreamAdapter({} as RelayClient);
    hydrate(adapter, 500);
    expect(adapter.stepToTime(999).timeSec).toBe(500 * STREAM_TICK_SEC);
    const clock = new PlaybackClock();
    clock.reset(100, 0);
    const controls = {
      status: "paused",
      rate: 1,
      seekTime: 0,
      seekNonce: 0,
    } as const;
    const frame = clock.step(adapter, controls, 1);
    expect(clock.time).toBe(500 * STREAM_TICK_SEC);
    expect(frame?.snapshot.timeSec).toBe(clock.time);
    expect(frame?.previousSnapshot.timeSec).toBe(clock.time);
    expect(clock.step(adapter, controls, 100)?.snapshot.timeSec).toBe(
      clock.time,
    );
  });

  it("rebases both interpolation endpoints after a backwards seek", () => {
    const adapter = new ReplayStreamAdapter({} as RelayClient);
    const clock = new PlaybackClock();
    const controls = {
      status: "paused",
      rate: 1,
      seekTime: 0,
      seekNonce: 0,
    } as const;
    hydrate(adapter, 1000);
    clock.step(adapter, controls, 0);
    hydrate(adapter, 10, "paused", 2);
    const frame = clock.step(adapter, controls, 0);
    expect(clock.time).toBe(10 * STREAM_TICK_SEC);
    expect(frame?.snapshot.timeSec).toBe(clock.time);
    expect(frame?.previousSnapshot.timeSec).toBe(clock.time);
  });

  it("resumes live stepping and admits only this session's new recorded moves", () => {
    const adapter = new ReplayStreamAdapter({} as RelayClient);
    hydrate(adapter, 100);
    adapter.applyState({
      sessionId: "room",
      epoch: 1,
      tick: 100,
      status: "playing",
    } as ReplayState);
    adapter.feedReplayTick({
      type: "replayTick",
      sessionId: "old",
      epoch: 1,
      tick: 101,
      move,
      firstPerson: true,
    });
    adapter.feedReplayTick({
      type: "replayTick",
      sessionId: "room",
      epoch: 0,
      tick: 101,
      move,
      firstPerson: true,
    });
    expect(adapter.sourceTick).toBe(100);
    adapter.feedReplayTick({
      type: "replayTick",
      sessionId: "room",
      epoch: 1,
      tick: 101,
      move,
      firstPerson: true,
    });
    adapter.feedReplayTick({
      type: "replayTick",
      sessionId: "room",
      epoch: 1,
      tick: 101,
      move,
      firstPerson: true,
    });
    expect(adapter.sourceTick).toBe(101);
    expect(adapter.stepToTime(104 * STREAM_TICK_SEC).timeSec).toBe(
      104 * STREAM_TICK_SEC,
    );
    const cursor = adapter as unknown as {
      nextPlayerMoveId: number;
      absoluteYaw: number;
    };
    expect(cursor.nextPlayerMoveId).toBe(6);
    expect(cursor.absoluteYaw).toBeCloseTo(0.1);
  });

  it("seeds absolute clock and recorded pending input before HUD hydration", () => {
    const adapter = new ReplayStreamAdapter({} as RelayClient);
    const payload = hydrate(adapter, 250);
    payload.hudState.clock = { durationMs: 600_000, elapsedMs: 20_000 };
    payload.replay!.pendingMoves = [{ id: 5, move, firstPerson: true }];
    payload.replay!.nextMoveId = 6;
    adapter.hydrate(payload);
    const internal = adapter as unknown as {
      conn: { clock: { anchorSec: number } };
      pendingPlayerMoves: Array<{ id: number; move: Move }>;
    };
    expect(internal.conn.clock.anchorSec).toBe(250 * STREAM_TICK_SEC - 20);
    expect(internal.pendingPlayerMoves).toEqual([
      { id: 5, move, firstPerson: true },
    ]);
  });

  it("reconstructs a cold paused control suffix once collision geometry becomes ready", () => {
    const registry = createDefaultRegistry();
    const pose = {
      position: { x: 0, y: 0, z: 100 },
      velocity: { x: 16, y: 0, z: 0 },
      rotationZ: 0,
      headX: 0,
      headZ: 0,
      energyLevel: 100,
    };
    const cold = new ReplayStreamAdapter({} as RelayClient);
    const payload = hydrate(cold, 1);
    payload.initialGhosts = [
      {
        index: 0,
        type: "create",
        classId: registry.getGhostClassId("Player")!,
        parsedData: { ...pose, dataBlockId: 1 },
        updateBitsStart: 0,
        updateBitsEnd: 0,
      },
      {
        index: 1,
        type: "create",
        classId: registry.getGhostClassId("TerrainBlock")!,
        parsedData: {},
        updateBitsStart: 0,
        updateBitsEnd: 0,
      },
    ];
    payload.dataBlocks = [
      [
        1,
        {
          className: "PlayerData",
          data: {
            boxSize: { x: 1, y: 1, z: 2 },
            mass: 90,
            maxEnergy: 100,
          },
        },
      ],
    ];
    payload.controlObjectGhostIndex = 0;
    payload.controlObjectData = pose;
    payload.worldGravity = 0;
    Object.assign(payload.replay!, {
      pendingMoves: [{ id: 0, move: { ...move, yaw: 0 }, firstPerson: true }],
      nextMoveId: 1,
      lastClientMoveId: 1,
      lastMoveAck: 0,
    });
    setTerrainCollisionData(null);
    try {
      cold.hydrate(payload);
      const clock = new PlaybackClock();
      const controls = {
        status: "paused",
        rate: 1,
        seekTime: 0,
        seekNonce: 0,
      } as const;
      const first = clock.step(cold, controls, 0)!.snapshot;
      const player = (snapshot: typeof first) =>
        snapshot.entities.find((entity) => entity.type === "Player")!;
      expect(player(first).position).toEqual([0, 0, 100]);
      const replaced = new ReplayStreamAdapter({} as RelayClient);
      replaced.hydrate(payload);
      const parser = (replaced as unknown as { packetParser: PacketParser })
        .packetParser;
      const parse = vi.spyOn(parser, "parsePacket").mockReturnValueOnce({
        dnetHeader: { packetType: 0 },
        events: [],
        ghosts: [],
        gameState: {
          lastMoveAck: 0,
          controlObjectGhostIndex: 0,
          controlObjectData: { ...pose, position: { x: 10, y: 0, z: 100 } },
        },
      } as unknown as PacketData);
      replaced.feedPacket(new Uint8Array([0]));
      parse.mockRestore();
      setTerrainCollisionData({
        heightMap: new Uint16Array(256 * 256),
        squareSize: 8,
      });
      const warm = new ReplayStreamAdapter({} as RelayClient);
      warm.hydrate(payload);
      const corrected = clock.step(cold, controls, 0)!.snapshot;
      expect(player(corrected).position).toEqual([0.5, 0, 100]);
      expect(player(replaced.getSnapshot()).position).toEqual([10.5, 0, 100]);
      expect(player(replaced.getSnapshot()).position).toEqual([10.5, 0, 100]);
      expect(player(corrected).position).toEqual(
        player(warm.getSnapshot()).position,
      );
      expect(corrected.timeSec).toBe(first.timeSec);
      expect(clock.time).toBe(STREAM_TICK_SEC);
      expect(player(cold.getSnapshot()).position).toEqual([0.5, 0, 100]);
      expect(player(clock.step(cold, controls, 1)!.snapshot).position).toEqual([
        0.5, 0, 100,
      ]);
    } finally {
      setTerrainCollisionData(null);
    }
  });

  it("matches normal demo body/head motion when recorded freelook switches view modes", () => {
    const registry = createDefaultRegistry();
    const playerClass = registry.getGhostClassId("Player")!;
    const armor = {
      boxSize: { x: 1, y: 1, z: 2 },
      mass: 90,
      maxEnergy: 100,
      maxLookAngle: 1.5,
      maxFreelookAngle: 1.5,
    };
    const pose = {
      position: { x: 0, y: 0, z: 100 },
      velocity: { x: 0, y: 0, z: 0 },
      rotationZ: 0,
      headX: 0,
      headZ: 0,
      energyLevel: 100,
    };
    const ghost = {
      index: 0,
      type: "create" as const,
      classId: playerClass,
      updateBitsStart: 0,
      updateBitsEnd: 0,
      parsedData: { ...pose, dataBlockId: 1 },
    };
    const dataBlock = { className: "PlayerData", classId: 1, data: armor };
    const input = { ...move, yaw: 0.5, freeLook: true };
    const blocks: unknown[] = [
      { type: BlockTypeInfo, parsed: { firstPerson: false, cameraFov: 90 } },
      { type: BlockTypeMove, parsed: input },
      { type: BlockTypeInfo, parsed: { firstPerson: true, cameraFov: 90 } },
      { type: BlockTypeMove, parsed: input },
    ];
    const demo = new DemoStreamAdapter(
      fakeDemoParser({
        registry,
        blocks,
        initialBlock: {
          initialGhosts: [ghost],
          dataBlocks: new Map([[1, dataBlock]]),
          controlObjectGhostIndex: 0,
          controlObjectData: pose,
        },
      }),
      {},
    );
    demo.setPlayerPredictionEnabled(true);
    demo.reset();
    const replay = new ReplayStreamAdapter({} as RelayClient);
    const payload = hydrate(replay, 0, "playing");
    payload.initialGhosts = [ghost];
    payload.dataBlocks = [[1, dataBlock]];
    payload.controlObjectGhostIndex = 0;
    payload.controlObjectData = pose;
    Object.assign(payload.replay!, {
      nextMoveId: 0,
      lastClientMoveId: 0,
      lastMoveAck: 0,
    });
    replay.hydrate(payload);
    const batchedReplay = new ReplayStreamAdapter({} as RelayClient);
    batchedReplay.hydrate(payload);
    const bodyRotations: number[][] = [];
    for (const [index, firstPerson] of [false, true].entries()) {
      const tick = index + 1;
      const event = {
        type: "replayTick",
        sessionId: "room",
        epoch: 1,
        tick,
        move: input,
        firstPerson,
      } as const;
      replay.feedReplayTick(event);
      batchedReplay.feedReplayTick(event);
      const actual = replay.stepToTime(tick * STREAM_TICK_SEC).entities[0];
      const expected = demo.stepToTime(tick * STREAM_TICK_SEC).entities[0];
      expect(actual.rotation).toEqual(expected.rotation);
      expect(actual.headYaw).toBe(expected.headYaw);
      expect(actual.position).toEqual(expected.position);
      bodyRotations.push(actual.rotation!);
      if (!firstPerson) {
        actual.rotation!.forEach((component, axis) =>
          expect(component).toBeCloseTo(axis === 3 ? 1 : 0),
        );
        expect(actual.headYaw).toBeGreaterThan(0);
      }
    }
    expect(bodyRotations[1]).not.toEqual(bodyRotations[0]);
    const batch = batchedReplay.stepToTime(2 * STREAM_TICK_SEC).entities[0];
    const expected = demo.getSnapshot().entities[0];
    expect(batch.rotation).toEqual(expected.rotation);
    expect(batch.headYaw).toBe(expected.headYaw);
    expect(batch.position).toEqual(expected.position);

    // A late join/seek replays the unacknowledged suffix from the last
    // control correction, even when its moves used different view modes.
    payload.replay = {
      ...payload.replay!,
      tick: 2,
      firstPerson: true,
      pendingMoves: [
        { id: 0, move: input, firstPerson: false },
        { id: 1, move: input, firstPerson: true },
      ],
      nextMoveId: 2,
      lastClientMoveId: 2,
    };
    const late = new ReplayStreamAdapter({} as RelayClient);
    late.hydrate(payload);
    const corrected = late.getSnapshot().entities[0];
    expect(corrected.rotation).toEqual(expected.rotation);
    expect(corrected.headYaw).toBe(expected.headYaw);
    expect(corrected.position).toEqual(expected.position);

    // No Move separates this Info change and the ACK0 positional correction.
    // Native playback reruns BOTH surviving inputs using the current mode.
    const correction = {
      lastMoveAck: 0,
      controlObjectGhostIndex: 0,
      controlObjectData: pose,
    };
    blocks.push(
      { type: BlockTypeInfo, parsed: { firstPerson: false, cameraFov: 90 } },
      packetBlock({ gameState: correction }),
      { type: BlockTypeMove, parsed: move },
    );
    const packetParser = (replay as unknown as { packetParser: PacketParser })
      .packetParser;
    const parse = vi.spyOn(packetParser, "parsePacket").mockReturnValueOnce({
      dnetHeader: { packetType: 0 },
      events: [],
      ghosts: [],
      gameState: correction,
    } as unknown as PacketData);
    replay.feedReplayInfo({
      type: "replayInfo",
      sessionId: "room",
      epoch: 1,
      firstPerson: false,
    });
    replay.feedPacket(new Uint8Array([0]));
    parse.mockRestore();
    replay.feedReplayTick({
      type: "replayTick",
      sessionId: "room",
      epoch: 1,
      tick: 3,
      move,
      firstPerson: false,
    });
    const afterCorrection = replay.stepToTime(3 * STREAM_TICK_SEC).entities[0];
    const nativeCorrection = demo.stepToTime(3 * STREAM_TICK_SEC).entities[0];
    expect(afterCorrection.rotation).toEqual(nativeCorrection.rotation);
    expect(afterCorrection.headYaw).toBe(nativeCorrection.headYaw);
    expect(afterCorrection.position).toEqual(nativeCorrection.position);
    expect(afterCorrection.rotation).not.toEqual(expected.rotation);

    payload.replay = {
      ...payload.replay,
      tick: 3,
      firstPerson: false,
      pendingMoves: [input, input, move].map((pending, id) => ({
        id,
        move: pending,
        firstPerson: false,
      })),
      nextMoveId: 3,
      lastClientMoveId: 3,
    };
    late.hydrate(payload);
    const normalized = late.getSnapshot().entities[0];
    expect(normalized.rotation).toEqual(nativeCorrection.rotation);
    expect(normalized.headYaw).toBe(nativeCorrection.headYaw);
    expect(normalized.position).toEqual(nativeCorrection.position);
  });
});

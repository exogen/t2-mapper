import { afterEach, describe, expect, it } from "vitest";
import {
  BlockTypeMove,
  BlockTypePacket,
  type DemoParser,
  type MoveData,
  type ParsedData,
} from "t2-demo-parser";
import { createRecordingFromParser } from "./demoStreaming";
import { clearWorldColliders } from "../collision/worldCollision";
import { setTerrainCollisionData } from "../collision/terrainCollision";

const armor = { boxSize: { x: 1, y: 1, z: 2 }, mass: 90, maxEnergy: 100 };
const neutral = {
  px: 16,
  py: 16,
  pz: 16,
  pyaw: 0,
  ppitch: 0,
  proll: 0,
  freeLook: false,
  trigger: [],
};
const pose = (x: number) => ({
  position: { x, y: 0, z: 100 },
  velocity: { x: 16, y: 0, z: 0 },
  rotationZ: 0,
  move: neutral,
});
const move = () => ({
  type: BlockTypeMove,
  parsed: { yaw: 0, pitch: 0, x: 0, y: 0, z: 0, trigger: [] },
});
function packet(ghosts: unknown[] = [], gameState: ParsedData = {}) {
  return {
    type: BlockTypePacket,
    parsed: { ghosts, events: [], gameState: { lastMoveAck: 0, ...gameState } },
  };
}
function update(parsedData: ParsedData) {
  return { index: 0, type: "update", classId: 1, parsedData };
}

/** Decoded parser blocks exercise the production adapter, without asset/network IO. */
function demo(
  blocks: unknown[],
  control = false,
  prediction = true,
  moves: MoveData[] = [],
  lastClientMove = 0,
) {
  let cursor = 0;
  const parser = {
    header: { demoLengthMs: 100000 },
    initialBlock: {
      dataBlocks: new Map([
        [1, { className: "PlayerData", data: armor }],
        [
          2,
          {
            className: "PlayerData",
            data: { ...armor, boxSize: { x: 2, y: 2, z: 3 } },
          },
        ],
      ]),
      initialGhosts: [
        {
          index: 0,
          type: "create",
          classId: 1,
          parsedData: { ...pose(0), dataBlockId: 1 },
        },
      ],
      controlObjectGhostIndex: control ? 0 : -1,
      controlObjectData: control
        ? { ...pose(0), energyLevel: 100 }
        : { cameraMode: 0 },
      targetEntries: [],
      sensorGroupColors: [],
      taggedStrings: new Map(),
      initialEvents: [],
      demoValues: [],
      firstPerson: true,
      connectionFields: [0, 0, 0, lastClientMove, 0, 0],
      moves,
    },
    getRegistry: () => ({
      getGhostParser: (classId: number) => ({
        name: classId === 2 ? "TerrainBlock" : "Player",
      }),
      getEventParser: () => undefined,
    }),
    getGhostTracker: () => ({ getGhost: () => ({ classId: 1 }) }),
    getPacketParser: () => ({}),
    reset: () => {
      cursor = 0;
    },
    nextBlock: () => blocks[cursor++],
    decompressedByteLength: 1,
    bufferedMoveTicks: 10000,
    isComplete: true,
  } as unknown as DemoParser;
  const stream = createRecordingFromParser(parser).streamingPlayback;
  stream.setPlayerPredictionEnabled?.(prediction);
  stream.reset();
  return stream;
}

afterEach(() => {
  clearWorldColliders();
  setTerrainCollisionData(null);
});

describe("demo player tick prediction", () => {
  it("runs only the initial queued moves not yet processed by the recording client", () => {
    const stream = demo([move()], true, true, [neutral, neutral, neutral], 1);
    // Initial moves 1 and 2 are pending; move 0 is already reflected in
    // the initial position. The first demo tick supplies move 3.
    expect(stream.stepToTime(0.032).entities[0].position?.[0]).toBe(1.5);
  });

  it("waits for collision assets instead of predicting a fall through the loading world", () => {
    const blocks = [
      packet([{ index: 1, type: "create", classId: 2, parsedData: {} }]),
      ...Array.from({ length: 25 }, move),
    ];
    const stream = demo(blocks);
    expect(stream.stepToTime(0.64).entities[0].position).toEqual([0, 0, 100]);
    setTerrainCollisionData({
      heightMap: new Uint16Array(256 * 256).fill(3200),
      squareSize: 8,
    });
    expect(stream.needsReplay).toBe(true);
    const player = stream.stepToTime(0.672).entities[0];
    const warm = demo(blocks);
    for (let tick = 1; tick <= 21; tick++) warm.stepToTime(tick * 0.032 + 1e-9);
    expect(player.position).toEqual(warm.getSnapshot().entities[0].position);
    expect(player.clientAnimation).toEqual(
      warm.getSnapshot().entities[0].clientAnimation,
    );
    expect(player.position![2]).toBeGreaterThanOrEqual(100);
    expect(stream.needsReplay).toBe(false);
  });
  it("advances players between packets while scanners retain recorded poses", () => {
    const blocks = [
      move(),
      move(),
      packet([update({ ...pose(1), allowWarp: true })]),
      move(),
    ];
    const stream = demo(blocks);
    const one = stream.stepToTime(0.032).entities[0];
    const two = stream.stepToTime(0.064).entities[0];
    expect(one.position?.[0]).toBe(0.5);
    expect(two.position?.[0]).toBe(1);
    expect(two.playerDelta?.posVec[0]).toBe(-0.5);
    expect(one.position?.[0]).toBe(0.5); // Immutable previous snapshot.
    expect(
      demo(blocks, false, false).stepToTime(0.064).entities[0].position?.[0],
    ).toBe(0);
  });

  it("replays only unacknowledged control moves after a server correction", () => {
    const stream = demo(
      [
        move(),
        move(),
        packet([], {
          lastMoveAck: 1,
          controlObjectGhostIndex: 0,
          controlObjectData: { ...pose(10), energyLevel: 100 },
        }),
        move(),
      ],
      true,
    );
    stream.stepToTime(0.064);
    const snapshot = stream.stepToTime(0.096);
    // Server acknowledged move 0. Replay move 1, then process move 2.
    expect(snapshot.entities[0].position?.[0]).toBe(11);
    expect(snapshot.camera?.position[0]).toBe(11);
    expect(snapshot.entities[0].playerDelta?.posVec[0]).toBe(-0.5);
  });

  it("has the same destination pose for sequential playback, fast seeking and backward seeking", () => {
    const blocks: unknown[] = [];
    for (let tick = 0; tick < 100; tick++) {
      if (tick % 2 === 0)
        blocks.push(
          packet([update({ ...pose(tick * 0.5), allowWarp: false })]),
        );
      blocks.push(move());
    }
    const sequential = demo(blocks);
    for (let tick = 1; tick <= 100; tick++)
      sequential.stepToTime(tick * 0.032 + 1e-9);
    const seek = demo(blocks);
    expect(seek.stepToTime(3.2).entities[0].position).toEqual(
      sequential.getSnapshot().entities[0].position,
    );
    const backward = seek.stepToTime(1.6).entities[0];
    expect(backward.position).toEqual(
      demo(blocks).stepToTime(1.6).entities[0].position,
    );
    expect(backward.playerDelta).toEqual(
      demo(blocks).stepToTime(1.6).entities[0].playerDelta,
    );
  });

  it("does not reuse prediction state after a ghost is deleted and recreated", () => {
    const stream = demo([
      move(),
      packet([
        { index: 0, type: "delete" },
        {
          index: 0,
          type: "create",
          classId: 1,
          parsedData: { ...pose(50), dataBlockId: 1 },
        },
      ]),
      move(),
    ]);
    const before = stream.stepToTime(0.032).entities[0];
    const after = stream.stepToTime(0.064).entities[0];
    expect(after.id).not.toBe(before.id);
    expect(after.position?.[0]).toBe(50.5);
    expect(after.playerDelta?.posVec[0]).toBe(-0.5);
  });

  it("preserves client animation history through prediction while seeking over sparse packets", () => {
    const blocks = Array.from({ length: 100 }, move);
    const sequential = demo(blocks);
    for (let tick = 1; tick <= 100; tick++)
      sequential.stepToTime(tick * 0.032 + 1e-9);
    expect(demo(blocks).stepToTime(3.2).entities[0].clientAnimation).toEqual(
      sequential.getSnapshot().entities[0].clientAnimation,
    );
  });

  it("keeps mount placement independent of the previous unmounted prediction", () => {
    const stream = demo([
      move(),
      packet([update({ mountObject: 5, mountNode: 0 })]),
      move(),
    ]);
    stream.stepToTime(0.032);
    expect(stream.stepToTime(0.064).entities[0].playerDelta).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  BlockTypeMove,
  BlockTypePacket,
  type DemoParser,
} from "t2-demo-parser";
import { PerspectiveCamera, Group } from "three";
import { createRecordingFromParser } from "./demoStreaming";
import { shapeThreadTime } from "./shapeThreads";
import { imageThreadPosition } from "./imageAnimation";
import { applyStreamEntityPose } from "./interpolateEntity";

const playing = {
  index: 3,
  sequence: 0,
  state: 0,
  forward: true,
  atEnd: false,
};
const create = (index = 0) => ({
  index,
  type: "create",
  classId: 1,
  parsedData: {
    dataBlockId: 1,
    position: { x: 1, y: 2, z: 3 },
    threads: [playing],
    wheels: [{ avel: 1, dx: 0, dy: 0 }],
    images: [{ index: 0, dataBlockId: 2, loaded: true, fireCount: 0 }],
  },
});
const update = (parsedData: object) => ({
  index: 0,
  type: "update",
  parsedData,
});
const packet = (...ghosts: object[]) => ({
  type: BlockTypePacket,
  parsed: { ghosts, events: [], gameState: { lastMoveAck: 0 } },
});
const move = () => ({
  type: BlockTypeMove,
  parsed: { yaw: 0, pitch: 0, x: 0, y: 0, z: 0, trigger: [] },
});
function demo(blocks: unknown[]) {
  let cursor = 0;
  const parser = {
    header: { demoLengthMs: 100000 },
    initialBlock: {
      dataBlocks: new Map([
        [
          1,
          {
            className: "WheeledVehicleData",
            data: { shapeName: "vehicle_land_mpbase.dts" },
          },
        ],
        [
          2,
          {
            className: "ShapeBaseImageData",
            data: {
              shapeName: "turret_muzzle.dts",
              states: [
                { name: "Ready", sequence: 0 },
                {
                  name: "Fire",
                  fire: true,
                  sequence: 1,
                  timeoutValue: 0.3,
                  transitionOnTimeout: 3,
                },
                { name: "Rest", sequence: 2 },
              ],
            },
          },
        ],
      ]),
      initialGhosts: [create()],
      controlObjectGhostIndex: -1,
      controlObjectData: { cameraMode: 0 },
      targetEntries: [],
      sensorGroupColors: [],
      taggedStrings: new Map(),
      initialEvents: [],
      demoValues: [],
      firstPerson: true,
      connectionFields: [0, 0, 0, 0, 0, 0],
      moves: [],
    },
    getRegistry: () => ({
      getGhostParser: () => ({ name: "WheeledVehicle" }),
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
  stream.reset();
  return stream;
}

const timeline = () => [
  ...Array.from({ length: 10 }, move),
  packet(
    update({
      threads: [{ ...playing, state: 2 }],
      images: [{ index: 0, dataBlockId: 2, fireCount: 1 }],
    }),
  ),
  ...Array.from({ length: 10 }, move),
  packet(update({ threads: [playing], wheels: [{ avel: -2, dx: 1, dy: 2 }] })),
  ...Array.from({ length: 80 }, move),
];
const withoutId = (entity: object) => {
  const { id, ...state } = entity as Record<string, unknown>;
  return state;
};

describe("seek reconstruction", () => {
  it("reconstructs complete threads, mounted-image state and wheel phase identically in both seek directions", () => {
    const sequential = demo(timeline()),
      seek = demo(timeline());
    for (let tick = 1; tick <= 100; tick++)
      sequential.stepToTime(tick * 0.032 + 1e-9);
    const expected = sequential.getSnapshot().entities[0];
    const direct = seek.stepToTime(3.2).entities[0];
    expect(withoutId(direct)).toEqual(withoutId(expected));
    expect(shapeThreadTime(direct.threads![0], 3.2, 1, false)).toBe(1);
    // Latest flags alone cannot tell Ready from Rest: it was fired earlier.
    expect(direct.imageSlots![0]!.animation!.state.stateIndex).toBe(2);
    const thread = direct.imageSlots![0]!.animation!.anim!;
    expect(imageThreadPosition(thread, 3.2, 1, false)).toBe(1);
    for (const t of [0.48, 3.2, 1.12, 3.2]) {
      expect(withoutId(seek.stepToTime(t).entities[0])).toEqual(
        withoutId(demo(timeline()).stepToTime(t).entities[0]),
      );
    }
  });

  it("keeps past snapshots immutable as images and wheels change", () => {
    const stream = demo(timeline());
    const before = stream.stepToTime(0.32).entities[0];
    const preserved = structuredClone(before);
    const after = stream.stepToTime(3.2).entities[0];
    expect(before).toEqual(preserved);
    expect(after.wheels).not.toEqual(before.wheels);
    expect(after.imageSlots?.[0]?.animation).not.toEqual(
      before.imageSlots?.[0]?.animation,
    );
  });

  it("treats replacement creates as new lifetimes and removes every old entity on deletion", () => {
    const stream = demo([
      move(),
      packet(create()),
      move(),
      packet({ index: 0, type: "delete" }),
      move(),
    ]);
    const a = stream.stepToTime(0.032).entities[0];
    const b = stream.stepToTime(0.064).entities[0];
    expect(b.id).not.toBe(a.id);
    expect(b.imageSlots![0]!.mountedAtSec).toBe(0.032);
    expect(stream.stepToTime(0.096).entities).toEqual([]);
  });

  it("hides a deleted render object immediately while React still has its previous model mounted", () => {
    const model = new Group();
    applyStreamEntityPose(
      model,
      undefined,
      undefined,
      undefined,
      0.5,
      new PerspectiveCamera(),
    );
    expect(model.visible).toBe(false);
  });
});

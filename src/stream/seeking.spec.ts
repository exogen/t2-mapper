import { describe, expect, it } from "vitest";
import {
  BlockTypeMove,
  BlockTypePacket,
  type DemoParser,
} from "t2-demo-parser";
import { PerspectiveCamera, Group } from "three";
import {
  createRecordingFromParser,
  type DemoStreamingOptions,
  DEMO_CHECKPOINT_TICKS,
} from "./demoStreaming";
import { shapeThreadTime } from "./shapeThreads";
import { imageThreadPosition } from "./imageAnimation";
import { applyStreamEntityPose } from "./interpolateEntity";
import { wheelRotationAt, wheelSteeringPosition } from "./vehicleWheels";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "./entityBridge";

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
const stats = () => ({ movesRead: 0, captures: 0, restores: 0 });
function demo(
  blocks: unknown[],
  options: DemoStreamingOptions = {},
  calls = stats(),
) {
  let cursor = 0;
  const parser = {
    header: { demoLengthMs: 100000 },
    initialBlock: {
      dataBlocks: new Map([
        [
          1,
          {
            className: "WheeledVehicleData",
            data: {
              shapeName: "vehicle_land_mpbase.dts",
              maxSteeringAngle: 0.3,
            },
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
    nextBlock: () => {
      const block = blocks[cursor++] as { type: number } | undefined;
      if (block?.type === BlockTypeMove) calls.movesRead++;
      return block;
    },
    createCheckpoint: () => {
      calls.captures++;
      return { cursor };
    },
    restoreCheckpoint: (checkpoint: { cursor: number }) => {
      calls.restores++;
      cursor = checkpoint.cursor;
    },
    decompressedByteLength: 1,
    bufferedMoveTicks: 10000,
    isComplete: true,
  } as unknown as DemoParser;
  const stream = createRecordingFromParser(parser, options).streamingPlayback;
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
  it("keeps signed steering through ghost updates, rendering and seeks", () => {
    const stream = demo([
      packet(update({ steeringYaw: 0 })),
      ...Array.from({ length: 10 }, move),
      packet(update({ steeringYaw: 1 })),
      ...Array.from({ length: 10 }, move),
      packet(update({ steeringYaw: 0.5 })),
      ...Array.from({ length: 10 }, move),
    ]);
    const initial = stream.stepToTime(0.16).entities[0];
    const rendered = streamEntityToGameEntity(initial);
    if (rendered.renderType !== "Shape")
      throw new Error("Expected vehicle shape");
    for (const [time, expectedYaw, position] of [
      [0.16, -0.3, 0.65],
      [0.48, 0.3, 0.35],
      [0.8, 0, 0.5],
      [0.16, -0.3, 0.65],
      [0.48, 0.3, 0.35],
    ]) {
      const entity = stream.stepToTime(time).entities[0];
      updateGameEntityFromStream(rendered, entity);
      expect(entity.steeringYaw).toBeCloseTo(expectedYaw);
      expect(rendered.steeringYaw).toBeCloseTo(expectedYaw);
      expect(
        wheelSteeringPosition(rendered.steeringYaw!, rendered.maxSteeringAngle),
      ).toBeCloseTo(position);
    }
  });

  it("integrates sparse wheel speed updates in radians, including stops and reversals", () => {
    const stream = demo([
      ...Array.from({ length: 10 }, move),
      packet(update({ wheels: [{ avel: 0, dx: 0, dy: 0 }] })),
      ...Array.from({ length: 10 }, move),
      packet(update({ wheels: [{ avel: -2, dx: 0, dy: 0 }] })),
      ...Array.from({ length: 20 }, move),
    ]);
    for (const time of [0.64, 0.8, 1.12, 0.64, 1.12]) {
      const entity = stream.stepToTime(time).entities[0];
      const radians = 0.32 - 2 * Math.max(0, time - 0.64);
      const turns = radians / (2 * Math.PI);
      expect(wheelRotationAt(entity.wheels![0], time)).toBeCloseTo(
        turns - Math.floor(turns),
      );
    }
  });

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

const atTick = (tick: number) => tick * 0.032 + 1e-9;
function checkpointTimeline() {
  return [
    ...Array.from({ length: DEMO_CHECKPOINT_TICKS - 20 }, move),
    packet(
      update({
        images: [{ index: 0, dataBlockId: 2, fireCount: 1 }],
        threads: [{ ...playing, forward: false }],
        fading: true,
        fadeTime: 1.1,
        fadeOut: true,
      }),
    ),
    ...Array.from({ length: 40 }, move),
    packet(
      update({
        threads: [playing],
        wheels: [{ avel: -2, dx: 1, dy: 2 }],
      }),
    ),
    ...Array.from({ length: DEMO_CHECKPOINT_TICKS * 2 - 10 }, move),
  ];
}

// Renderer IDs intentionally change on reset/restore; state and links must not.
function normalized(
  snapshot: ReturnType<ReturnType<typeof demo>["getSnapshot"]>,
) {
  return { ...snapshot, entities: snapshot.entities.map(withoutId) };
}

describe("on-demand demo checkpoints", () => {
  it.each([false, true])(
    "preserves wheel phase across freeze/resume and checkpoint restores (combined speed update: %s)",
    (combined) => {
      const blocks = [
        ...Array.from({ length: 10 }, move),
        packet(
          update({
            frozen: true,
            ...(combined && { wheels: [{ avel: 2, dx: 0, dy: 0 }] }),
          }),
        ),
        ...Array.from({ length: 10 }, move),
        packet(update({ wheels: [{ avel: 2, dx: 0, dy: 0 }] })),
        ...Array.from({ length: DEMO_CHECKPOINT_TICKS - 10 }, move),
        packet(
          update({
            frozen: false,
            ...(combined && { wheels: [{ avel: 2, dx: 0, dy: 0 }] }),
          }),
        ),
        ...Array.from({ length: 10 }, move),
        packet(update({ wheels: [{ avel: 0, dx: 0, dy: 0 }] })),
        ...Array.from({ length: 10 }, move),
      ];
      const stream = demo(blocks);
      for (const offset of [5, 30, 5, 30]) {
        const time = atTick(DEMO_CHECKPOINT_TICKS + offset);
        const entity = stream.stepToTime(time).entities[0];
        const rotation = wheelRotationAt(
          entity.wheels![0],
          time,
          entity.frozen,
        );
        // 10 ticks at 1 rad/s, frozen, then 10 ticks at 2 rad/s and stopped.
        expect(rotation).toBeCloseTo(
          (offset === 5 ? 0.32 : 0.96) / (2 * Math.PI),
        );
        const forward = demo(blocks).stepToTime(time).entities[0];
        expect(entity.wheels).toEqual(forward.wheels);
      }
    },
  );

  it("captures each configured boundary once, only as the playhead reaches it", () => {
    const calls = stats();
    const stream = demo(checkpointTimeline(), {}, calls);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS - 1));
    expect(stream.checkpointTicks).toEqual([]);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS));
    expect(stream.checkpointTicks).toEqual([DEMO_CHECKPOINT_TICKS]);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 2 + 5));
    expect(stream.checkpointTicks).toEqual([
      DEMO_CHECKPOINT_TICKS,
      DEMO_CHECKPOINT_TICKS * 2,
    ]);
    expect(calls.captures).toBe(2);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 10));
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 2 + 5));
    expect(calls.captures).toBe(2);
    expect(stream.checkpointTicks).toEqual([
      DEMO_CHECKPOINT_TICKS,
      DEMO_CHECKPOINT_TICKS * 2,
    ]);
  });

  it("resumes a backward seek at its nearest checkpoint with identical state", () => {
    const blocks = checkpointTimeline(),
      calls = stats();
    const stream = demo(blocks, {}, calls);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 3 + 5));
    const before = calls.movesRead;
    const restored = stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 5));
    expect(calls.movesRead - before).toBe(5);
    expect(calls.restores).toBe(1);
    expect(normalized(restored)).toEqual(
      normalized(
        demo(blocks, { checkpoints: false }).stepToTime(
          atTick(DEMO_CHECKPOINT_TICKS + 5),
        ),
      ),
    );
    // Resuming again must not mutate the checkpoint or restart image/shape phases.
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 2 + 5));
    expect(
      normalized(stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 5))),
    ).toEqual(normalized(restored));
  });

  it("reuses a future checkpoint after rewinding and builds new ones beyond it", () => {
    const calls = stats(),
      stream = demo(checkpointTimeline(), {}, calls);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 2 + 5));
    stream.stepToTime(atTick(100));
    const before = calls.movesRead;
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 3 + 5));
    expect(calls.movesRead - before).toBe(DEMO_CHECKPOINT_TICKS + 5);
    expect(stream.checkpointTicks).toEqual([
      DEMO_CHECKPOINT_TICKS,
      DEMO_CHECKPOINT_TICKS * 2,
      DEMO_CHECKPOINT_TICKS * 3,
    ]);
    expect(calls.captures).toBe(3);
  });

  it("keeps a closer current state and honors the simulation tick budget", () => {
    const calls = stats(),
      stream = demo(checkpointTimeline(), {}, calls);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 5));
    const before = calls.movesRead;
    const snapshot = stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 1000), 7);
    expect(calls.movesRead - before).toBe(7);
    expect(snapshot.timeSec).toBe((DEMO_CHECKPOINT_TICKS + 12) * 0.032);
    expect(calls.restores).toBe(0);
  });

  it("reconstructs both interpolation endpoints on a checkpoint boundary", () => {
    const blocks = checkpointTimeline(),
      stream = demo(blocks);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 2 + 5));
    const expected = demo(blocks, { checkpoints: false });
    for (const tick of [
      DEMO_CHECKPOINT_TICKS - 1,
      DEMO_CHECKPOINT_TICKS,
      DEMO_CHECKPOINT_TICKS + 1,
    ]) {
      expect(normalized(stream.stepToTime(atTick(tick)))).toEqual(
        normalized(expected.stepToTime(atTick(tick))),
      );
    }
  });

  it("does not build checkpoints for analysis scans, and discards them on reset or prediction changes", () => {
    const blocks = checkpointTimeline(),
      calls = stats();
    const scan = demo(blocks, { checkpoints: false }, calls);
    scan.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 2 + 1));
    expect(calls.captures).toBe(0);
    const stream = demo(blocks);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS));
    stream.reset();
    expect(stream.checkpointTicks).toEqual([]);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS));
    stream.setPlayerPredictionEnabled?.(true);
    expect(stream.checkpointTicks).toEqual([]);
    expect(stream.needsReplay).toBe(true);
    stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS));
    expect(stream.checkpointTicks).toEqual([DEMO_CHECKPOINT_TICKS]);
    expect(stream.needsReplay).toBe(false);
  });
});

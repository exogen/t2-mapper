import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BlockTypeSendPacket,
  BlockTypeMove,
  type MoveData,
  type ParsedData,
} from "t2-demo-parser";
import { serverMessagePacket } from "../../relay/serverPacketFixtures";
import type { PlayerTickView, StreamEntity } from "./types";
import {
  createRecordingFromParser,
  DEMO_CHECKPOINT_TICKS,
  DemoStreamAdapter,
} from "./demoStreaming";
import { clearWorldColliders } from "../collision/worldCollision";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import { registerCollisionLoadFailure } from "../collision/collisionContext";
import { PlayerPrediction } from "./playerPrediction";
import {
  DEFAULT_PLAYER_INTERPOLATION,
  RETAIL_PLAYER_INTERPOLATION,
} from "./playerInterpolation";
import { PACKED_BODY_YAW_STEP } from "./quantizedPlayerAim";
import { DemoAimLookahead } from "./demoAimLookahead";
import { GhostMessage } from "./entityClassification";
import {
  fakeDemoParser,
  moveBlock,
  packetBlock,
  TestLiveStream,
} from "./streamTestFixtures";

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
const move = moveBlock;
const atTick = (tick: number) => tick * 0.032 + 1e-9;
function packet(ghosts: unknown[] = [], gameState: ParsedData = {}) {
  return packetBlock({ ghosts, gameState });
}
function update(parsedData: ParsedData) {
  return { index: 0, type: "update", classId: 1, parsedData };
}

function forkableAimDemo(blocks: readonly unknown[], complete = true) {
  const forkedBlocks: unknown[] = [];
  function makeParser(isFork: boolean): ReturnType<typeof fakeDemoParser> {
    const packetParser = {
      protocolRejected: 0,
      protocolNoDispatch: 0,
      getDataBlockDataMap: () => undefined,
    };
    const parser = fakeDemoParser({
      blocks,
      blockCursor: true,
      bufferedMoveTicks: blocks.filter(
        (block) => (block as { type: number }).type === BlockTypeMove,
      ).length,
      decompressedByteLength: blocks.length + 1,
      ghostClasses: "Player",
      packetParser,
      onBlock: (block) => {
        if (isFork && block) forkedBlocks.push(block);
        const { discarded } = (block ?? {}) as {
          discarded?: "rejected" | "noDispatch";
        };
        if (discarded === "rejected") packetParser.protocolRejected++;
        if (discarded === "noDispatch") packetParser.protocolNoDispatch++;
      },
      initialBlock: {
        initialGhosts: [
          {
            ...update({ ...pose(0), targetId: 32 }),
            type: "create",
          },
        ],
      },
    });
    const resetParser = parser.reset.bind(parser);
    parser.reset = () => {
      resetParser();
      packetParser.protocolRejected = 0;
      packetParser.protocolNoDispatch = 0;
    };
    const createCheckpoint = parser.createCheckpoint.bind(parser);
    parser.createCheckpoint = () => ({
      ...createCheckpoint(),
      protocolRejected: packetParser.protocolRejected,
      protocolNoDispatch: packetParser.protocolNoDispatch,
    });
    const initialCheckpoint = parser.createCheckpoint();
    const restoreCheckpoint = parser.restoreCheckpoint.bind(parser);
    parser.restoreCheckpoint = (checkpoint) => {
      if (checkpoint.owner !== initialCheckpoint.owner)
        throw new Error("Checkpoint belongs to a different fixture parser");
      restoreCheckpoint(checkpoint);
      const dispatch = checkpoint as typeof checkpoint & {
        protocolRejected: number;
        protocolNoDispatch: number;
      };
      packetParser.protocolRejected = dispatch.protocolRejected;
      packetParser.protocolNoDispatch = dispatch.protocolNoDispatch;
    };
    return Object.assign(parser, {
      isComplete: complete,
      fork: vi.fn(() => {
        if (!parser.isComplete) throw new Error("Incomplete demo");
        return makeParser(true);
      }),
    });
  }
  const parser = makeParser(false);
  const stream = new DemoStreamAdapter(parser, { checkpoints: false });
  stream.setPlayerPredictionEnabled(false);
  stream.reset();
  return { stream, parser, forkedBlocks };
}

function aimObservation(bin: number, pyaw: number, tick: number) {
  return update({
    ...pose(tick),
    rotationZ: bin * PACKED_BODY_YAW_STEP,
    headX: -1 / 63,
    headZ: -1 / 63,
    targetId: 32,
    move: { ...neutral, pyaw },
    allowWarp: true,
  });
}

function batchedAimBlocks() {
  // A slow turn where two ordered observations arrive together, taken from
  // the yaw samples around 4:12.736 of Mistcane's S5-Massive replay.
  const samples: [bin: number, pyaw: number][][] = [
    [[120, 440]],
    [],
    [[121, 183]],
    [[121, 14]],
    [[121, 95]],
    [[121, 176]],
    [[121, 190]],
    [
      [122, 190],
      [123, 168],
    ],
  ];
  return samples.flatMap((observations, i) => [
    ...observations.map(([bin, pyaw]) =>
      packet([aimObservation(bin, pyaw, i + 1)]),
    ),
    move(),
  ]);
}

/** Decoded parser blocks exercise the production adapter, without asset/network IO. */
function demo(
  blocks: unknown[],
  control = false,
  prediction = true,
  moves: MoveData[] = [],
  lastClientMove = 0,
  fromConnect = false,
  firstMoveIndex = 0,
) {
  let packetDataBlocks: Map<number, unknown> | undefined;
  const packetParser = {
    protocolRejected: 0,
    protocolNoDispatch: 0,
    getDataBlockDataMap: () => packetDataBlocks,
  };
  const parser = fakeDemoParser({
    blocks,
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
      lastMoveAck: firstMoveIndex,
      lastClientMove,
      firstMoveIndex,
      moves,
    },
    ghostClasses: (classId) =>
      ["", "Player", "TerrainBlock", "InteriorInstance"][classId],
    packetParser,
    decompressedByteLength: blocks.length + 1,
    onBlock: (block) => {
      const { discarded } = (block ?? {}) as {
        discarded?: "rejected" | "noDispatch";
      };
      if (discarded === "rejected") packetParser.protocolRejected++;
      if (discarded === "noDispatch") packetParser.protocolNoDispatch++;
    },
  });
  if (fromConnect) {
    const initial = parser.initialBlock;
    packetDataBlocks = new Map(
      [...initial.dataBlocks].map(([id, block]) => [id, block.data]),
    );
    blocks.unshift(packet(initial.initialGhosts));
    initial.dataBlocks.clear();
    initial.initialGhosts = [];
    initial.controlObjectGhostIndex = -1;
    initial.controlObjectData = undefined;
  }
  const stream = createRecordingFromParser(parser).streamingPlayback;
  stream.setPlayerPredictionEnabled?.(prediction);
  stream.reset();
  return stream;
}

it.each([false, true])(
  "recovers from an impossible input backlog without guessing recorder origin (empty start: %s)",
  (fromConnect) => {
    const make = () => {
      const blocks: unknown[] = [];
      for (let tick = 0; tick < DEMO_CHECKPOINT_TICKS + 20; tick++) {
        if (tick % 5 === 0)
          blocks.push(
            packet([], {
              lastMoveAck: 0,
              controlObjectGhostIndex: 0,
              controlObjectData: { ...pose(tick), energyLevel: 90 },
            }),
          );
        blocks.push(move());
      }
      return demo(blocks, true, true, [], 0, fromConnect);
    };
    const tick = vi.spyOn(PlayerPrediction.prototype, "processTick");
    const stream = make();
    const end = DEMO_CHECKPOINT_TICKS + 19;
    stream.stepToTime(atTick(50));
    tick.mockClear();
    const result = stream.stepToTime(atTick(end));
    expect(tick).toHaveBeenCalledTimes(end - 50);
    // The received velocity still advances between corrections, even though
    // lastMoveAck stays at zero for the entire observer recording.
    expect(result.entities[0].position?.[0]).toBe(end - 2);
    const checkpoint = (stream as DemoStreamAdapter).captureCheckpoint();
    expect(checkpoint.simulation.state.pendingPlayerMoves).toEqual([]);
    expect(checkpoint.simulation.state.controlMovesAvailable).toBe(false);

    const restored = stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 3));
    const expected = make().stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 3));
    expect(restored.entities[0].position).toEqual(
      expected.entities[0].position,
    );
    expect(restored.entities[0].playerDelta).toEqual(
      expected.entities[0].playerDelta,
    );
    stream.stepToTime(atTick(20));
    expect(
      (stream as DemoStreamAdapter).captureCheckpoint().simulation.state
        .controlMovesAvailable,
    ).toBe(true);
    expect(stream.stepToTime(atTick(end)).entities[0].position).toEqual(
      result.entities[0].position,
    );
  },
);

it.each([
  [true, true],
  [true, false],
  [false, true],
  [false, false],
])(
  "validates 46 pending inputs independently of control=%s and prediction=%s",
  (control, prediction) => {
    const stream = demo(
      Array.from({ length: 47 }, move),
      control,
      prediction,
    ) as DemoStreamAdapter;
    stream.stepToTime(atTick(46));
    const valid = stream.captureCheckpoint().simulation.state;
    expect(valid.controlMovesAvailable).toBe(true);
    expect(valid.pendingPlayerMoves).toHaveLength(
      control && prediction ? 46 : 0,
    );
    stream.stepToTime(atTick(47));
    const invalid = stream.captureCheckpoint().simulation.state;
    expect(invalid.controlMovesAvailable).toBe(false);
    expect(invalid.pendingPlayerMoves).toHaveLength(0);
  },
);

it.each([
  [false, true],
  [false, false],
  [true, true],
  [true, false],
])(
  "marks a view quantized only when a ghost update packed it (control=%s, prediction=%s)",
  (control, prediction) => {
    // The recorder's control data follows its own ghost update in a packet.
    const stream = demo(
      [
        packet(
          [update(pose(1))],
          control
            ? {
                controlObjectGhostIndex: 0,
                controlObjectData: { ...pose(1), energyLevel: 90 },
              }
            : {},
        ),
        move(),
      ],
      control,
      prediction,
    );
    expect(stream.stepToTime(atTick(1)).entities[0].viewQuantized).toBe(
      !control,
    );
  },
);

function tickView(entity: StreamEntity): PlayerTickView {
  const {
    rotation,
    headPitch,
    headYaw,
    damageState,
    viewQuantized,
    reconstructedAim,
    mountObjectId,
    mountNode,
  } = entity;
  return {
    rotation,
    headPitch,
    headYaw,
    damageState,
    viewQuantized,
    reconstructedAim,
    mountObjectId,
    mountNode,
  };
}

it.each([false, true])(
  "retains the immediately previous tick's aim through packet corrections and skipped render ticks (prediction=%s)",
  (prediction) => {
    const blocks = Array.from({ length: 4 }, (_, tick) => [
      packet([
        update({
          ...pose(tick),
          rotationZ: tick * 0.2,
          headX: tick * 0.1,
          headZ: tick * 0.05,
        }),
      ]),
      move(),
    ]).flat();
    const stream = demo(blocks, false, prediction);
    const first = stream.stepToTime(atTick(1));
    const reference = demo(blocks, false, prediction).stepToTime(atTick(3))
      .entities[0];
    const fourth = stream.stepToTime(atTick(4));
    const player = fourth.entities[0];
    const previous = fourth.previousPlayerViews!.get(player.id)!;
    expect(previous).toEqual(tickView(reference));
    expect(previous.rotation).not.toBe(reference.rotation);
    expect(previous).not.toEqual(tickView(first.entities[0]));
    expect(stream.stepToTime(atTick(5)).previousPlayerViews).toBe(
      fourth.previousPlayerViews,
    );
    const rewound = stream.stepToTime(atTick(2));
    expect(rewound.entities[0].id).not.toBe(player.id);
    expect(rewound.previousPlayerViews!.get(rewound.entities[0].id)).toEqual(
      tickView(first.entities[0]),
    );
    expect(fourth.previousPlayerViews!.get(player.id)).toEqual(previous);
    stream.reset();
    expect(stream.getSnapshot().previousPlayerViews).toBeUndefined();
  },
);

it.each([false, true])(
  "does not carry aim across player ghost-slot reuse (explicit delete: %s)",
  (deleteOldBody) => {
    const angles = { headX: -1 / 63, headZ: -1 / 63 };
    const player = { ...pose(0), ...angles, targetId: 32, dataBlockId: 1 };
    const stream = demo(
      [
        packet([update(player)]),
        move(),
        packet([update({ ...player, move: { ...neutral, pyaw: 64 } })]),
        move(),
        packet([
          ...(deleteOldBody
            ? [update({ damageState: 1 }), { index: 0, type: "delete" }]
            : []),
          { ...update(player), type: "create" },
        ]),
        move(),
      ],
      false,
      false,
    );
    const before = stream.stepToTime(atTick(2)).entities[0];
    const after = stream.stepToTime(atTick(3));
    const respawned = after.entities[0];
    const center = PACKED_BODY_YAW_STEP / 2;
    expect(before.reconstructedAim?.bodyYaw).toBeGreaterThan(center);
    expect(respawned.targetId).toBe(before.targetId);
    expect(respawned.id).not.toBe(before.id);
    expect(after.previousPlayerViews!.has(respawned.id)).toBe(false);
    expect(respawned.reconstructedAim?.bodyYaw).toBeCloseTo(center, 12);
  },
);

it("reconstructs a sub-step turn once per tick without changing the entity pose", () => {
  const level = -1 / 63;
  const packed = { ...pose(1), headX: level, headZ: level };
  const turn = packet([
    update({ ...packed, move: { ...neutral, pyaw: 64, ppitch: 32 } }),
  ]);
  const stream = demo(
    [packet([update(packed)]), move(), turn, turn, move()],
    false,
    false,
  );
  const first = stream.stepToTime(atTick(1)).entities[0];
  const second = stream.stepToTime(atTick(2));
  const player = second.entities[0];
  const delta = (2 * Math.PI) / 65536;
  expect(first.reconstructedAim?.bodyYaw).toBeCloseTo(
    PACKED_BODY_YAW_STEP / 2,
    12,
  );
  expect(player.reconstructedAim?.bodyYaw).toBeCloseTo(
    PACKED_BODY_YAW_STEP / 2 + 64 * delta,
    12,
  );
  expect(player.reconstructedAim?.pitch).toBeCloseTo(32 * delta, 12);
  expect(second.previousPlayerViews?.get(player.id)?.reconstructedAim).toEqual(
    first.reconstructedAim,
  );
  expect(player.rotation).toEqual(first.rotation);
  expect(player.headPitch).toBe(first.headPitch);
  expect(player.position).toEqual(first.position);
});

it("fits ordered ghost updates without advancing the playback parser or world", () => {
  const throughBurst = batchedAimBlocks();
  const futurePacket = packet([
    { ...aimObservation(123, 110, 9), index: 1, type: "create" },
  ]);
  const laterPacket = packet([aimObservation(123, 73, 11)]);
  const { stream, parser, forkedBlocks } = forkableAimDemo([
    ...throughBurst,
    futurePacket,
    move(),
    move(),
    laterPacket,
    move(),
  ]);
  const snapshot = stream.stepToTime(atTick(8));
  const body = snapshot.entities[0];
  const baselinePrevious = snapshot.previousPlayerViews!.get(body.id)!;
  const fit = stream.getPlayerAim(body.id)!;
  const baselineTurn =
    body.reconstructedAim!.bodyYaw - baselinePrevious.reconstructedAim!.bodyYaw;
  const fittedTurn = fit.current.bodyYaw - fit.previous.bodyYaw;
  expect(fittedTurn).toBeGreaterThan(0);
  expect(fittedTurn).toBeLessThan(baselineTurn - Math.PI / 450);
  expect(parser.blockCursor).toBe(throughBurst.length);
  expect(snapshot.entities).toEqual([body]);
  expect(stream.getSnapshot()).toBe(snapshot);
  expect(body.position?.[0]).toBe(8);
  expect(forkedBlocks).toContain(futurePacket);
  expect(forkedBlocks).not.toContain(laterPacket);
  expect(stream.stepToTime(atTick(9)).entities).toHaveLength(2);
  expect(stream.getPlayerAim(body.id)?.previous).toEqual(fit.current);
});

it("uses nearby received angles on both sides of a short gap only with a complete demo", () => {
  const blocks = [
    packet([aimObservation(5, 200, 1)]),
    move(),
    packet([aimObservation(6, 200, 2)]),
    move(),
    move(),
    packet([aimObservation(7, 200, 4)]),
    move(),
    packet([aimObservation(7, 200, 5)]),
    move(),
  ];
  const { stream, parser } = forkableAimDemo(blocks);
  const snapshot = stream.stepToTime(atTick(3));
  const body = snapshot.entities[0];
  const previous = snapshot.previousPlayerViews!.get(body.id)!;
  expect(body.reconstructedAim).toBe(previous.reconstructedAim);
  const fit = stream.getPlayerAim(body.id)!;
  expect(fit.current.bodyYaw).toBeGreaterThan(fit.previous.bodyYaw);
  expect(fit.current.bodyYaw).toBeLessThan(8 * PACKED_BODY_YAW_STEP);
  expect(parser.blockCursor).toBe(5);

  stream.stepToTime(atTick(5));
  const rewound = stream.stepToTime(atTick(3)).entities[0];
  expect(rewound.id).not.toBe(body.id);
  expect(stream.getPlayerAim(rewound.id)).toEqual(fit);

  const loading = forkableAimDemo(blocks, false);
  const loadingBody = loading.stream.stepToTime(atTick(3)).entities[0];
  expect(loadingBody.reconstructedAim).toBeDefined();
  expect(loading.stream.getPlayerAim(loadingBody.id)).toBeUndefined();
  expect(loading.parser.fork).not.toHaveBeenCalled();
});

it.each(["death", "new body", "scope-always body"] as const)(
  "cuts lookahead at a future %s before later angles in the same packet",
  (boundary) => {
    const blocks = batchedAimBlocks();
    const sample = aimObservation(124, 210, 9);
    const boundaryPacket = {
      death: packet([
        update({ damageState: 1 }),
        update({ ...sample.parsedData, damageState: 0 }),
      ]),
      "new body": packet([{ ...sample, type: "create" }]),
      "scope-always body": packetBlock({
        events: [
          {
            classId: 0,
            parsedData: {
              type: "GhostAlwaysObjectEvent",
              ghostIndex: 0,
              classId: 1,
              hasObjectData: true,
              objectData: sample.parsedData,
            },
          },
        ],
        ghosts: [sample],
      }),
    }[boundary];
    const before = forkableAimDemo([...blocks, move(), move()]).stream;
    const after = forkableAimDemo([
      ...blocks,
      boundaryPacket,
      move(),
      packet([aimObservation(124, 200, 10)]),
      move(),
    ]).stream;
    const beforeBody = before.stepToTime(atTick(8)).entities[0];
    const afterBody = after.stepToTime(atTick(8)).entities[0];
    expect(before.getPlayerAim(beforeBody.id)).toBeDefined();
    expect(after.getPlayerAim(afterBody.id)).toEqual(
      before.getPlayerAim(beforeBody.id),
    );

    const nextBody = after.stepToTime(atTick(9)).entities[0];
    const nextAim = after.getPlayerAim(nextBody.id);
    if (boundary === "death") {
      expect(nextBody.id).toBe(afterBody.id);
      expect(nextAim).toBeDefined();
      expect(nextAim?.previous).toEqual(nextAim?.current);
    } else {
      expect(nextBody.id).not.toBe(afterBody.id);
      expect(nextAim).toBeUndefined();
    }
  },
);

it("cuts every target's lookahead when ghosting ends", () => {
  const blocks = batchedAimBlocks();
  const { stream, parser } = forkableAimDemo([
    ...blocks,
    packetBlock({
      events: [
        {
          classId: 0,
          parsedData: {
            type: "GhostingMessageEvent",
            message: GhostMessage.EndGhosting,
          },
        },
      ],
    }),
    move(),
  ]);
  stream.stepToTime(atTick(8));
  const lookahead = new DemoAimLookahead();
  expect(lookahead.read(parser, 8, 0)).toEqual([
    { tick: 9, observations: [], cut: true },
  ]);
  expect(stream.stepToTime(atTick(9)).entities).toEqual([]);
});

it("reseeds aim endpoints after an imported checkpoint instead of retaining the prior world", async () => {
  const blocks = Array.from({ length: 6 }, (_, tick) => [
    packet([
      update({
        ...pose(tick),
        headX: -1 / 63,
        headZ: -1 / 63,
        move: { ...neutral, pyaw: 16 },
      }),
    ]),
    move(),
  ]).flat();
  const source = demo(blocks) as DemoStreamAdapter;
  const checkpoint = await source.captureCheckpointAt(3, async () => {});
  const expected = source.getSnapshot().entities[0];
  expect(expected.reconstructedAim).toBeDefined();
  const expectedNext = source.stepToTime(atTick(4)).entities[0];
  const restored = demo(blocks) as DemoStreamAdapter;
  restored.importCheckpoints([checkpoint]);
  const atCheckpoint = restored.stepToTime(atTick(3));
  expect(atCheckpoint.previousPlayerViews).toBeUndefined();
  const next = restored.stepToTime(atTick(4));
  expect(next.previousPlayerViews!.get(next.entities[0].id)).toEqual(
    tickView(expected),
  );
  expect(next.entities[0].reconstructedAim).toEqual(
    expectedNext.reconstructedAim,
  );
});

it("counts initial queued moves from their recorded index", () => {
  const stream = demo(
    Array.from({ length: 45 }, move),
    true,
    true,
    [neutral, neutral],
    1000,
    false,
    1000,
  ) as DemoStreamAdapter;
  stream.stepToTime(atTick(44));
  expect(
    stream.captureCheckpoint().simulation.state.controlMovesAvailable,
  ).toBe(true);
  stream.stepToTime(atTick(45));
  expect(
    stream.captureCheckpoint().simulation.state.controlMovesAvailable,
  ).toBe(false);
});

it("discards retained control input when recovering, including after subsequent corrections", () => {
  const turn = () => ({
    type: BlockTypeMove,
    parsed: {
      ...move().parsed,
      yaw: 0.01,
      trigger: [false, false, false, true],
    },
  });
  const { move: _move, ...correction } = pose(100);
  const stream = demo(
    [
      ...Array.from({ length: 47 }, turn),
      packet([], {
        controlObjectGhostIndex: 0,
        // Retail control corrections carry no Move; they cannot replace
        // the predictor's retained input after we reject the recording queue.
        controlObjectData: { ...correction, rotationZ: 0.7, energyLevel: 90 },
      }),
      turn(),
    ],
    true,
  );
  const before = stream.stepToTime(atTick(46));
  const recovered = stream.stepToTime(atTick(47));
  expect(recovered.camera?.yaw).toBeCloseTo(before.camera!.yaw!);
  expect(recovered.entities[0].jetting).toBe(false);
  const corrected = stream.stepToTime(atTick(48));
  expect(corrected.camera?.yaw).toBeCloseTo(0.7);
  expect(corrected.entities[0].position?.[0]).toBe(100.5);
});

it("keeps real input replay in an empty-start recording whose server acknowledges moves", () => {
  const blocks: unknown[] = [];
  for (let tick = 0; tick < 100; tick++) {
    if (tick % 5 === 0)
      blocks.push(
        packet([], {
          lastMoveAck: Math.max(0, tick - 2),
          controlObjectGhostIndex: 0,
          controlObjectData: { ...pose(tick), energyLevel: 90 },
        }),
      );
    blocks.push(move());
  }
  const stream = demo(blocks, false, true, [], 0, true) as DemoStreamAdapter;
  stream.stepToTime(atTick(100));
  const state = stream.captureCheckpoint().simulation.state;
  expect(state.controlMovesAvailable).toBe(true);
  expect(state.pendingPlayerMoves).toHaveLength(7);
});

afterEach(() => {
  vi.restoreAllMocks();
  clearWorldColliders();
  setTerrainCollisionData(null);
});

it("restores imported checkpoints at arbitrary ticks and keeps them through renderer reset", async () => {
  const blocks = Array.from({ length: 1100 }, move);
  const source = demo(blocks) as DemoStreamAdapter;
  const checkpoint = await source.captureCheckpointAt(937, async () => {});
  const restored = demo(blocks, false, false) as DemoStreamAdapter;
  restored.importCheckpoints(structuredClone([checkpoint]));
  expect(restored.checkpointTicks).not.toContain(937);
  restored.setPlayerPredictionEnabled(true);
  restored.reset();
  expect(restored.checkpointTicks).toContain(937);
  const actual = restored.stepToTime(atTick(968)).entities[0];
  const expected = demo(blocks).stepToTime(atTick(968)).entities[0];
  expect(restored.lastStepStartTimeSec).toBe(937 * 0.032);
  const { id: _actualId, ...actualState } = actual;
  const { id: _expectedId, ...expectedState } = expected;
  expect(actualState).toEqual(expectedState);
});

it("replays the current tick with changed interpolation settings", () => {
  const blocks = [
    move(),
    packet([update({ ...pose(12), allowWarp: true })]),
    move(),
    move(),
  ];
  const stream = demo(blocks) as DemoStreamAdapter;
  const baseline = stream.stepToTime(atTick(2));
  expect(baseline.entities[0].position?.[0]).toBeLessThan(12);

  const custom = { ...DEFAULT_PLAYER_INTERPOLATION, maxWarpTicks: 1 };
  stream.setPlayerInterpolation(custom);
  expect(stream.needsReplay).toBe(true);
  const updated = stream.stepToTime(atTick(2));
  expect(updated.timeSec).toBe(baseline.timeSec);
  expect(updated.entities[0].position?.[0]).toBe(12);
  expect(stream.needsReplay).toBe(false);

  stream.setPlayerInterpolation({ ...custom });
  expect(stream.needsReplay).toBe(false);
  expect(stream.stepToTime(atTick(2))).toBe(updated);
});

it.each([
  { headerRtt: 130, scorePing: undefined, maxLatencyTicks: 2, x: 13.5 },
  { headerRtt: 130, scorePing: 16, maxLatencyTicks: 2, x: 13.5 },
  { headerRtt: 0, scorePing: undefined, maxLatencyTicks: 2, x: 12 },
  { headerRtt: 130, scorePing: undefined, maxLatencyTicks: 0.5, x: 12 },
  { headerRtt: 130, scorePing: undefined, maxLatencyTicks: 1.5, x: 13 },
])(
  "uses RTT $headerRtt and cap $maxLatencyTicks independently of scoreboard ping $scorePing",
  ({ headerRtt, scorePing, maxLatencyTicks, x }) => {
    const recorderMessages =
      scorePing === undefined
        ? []
        : [
            packetBlock(
              serverMessagePacket(["MsgClientJoin", "", "Recorder", "17"]),
            ),
            packetBlock(
              serverMessagePacket([
                "MsgPlayerScore",
                "",
                "17",
                "0",
                String(scorePing),
              ]),
            ),
          ];
    const parser = fakeDemoParser({
      blocks: [
        move(),
        ...recorderMessages,
        packet([update({ ...pose(12), allowWarp: true })]),
        move(),
      ],
      ghostClasses: "Player",
      initialBlock: {
        roundTripTime: headerRtt,
        demoValues: ["readplayerinfo", "1\t17\tRecorder"],
        dataBlocks: new Map([[1, { className: "PlayerData", data: armor }]]),
        initialGhosts: [
          { ...update({ ...pose(0), dataBlockId: 1 }), type: "create" },
        ],
      },
    });
    const stream = new DemoStreamAdapter(parser, { checkpoints: false });
    stream.setPlayerPredictionEnabled(true);
    stream.setPlayerInterpolation({
      ...DEFAULT_PLAYER_INTERPOLATION,
      maxLatencyTicks,
      maxWarpTicks: 1,
    });
    stream.reset();
    expect(stream.stepToTime(atTick(2)).entities[0].position?.[0]).toBe(x);
  },
);

it("checkpoints pending sends and uses accepted acknowledgments across a wire sequence wrap", async () => {
  const settings = { ...DEFAULT_PLAYER_INTERPOLATION, maxLatencyTicks: 4 };
  function replay(interpolation = settings) {
    const packets = {
      protocolRejected: 0,
      protocolNoDispatch: 0,
      getDataBlockDataMap: () => undefined,
    };
    const acknowledgment = (
      highestAck: number,
      ackMask: number,
      gate: string,
    ) => {
      const block = packetBlock();
      return {
        ...block,
        parsed: { ...block.parsed, dnetHeader: { highestAck, ackMask } },
        gate,
      };
    };
    const parser = fakeDemoParser({
      blocks: [
        { type: BlockTypeSendPacket },
        move(),
        { type: BlockTypeSendPacket },
        move(),
        acknowledgment(0, 3, "reject"),
        move(),
        acknowledgment(0, 1, "ackOnly"),
        acknowledgment(0, 1, "ackOnly"),
        move(),
        { type: BlockTypeSendPacket },
        move(),
        acknowledgment(1, 1, "ackOnly"),
        move(),
      ],
      decompressedByteLength: 16,
      packetParser: packets,
      initialBlock: {
        roundTripTime: 128,
        connectionState: { lastSendSeq: 510, highestAckedSeq: 510 },
      },
      onBlock: (block) => {
        const gate = (block as { gate?: string } | undefined)?.gate;
        if (gate === "reject") packets.protocolRejected++;
        if (gate === "ackOnly") packets.protocolNoDispatch++;
      },
    });
    const stream = new DemoStreamAdapter(parser, { checkpoints: false });
    stream.setPlayerPredictionEnabled(true);
    stream.setPlayerInterpolation(interpolation);
    stream.reset();
    return stream;
  }
  const source = replay(RETAIL_PLAYER_INTERPOLATION);
  const checkpoint = await source.captureCheckpointAt(2, async () => {});
  source.stepToTime(atTick(4));
  const latency = source.captureCheckpoint().cursor.latency;
  // Seq 511 was dropped. Seq 512 was sent at tick 1, acknowledged at tick 3.
  expect(latency?.roundTripMs).toBe((128 + 2 * 32) / 2);
  const viewer = replay();
  viewer.importCheckpoints([checkpoint]);
  viewer.stepToTime(atTick(4));
  expect(viewer.lastStepStartTimeSec).toBeCloseTo(atTick(2));
  expect(viewer.captureCheckpoint().cursor.latency).toEqual(latency);

  // v22 has the decoder's sequence window but no send timestamps. Seeking
  // back must drop later sends and start measuring from the restored window.
  viewer.stepToTime(atTick(6));
  const legacy = structuredClone(checkpoint);
  delete legacy.cursor.latency;
  legacy.parser.packetState = {
    ...legacy.parser.packetState,
    lastSendSeq: 512,
    highestAckedSeq: 510,
  };
  viewer.importCheckpoints([legacy]);
  viewer.stepToTime(atTick(2));
  expect(viewer.captureCheckpoint().cursor.latency).toEqual({
    roundTripMs: 128,
    lastSend: 512,
    lastAck: 510,
    sendTicks: Array(32).fill(null),
  });
  viewer.stepToTime(atTick(6));
  expect(viewer.captureCheckpoint().cursor.latency).toMatchObject({
    lastSend: 513,
    lastAck: 513,
    roundTripMs: (128 + 32) / 2,
  });
});
it("reuses a stock pose across clip and viewer settings, then processes movement with the active settings", async () => {
  const blocks = [
    move(),
    packet([update({ ...pose(12), allowWarp: true })]),
    move(),
    move(),
    packet([update({ ...pose(40), allowWarp: true })]),
    move(),
  ];
  const source = demo(blocks) as DemoStreamAdapter;
  source.setPlayerInterpolation(RETAIL_PLAYER_INTERPOLATION);
  source.reset();
  const checkpoint = await source.captureCheckpointAt(2, async () => {});
  const stockX = source.getSnapshot().entities[0].position![0];
  expect(stockX).toBeLessThan(12);

  const viewer = demo(blocks) as DemoStreamAdapter;
  viewer.importCheckpoints([checkpoint]);
  const settings = { ...DEFAULT_PLAYER_INTERPOLATION, maxWarpTicks: 1 };
  const releaseFirst = viewer.holdPlayerInterpolation(settings);
  const releaseSecond = viewer.holdPlayerInterpolation(settings);
  const xAt = (tick: number) =>
    viewer.stepToTime(atTick(tick)).entities[0].position![0];
  expect(xAt(2)).toBe(stockX);
  expect(viewer.lastStepStartTimeSec).toBeCloseTo(atTick(2));
  expect(xAt(3)).toBeCloseTo(12); // Complete the pending warp in one tick.
  expect(xAt(4)).toBe(40);
  releaseFirst();
  releaseFirst();
  expect(viewer.needsReplay).toBe(false);
  releaseSecond();
  expect(viewer.checkpointTicks).toEqual([2]);
  expect(xAt(2)).toBe(stockX);
  expect(xAt(4)).toBeLessThan(40); // Viewer default allows a two-tick warp.
});

it.each([0, 2, 40])(
  "resumes a shared pose with a %i-tick prediction budget, accounting for ticks already spent",
  async (limit) => {
    const blocks = Array.from({ length: 45 }, move);
    const source = demo(blocks) as DemoStreamAdapter;
    const checkpoint = await source.captureCheckpointAt(3, async () => {});
    const viewer = demo(blocks) as DemoStreamAdapter;
    viewer.setPlayerInterpolation({
      ...DEFAULT_PLAYER_INTERPOLATION,
      maxPredictionTicks: limit,
    });
    viewer.importCheckpoints([checkpoint]);
    const xAt = (tick: number) =>
      viewer.stepToTime(atTick(tick)).entities[0].position![0];
    const start = xAt(3);
    if (limit <= 3) {
      expect(xAt(4)).toBe(start);
    } else {
      const previous = xAt(limit - 1);
      expect(previous).toBeGreaterThan(start);
      const last = xAt(limit);
      expect(last).toBeGreaterThan(previous);
      expect(xAt(limit + 1)).toBe(last);
    }
  },
);

it("waits for a restored map's collision geometry before advancing from its checkpoint", async () => {
  const blocks = [
    packet([{ index: 1, type: "create", classId: 2, parsedData: {} }]),
    ...Array.from({ length: 1200 }, move),
  ];
  const terrain = {
    heightMap: new Uint16Array(256 * 256).fill(3200),
    squareSize: 8,
  };
  const source = demo(blocks) as DemoStreamAdapter;
  setTerrainCollisionData(terrain);
  const checkpoint = await source.captureCheckpointAt(900, async () => {});
  // Geometry from the previously mounted map must not satisfy the gate.
  const restored = demo(blocks) as DemoStreamAdapter;
  restored.importCheckpoints([checkpoint]);
  expect(restored.stepToTime(atTick(1100)).timeSec).toBe(900 * 0.032);
  expect(restored.canStartSeek).toBe(false);
  expect(restored.seekSceneSnapshot?.timeSec).toBe(900 * 0.032);
  expect(restored.stepToTime(atTick(1100)).timeSec).toBe(900 * 0.032);
  setTerrainCollisionData(terrain);
  expect(restored.canStartSeek).toBe(true);
  expect(restored.stepToTime(atTick(1100)).timeSec).toBe(1100 * 0.032);
  expect(restored.needsReplay).toBe(false);
});

it("rejects an invalid import without retaining any partial checkpoints", async () => {
  const blocks = Array.from({ length: 1100 }, move);
  const source = demo(blocks) as DemoStreamAdapter;
  const first = await source.captureCheckpointAt(900, async () => {});
  const invalid = await source.captureCheckpointAt(950, async () => {});
  invalid.parser.blockStreamOffset = NaN;
  const restored = demo(blocks) as DemoStreamAdapter;
  expect(() => restored.importCheckpoints([first, invalid])).toThrow(
    "Invalid seek checkpoint",
  );
  expect(restored.checkpointTicks).toEqual([]);
});

type CheckpointConn = Record<string, unknown> & {
  targets: Record<string, unknown>;
};
it.each<[string, (state: { conn?: CheckpointConn }) => void]>([
  ["no connection state", (state) => delete state.conn],
  ["an unknown connection field", (state) => (state.conn!.extra = 1)],
  [
    "a missing target table",
    (state) => delete state.conn!.targets.pendingSkinPrefTags,
  ],
])("rejects a checkpoint with %s", async (_shape, mutate) => {
  const blocks = Array.from({ length: 1100 }, move);
  const checkpoint = await (
    demo(blocks) as DemoStreamAdapter
  ).captureCheckpointAt(900, async () => {});
  mutate(checkpoint.simulation.state as unknown as { conn?: CheckpointConn });
  const restored = demo(blocks) as DemoStreamAdapter;
  expect(() => restored.importCheckpoints([checkpoint])).toThrow(
    "Invalid seek checkpoint",
  );
  expect(restored.checkpointTicks).toEqual([]);
});

describe("demo player tick prediction", () => {
  it.each([2, 3])(
    "allows a seek after collision asset class %s fails without predicting through missing geometry",
    (classId) => {
      const stream = demo([
        packet([{ index: 1, type: "create", classId, parsedData: {} }]),
        ...Array.from({ length: 25 }, move),
      ]);
      stream.stepToTime(0.032);
      expect(stream.canStartSeek).toBe(false);
      const clearFailure = registerCollisionLoadFailure(1);
      expect(stream.canStartSeek).toBe(true);
      expect(stream.needsReplay).toBe(false);
      expect(stream.stepToTime(0.64).entities[0].position).toEqual([0, 0, 100]);
      clearFailure();
      expect(stream.canStartSeek).toBe(false);
    },
  );

  it("keeps waiting for other assets and does not clear a replacement failure", () => {
    const stream = demo([
      packet([
        { index: 1, type: "create", classId: 2, parsedData: {} },
        { index: 2, type: "create", classId: 3, parsedData: {} },
      ]),
      move(),
    ]);
    stream.stepToTime(0.032);
    const clearTerrainFailure = registerCollisionLoadFailure(1);
    expect(stream.canStartSeek).toBe(false);
    const clearInteriorFailure = registerCollisionLoadFailure(2);
    expect(stream.canStartSeek).toBe(true);
    const clearReplacement = registerCollisionLoadFailure(1);
    clearTerrainFailure();
    expect(stream.canStartSeek).toBe(true);
    clearReplacement();
    clearInteriorFailure();
    expect(stream.canStartSeek).toBe(false);
  });

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
    // After the startup repair, hiding or remounting geometry must not block
    // subsequent seeks: there is no longer a collision replay to wait for.
    setTerrainCollisionData(null);
    expect(stream.canStartSeek).toBe(true);
  });

  it("repairs prediction again if interpolation changes during a collision remount", () => {
    const blocks = [
      packet([{ index: 1, type: "create", classId: 2, parsedData: {} }]),
      ...Array.from({ length: 8 }, move),
    ];
    const terrain = {
      heightMap: new Uint16Array(256 * 256).fill(3200),
      squareSize: 8,
    };
    const stream = demo(blocks) as DemoStreamAdapter;
    const time = atTick(8);
    stream.stepToTime(time);
    setTerrainCollisionData(terrain);
    const baseline = stream.stepToTime(time).entities[0];

    setTerrainCollisionData(null);
    expect(stream.canStartSeek).toBe(true);
    const settings = { ...DEFAULT_PLAYER_INTERPOLATION, maxPredictionTicks: 2 };
    stream.setPlayerInterpolation(settings);
    expect(stream.canStartSeek).toBe(false);

    // A failed mount lets the seek complete on recorded poses until a retry.
    const clearFailure = registerCollisionLoadFailure(1);
    expect(stream.canStartSeek).toBe(true);
    const withoutCollision = stream.stepToTime(time).entities[0];
    expect(withoutCollision.playerDelta).toBeUndefined();
    clearFailure();
    setTerrainCollisionData(terrain);
    expect(stream.needsReplay).toBe(true);

    const repaired = stream.stepToTime(time).entities[0];
    const warm = demo(blocks) as DemoStreamAdapter;
    warm.setPlayerInterpolation(settings);
    const expected = warm.stepToTime(time).entities[0];
    expect(repaired.position).toEqual(expected.position);
    expect(repaired.playerDelta).toEqual(expected.playerDelta);
    expect(repaired.position).not.toEqual(baseline.position);
    expect(repaired.position).not.toEqual(withoutCollision.position);
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

it("rebuilds provisional checkpoints once collision assets arrive", () => {
  const blocks = [
    packet([{ index: 1, type: "create", classId: 2, parsedData: {} }]),
    ...Array.from({ length: DEMO_CHECKPOINT_TICKS * 2 + 10 }, move),
  ];
  const stream = demo(blocks);
  const cold = stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 2)).entities[0];
  expect(stream.checkpointTicks).toEqual([
    DEMO_CHECKPOINT_TICKS,
    DEMO_CHECKPOINT_TICKS * 2,
  ]);
  expect(cold.position).toEqual([0, 0, 100]);
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256).fill(3200),
    squareSize: 8,
  });
  expect(stream.needsReplay).toBe(true);
  stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS * 2));
  expect(stream.needsReplay).toBe(false);
  const warm = demo(blocks);
  const restored = stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 1))
    .entities[0];
  const expected = warm.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 1))
    .entities[0];
  expect(restored.position).toEqual(expected.position);
  expect(restored.position).not.toEqual(cold.position);
  expect(restored.playerDelta).toEqual(expected.playerDelta);
  expect(restored.clientAnimation).toEqual(expected.clientAnimation);
});

it("resumes the control player's queued moves and packet corrections from checkpoints", () => {
  const blocks: unknown[] = [];
  for (let tick = 0; tick < DEMO_CHECKPOINT_TICKS + 20; tick++) {
    if (tick % 5 === 0)
      blocks.push(
        packet([], {
          lastMoveAck: Math.max(0, tick - 2),
          controlObjectGhostIndex: 0,
          controlObjectData: { ...pose(tick), energyLevel: 90 },
        }),
      );
    blocks.push(move());
  }
  const stream = demo(blocks, true);
  stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 19));
  const restored = stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 3));
  const expected = demo(blocks, true).stepToTime(
    atTick(DEMO_CHECKPOINT_TICKS + 3),
  );
  expect(restored.entities[0].position).toEqual(expected.entities[0].position);
  expect(restored.entities[0].playerDelta).toEqual(
    expected.entities[0].playerDelta,
  );
  expect(restored.camera?.controlEntityId).toBe(restored.entities[0].id);
  expect({ ...restored.camera, controlEntityId: undefined }).toEqual({
    ...expected.camera,
    controlEntityId: undefined,
  });
  const boundary = stream.stepToTime(atTick(DEMO_CHECKPOINT_TICKS));
  expect(boundary.camera?.controlEntityId).toBe(boundary.entities[0].id);
  expect(restored.status).toEqual(expected.status);
});

it("restores the contact grace period and its animation transition across seek checkpoints", () => {
  const createdAt = DEMO_CHECKPOINT_TICKS - 15;
  const endTick = DEMO_CHECKPOINT_TICKS + 40;
  const airbornePose = {
    ...pose(0),
    velocity: { x: 0, y: 10, z: 0 },
    moveFlag0: false,
  };
  const blocks: unknown[] = [];
  for (let tick = 0; tick < endTick; tick++) {
    if (tick === createdAt) {
      blocks.push(
        packet([
          { index: 0, type: "delete" },
          {
            index: 0,
            type: "create",
            classId: 1,
            parsedData: { ...airbornePose, dataBlockId: 1 },
          },
        ]),
      );
    } else if (tick > createdAt) {
      // Refresh velocity without resetting the client's contact history.
      blocks.push(packet([update({ ...airbornePose, allowWarp: false })]));
    }
    blocks.push(move());
  }
  const forward = demo(blocks);
  for (let tick = 1; tick <= endTick; tick++) forward.stepToTime(atTick(tick));
  const expected = forward.getSnapshot().entities[0].clientAnimation;
  expect(expected?.move).toMatchObject({
    animation: "root",
    timeSec: (createdAt + 30) * 0.032,
  });
  const seeking = demo(blocks);
  expect(
    seeking.stepToTime(atTick(endTick)).entities[0].clientAnimation,
  ).toEqual(expected);
  const backward = seeking.stepToTime(atTick(DEMO_CHECKPOINT_TICKS + 5));
  expect(backward.entities[0].clientAnimation?.move?.animation).toBe("run");
  expect(
    seeking.stepToTime(atTick(endTick)).entities[0].clientAnimation,
  ).toEqual(expected);
});

it.each(["play", "watch"] as const)(
  "matches demo ticks, interpolation and animation in live %s mode",
  (mode) => {
    class Live extends TestLiveStream {
      override getDataBlockData() {
        return armor;
      }
    }
    const live = new Live(mode, "Player");
    // Protocol hydration is covered by watchCatchup.spec. Here, decode identical
    // packet contents for both transports, then exercise their production ticks.
    (live as unknown as { hydratedEpoch: number }).hydratedEpoch = 1;
    const send = (block: ReturnType<typeof packet>) =>
      live.feedDecoded(block.parsed);
    send(
      packet([
        {
          index: 0,
          type: "create",
          classId: 1,
          parsedData: { ...pose(0), dataBlockId: 1 },
        },
      ]),
    );
    const packets = Array.from({ length: 70 }, (_, tick) =>
      tick % 5 === 0
        ? packet([
            update({
              ...pose(tick / 2),
              rotationZ: ((tick % 4) * Math.PI) / 2,
              allowWarp: tick % 10 === 0,
            }),
          ])
        : null,
    );
    const blocks = packets.flatMap((p) => (p ? [p, move()] : [move()]));
    const recorded = demo(blocks);
    const project = (entity: StreamEntity) => ({
      position: entity.position,
      rotation: entity.rotation,
      velocity: entity.velocity,
      playerDelta: entity.playerDelta,
      jetting: entity.jetting,
      falling: entity.falling,
      clientAnimation: entity.clientAnimation,
    });
    for (let tick = 0; tick < packets.length; tick++) {
      if (packets[tick]) send(packets[tick]!);
      expect(project(live.stepToTime(atTick(tick + 1)).entities[0])).toEqual(
        project(recorded.stepToTime(atTick(tick + 1)).entities[0]),
      );
    }
  },
);

it("uses the same control-move replay for live and recorded packets", () => {
  class Live extends TestLiveStream {
    override getDataBlockData() {
      return armor;
    }
    seed() {
      this.createGhost(0, 1, { ...pose(0), dataBlockId: 1 });
      this.processControlObject({
        controlObjectGhostIndex: 0,
        controlObjectData: { ...pose(0), energyLevel: 100 },
      });
      this.correctControlPlayer({ ...pose(0), energyLevel: 100 });
    }
  }
  const live = new Live("play", "Player");
  live.seed();
  const correction = packet([], {
    lastMoveAck: 1,
    controlObjectGhostIndex: 0,
    controlObjectData: { ...pose(10), energyLevel: 100 },
  });
  const recorded = demo([move(), move(), correction, move()], true);
  live.submitMove(move().parsed, 0);
  live.stepToTime(0.032);
  live.submitMove(move().parsed, 1);
  live.stepToTime(0.064);
  live.feedDecoded(correction.parsed);
  live.submitMove(move().parsed, 2);
  const expected = recorded.stepToTime(0.096);
  const actual = live.stepToTime(0.096);
  expect(actual.entities[0].position).toEqual(expected.entities[0].position);
  expect(actual.entities[0].position?.[0]).toBe(11);
  expect(actual.entities[0].playerDelta).toEqual(
    expected.entities[0].playerDelta,
  );
  expect(actual.camera?.position).toEqual(expected.camera?.position);
});

it.each(["rejected", "noDispatch"] as const)(
  "ignores recorded packets suppressed by ConnectionProtocol: %s",
  (discarded) => {
    const stream = demo(
      [
        move(),
        { ...packet([], { lastMoveAck: 50 }), discarded },
        packet([], {
          lastMoveAck: 0,
          controlObjectGhostIndex: 0,
          controlObjectData: { ...pose(10), energyLevel: 100 },
        }),
        move(),
        packet([], {
          lastMoveAck: 1,
          controlObjectGhostIndex: 0,
          controlObjectData: { ...pose(20), energyLevel: 100 },
        }),
        move(),
      ],
      true,
    );
    const result = stream.stepToTime(0.096);
    // The ignored packet must not advance the move index to 50: the real
    // ack=1 should remove move 0, replay move 1, then process move 2.
    expect(result.entities[0].position?.[0]).toBe(21);
  },
);

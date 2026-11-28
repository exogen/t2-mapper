import {
  BlockTypeMove,
  BlockTypePacket,
  type DemoBlock,
  type DemoParser,
  type PacketData,
  type ParsedData,
} from "t2-demo-parser";
import { expect, it, vi } from "vitest";
import { TargetTable } from "../../relay/connectionState";
import {
  collectDemoDatablockResources,
  DemoResourceLookahead,
  type DemoResourceHint,
} from "./demoResourceLookahead";

it("walks the observed weapon's projectile, explosion, and emitter dependencies", () => {
  const blocks = new Map<number, ParsedData>([
    [
      10,
      { shapeName: "mortar.dts", projectile: 11, states: [{ emitter: 13 }] },
    ],
    [
      11,
      {
        projectileShapeName: "shell.dts",
        explosion: 12,
        underwaterExplosion: 16,
      },
    ],
    [
      12,
      {
        dtsFileName: "mortar-explosion.dts",
        subExplosions: [12],
        shockwave: 17,
        emitters: [13],
      },
    ],
    [13, { particles: [null, 99, 14, 15] }],
    [14, { keys: [], textures: ["special/smoke", "special/smoke2"] }],
    [15, { textureName: "special/unused-smoke" }],
    [16, { dtsFileName: "underwater-explosion.dts" }],
    [17, { textureName: "special/shockwave" }],
  ]);
  const hints: DemoResourceHint[] = [];
  collectDemoDatablockResources(
    10,
    (id) => blocks.get(id),
    (hint) => hints.push(hint),
  );
  expect(hints).toEqual([
    { kind: "shape", name: "mortar.dts" },
    { kind: "shape", name: "shell.dts" },
    { kind: "shape", name: "mortar-explosion.dts" },
    { kind: "particleTexture", name: "special/shockwave" },
    { kind: "particleTexture", name: "special/smoke" },
    { kind: "shape", name: "underwater-explosion.dts" },
  ]);
});

it("uses the runtime flare, tracer, and beam texture fields", () => {
  const hints: DemoResourceHint[] = [];
  collectDemoDatablockResources(
    1,
    () => ({
      flareBaseTexture: "flare/base",
      flareModTexture: "flare/mod",
      tracerTex0: "tracer/main",
      tracerTex1: "tracer/cross",
      textures: ["beam/main", "beam/flare"],
    }),
    (hint) => hints.push(hint),
  );
  expect(hints).toEqual([
    { kind: "texture", name: "tracer/main" },
    { kind: "texture", name: "tracer/cross" },
    { kind: "texture", name: "flare/base" },
    { kind: "texture", name: "flare/mod" },
    { kind: "texture", name: "beam/main" },
    { kind: "texture", name: "beam/flare" },
  ]);
});

function mockScanner(
  blocks: (Pick<DemoBlock, "type" | "parsed" | "parseError"> & {
    skipDispatch?: boolean;
  })[],
  dataBlocks: Map<number, { data: ParsedData }>,
) {
  let forkCursor = 0;
  const protocol = {
    protocolRejected: 0,
    protocolNoDispatch: 0,
    getDataBlockDataMap: () => undefined,
  };
  const readBlock = vi.fn(() => {
    const block = blocks[forkCursor++];
    if (block?.skipDispatch) protocol.protocolNoDispatch++;
    return block;
  });
  const fork = {
    initialBlock: { dataBlocks },
    createCheckpoint: () => ({ owner: {} }),
    restoreCheckpoint: ({ blockCursor }: { blockCursor: number }) => {
      forkCursor = blockCursor;
    },
    nextBlock: readBlock,
    getPacketParser: () => protocol,
    getRegistry: () => ({
      getGhostParser: (id: number) => ({
        name: id === 2 ? "GrenadeProjectile" : "Player",
      }),
    }),
  };
  const source = {
    isComplete: false,
    fork: vi.fn(() => fork),
    createCheckpoint: () => ({ blockCursor: 0 }),
    nextBlock: vi.fn(),
  };
  const cursor = new DemoResourceLookahead();
  const parser = source as unknown as DemoParser;
  const netStrings = new Map([
    [41, "baseb"],
    [42, "custom"],
  ]);
  const seed = () => ({
    netStrings,
    targets: new TargetTable(netStrings),
    entities: [],
  });
  const read = (tick: number, target: number, input = parser) => {
    for (let i = 0; i < blocks.length; i++) {
      const result = cursor.read(input, tick, target, seed);
      if (result.complete) return result;
    }
    throw new Error("Lookahead did not finish");
  };
  return { source, read, readBlock };
}

const move = { type: BlockTypeMove };

function packet(fields: {
  events?: ParsedData[];
  ghosts?: Pick<
    PacketData["ghosts"][number],
    "type" | "index" | "classId" | "parsedData"
  >[];
}) {
  return {
    type: BlockTypePacket,
    parsed: {
      events: (fields.events ?? []).map((parsedData) => ({ parsedData })),
      ghosts: fields.ghosts ?? [],
    } as unknown as PacketData,
  };
}

it("looks ahead on an independent rolling cursor and detaches freed targets", () => {
  const { source, read, readBlock } = mockScanner(
    [
      packet({
        events: [{ type: "TargetInfoEvent", targetId: 4, skinTag: 41 }],
        ghosts: [
          {
            type: "create",
            index: 1,
            classId: 1,
            parsedData: {
              dataBlockId: 7,
              targetId: 4,
              images: [{ dataBlockId: 8 }],
            },
          },
        ],
      }),
      move,
      packet({
        events: [{ type: "TargetInfoEvent", targetId: 4, skinPrefTag: 42 }],
      }),
      move,
      packet({
        events: [
          { type: "TargetFreeEvent", targetId: 4 },
          { type: "TargetInfoEvent", targetId: 4, skinTag: 42 },
        ],
      }),
      move,
    ],
    new Map([
      [7, { data: { shapeName: "light.dts" } }],
      [8, { data: { shapeName: "spinfusor.dts" } }],
    ]),
  );
  expect(read(0, 1)).toEqual({
    hints: [],
    complete: true,
  });
  expect(source.fork).not.toHaveBeenCalled();
  source.isComplete = true;
  expect(read(0, 1)).toEqual({
    hints: [
      { kind: "shape", name: "light.dts" },
      { kind: "shape", name: "spinfusor.dts" },
      { kind: "playerSkin", shapeName: "light.dts", skinName: "baseb" },
    ],
    complete: true,
  });
  expect(read(1, 2)).toEqual({
    hints: [
      {
        kind: "playerSkin",
        shapeName: "light.dts",
        skinName: "baseb",
        skinPrefName: "custom",
      },
    ],
    complete: true,
  });
  expect(read(2, 3)).toEqual({ hints: [], complete: true });
  expect(source.nextBlock).not.toHaveBeenCalled();
  expect(source.fork).toHaveBeenCalledOnce();
  expect(readBlock).toHaveBeenCalledTimes(6);
});

it("filters a shortened window and orders hints by the next use", () => {
  const ghost = (dataBlockId: number) =>
    packet({
      ghosts: [
        { type: "create", index: 1, classId: 1, parsedData: { dataBlockId } },
      ],
    });
  const { source, read, readBlock } = mockScanner(
    [ghost(1), move, move, ghost(2), move, ghost(1), move],
    new Map([
      [1, { data: { shapeName: "first.dts" } }],
      [2, { data: { shapeName: "second.dts" } }],
    ]),
  );
  source.isComplete = true;
  const names = (tick: number, target: number) => read(tick, target).hints;
  expect(names(0, 4)).toEqual([
    { kind: "shape", name: "first.dts" },
    { kind: "shape", name: "second.dts" },
  ]);
  expect(read(0, 4)).toBe(read(0, 4));
  expect(names(1, 3)).toEqual([{ kind: "shape", name: "second.dts" }]);
  expect(names(1, 4)).toEqual([
    { kind: "shape", name: "second.dts" },
    { kind: "shape", name: "first.dts" },
  ]);
  const failedFork = {
    isComplete: true,
    fork() {
      throw new Error("Speculative fork failed");
    },
  } as unknown as DemoParser;
  expect(read(0, 4, failedFork)).toEqual({ hints: [], complete: true });
  expect(readBlock).toHaveBeenCalledTimes(7);
});

it("gives actual mortar trail and impact resources priority only inside their observed window", () => {
  const { source, read } = mockScanner(
    [
      packet({
        ghosts: [
          {
            type: "create",
            index: 1,
            classId: 1,
            parsedData: { images: [{ dataBlockId: 3 }] },
          },
        ],
      }),
      move,
      packet({
        ghosts: [
          {
            type: "create",
            index: 2,
            classId: 2,
            parsedData: { dataBlockId: 4 },
          },
        ],
      }),
      move,
    ],
    new Map([
      [3, { data: { projectile: 4 } }],
      [4, { data: { baseEmitter: 5, explosion: 6 } }],
      [5, { data: { particles: [7] } }],
      [6, { data: { dtsFileName: "mortar_explosion.dts" } }],
      [7, { data: { textures: ["special/Smoke/bigSmoke"] } }],
    ]),
  );
  source.isComplete = true;
  const smoke = { kind: "particleTexture", name: "special/Smoke/bigSmoke" };
  expect(read(0, 2).hints).toEqual([
    { kind: "shape", name: "mortar_explosion.dts" },
    { ...smoke, observedEffect: true },
    { kind: "effectShape", name: "mortar_explosion.dts", observedEffect: true },
  ]);
  expect(read(0, 1).hints).toEqual([
    { kind: "shape", name: "mortar_explosion.dts" },
    smoke,
  ]);
});

it("ignores non-dispatched packets and preserves completed hints on a fault", () => {
  const ghost = (dataBlockId: number) =>
    packet({
      ghosts: [
        { type: "create", index: 1, classId: 1, parsedData: { dataBlockId } },
      ],
    });
  const { source, read, readBlock } = mockScanner(
    [
      { ...ghost(1), skipDispatch: true },
      move,
      ghost(2),
      move,
      { ...ghost(3), parseError: "Malformed demo block" },
      move,
    ],
    new Map([
      [1, { data: { shapeName: "ignored.dts" } }],
      [2, { data: { shapeName: "accepted.dts" } }],
      [3, { data: { shapeName: "broken.dts" } }],
    ]),
  );
  source.isComplete = true;
  expect(read(0, 3)).toEqual({
    hints: [{ kind: "shape", name: "accepted.dts" }],
    complete: true,
  });
  expect(readBlock).toHaveBeenCalledTimes(5);
});

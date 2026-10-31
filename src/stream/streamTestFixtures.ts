import { vi } from "vitest";
import {
  BlockTypeMove,
  BlockTypePacket,
  type DemoParser,
  type GameState,
  type InitialBlockData,
  type PacketData,
  type PacketParser,
  type ParsedData,
} from "t2-demo-parser";
import { decodeCheckpoint, encodeCheckpoint } from "./checkpointCodec";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import type { MutableEntity } from "./StreamEngine";
import type { StreamEntity } from "./types";

/**
 * Ghost class names by class id, or one name for every class.
 */
export type GhostClasses = string | ((classId: number) => string | undefined);

/**
 * A parser registry that knows only ghost class names.
 */
export function ghostClassRegistry(classes: GhostClasses) {
  const nameOf = typeof classes === "string" ? () => classes : classes;
  return {
    getGhostParser(classId: number): { name: string } | undefined {
      const name = nameOf(classId);
      return name === undefined ? undefined : { name };
    },
    getEventParser(): { name: string } | undefined {
      return undefined;
    },
  };
}

/**
 * The parts of a decoded packet a spec sets; the rest stay empty.
 */
export interface DecodedPacketFields {
  gameState?: ParsedData | Partial<GameState>;
  events?: unknown[];
  ghosts?: unknown[];
  dnetHeader?: { packetType: number };
}

type EntityFields = Omit<MutableEntity, "spawnTick" | "rotation"> &
  Partial<Pick<MutableEntity, "spawnTick" | "rotation">>;

/**
 * A LiveStreamAdapter with no relay behind it, exposing the engine's
 * protected entry points to specs. Given `ghostClasses`, it names ghost
 * classes from those instead of the parser's class table.
 */
export class TestLiveStream extends LiveStreamAdapter {
  constructor(mode: "play" | "watch" = "watch", ghostClasses?: GhostClasses) {
    super({} as RelayClient, { mode });
    if (ghostClasses !== undefined)
      this.registry = ghostClassRegistry(ghostClasses);
  }

  event(parsedData: ParsedData): void {
    this.processEvent({ classId: 0, parsedData }, undefined);
  }

  command(funcName: string, ...args: string[]): void {
    this.event({ type: "RemoteCommandEvent", funcName, args });
  }

  message(...args: string[]): void {
    this.handleServerMessage(args);
  }

  ghost(update: {
    index: number;
    type: "create" | "update" | "delete";
    classId?: number;
    parsedData?: ParsedData;
  }): void {
    this.processGhostUpdate(update);
  }

  createGhost(index: number, classId: number, parsedData: ParsedData): void {
    this.ghost({ index, classId, type: "create", parsedData });
  }

  updateGhost(index: number, parsedData: ParsedData): void {
    this.ghost({ index, type: "update", parsedData });
  }

  entityAt(ghostIndex: number): StreamEntity | undefined {
    return this.buildEntityList().find(
      (entity) => entity.ghostIndex === ghostIndex,
    );
  }

  /**
   * Registers an entity under its ghost index as a ghost create does: a new
   * lifetime that replaces whatever held the index.
   */
  addEntity(fields: EntityFields): MutableEntity {
    const entity: MutableEntity = {
      spawnTick: 0,
      rotation: [0, 0, 0, 1],
      ...fields,
    };
    const previous = this.entityIdByGhostIndex.get(entity.ghostIndex);
    if (previous) this.entities.delete(previous);
    this.entities.set(entity.id, entity);
    this.entityIdByGhostIndex.set(entity.ghostIndex, entity.id);
    return entity;
  }

  checkpoint() {
    return this.captureSimulationState();
  }

  restore(checkpoint: ReturnType<TestLiveStream["checkpoint"]>): void {
    this.restoreSimulationState(checkpoint);
  }

  /**
   * Restores a checkpoint of the current state through its serialized form.
   */
  roundTripCheckpoint(): void {
    const saved = this.captureSimulationState();
    this.restoreSimulationState(
      decodeCheckpoint(encodeCheckpoint(saved)) as typeof saved,
    );
  }

  /**
   * Feeds a packet through the production acceptance path with only its
   * decoding stubbed. A discarded packet counts as one the connection
   * protocol rejected or did not dispatch.
   */
  feedDecoded(
    packet: DecodedPacketFields = {},
    discarded?: "rejected" | "noDispatch",
  ): void {
    const parser = (this as unknown as { packetParser: PacketParser })
      .packetParser;
    vi.spyOn(parser, "parsePacket").mockImplementationOnce(() => {
      if (discarded === "rejected") parser.protocolRejected++;
      if (discarded === "noDispatch") parser.protocolNoDispatch++;
      return {
        events: [],
        ghosts: [],
        dnetHeader: { packetType: 0 },
        ...packet,
        gameState: { lastMoveAck: 0, ...packet.gameState },
      } as unknown as PacketData;
    });
    this.feedPacket(new Uint8Array([0]));
  }
}

export const moveBlock = () => ({
  type: BlockTypeMove,
  parsed: { yaw: 0, pitch: 0, x: 0, y: 0, z: 0, trigger: [] },
});

export const packetBlock = (parsed: DecodedPacketFields = {}) => ({
  type: BlockTypePacket,
  parsed: {
    ghosts: [],
    events: [],
    ...parsed,
    gameState: { lastMoveAck: 0, ...parsed.gameState },
  },
});

/**
 * A DemoParser over decoded `blocks`, read in place so a spec can append to
 * them as a download progresses. Unless given one, its ghost tracker knows
 * every ghost but none of their class names.
 */
export function fakeDemoParser({
  blocks = [],
  demoLengthMs = 100_000,
  initialBlock,
  ghostClasses = () => undefined,
  registry = ghostClassRegistry(ghostClasses),
  ghostTracker = { getGhost: () => ({ classId: 1 }) },
  packetParser = {
    protocolRejected: 0,
    protocolNoDispatch: 0,
    getDataBlockDataMap: () => undefined,
  },
  decompressedByteLength = 1,
  bufferedMoveTicks = 10_000,
  blockCursor = false,
  onBlock,
  onCapture,
  onRestore,
}: {
  blocks?: readonly unknown[];
  demoLengthMs?: number;
  initialBlock?: { [K in keyof InitialBlockData]?: unknown };
  ghostClasses?: GhostClasses;
  registry?: object;
  ghostTracker?: object;
  packetParser?: object;
  decompressedByteLength?: number;
  bufferedMoveTicks?: number;
  /**
   * Exposes the cursor, which lets the metadata probe read ahead.
   */
  blockCursor?: boolean;
  onBlock?: (block: unknown) => void;
  onCapture?: () => void;
  onRestore?: () => void;
} = {}): DemoParser {
  let cursor = 0;
  const owner = {};
  return {
    header: { demoLengthMs },
    initialBlock: {
      dataBlocks: new Map(),
      initialGhosts: [],
      controlObjectGhostIndex: -1,
      targetEntries: [],
      sensorGroupColors: [],
      taggedStrings: new Map(),
      initialEvents: [],
      demoValues: [],
      firstPerson: true,
      lastMoveAck: 0,
      lastClientMove: 0,
      firstMoveIndex: 0,
      sensorGroup: 0,
      moves: [],
      ...initialBlock,
    },
    get blockCursor() {
      return blockCursor ? cursor : undefined;
    },
    getRegistry: () => registry,
    getGhostTracker: () => ghostTracker,
    getPacketParser: () => packetParser,
    reset: () => {
      cursor = 0;
    },
    nextBlock: () => {
      const block = blocks[cursor];
      if (block) cursor++;
      onBlock?.(block);
      return block;
    },
    createCheckpoint: () => {
      onCapture?.();
      return {
        owner,
        cursor,
        blockStreamOffset: cursor,
        blockCursor: cursor,
        ghosts: new Map(),
      };
    },
    restoreCheckpoint: (checkpoint: { cursor: number }) => {
      onRestore?.();
      cursor = checkpoint.cursor;
    },
    decompressedByteLength,
    bufferedMoveTicks,
    isComplete: true,
  } as unknown as DemoParser;
}

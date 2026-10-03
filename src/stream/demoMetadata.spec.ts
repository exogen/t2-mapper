import { describe, expect, it, vi } from "vitest";
import {
  BlockTypeMove,
  BlockTypePacket,
  type DemoBlock,
  type DemoParser,
} from "t2-demo-parser";
import { createRecordingFromParser, DemoStreamAdapter } from "./demoStreaming";

const player = {
  position: { x: 0, y: 0, z: 100 },
  velocity: { x: 0, y: 0, z: 0 },
  rotationZ: 0,
  headX: 0,
  energyLevel: 100,
};
const camera = {
  position: { x: 0, y: 0, z: 100 },
  rotZ: 0,
  rotX: 0,
  cameraMode: 3,
  orbitObjectGhostIndex: 1,
};
const move = () => ({ type: BlockTypeMove, parsed: { yaw: 0, pitch: 0 } });
const controlPlayer = (ghostIndex = 1) => ({
  type: BlockTypePacket,
  parsed: {
    ghosts: [],
    events: [],
    gameState: {
      lastMoveAck: 0,
      controlObjectGhostIndex: ghostIndex,
      controlObjectData: player,
    },
  },
});
const serverMessage = (...args: string[]) => ({
  type: BlockTypePacket,
  parsed: {
    ghosts: [],
    events: [
      {
        parsedData: {
          type: "RemoteCommandEvent",
          funcName: "ServerMessage",
          args,
        },
      },
    ],
    gameState: { lastMoveAck: 0 },
  },
});
const roster = (clientId = 29905, targetId = 70, name = "Flyersfan") =>
  `${name}\t118791\t${clientId}\t${targetId}\t1\t0\t91\t0`;

function fixture(
  blocks: unknown[],
  options: {
    initialPlayer?: boolean;
    roster?: string[];
    metadata?: string[];
    secondPlayer?: boolean;
  } = {},
) {
  let cursor = 0;
  const owner = {};
  const entries = options.roster ?? [roster()];
  const nextBlock = vi.fn(() => {
    const block = blocks[cursor] as DemoBlock | undefined;
    if (block) cursor++;
    return block;
  });
  const parser = {
    header: { demoLengthMs: 120_000 },
    initialBlock: {
      dataBlocks: new Map([
        [1, { className: "PlayerData", data: { maxEnergy: 100, mass: 90 } }],
      ]),
      initialGhosts: [
        { index: 0, type: "create", classId: 4, parsedData: camera },
        {
          index: 1,
          type: "create",
          classId: 25,
          parsedData: { ...player, dataBlockId: 1, targetId: 70 },
        },
        ...(options.secondPlayer
          ? [
              {
                index: 2,
                type: "create",
                classId: 25,
                parsedData: { ...player, dataBlockId: 1, targetId: 71 },
              },
            ]
          : []),
      ],
      controlObjectGhostIndex: options.initialPlayer ? 1 : 0,
      controlObjectData: options.initialPlayer ? player : camera,
      targetEntries: [
        { targetId: 70, name: "Flyersfan", sensorGroup: 1 },
        ...(options.secondPlayer
          ? [{ targetId: 71, name: "Later Player", sensorGroup: 1 }]
          : []),
      ],
      sensorGroupColors: [],
      taggedStrings: new Map(),
      initialEvents: [],
      demoValues: [
        "Observer",
        String(entries.length),
        ...entries,
        ...(options.metadata ?? []),
      ],
      firstPerson: true,
      connectionFields: [0, 0, 0, 0, 0, 0],
      moves: [],
    },
    get blockCursor() {
      return cursor;
    },
    getRegistry: () => ({
      getGhostParser: (id: number) => ({
        name: id === 25 ? "Player" : "Camera",
      }),
      getEventParser: () => undefined,
    }),
    getGhostTracker: () => ({
      getGhost: (id: number) => ({ classId: id === 1 || id === 2 ? 25 : 4 }),
    }),
    getPacketParser: () => ({ protocolRejected: 0, protocolNoDispatch: 0 }),
    reset: () => {
      cursor = 0;
    },
    nextBlock,
    createCheckpoint: () => ({
      owner,
      cursor,
      blockStreamOffset: cursor,
      blockCursor: cursor,
      ghosts: new Map(),
    }),
    restoreCheckpoint: (checkpoint: { cursor: number }) => {
      cursor = checkpoint.cursor;
    },
    isComplete: true,
    decompressedByteLength: blocks.length,
    bufferedMoveTicks: blocks.filter(
      (block) => (block as DemoBlock).type === BlockTypeMove,
    ).length,
  } as unknown as DemoParser;
  return { parser, nextBlock };
}

describe("bounded demo metadata fallback", () => {
  it("identifies a controlled Player and rewinds without needing a date", () => {
    const { parser } = fixture([controlPlayer(), move()]);
    const recording = createRecordingFromParser(parser);
    expect(recording.recorderName).toBe("Flyersfan");
    expect(recording.recordingDate).toBeNull();
    expect(parser.blockCursor).toBe(0);
    expect(recording.streamingPlayback.getSnapshot()).toMatchObject({
      timeSec: 0,
      connectedClientId: 29905,
      camera: { mode: "third-person" },
    });
    recording.streamingPlayback.reset();
    expect(recording.streamingPlayback.getSnapshot().connectedClientId).toBe(
      29905,
    );
  });

  it("does not attribute an observed player to the recorder", () => {
    const { parser, nextBlock } = fixture(Array.from({ length: 200 }, move));
    const recording = createRecordingFromParser(parser);
    expect(recording.recorderName).toBeNull();
    expect(nextBlock.mock.calls.length).toBeLessThanOrEqual(62);
  });

  it("gives up before a late control-player transition", () => {
    const { parser, nextBlock } = fixture([
      ...Array.from({ length: 100 }, move),
      controlPlayer(),
      move(),
    ]);
    const recording = createRecordingFromParser(parser);
    expect(recording.recorderName).toBeNull();
    expect(nextBlock.mock.calls.length).toBeLessThanOrEqual(62);
    recording.streamingPlayback.stepToTime(4);
    expect(
      recording.streamingPlayback.getSnapshot().connectedClientId,
    ).toBeNull();
  });

  it("bounds block work even when no movement ticks arrive", () => {
    const { parser, nextBlock } = fixture(
      Array.from({ length: 2_000 }, () => controlPlayer()),
    );
    expect(createRecordingFromParser(parser).recorderName).toBe("Flyersfan");
    expect(nextBlock).toHaveBeenCalledTimes(512);
    expect(parser.blockCursor).toBe(0);
  });

  it("stops the probe as soon as both names are known, without requiring a movement tick", () => {
    const { parser, nextBlock } = fixture([
      controlPlayer(),
      serverMessage(
        "MsgMissionDropInfo",
        "",
        "Surreal",
        "Capture the Flag",
        "First Server",
      ),
      ...Array.from({ length: 1_000 }, move),
    ]);
    const recording = createRecordingFromParser(parser);
    expect(recording.recorderName).toBe("Flyersfan");
    expect(recording.serverDisplayName).toBe("First Server");
    expect(nextBlock).toHaveBeenCalledTimes(2);
    expect(parser.blockCursor).toBe(0);
    expect(recording.streamingPlayback.getSnapshot().timeSec).toBe(0);
  });

  it("identifies the first control player before another control packet in the same tick", () => {
    const { parser } = fixture([controlPlayer(), controlPlayer(2), move()], {
      secondPlayer: true,
      roster: [roster(), roster(29906, 71, "Later Player")],
    });
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback;
    expect(recording.recorderName).toBe("Flyersfan");
    expect(stream.getSnapshot().connectedClientId).toBe(29905);
    expect(parser.blockCursor).toBe(0);

    const snapshot = stream.stepToTime(0.032);
    expect(
      snapshot.entities.find(
        (entity) => entity.id === snapshot.controlPlayerGhostId,
      ),
    ).toMatchObject({ targetId: 71, playerName: "Later Player" });
    expect(stream.connectedPlayerName).toBe("Flyersfan");
    expect(snapshot.connectedClientId).toBe(29905);
  });

  it("keeps the first recorder when control moves to another player's target", () => {
    const { parser } = fixture(
      [
        controlPlayer(),
        move(),
        controlPlayer(2),
        move(),
        ...Array.from({ length: 100 }, move),
      ],
      {
        secondPlayer: true,
        roster: [roster(), roster(29906, 71, "Later Player")],
      },
    );
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback;
    expect(recording.recorderName).toBe("Flyersfan");

    const snapshot = stream.stepToTime(0.064);
    expect(
      snapshot.entities.find(
        (entity) => entity.id === snapshot.controlPlayerGhostId,
      ),
    ).toMatchObject({ targetId: 71, playerName: "Later Player" });
    expect(stream.connectedPlayerName).toBe("Flyersfan");
    expect(stream.getSnapshot().connectedClientId).toBe(29905);
    stream.stepToTime(3);
    expect(stream.connectedPlayerName).toBe("Flyersfan");
    expect(stream.getSnapshot().connectedClientId).toBe(29905);
    stream.reset();
    expect(stream.connectedPlayerName).toBe("Flyersfan");
    expect(stream.getSnapshot().connectedClientId).toBe(29905);
  });

  it("rewinds a malformed prefix and reports its fault during ordinary playback", () => {
    const { parser } = fixture([
      move(),
      { type: BlockTypePacket, parseError: "malformed metadata prefix" },
    ]);
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback;

    expect(parser.blockCursor).toBe(0);
    expect(stream.getSnapshot().timeSec).toBe(0);
    expect(() => stream.stepToTime(0.064)).toThrow(
      "Demo parsing failed at 0.032s: malformed metadata prefix",
    );
    expect(parser.blockCursor).toBe(2);
  });

  it.each([{ roster: [] }, { roster: [roster(), roster(29906)] }])(
    "requires a unique roster match for the controlled target (%j)",
    (options) => {
      const { parser } = fixture([controlPlayer(), move()], {
        roster: options.roster,
      });
      expect(createRecordingFromParser(parser).recorderName).toBeNull();
    },
  );

  it("preserves explicit recorder metadata over the controlled-player fallback", () => {
    const { parser, nextBlock } = fixture([controlPlayer(), move()], {
      initialPlayer: true,
      metadata: [
        "readplayerinfo",
        "1\t7\tHeader Recorder\tStorm\t999",
        "readplayerinfo",
        "2\tKnown Server\t127.0.0.1\tJan-1-2004 1:00PM\tSurreal",
      ],
    });
    const recording = createRecordingFromParser(parser);
    expect(recording.recorderName).toBe("Header Recorder");
    expect(recording.serverDisplayName).toBe("Known Server");
    expect(nextBlock).not.toHaveBeenCalled();
  });

  it("can recover identity from an available progressive prefix during playback", () => {
    const blocks: unknown[] = [];
    const { parser } = fixture(blocks);
    Object.defineProperty(parser, "isComplete", { value: false });
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback;
    const changed = vi.fn();
    stream.onMissionInfoChange = changed;
    blocks.push(controlPlayer(), move());
    stream.stepToTime(0.032);
    expect(stream.connectedPlayerName).toBe("Flyersfan");
    expect(stream.getSnapshot().connectedClientId).toBe(29905);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("remembers a progressive welcome-join identity before publishing it", () => {
    const blocks: unknown[] = [];
    const { parser } = fixture(blocks, { roster: [] });
    Object.defineProperty(parser, "isComplete", { value: false });
    const stream = createRecordingFromParser(parser).streamingPlayback;
    expect(stream.getSnapshot().connectedClientId).toBeNull();
    const notifications: {
      recorder: string | null;
      clientId: number | null;
    }[] = [];
    stream.onMissionInfoChange = () => {
      notifications.push({
        recorder: stream.connectedPlayerName,
        clientId: stream.getSnapshot().connectedClientId,
      });
    };
    blocks.push(
      serverMessage(
        "MsgClientJoin",
        "Welcome to Tribes",
        "First Joiner",
        "29905",
        "70",
        "0",
        "0",
        "0",
        "0",
        "12345",
      ),
    );
    stream.stepToTime(0.032);
    expect(notifications).toEqual([
      { recorder: "First Joiner", clientId: 29905 },
    ]);
    stream.reset();
    expect(stream.connectedPlayerName).toBe("First Joiner");
    expect(stream.getSnapshot().connectedClientId).toBe(29905);
  });

  it("keeps the inferred name and client ID together when the header has only a client ID", () => {
    const { parser } = fixture([], {
      initialPlayer: true,
      metadata: ["readplayerinfo", "1\t999\t\tStorm\t123"],
    });
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback;
    expect(recording.recorderName).toBe("Flyersfan");
    expect(stream.getSnapshot().connectedClientId).toBe(29905);
    stream.reset();
    expect(stream.connectedPlayerName).toBe("Flyersfan");
    expect(stream.getSnapshot().connectedClientId).toBe(29905);
  });

  it("ignores header names containing only formatting or whitespace", () => {
    const { parser } = fixture(
      [
        controlPlayer(),
        serverMessage(
          "MsgMissionDropInfo",
          "",
          "Surreal",
          "Capture the Flag",
          "First Server",
        ),
      ],
      {
        metadata: [
          "readplayerinfo",
          "1\t999\t\x10\x0b\x11\tStorm\t123",
          "readplayerinfo",
          "2\t  \x0b  \t127.0.0.1\t\tSurreal",
        ],
      },
    );
    const recording = createRecordingFromParser(parser);
    expect(recording.recorderName).toBe("Flyersfan");
    expect(recording.serverDisplayName).toBe("First Server");
    expect(recording.streamingPlayback.getSnapshot().connectedClientId).toBe(
      29905,
    );
  });

  it("remembers a scanned server name through reset and older checkpoints", () => {
    const { parser } = fixture(Array.from({ length: 200 }, move), {
      initialPlayer: true,
    });
    const stream = createRecordingFromParser(parser)
      .streamingPlayback as DemoStreamAdapter;
    stream.setPlayerPredictionEnabled(true);
    stream.stepToTime(3);
    const checkpoint = stream.captureCheckpoint();
    expect(checkpoint.simulation.state.serverDisplayName).toBeNull();
    stream.importCheckpoints([checkpoint]);
    const changed = vi.fn();
    stream.onMissionInfoChange = changed;
    const timeBefore = stream.getSnapshot().timeSec;
    const cursorBefore = parser.blockCursor;
    stream.setServerNameFallback("\x0bRapture Competition East");
    expect(stream.serverDisplayName).toBe("Rapture Competition East");
    expect(changed).toHaveBeenCalledOnce();
    expect(stream.getSnapshot().timeSec).toBe(timeBefore);
    expect(parser.blockCursor).toBe(cursorBefore);

    stream.reset();
    expect(stream.serverDisplayName).toBe("Rapture Competition East");
    stream.stepToTime(6);
    const restore = vi.spyOn(parser, "restoreCheckpoint");
    stream.stepToTime(4);
    expect(restore).toHaveBeenCalledOnce();
    expect(stream.serverDisplayName).toBe("Rapture Competition East");
  });

  it("preserves known server metadata over a background fallback", () => {
    const { parser } = fixture([], {
      initialPlayer: true,
      metadata: ["readplayerinfo", "2\tKnown Server\t127.0.0.1\t\tSurreal"],
    });
    const stream = createRecordingFromParser(parser).streamingPlayback;
    const changed = vi.fn();
    stream.onMissionInfoChange = changed;
    stream.setServerNameFallback!("Scanned Server");
    expect(stream.serverDisplayName).toBe("Known Server");
    expect(changed).not.toHaveBeenCalled();
    stream.reset();
    expect(stream.serverDisplayName).toBe("Known Server");
  });

  it("keeps the first server from runtime messages and later scanned fallbacks", () => {
    const { parser } = fixture(
      [
        serverMessage(
          "MsgMissionDropInfo",
          "",
          "Surreal",
          "Capture the Flag",
          "First Server",
        ),
        serverMessage(
          "MsgLoadInfo",
          "",
          "Surreal",
          "Classic  1.3",
          "Later Server",
        ),
        move(),
      ],
      { initialPlayer: true },
    );
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback;
    expect(recording.serverDisplayName).toBe("First Server");
    expect(stream.serverDisplayName).toBe("First Server");
    expect(parser.blockCursor).toBe(0);

    const notifications: (string | null)[] = [];
    stream.onMissionInfoChange = () => {
      notifications.push(stream.serverDisplayName);
    };
    stream.stepToTime(0.032);
    expect(parser.blockCursor).toBe(3);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every((name) => name === "First Server")).toBe(true);

    stream.setServerNameFallback!("Third Server");
    expect(stream.serverDisplayName).toBe("First Server");
    stream.reset();
    expect(stream.serverDisplayName).toBe("First Server");
    expect(notifications.every((name) => name === "First Server")).toBe(true);
  });

  it("keeps recovered attribution when importing an older checkpoint", () => {
    const { parser } = fixture(Array.from({ length: 200 }, move), {
      initialPlayer: true,
      metadata: ["readplayerinfo", "2\tKnown Server\t127.0.0.1\t\tSurreal"],
    });
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback as DemoStreamAdapter;
    stream.setPlayerPredictionEnabled(true);
    stream.stepToTime(3);
    const checkpoint = stream.captureCheckpoint();
    checkpoint.simulation.state.connectedPlayerName = null;
    checkpoint.simulation.state.connectedClientId = null;
    checkpoint.simulation.state.serverDisplayName = null;
    stream.importCheckpoints([checkpoint]);
    stream.stepToTime(6);
    const restore = vi.spyOn(parser, "restoreCheckpoint");
    stream.stepToTime(4);
    expect(restore).toHaveBeenCalledOnce();
    expect(stream.connectedPlayerName).toBe("Flyersfan");
    expect(stream.connectedClientId).toBe(29905);
    expect(stream.serverDisplayName).toBe("Known Server");
  });

  it("never publishes later checkpoint attribution over the first recorder and server", () => {
    const { parser } = fixture(Array.from({ length: 200 }, move), {
      initialPlayer: true,
    });
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback as DemoStreamAdapter;
    stream.setServerNameFallback("First Server");
    stream.setPlayerPredictionEnabled(true);
    stream.stepToTime(3);
    const checkpoint = stream.captureCheckpoint();
    checkpoint.simulation.state.connectedPlayerName = "Later Player";
    checkpoint.simulation.state.connectedClientId = 29906;
    checkpoint.simulation.state.serverDisplayName = "Later Server";
    stream.importCheckpoints([checkpoint]);
    stream.stepToTime(6);

    const notifications: {
      recorder: string | null;
      clientId: number | null;
      server: string | null;
    }[] = [];
    stream.onMissionInfoChange = () => {
      notifications.push({
        recorder: stream.connectedPlayerName,
        clientId: stream.connectedClientId,
        server: stream.serverDisplayName,
      });
    };
    const restore = vi.spyOn(parser, "restoreCheckpoint");
    stream.stepToTime(4);

    expect(restore).toHaveBeenCalledOnce();
    expect(notifications).toEqual([
      { recorder: "Flyersfan", clientId: 29905, server: "First Server" },
    ]);
    expect(stream.connectedPlayerName).toBe("Flyersfan");
    expect(stream.connectedClientId).toBe(29905);
    expect(stream.serverDisplayName).toBe("First Server");
    expect(recording.recorderName).toBe("Flyersfan");
  });

  it("does not infer unknown recording attribution from an imported checkpoint", () => {
    const { parser } = fixture(Array.from({ length: 200 }, move));
    const recording = createRecordingFromParser(parser);
    const stream = recording.streamingPlayback as DemoStreamAdapter;
    stream.setPlayerPredictionEnabled(true);
    stream.stepToTime(3);
    const checkpoint = stream.captureCheckpoint();
    checkpoint.simulation.state.connectedPlayerName = "Later Player";
    checkpoint.simulation.state.connectedClientId = 29906;
    checkpoint.simulation.state.serverDisplayName = "Later Server";
    stream.importCheckpoints([checkpoint]);
    stream.stepToTime(6);

    const notifications: {
      recorder: string | null;
      clientId: number | null;
      server: string | null;
    }[] = [];
    stream.onMissionInfoChange = () => {
      notifications.push({
        recorder: stream.connectedPlayerName,
        clientId: stream.connectedClientId,
        server: stream.serverDisplayName,
      });
    };
    const restore = vi.spyOn(parser, "restoreCheckpoint");
    stream.stepToTime(4);

    expect(restore).toHaveBeenCalledOnce();
    expect(notifications).toEqual([
      { recorder: null, clientId: null, server: null },
    ]);
    expect(stream.connectedPlayerName).toBeNull();
    expect(stream.connectedClientId).toBeNull();
    expect(stream.serverDisplayName).toBeNull();
  });
});

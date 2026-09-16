import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockTypePacket, DemoParser, type DemoBlock } from "t2-demo-parser";
import { buildDemoValues } from "../../relay/demoWriter.js";
import { analyzeDemo } from "./analyzeDemo";

function packet(...args: string[]): DemoBlock {
  return {
    index: 1,
    type: BlockTypePacket,
    size: 0,
    data: new Uint8Array(),
    parsed: {
      dnetHeader: {
        gameFlag: true,
        connectSeqBit: 0,
        seqNumber: 1,
        highestAck: 0,
        packetType: 0,
        ackByteCount: 0,
        ackMask: 0,
      },
      rateInfo: {},
      gameState: { lastMoveAck: 0, pinged: false, jammed: false },
      ghosts: [],
      events: [
        {
          classId: 0,
          guaranteed: true,
          dataBitsStart: 0,
          dataBitsEnd: 0,
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args,
          },
        },
      ],
    },
  };
}

function source(
  blocks: DemoBlock[],
  initialPlayers: string[] = [],
  recorderClientId = 0,
) {
  const demoValues = buildDemoValues({
    recorderName: "Recorder",
    clientId: recorderClientId,
    serverName: "Server",
    serverAddress: "localhost",
    date: new Date("2026-09-13T00:00:00Z"),
    missionDisplayName: "Test",
    mod: "classic",
    gameType: "CTF",
  });
  demoValues[1] = String(initialPlayers.length);
  demoValues.splice(2, 0, ...initialPlayers);
  vi.spyOn(DemoParser.prototype, "load").mockResolvedValue({
    header: { demoLengthMs: 60_000 },
    initialBlock: {
      demoValues,
      taggedStrings: new Map(),
      dataBlocks: new Map(),
      missionName: "Test",
    },
  } as Awaited<ReturnType<DemoParser["load"]>>);
  let index = 0;
  vi.spyOn(DemoParser.prototype, "nextBlock").mockImplementation(
    () => blocks[index++],
  );
}

afterEach(() => vi.restoreAllMocks());

describe("demo metadata replay", () => {
  it("counts header players once when their tags change before any join packet", async () => {
    source(
      [
        packet(
          "MsgClientNameChanged",
          "",
          "Alice",
          "\x10\x0b[TAG]\x08Alice\x11",
          "10",
        ),
        packet("MsgClientDrop", "", "\x10\x0b[TAG]\x08Alice\x11", "10"),
      ],
      ["Alice\t1\t10\t\t1\t0\t40\t0"],
    );
    const record = await analyzeDemo(new Uint8Array(), "test.rec");
    expect(record.playerCount).toBe(1);
    expect(record.players).toEqual(["[TAG]Alice", "Alice"]);
  });

  it("counts tag-less names once across reconnects and keeps their aliases", async () => {
    source([
      packet(
        "MsgClientJoin",
        "",
        "Alice",
        "10",
        "1",
        "0",
        "0",
        "0",
        "0",
        "1234",
      ),
      packet("MsgClientDrop", "", "Alice", "10"),
      packet(
        "MsgClientJoin",
        "",
        "\x10\x0b[TAG]\x08Alice\x11",
        "11",
        "1",
        "0",
        "0",
        "0",
        "0",
        "1234",
      ),
    ]);
    const record = await analyzeDemo(new Uint8Array(), "test.rec");
    expect(record.playerCount).toBe(1);
    expect(record.players).toEqual(["[TAG]Alice", "Alice"]);
  });

  it("does not mistake a later join in a mid-match demo for the recorder", async () => {
    source(
      [packet("MsgClientJoin", "Carol joined", "Carol", "12", "2")],
      ["Alice\t1\t10\t\t1\t0\t40\t0"],
    );
    const record = await analyzeDemo(new Uint8Array(), "test.rec");
    expect(record.players).toEqual(["Alice", "Carol"]);
    expect(record.playerCount).toBe(2);
  });

  it("honors a retail header's recorder ID over subsequent welcome-style joins", async () => {
    source(
      [
        packet("MsgClientJoin", "Carol joined", "Carol", "12", "2"),
        packet("MsgClientNameChanged", "", "Other name", "New name", "10"),
      ],
      ["Other name\t1\t10\t\t1\t0\t40\t0"],
      10,
    );
    const record = await analyzeDemo(new Uint8Array(), "test.rec");
    expect(record.players).toEqual(["Carol"]);
  });

  it("treats the relay's zero header ID as unknown and learns the welcome ID", async () => {
    source([
      packet(
        "MsgClientJoin",
        "Welcome to Tribes2",
        "Authenticated name",
        "10",
        "1",
      ),
      packet("MsgClientJoin", "Alice joined", "Alice", "11", "2"),
    ]);
    const record = await analyzeDemo(new Uint8Array(), "test.rec");
    expect(record.players).toEqual(["Alice"]);
  });

  it("retains every name seen within a packet, even if the client leaves immediately", async () => {
    const combined = packet("MsgClientJoin", "", "Alice", "10", "1");
    const renamed = packet("MsgClientNameChanged", "", "Alice", "Bob", "10");
    const dropped = packet("MsgClientDrop", "", "Bob", "10");
    if (combined.parsed && "events" in combined.parsed) {
      for (const block of [renamed, dropped])
        if (block.parsed && "events" in block.parsed)
          combined.parsed.events.push(...block.parsed.events);
    }
    source([combined]);
    const record = await analyzeDemo(new Uint8Array(), "test.rec");
    expect(record.players).toEqual(["Alice", "Bob"]);
    expect(record.playerCount).toBe(2);
  });

  it("refuses to publish partial counts when packet parsing fails", async () => {
    const broken = packet("MsgClientJoin", "", "Alice", "10");
    broken.parseError = "bad packet";
    source([broken]);
    await expect(analyzeDemo(new Uint8Array(), "test.rec")).rejects.toThrow(
      "bad packet",
    );
  });
});

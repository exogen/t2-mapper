import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BitStreamWriter } from "./BitStreamWriter";
import { writeString } from "./HuffmanWriter";
import {
  parseServerStatusString,
  queryServerInfo,
  queryServerList,
} from "./masterQuery";

function pingResponse(): Buffer {
  const bs = new BitStreamWriter();
  bs.writeU8(16);
  bs.writeU8(0);
  bs.writeU32(0);
  writeString(bs, "VER5");
  bs.writeU32(12);
  bs.writeU32(12);
  bs.writeU32(25034);
  writeString(bs, "Test Server");
  return Buffer.from(bs.getBuffer());
}

function infoResponse(roster?: string): Buffer {
  const bs = new BitStreamWriter();
  bs.writeU8(20);
  bs.writeU8(0);
  bs.writeU32(0);
  writeString(bs, "Classic");
  writeString(bs, "Capture the Flag (Practice)");
  writeString(bs, "Katabatic");
  bs.writeU8(0x0a);
  bs.writeU8(5);
  bs.writeU8(64);
  bs.writeU8(2);
  if (roster !== undefined) {
    bs.writeInt(3000, 16);
    writeString(bs, "Server description");
    bs.writeInt(roster.length, 16);
    for (const char of roster) bs.writeU8(char.charCodeAt(0));
  }
  return Buffer.from(bs.getBuffer());
}

interface QueryReply {
  ping: Buffer;
  info?: Buffer;
}

class QuerySocket extends EventEmitter {
  private replies: Map<string, QueryReply>;

  constructor(replies: Map<string, QueryReply>) {
    super();
    this.replies = replies;
  }

  send = vi.fn((request: Uint8Array, port: number, host: string) => {
    const reply = this.replies.get(`${host}:${port}`);
    const packet = request[0] === 14 ? reply?.ping : reply?.info;
    if (packet) {
      queueMicrotask(() =>
        this.emit("message", packet, { address: host, port }),
      );
    }
  });
  close = vi.fn();
}

describe("server queries", () => {
  const address = "192.0.2.1:28000";
  let replies: Map<string, QueryReply>;

  beforeEach(() => {
    vi.useFakeTimers();
    replies = new Map([[address, { ping: pingResponse() }]]);
    vi.spyOn(dgram, "createSocket").mockImplementation(
      () => new QuerySocket(replies) as unknown as dgram.Socket,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response([...replies.keys()].join("\n"))),
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("omits ping-only servers until a later query receives their info", async () => {
    const completeAddress = "192.0.2.2:28000";
    replies.set(completeAddress, {
      ping: pingResponse(),
      info: infoResponse(),
    });
    const first = queryServerList("master.test");
    await vi.runAllTimersAsync();
    expect((await first).map((server) => server.address)).toEqual([
      completeAddress,
    ]);

    replies.get(address)!.info = infoResponse();
    const next = queryServerList("master.test");
    await vi.runAllTimersAsync();
    expect((await next).map((server) => server.address)).toEqual([
      address,
      completeAddress,
    ]);
  });

  it("returns null for a single-server probe with only a ping reply", async () => {
    const result = queryServerInfo(address);
    await vi.runAllTimersAsync();
    expect(await result).toBeNull();
  });

  it("omits servers whose info response cannot be parsed", async () => {
    replies.get(address)!.info = Buffer.from([20, 0, 0, 0, 0, 0]);
    const result = queryServerList("master.test");
    await vi.runAllTimersAsync();
    expect(await result).toEqual([]);
  });

  it.each([undefined, "NoGame"])(
    "keeps valid info and counts with an absent or unreadable roster (%s)",
    async (roster) => {
      replies.get(address)!.info = infoResponse(roster);
      const result = queryServerList("master.test");
      await vi.runAllTimersAsync();
      expect(await result).toEqual([
        {
          address,
          name: "Test Server",
          mod: "Classic",
          gameType: "Capture the Flag (Practice)",
          mapName: "Katabatic",
          playerCount: 5,
          maxPlayers: 64,
          botCount: 2,
          ping: expect.any(Number),
          buildVersion: 25034,
          passwordRequired: true,
          tournament: true,
          isPatrolled: false,
        },
      ]);
    },
  );

  it("still includes the roster when it is available", async () => {
    replies.get(address)!.info = infoResponse(
      "1\nStorm\t2\n1\nAlice\tStorm\t10",
    );
    const result = queryServerInfo(address);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({
      teams: [{ name: "Storm", score: 2 }],
      players: [{ name: "Alice", team: "Storm", score: 10 }],
    });
  });
});

describe("parseServerStatusString", () => {
  it("strips tagged-string markup control bytes from names", () => {
    // Live-observed wrapping: \x10\x0e<name>\x11 (and \x08 prefixes).
    const status = [
      "1",
      "Storm\t0",
      "2",
      "\x10\x0eSnake Pliskin \x11\tStorm\t12",
      "\x08Krash\tStorm\t3",
    ].join("\n");
    expect(parseServerStatusString(status)?.players).toEqual([
      { name: "Snake Pliskin", team: "Storm", score: 12 },
      { name: "Krash", team: "Storm", score: 3 },
    ]);
  });

  it("parses teams and players from the retail status format", () => {
    const status = [
      "2",
      "Storm\t3",
      "Inferno\t1",
      "4",
      "Alice\tStorm\t120",
      "Bob\tInferno\t85",
      "Watcher\tUnassigned\t0",
      "Carol\tStorm\t40",
    ].join("\n");
    expect(parseServerStatusString(status)).toEqual({
      teams: [
        { name: "Storm", score: 3 },
        { name: "Inferno", score: 1 },
      ],
      players: [
        { name: "Alice", team: "Storm", score: 120 },
        { name: "Bob", team: "Inferno", score: 85 },
        { name: "Watcher", team: "Unassigned", score: 0 },
        { name: "Carol", team: "Storm", score: 40 },
      ],
    });
  });

  it("parses teamless (numTeams 0) rosters", () => {
    const status = ["0", "2", "Alice\t\t10", "Bob\t\t5"].join("\n");
    expect(parseServerStatusString(status)).toEqual({
      teams: [],
      players: [
        { name: "Alice", team: "", score: 10 },
        { name: "Bob", team: "", score: 5 },
      ],
    });
  });

  it("tolerates a truncated player section", () => {
    const status = ["1", "Storm\t0", "5", "Alice\tStorm\t1"].join("\n");
    const parsed = parseServerStatusString(status);
    expect(parsed?.players).toHaveLength(1);
  });

  it("rejects garbage", () => {
    expect(parseServerStatusString("NoGame")).toBeNull();
    expect(parseServerStatusString("")).toBeNull();
    expect(parseServerStatusString("9999")).toBeNull();
  });
});

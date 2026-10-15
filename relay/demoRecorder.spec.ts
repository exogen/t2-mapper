import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  freshConnectionProtocolState,
  type DemoBlock,
} from "t2-demo-parser";
import {
  extractMissionInfo,
  parseDemoValues,
} from "../src/stream/demoStreaming";
import { BitStreamWriter } from "./BitStreamWriter.js";
import {
  DemoRecorder,
  buildDemoFilename,
  type ServerIdentity,
} from "./demoRecorder.js";
import * as demoStart from "./demoStart.js";
import { JoinGameOverFilter } from "./joinGameOver.js";
import type { ServerInfo } from "./types.js";
import type { DemoPlayerRoster } from "./demoPlayers.js";
import { GameConnection } from "./gameConnection.js";
import { demoLog } from "./logger.js";

const CONNECT_SEQUENCE = 0x0badf00d;

const serverInfo: ServerInfo = {
  address: "45.76.24.91:28000",
  name: "| the cut |",
  mod: "classic",
  gameType: "Capture the Flag",
  mapName: "Damnation",
  playerCount: 3,
  maxPlayers: 16,
  botCount: 0,
  ping: 40,
  buildVersion: 22337,
  passwordRequired: false,
  tournament: false,
  isPatrolled: false,
};

function buildPingPacket(seq: number): Uint8Array {
  const bs = new BitStreamWriter(16);
  bs.writeFlag(true);
  bs.writeInt(CONNECT_SEQUENCE & 1, 1);
  bs.writeInt(seq & 0x1ff, 9);
  bs.writeInt(0, 9);
  bs.writeInt(1, 2); // PingPacket
  bs.writeInt(0, 3);
  return bs.getBuffer();
}

async function parseDemoFile(filePath: string) {
  const parser = new DemoParser(new Uint8Array(await fsp.readFile(filePath)));
  const loadResult = await parser.load();
  const blocks: DemoBlock[] = [];
  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    blocks.push(block);
  }
  return { ...loadResult, blocks };
}

describe("DemoRecorder", () => {
  let dir: string;
  let time: number;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "demo-recorder-"));
    time = 100_000;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createRecorder(
    overrides: {
      minLengthMs?: number;
      minPlayers?: number;
      playerCount?: () => number;
      playerRoster?: () => DemoPlayerRoster;
      serverIdentity?: () => ServerIdentity;
      matchStarted?: () => boolean;
      recordContext?: () => { pinned: boolean; watchers: number };
      maxBytes?: number;
    } = {},
  ) {
    return new DemoRecorder({
      dir,
      address: serverInfo.address,
      getConnectSequence: () => CONNECT_SEQUENCE,
      getServerInfo: () => serverInfo,
      getServerIdentity:
        overrides.serverIdentity ??
        (() => ({
          name: serverInfo.name,
          gameType: serverInfo.gameType,
          mod: serverInfo.mod,
        })),
      getActivePlayerCount: overrides.playerCount ?? (() => 2),
      getPlayerRoster: overrides.playerRoster ?? (() => new Map()),
      getRecorderClientId: () => 1,
      getMatchStarted: overrides.matchStarted ?? (() => true),
      getRecordContext: overrides.recordContext,
      recorderName: "Observer",
      maxBytes: overrides.maxBytes ?? 512 * 1024 * 1024,
      minLengthMs: overrides.minLengthMs ?? 0,
      minPlayers: overrides.minPlayers ?? 0,
      now: () => time,
    });
  }

  it("buffers until setMissionName, then records a parseable demo", async () => {
    const info = vi.spyOn(demoLog, "info").mockImplementation(() => {});
    const warn = vi.spyOn(demoLog, "warn").mockImplementation(() => {});
    const error = vi.spyOn(demoLog, "error").mockImplementation(() => {});
    const recorder = createRecorder();
    const packets: Uint8Array[] = [];
    for (let i = 1; i <= 10; i++) {
      const packet = buildPingPacket(i);
      packets.push(packet);
      recorder.onPacket(packet, false);
      recorder.onMove();
      if (i === 3) recorder.onSent();
      time += 100;
    }
    expect(recorder.state).toBe("buffering");

    recorder.setMissionName("Katabatic");
    recorder.setMissionName("Katabatic", 42);
    expect(recorder.state).toBe("recording");
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "demo_recording_started",
        startMode: "from_connect",
        bufferedEntries: 21,
        bufferedBytes: packets.reduce((sum, packet) => sum + packet.length, 0),
        bufferedMs: 1000,
        skippedEntries: 0,
        fallbackReason: undefined,
      }),
      "Demo recording started",
    );
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    for (let i = 11; i <= 15; i++) {
      const packet = buildPingPacket(i);
      packets.push(packet);
      recorder.onPacket(packet, false);
      recorder.onMove();
      time += 100;
    }

    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
    expect(recorder.state).toBe("done");

    const { header, initialBlock, blocks } = await parseDemoFile(result!.path);
    const packetBlocks = blocks.filter((b) => b.type === BlockTypePacket);
    const sendBlocks = blocks.filter((b) => b.type === BlockTypeSendPacket);

    // One Move block per connection move, in stream order — the demo
    // clock follows the moves, not the wall time between events.
    expect(
      blocks
        .filter((b) => b.type !== BlockTypeInfo)
        .map((b) => b.type)
        .slice(0, 7),
    ).toEqual([
      BlockTypePacket,
      BlockTypeMove,
      BlockTypePacket,
      BlockTypeMove,
      BlockTypePacket,
      BlockTypeMove,
      BlockTypeSendPacket,
    ]);
    expect(blocks.filter((b) => b.type === BlockTypeMove)).toHaveLength(15);
    expect(header.demoLengthMs).toBe(15 * 32);
    expect(result!.durationMs).toBe(header.demoLengthMs);
    expect(sendBlocks.length).toBe(1);
    expect(packetBlocks.map((b) => b.data)).toEqual(packets);

    expect(initialBlock.missionName).toBe("Katabatic");
    expect(initialBlock.connectionState.connectSequence).toBe(CONNECT_SEQUENCE);
    const missionInfo = extractMissionInfo(initialBlock.demoValues);
    expect(missionInfo.recorderName).toBe("Observer");
    expect(missionInfo.recorderClientId).toBe(1);
    expect(missionInfo.serverDisplayName).toBe("| the cut |");
    expect(missionInfo.missionDisplayName).toBe("Katabatic");
    expect(missionInfo.missionType).toBe("Capture the Flag");
    expect(missionInfo.mod).toBe("classic");

    // The standard saveDemoSettings sections must parse cleanly:
    // without them, positional readers (real client + app playback)
    // misread the PJ metadata tail and its last row leaks into the
    // chat HUD as a bogus "3ClassicLCTF0<BLANK>"-style line.
    const hudState = parseDemoValues(initialBlock.demoValues);
    expect(hudState.chatMessages).toEqual([]);
    expect(hudState.playerRoster.size).toBe(0);
    expect(hudState.gravity).toBe(-20);
    // Tribes2.exe applies the CLOCK time regardless of visibility: a
    // relay demo counts up from 00:00 until the joiner-sync MsgSystemClock
    // re-anchors it, exactly as the real client shows.
    expect(hudState.clockTimeMin).toBe(0);
  });

  it("writes an Info block only after packets the connection dispatched", async () => {
    const warn = vi.spyOn(demoLog, "warn").mockImplementation(() => {});
    const info = vi.spyOn(demoLog, "info").mockImplementation(() => {});
    const error = vi.spyOn(demoLog, "error").mockImplementation(() => {});
    // The connection decides (Tribes2.exe writes Info from readPacket);
    // the recorder only follows its flag, buffered or not.
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1), true);
    recorder.onPacket(buildPingPacket(2), false);
    time += 250;
    recorder.setMissionName("Katabatic", 42);
    recorder.setMissionName("Katabatic", 42);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "demo_recording_started",
        startMode: "fallback",
        address: serverInfo.address,
        serverName: serverInfo.name,
        missionName: "Katabatic",
        missionSequence: 42,
        connectSequence: CONNECT_SEQUENCE,
        bufferedEntries: 2,
        bufferedBytes: buildPingPacket(1).length * 2,
        bufferedMs: 250,
        skippedEntries: 0,
        fallbackReason: "packet 0 dispatch differs from the connection's",
        err: undefined,
      }),
      expect.stringContaining("recording from connect"),
    );
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    recorder.onPacket(buildPingPacket(3), false);
    recorder.onPacket(buildPingPacket(4), true);
    recorder.onMove();

    const result = await recorder.finalize("test");
    expect(warn.mock.calls[0][0]).toMatchObject({
      file: path.basename(result!.path),
    });
    const { blocks } = await parseDemoFile(result!.path);
    expect(blocks.map((b) => b.type)).toEqual([
      BlockTypePacket,
      BlockTypeInfo,
      BlockTypePacket,
      BlockTypePacket,
      BlockTypePacket,
      BlockTypeInfo,
      BlockTypeMove,
    ]);
  });

  it("starts the file where the start plan puts it", async () => {
    const info = vi.spyOn(demoLog, "info").mockImplementation(() => {});
    const warn = vi.spyOn(demoLog, "warn").mockImplementation(() => {});
    const error = vi.spyOn(demoLog, "error").mockImplementation(() => {});
    const plan = vi.spyOn(demoStart, "planDemoStart").mockReturnValue({
      skip: 3,
      gravity: Math.fround(-26.9),
      start: {
        taggedStrings: new Map([[0, "t2csri_pokeClient"]]),
        lastMoveAck: 0,
        lastClientMove: 0,
        firstMoveIndex: 0,
        sensorGroup: 0,
        queuedMoves: 1,
        protocol: {
          ...freshConnectionProtocolState(CONNECT_SEQUENCE),
          lastSeqRecvd: 1,
          lastSendSeq: 1,
        },
        nextRecvEventSeq: 3,
      },
    });
    const recorder = createRecorder();
    const packets = [1, 2, 3].map(buildPingPacket);
    recorder.onPacket(packets[0], false);
    recorder.onMove();
    recorder.onSent();
    recorder.onPacket(packets[1], false);
    recorder.onMove();
    recorder.setMissionName("Katabatic");
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "demo_recording_started",
        startMode: "after_handshake",
        bufferedEntries: 5,
        skippedEntries: 3,
        fallbackReason: undefined,
      }),
      "Demo recording started",
    );
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    recorder.onPacket(packets[2], false);
    recorder.onMove();

    const result = await recorder.finalize("test");
    expect(plan).toHaveBeenCalledOnce();
    expect(plan.mock.calls[0][0]).toHaveLength(5);
    expect(plan.mock.calls[0][1]).toBe(CONNECT_SEQUENCE);
    const { header, initialBlock, blocks } = await parseDemoFile(result!.path);
    expect(blocks.map((b) => b.type)).toEqual([
      BlockTypePacket,
      BlockTypeMove,
      BlockTypePacket,
      BlockTypeMove,
    ]);
    expect(
      blocks.filter((b) => b.type === BlockTypePacket).map((b) => b.data),
    ).toEqual(packets.slice(1));
    // Only the moves in the file are on its clock.
    expect(header.demoLengthMs).toBe(2 * 32);
    expect(result!.durationMs).toBe(header.demoLengthMs);
    expect(initialBlock.taggedStrings).toEqual(
      new Map([[0, "t2csri_pokeClient"]]),
    );
    expect(initialBlock.moves).toHaveLength(1);
    expect(initialBlock.nextRecvEventSeq).toBe(3);
    expect(initialBlock.notifyCount).toBe(1);
    expect(parseDemoValues(initialBlock.demoValues).gravity).toBe(-26.9);
  });

  it("passes every entry it writes through the welcome-page filter", async () => {
    const info = vi.spyOn(demoLog, "info").mockImplementation(() => {});
    vi.spyOn(demoStart, "planDemoStart").mockReturnValue({ skip: 1 });
    const forRecording = vi.spyOn(JoinGameOverFilter, "forRecording");
    const filtered: string[] = [];
    vi.spyOn(JoinGameOverFilter.prototype, "apply").mockImplementation(
      (entry) => {
        filtered.push(entry.kind);
        return entry.kind === "packet";
      },
    );
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1), false);
    recorder.onMove();
    recorder.setMissionName("Katabatic");
    recorder.onSent();
    recorder.onPacket(buildPingPacket(2), false);
    await recorder.finalize("test");
    expect(forRecording).toHaveBeenCalledWith(undefined, CONNECT_SEQUENCE);
    expect(filtered).toEqual(["move", "sent", "packet"]);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ atMs: 32 }),
      "Rewrote a welcome page that would leave Tribes2.exe on the debrief screen",
    );
  });

  it("records from connect if start planning throws", async () => {
    const error = vi.spyOn(demoLog, "error").mockImplementation(() => {});
    const info = vi.spyOn(demoLog, "info").mockImplementation(() => {});
    const warn = vi.spyOn(demoLog, "warn").mockImplementation(() => {});
    const err = new Error("planner bug");
    vi.spyOn(demoStart, "planDemoStart").mockImplementation(() => {
      throw err;
    });
    const recorder = createRecorder();
    const packet = buildPingPacket(1);
    recorder.onPacket(packet, false);
    recorder.onMove();
    recorder.setMissionName("Katabatic", 42);
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "demo_recording_started",
        startMode: "fallback",
        address: serverInfo.address,
        serverName: serverInfo.name,
        missionName: "Katabatic",
        missionSequence: 42,
        connectSequence: CONNECT_SEQUENCE,
        bufferedEntries: 2,
        bufferedBytes: packet.length,
        bufferedMs: 0,
        skippedEntries: 0,
        fallbackReason: "Unexpected error reconstructing demo start",
        err,
      }),
      expect.stringContaining("recording from connect"),
    );
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    const result = await recorder.finalize("test");
    expect(error.mock.calls[0][0]).toMatchObject({
      file: path.basename(result!.path),
    });
    const { initialBlock, blocks } = await parseDemoFile(result!.path);
    expect(blocks.map((b) => b.data)).toEqual([packet, expect.anything()]);
    expect(initialBlock.taggedStrings.size).toBe(0);
    expect(parseDemoValues(initialBlock.demoValues).gravity).toBe(-20);
  });

  it("parseDemoValues skips section parsing for legacy tail-only demoValues", () => {
    const legacy = [
      "NewDemoData",
      "1",
      "readplayerinfo",
      "1\t0\tObserver\t\t0",
      "1",
      "readplayerinfo",
      "2\tserver\t1.2.3.4:28000\tMay-16-2025 5:04AM\tKatabatic",
      "1",
      "readplayerinfo",
      "3\tclassic\tLCTF\t0\t<BLANK>",
    ];
    const hudState = parseDemoValues(legacy);
    expect(hudState.chatMessages).toEqual([]);
    expect(hudState.playerRoster.size).toBe(0);
  });

  it("flushes with the server-info mission name when buffering caps expire", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1), false);
    time += 31_000;
    recorder.onPacket(buildPingPacket(2), false);
    expect(recorder.state).toBe("recording");

    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
    const { initialBlock } = await parseDemoFile(result!.path);
    expect(initialBlock.missionName).toBe("Damnation");
  });

  it("adds a late mission sequence after the buffering fallback without relabeling the map", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1), false);
    time += 31_000;
    recorder.onPacket(buildPingPacket(2), false);
    recorder.setMissionName("Katabatic", 40);
    recorder.setMissionName("Damnation", 41);
    const result = await recorder.finalize("test");
    const record = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf8"),
    );
    expect(record.games).toMatchObject([
      { mission: "Damnation", missionSequence: 41 },
    ]);
  });

  it("returns null and keeps no file when finalized while buffering", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1), false);
    const result = await recorder.finalize("test");
    expect(result).toBeNull();
    expect(recorder.state).toBe("aborted");
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("drops demos shorter than minLengthMs", async () => {
    const recorder = createRecorder({ minLengthMs: 60_000 });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    // Only moves advance the demo clock, however long the wall-clock gap.
    time += 120_000;
    recorder.onMove();
    recorder.onPacket(buildPingPacket(2), false);
    const result = await recorder.finalize("test");
    expect(result).toBeNull();
    expect(recorder.state).toBe("aborted");
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("drops demos whose peak player count stayed below minPlayers", async () => {
    const recorder = createRecorder({ minPlayers: 2, playerCount: () => 1 });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    time += 1000;
    recorder.onPacket(buildPingPacket(2), false);
    const result = await recorder.finalize("test");
    expect(result).toBeNull();
    expect(recorder.state).toBe("aborted");
    expect(recorder.failure).toBeNull();
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("keeps demos once the player count peaked, even after dipping", async () => {
    let players = 2;
    const recorder = createRecorder({
      minPlayers: 2,
      playerCount: () => players,
    });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    // Peak during the recording (pre-flush samples are discarded as the
    // previous mission's), then dip before finalize.
    recorder.onPacket(buildPingPacket(2), false);
    players = 0;
    time += 1000;
    recorder.onPacket(buildPingPacket(3), false);
    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
  });

  it("drops demos where the match never started (pre-match warmup)", async () => {
    const recorder = createRecorder({ matchStarted: () => false });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    time += 1000;
    recorder.onPacket(buildPingPacket(2), false);
    const result = await recorder.finalize("test");
    expect(result).toBeNull();
    expect(recorder.state).toBe("aborted");
    expect(recorder.failure).toBeNull();
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("keeps demos once the match started, even mid-recording", async () => {
    let started = false;
    const recorder = createRecorder({ matchStarted: () => started });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    started = true;
    time += 1000;
    recorder.onPacket(buildPingPacket(2), false);
    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
  });

  it("counts tag-less names once across tag changes while keeping sanitized aliases searchable", async () => {
    const roster = new Map([
      [1, { rawName: "Observer" }],
      [2, { rawName: "\x02\x01Alice" }],
      [3, { rawName: "Bob" }],
      [4, { rawName: "  " }],
    ]);
    const recorder = createRecorder({ playerRoster: () => roster });
    recorder.onPacket(buildPingPacket(1), false);
    time += 100;
    recorder.setMissionName("Katabatic");
    for (let i = 2; i <= 5; i++) {
      recorder.onPacket(buildPingPacket(i), false);
      time += 100;
    }
    // Bob leaves (stays in the union); Chloé joins wrapped in C1/DEL junk.
    roster.delete(3);
    roster.set(2, { rawName: "\x10\x0b[TAG]\x08Alice\x11" });
    roster.set(4, { rawName: "\x9fChloé\x7f" });
    for (let i = 6; i <= 10; i++) {
      recorder.onPacket(buildPingPacket(i), false);
      time += 100;
    }

    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
    const sidecar: unknown = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf-8"),
    );
    expect(sidecar).toEqual({
      filename: path.basename(result!.path),
      bytes: (await fsp.stat(result!.path)).size,
      recordedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/),
      server: "| the cut |",
      address: "45.76.24.91:28000",
      games: [
        {
          mission: "Katabatic",
          gameType: "Capture the Flag",
          startMs: 0,
          tournament: false,
        },
      ],
      mod: "classic",
      recorder: "Observer",
      durationMs: result!.durationMs,
      // No record context in this test → generic trigger.
      reason: "session recording, peak 2 players, match started",
      // Sorted, deduped, control chars stripped, blank and the
      // recorder's own connection excluded.
      players: ["[TAG]Alice", "Alice", "Bob", "Chloé"],
      playerCount: 3,
    });
  });

  it("sidecar uses finalize-time stream identity; the file keeps flush-time values", async () => {
    // Nothing known at flush (fresh session, MsgMissionDropInfo not yet
    // received) — the stream names the server mid-recording.
    let identity: ServerIdentity = {};
    const recorder = createRecorder({ serverIdentity: () => identity });
    recorder.onPacket(buildPingPacket(1), false);
    time += 100;
    recorder.setMissionName("Katabatic", 41);
    identity = { name: "| the cut |", gameType: "LCTF" };
    for (let i = 2; i <= 5; i++) {
      recorder.onPacket(buildPingPacket(i), false);
      time += 100;
    }

    // A later same-map phase must not relabel the segment being finalized.
    recorder.setMissionName("Katabatic", 42);

    const result = await recorder.finalize("test");
    const { initialBlock } = await parseDemoFile(result!.path);
    const info = extractMissionInfo(initialBlock.demoValues);
    // In-file $DemoValues are baked at flush: address fallback, no type.
    expect(info.serverDisplayName).toBe(serverInfo.address);
    expect(info.missionType).toBeNull();

    const sidecar = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf-8"),
    ) as Record<string, unknown>;
    expect(sidecar.server).toBe("| the cut |");
    expect(sidecar.games).toEqual([
      {
        mission: "Katabatic",
        missionSequence: 41,
        gameType: "LCTF",
        startMs: 0,
        tournament: false,
      },
    ]);
    expect(sidecar.mod).toBe("");
  });

  it("records the mission's tournament mode on the sidecar game", async () => {
    const recorder = createRecorder({
      serverIdentity: () => ({ gameType: "CTF", tournament: true }),
    });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    for (let i = 2; i <= 5; i++) {
      recorder.onPacket(buildPingPacket(i), false);
      time += 100;
    }
    const result = await recorder.finalize("test");
    const sidecar = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf-8"),
    ) as { games: Array<{ tournament: boolean }> };
    expect(sidecar.games[0].tournament).toBe(true);
  });

  it("ignores pre-flush start signals (they belong to the prior mission)", async () => {
    // Connecting into the previous mission's intermission debrief must
    // not mark the newly recorded mission's match as started.
    let started = true;
    const recorder = createRecorder({ matchStarted: () => started });
    recorder.onPacket(buildPingPacket(1), false);
    time += 100;
    started = false;
    recorder.setMissionName("Katabatic");
    for (let i = 2; i <= 6; i++) {
      recorder.onPacket(buildPingPacket(i), false);
      time += 100;
    }
    expect(await recorder.finalize("test")).toBeNull();
    expect(recorder.state).toBe("aborted");
  });

  it("ignores pre-flush player samples (previous mission's debrief)", async () => {
    // Connecting into a crowded intermission must not let its peak
    // player count pass the keep gate for a near-empty next mission.
    let count = 24;
    const recorder = createRecorder({
      minPlayers: 2,
      playerCount: () => count,
    });
    recorder.onPacket(buildPingPacket(1), false);
    time += 100;
    count = 0;
    recorder.setMissionName("Katabatic");
    for (let i = 2; i <= 6; i++) {
      recorder.onPacket(buildPingPacket(i), false);
      time += 100;
    }
    expect(await recorder.finalize("test")).toBeNull();
    expect(recorder.state).toBe("aborted");
  });

  it("records a keep reason describing the trigger and gates", async () => {
    const recorder = createRecorder({
      playerCount: () => 3,
      recordContext: () => ({ pinned: true, watchers: 2 }),
    });
    recorder.onPacket(buildPingPacket(1), false);
    time += 100;
    recorder.setMissionName("Katabatic");
    recorder.onPacket(buildPingPacket(2), false);
    const result = await recorder.finalize("test");
    const sidecar = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf-8"),
    ) as Record<string, unknown>;
    expect(sidecar.reason).toBe(
      "patrol pin, 2 watchers, peak 3 players, match started",
    );
  });

  it("keeps recording valid packets after oversized datagrams are discarded at reception", async () => {
    const roster = new Map([[2, { rawName: "Alice" }]]);
    const recorder = createRecorder({ playerRoster: () => roster });
    const conn = new GameConnection(serverInfo.address);
    const receiver = conn as unknown as {
      _status: string;
      protocol: { connectSequence: number };
      handleMessage(msg: Buffer): void;
    };
    receiver._status = "connected";
    receiver.protocol.connectSequence = CONNECT_SEQUENCE;
    const recordPacket = vi.fn((data: Uint8Array, dispatched: boolean) =>
      recorder.onPacket(data, dispatched),
    );
    conn.on("packet", recordPacket);
    const receive = (seq: number, size?: number) => {
      const packet = buildPingPacket(seq);
      const datagram = Buffer.alloc(size ?? packet.length);
      datagram.set(packet);
      receiver.handleMessage(datagram);
    };

    receive(1);
    time += 100;
    receive(2, 5000);
    expect(recorder.state).toBe("buffering");
    recorder.setMissionName("Katabatic");
    time += 100;
    receive(2);
    time += 100;
    receive(3, 1501);
    time += 100;
    receive(3);
    expect(recorder.state).toBe("recording");
    expect(recordPacket).toHaveBeenCalledTimes(3);
    expect(conn.status).toBe("connected");

    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
    const { blocks } = await parseDemoFile(result!.path);
    const packetBlocks = blocks.filter((b) => b.type === BlockTypePacket);
    expect(packetBlocks.map((b) => b.data)).toEqual([
      buildPingPacket(1),
      buildPingPacket(2),
      buildPingPacket(3),
    ]);
    expect(blocks.some((b) => b.type === BlockTypeSendPacket)).toBe(false);
    const sidecar = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf8"),
    );
    expect(sidecar.players).toEqual(["Alice"]);
    expect(sidecar.playerCount).toBe(1);
  });

  it("stops growing at the size cap but keeps the recording", async () => {
    const recorder = createRecorder({ maxBytes: 1 });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    // The cap is judged on bytes that reached the file; wait for the
    // header to land so the next write trips it.
    await vi.waitFor(() => {
      expect(
        (recorder as unknown as { writer: { bytesWritten: number } }).writer
          .bytesWritten,
      ).toBeGreaterThan(1);
    });
    time += 100;
    recorder.onPacket(buildPingPacket(2), false);
    time += 100;
    recorder.onPacket(buildPingPacket(3), false);
    expect(recorder.state).toBe("recording");

    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
    expect(recorder.failure).toBeNull();
    const { blocks } = await parseDemoFile(result!.path);
    const packets = blocks
      .filter((b) => b.type === BlockTypePacket)
      .map((b) => b.data);
    expect(packets).toEqual([buildPingPacket(1), buildPingPacket(2)]);
  });

  it("drops capped footage when the required players and match start arrive after its cutoff", async () => {
    let players = 1;
    let started = false;
    const recorder = createRecorder({
      maxBytes: 1,
      minPlayers: 2,
      playerCount: () => players,
      matchStarted: () => started,
    });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    await vi.waitFor(() => {
      expect(
        (recorder as unknown as { writer: { bytesWritten: number } }).writer
          .bytesWritten,
      ).toBeGreaterThan(1);
    });
    expect(recorder.onPacket(buildPingPacket(2), false)).toBe(true);
    recorder.sampleRecordedState();
    players = 2;
    started = true;
    expect(recorder.onPacket(buildPingPacket(3), false)).toBe(false);
    expect(await recorder.finalize("test")).toBeNull();
  });

  it("freezes roster metadata at the size cap, including the final accepted packet", async () => {
    const roster = new Map([[2, { rawName: "Alice" }]]);
    const recorder = createRecorder({
      maxBytes: 1,
      playerRoster: () => roster,
    });
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    await vi.waitFor(() => {
      expect(
        (recorder as unknown as { writer: { bytesWritten: number } }).writer
          .bytesWritten,
      ).toBeGreaterThan(1);
    });
    expect(recorder.onPacket(buildPingPacket(2), false)).toBe(true);
    // Live packet state applies after its bytes are accepted.
    roster.set(3, { rawName: "Bob" });
    recorder.sampleRecordedState();
    roster.set(4, { rawName: "After cutoff" });
    expect(recorder.onPacket(buildPingPacket(3), false)).toBe(false);
    const result = await recorder.finalize("test");
    const sidecar = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf8"),
    );
    expect(sidecar.players).toEqual(["Alice", "Bob"]);
    expect(sidecar.playerCount).toBe(2);
  });

  it("retains aliases from the recorded backlog and freezes them before async finalization", async () => {
    const roster = new Map([[2, { rawName: "Before Phase1" }]]);
    const recorder = createRecorder({ playerRoster: () => roster });
    recorder.onPacket(buildPingPacket(1), false);
    roster.clear();
    recorder.setMissionName("Katabatic");
    roster.set(3, { rawName: "During match" });
    recorder.onPacket(buildPingPacket(2), false);
    const finishing = recorder.finalize("test");
    // A reconnect/new epoch cannot leak into the detached recorder.
    roster.clear();
    roster.set(4, { rawName: "Next connection" });
    recorder.sampleRecordedState();
    expect(recorder.onPacket(buildPingPacket(3), false)).toBe(false);
    const result = await finishing;
    const sidecar = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf8"),
    );
    expect(sidecar.players).toEqual(["Before Phase1", "During match"]);
    expect(sidecar.playerCount).toBe(2);
  });

  it("strands the spool on a stream error instead of deleting it", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    const partial = recorder.partialPath!;
    const writer = (
      recorder as unknown as { writer: { deflate: EventEmitter } }
    ).writer;
    writer.deflate.emit("error", new Error("disk gone"));
    time += 100;
    recorder.onPacket(buildPingPacket(2), false);
    expect(recorder.state).toBe("aborted");
    expect(recorder.failure).toBe("stream-error");
    // The spool stays for the boot salvage; abort() must not remove it.
    // (The stream opens the file asynchronously, hence the wait.)
    await recorder.abort();
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([path.basename(partial)]);
    });
    expect(await recorder.finalize("test")).toBeNull();
  });

  it("exposes its spool path only while a file is open", async () => {
    const recorder = createRecorder();
    expect(recorder.partialPath).toBeNull();
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    expect(recorder.partialPath).toMatch(/\.rec\.partial$/);
    expect(path.dirname(recorder.partialPath!)).toBe(dir);
    await recorder.abort();
  });

  it("explicitly discards a failed spool when a server admin disables recording", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    const writer = (
      recorder as unknown as { writer: { deflate: EventEmitter } }
    ).writer;
    writer.deflate.emit("error", new Error("disk gone"));
    recorder.onPacket(buildPingPacket(2), false);
    expect(recorder.state).toBe("aborted");
    await recorder.abort({ discardStranded: true });
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("abort is idempotent and clears the partial file", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1), false);
    recorder.setMissionName("Katabatic");
    await recorder.abort();
    await recorder.abort();
    expect(recorder.state).toBe("aborted");
    expect(await fsp.readdir(dir)).toEqual([]);
    expect(await recorder.finalize("test")).toBeNull();
  });
});

describe("buildDemoFilename", () => {
  it("slugs server and mission, stamps sortable UTC time, appends a random id", () => {
    const name = buildDemoFilename(
      new Date(Date.UTC(2026, 7, 20, 9, 5, 7)),
      "| the cut |",
      "MiniSunDried",
    );
    expect(name).toMatch(
      /^the-cut_20260820T0905_minisundried_[0-9a-f]{6}\.rec$/,
    );
  });

  it("falls back when a component slugs to nothing", () => {
    const name = buildDemoFilename(
      new Date(Date.UTC(2026, 0, 2, 0, 5)),
      "|||",
      "",
    );
    expect(name).toMatch(/^server_20260102T0005_mission_[0-9a-f]{6}\.rec$/);
  });

  it("generates distinct names for identical inputs", () => {
    const date = new Date(Date.UTC(2026, 7, 20, 9, 5));
    expect(buildDemoFilename(date, "Legacy CTF+", "Katabatic")).not.toBe(
      buildDemoFilename(date, "Legacy CTF+", "Katabatic"),
    );
  });
});

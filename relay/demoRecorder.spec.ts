import { beforeEach, describe, expect, it } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
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
import type { ServerInfo } from "./types.js";

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

  function createRecorder(
    overrides: {
      minLengthMs?: number;
      minPlayers?: number;
      playerCount?: () => number;
      playerNames?: () => string[];
      serverIdentity?: () => ServerIdentity;
      matchStarted?: () => boolean;
      recordContext?: () => { pinned: boolean; watchers: number };
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
      getPlayerNames: overrides.playerNames ?? (() => []),
      getMatchStarted: overrides.matchStarted ?? (() => true),
      getRecordContext: overrides.recordContext,
      recorderName: "Observer",
      maxBytes: 512 * 1024 * 1024,
      minLengthMs: overrides.minLengthMs ?? 0,
      minPlayers: overrides.minPlayers ?? 0,
      now: () => time,
    });
  }

  it("buffers until setMissionName, then records a parseable demo", async () => {
    const recorder = createRecorder();
    const packets: Uint8Array[] = [];
    for (let i = 1; i <= 10; i++) {
      const packet = buildPingPacket(i);
      packets.push(packet);
      recorder.onPacket(packet);
      if (i === 3) recorder.onSent();
      time += 100;
    }
    expect(recorder.state).toBe("buffering");

    recorder.setMissionName("Katabatic");
    expect(recorder.state).toBe("recording");

    for (let i = 11; i <= 15; i++) {
      const packet = buildPingPacket(i);
      packets.push(packet);
      recorder.onPacket(packet);
      time += 100;
    }
    const lastEventTime = time - 100;

    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
    expect(recorder.state).toBe("done");

    const { header, initialBlock, blocks } = await parseDemoFile(result!.path);
    const moveBlocks = blocks.filter((b) => b.type === BlockTypeMove);
    const packetBlocks = blocks.filter((b) => b.type === BlockTypePacket);
    const sendBlocks = blocks.filter((b) => b.type === BlockTypeSendPacket);

    // The move clock covers first event → last event at 32 ms per move.
    expect(moveBlocks.length).toBe(Math.floor((lastEventTime - 100_000) / 32));
    expect(header.demoLengthMs).toBe(moveBlocks.length * 32);
    expect(result!.durationMs).toBe(header.demoLengthMs);
    expect(sendBlocks.length).toBe(1);
    expect(packetBlocks.map((b) => b.data)).toEqual(packets);

    expect(initialBlock.missionName).toBe("Katabatic");
    expect(initialBlock.connectionState.connectSequence).toBe(CONNECT_SEQUENCE);
    const info = extractMissionInfo(initialBlock.demoValues);
    expect(info.recorderName).toBe("Observer");
    expect(info.serverDisplayName).toBe("| the cut |");
    expect(info.missionDisplayName).toBe("Katabatic");
    expect(info.missionType).toBe("Capture the Flag");
    expect(info.mod).toBe("classic");

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
    recorder.onPacket(buildPingPacket(1));
    time += 31_000;
    recorder.onPacket(buildPingPacket(2));
    expect(recorder.state).toBe("recording");

    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
    const { initialBlock } = await parseDemoFile(result!.path);
    expect(initialBlock.missionName).toBe("Damnation");
  });

  it("returns null and keeps no file when finalized while buffering", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1));
    const result = await recorder.finalize("test");
    expect(result).toBeNull();
    expect(recorder.state).toBe("aborted");
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("drops demos shorter than minLengthMs", async () => {
    const recorder = createRecorder({ minLengthMs: 60_000 });
    recorder.onPacket(buildPingPacket(1));
    recorder.setMissionName("Katabatic");
    time += 1000;
    recorder.onPacket(buildPingPacket(2));
    const result = await recorder.finalize("test");
    expect(result).toBeNull();
    expect(recorder.state).toBe("aborted");
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("drops demos whose peak player count stayed below minPlayers", async () => {
    const recorder = createRecorder({ minPlayers: 2, playerCount: () => 1 });
    recorder.onPacket(buildPingPacket(1));
    recorder.setMissionName("Katabatic");
    time += 1000;
    recorder.onPacket(buildPingPacket(2));
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
    recorder.onPacket(buildPingPacket(1));
    recorder.setMissionName("Katabatic");
    // Peak during the recording (pre-flush samples are discarded as the
    // previous mission's), then dip before finalize.
    recorder.onPacket(buildPingPacket(2));
    players = 0;
    time += 1000;
    recorder.onPacket(buildPingPacket(3));
    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
  });

  it("drops demos where the match never started (pre-match warmup)", async () => {
    const recorder = createRecorder({ matchStarted: () => false });
    recorder.onPacket(buildPingPacket(1));
    recorder.setMissionName("Katabatic");
    time += 1000;
    recorder.onPacket(buildPingPacket(2));
    const result = await recorder.finalize("test");
    expect(result).toBeNull();
    expect(recorder.state).toBe("aborted");
    expect(recorder.failure).toBeNull();
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("keeps demos once the match started, even mid-recording", async () => {
    let started = false;
    const recorder = createRecorder({ matchStarted: () => started });
    recorder.onPacket(buildPingPacket(1));
    recorder.setMissionName("Katabatic");
    started = true;
    time += 1000;
    recorder.onPacket(buildPingPacket(2));
    const result = await recorder.finalize("test");
    expect(result).not.toBeNull();
  });

  it("writes a metadata sidecar with unique sanitized player names", async () => {
    let names = ["Observer", "\x02\x01Alice", "  ", "Bob"];
    const recorder = createRecorder({ playerNames: () => names });
    recorder.onPacket(buildPingPacket(1));
    time += 100;
    recorder.setMissionName("Katabatic");
    for (let i = 2; i <= 5; i++) {
      recorder.onPacket(buildPingPacket(i));
      time += 100;
    }
    // Bob leaves (stays in the union); Chloé joins wrapped in C1/DEL junk.
    names = ["Observer", "Alice", "\x9fChloé\x7f"];
    for (let i = 6; i <= 10; i++) {
      recorder.onPacket(buildPingPacket(i));
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
        { mission: "Katabatic", gameType: "Capture the Flag", startMs: 0 },
      ],
      mod: "classic",
      recorder: "Observer",
      durationMs: result!.durationMs,
      // No record context in this test → generic trigger.
      reason: "session recording, peak 2 players, match started",
      // Sorted, deduped, control chars stripped, blank and the
      // recorder's own connection excluded.
      players: ["Alice", "Bob", "Chloé"],
    });
  });

  it("sidecar uses finalize-time stream identity; the file keeps flush-time values", async () => {
    // Nothing known at flush (fresh session, MsgMissionDropInfo not yet
    // received) — the stream names the server mid-recording.
    let identity: ServerIdentity = {};
    const recorder = createRecorder({ serverIdentity: () => identity });
    recorder.onPacket(buildPingPacket(1));
    time += 100;
    recorder.setMissionName("Katabatic");
    identity = { name: "| the cut |", gameType: "LCTF" };
    for (let i = 2; i <= 5; i++) {
      recorder.onPacket(buildPingPacket(i));
      time += 100;
    }

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
      { mission: "Katabatic", gameType: "LCTF", startMs: 0 },
    ]);
    expect(sidecar.mod).toBe("");
  });

  it("ignores pre-flush start signals (they belong to the prior mission)", async () => {
    // Connecting into the previous mission's intermission debrief must
    // not mark the newly recorded mission's match as started.
    let started = true;
    const recorder = createRecorder({ matchStarted: () => started });
    recorder.onPacket(buildPingPacket(1));
    time += 100;
    started = false;
    recorder.setMissionName("Katabatic");
    for (let i = 2; i <= 6; i++) {
      recorder.onPacket(buildPingPacket(i));
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
    recorder.onPacket(buildPingPacket(1));
    time += 100;
    count = 0;
    recorder.setMissionName("Katabatic");
    for (let i = 2; i <= 6; i++) {
      recorder.onPacket(buildPingPacket(i));
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
    recorder.onPacket(buildPingPacket(1));
    time += 100;
    recorder.setMissionName("Katabatic");
    recorder.onPacket(buildPingPacket(2));
    const result = await recorder.finalize("test");
    const sidecar = JSON.parse(
      await fsp.readFile(`${result!.path}.json`, "utf-8"),
    ) as Record<string, unknown>;
    expect(sidecar.reason).toBe(
      "patrol pin, 2 watchers, peak 3 players, match started",
    );
  });

  it("skips oversized packets and keeps recording", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1));
    recorder.setMissionName("Katabatic");
    time += 100;
    recorder.onPacket(new Uint8Array(5000));
    time += 100;
    const smallPacket = buildPingPacket(2);
    recorder.onPacket(smallPacket);
    expect(recorder.state).toBe("recording");

    const result = await recorder.finalize("test");
    const { blocks } = await parseDemoFile(result!.path);
    const packetBlocks = blocks.filter((b) => b.type === BlockTypePacket);
    expect(packetBlocks.map((b) => b.data)).toEqual([
      buildPingPacket(1),
      smallPacket,
    ]);
  });

  it("exposes its spool path only while a file is open", async () => {
    const recorder = createRecorder();
    expect(recorder.partialPath).toBeNull();
    recorder.onPacket(buildPingPacket(1));
    recorder.setMissionName("Katabatic");
    expect(recorder.partialPath).toMatch(/\.rec\.partial$/);
    expect(path.dirname(recorder.partialPath!)).toBe(dir);
    await recorder.abort();
  });

  it("abort is idempotent and clears the partial file", async () => {
    const recorder = createRecorder();
    recorder.onPacket(buildPingPacket(1));
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { WebSocket } from "ws";
import type { PacketData, ParsedData } from "t2-demo-parser";
import {
  WatchSessionManager,
  type WatchSessionManagerOptions,
} from "./watchSession";
import { DemoCoordinator } from "./demoCoordinator";
import { WatchRequest } from "./watchRequest";
import type { GameConnection } from "./gameConnection";
import type { ServerMessage } from "./types";
import { GAME_PROTOCOL_VERSION } from "./shared";
import { relayLog } from "./logger";
import { extractWavTag } from "../src/stream/streamHelpers";

const missionCyclingReason =
  "Server is cycling missions.  Please try to connect in a moment.";
const singleAdminPolicies = [
  { tournament: true, minPlayerCount: 0, adminVotes: 1 },
  { tournament: false, minPlayerCount: 0, adminVotes: 1 },
];

/** Exercise retention/status without file I/O in fake-timer tests. */
function policyCoordinator(): DemoCoordinator {
  return {
    enabled: true,
    createRecorder: () => null,
    finalize: vi.fn(),
    observeMission: vi.fn(),
    updateMission: vi.fn(),
    takeRestoredPolicy: () => undefined,
  } as unknown as DemoCoordinator;
}

class FakeGameConnection extends EventEmitter {
  address: string;
  status = "connecting";
  mapName: string | undefined;
  connectSequence = 0x0badf00d;
  connectCalls = 0;
  disconnectCalls = 0;
  commands: Array<{ command: string; args: string[] }> = [];
  selfClientId: number | null = null;

  constructor(address: string) {
    super();
    this.address = address;
  }

  async connect(): Promise<void> {
    this.connectCalls++;
  }

  disconnect(): void {
    this.disconnectCalls++;
    this.status = "disconnected";
  }

  sendCommand(command: string, ...args: string[]): void {
    this.commands.push({ command, args });
  }

  setMapName(mapName: string): void {
    this.mapName = mapName;
  }

  setStatus(status: string, message?: string): void {
    this.status = status;
    this.emit("status", status, message);
  }

  noAuthPromotions = 0;

  /** Mirrors GameConnection: an unpoked auth wait ends at Phase1. */
  missionStartedWithoutAuth(): void {
    if (this.status !== "authenticating") return;
    this.noAuthPromotions++;
    this.setStatus("connected");
  }
}

interface SentFrame {
  binary: boolean;
  data: Uint8Array | string;
}

class FakeWebSocket {
  OPEN = 1;
  readyState = 1;
  sent: SentFrame[] = [];

  send(data: Uint8Array | string, opts?: { binary?: boolean }): void {
    this.sent.push({ binary: opts?.binary ?? false, data });
  }

  jsonMessages(): ServerMessage[] {
    return this.sent
      .filter((f) => !f.binary)
      .map((f) => JSON.parse(f.data as string) as ServerMessage);
  }

  binaryFrames(): Uint8Array[] {
    return this.sent.filter((f) => f.binary).map((f) => f.data as Uint8Array);
  }

  /** Message types in send order (catch-up chunks appear as "<binary>"). */
  frameTypes(): string[] {
    return this.sent.map((f) =>
      f.binary
        ? "<binary>"
        : (JSON.parse(f.data as string) as ServerMessage).type,
    );
  }
}

function createManager(extra: Partial<WatchSessionManagerOptions> = {}) {
  const connections: FakeGameConnection[] = [];
  const manager = new WatchSessionManager({
    gameBasePath: "/nonexistent",
    getCachedServer: () => undefined,
    createConnection: (address) => {
      const conn = new FakeGameConnection(address);
      connections.push(conn);
      return conn as unknown as GameConnection;
    },
    ...extra,
  });
  return { manager, connections };
}

describe("watch mission controls", () => {
  const address = "1.2.3.4:28000";
  const twoAdminPolicies = [
    { tournament: true, minPlayerCount: 0, adminVotes: 2 },
    { tournament: false, minPlayerCount: 0, adminVotes: 2 },
  ];
  const rolePolicies = (adminVotes: number, superAdminVotes: number) =>
    [true, false].map((tournament) => ({
      tournament,
      minPlayerCount: 0,
      adminVotes,
      superAdminVotes,
    }));
  let manager: WatchSessionManager;
  let connections: FakeGameConnection[];
  let session: any;
  let viewer: FakeWebSocket;
  let saved: Record<string, unknown>;

  const remote = (funcName: string, ...args: string[]): ParsedData => ({
    type: "RemoteCommandEvent",
    funcName,
    args,
  });
  const join = (
    id: number,
    admin = "0",
    superAdmin = "0",
    guid = String(1000 + id),
    rawName = "Same name",
    smurf = "0",
  ) =>
    remote(
      "ServerMessage",
      "MsgClientJoin",
      "",
      rawName,
      String(id),
      "-1",
      "0",
      admin,
      superAdmin,
      smurf,
      guid,
    );
  const chat = (text: string, id = 7, template = "\x06%1: %2") =>
    remote(
      "ChatMessage",
      String(id),
      "",
      "1",
      template,
      "Same name",
      `@MapGenius ${text}`,
    );
  function events(...data: ParsedData[]) {
    session.parserKit.packetParser.parsePacket = () => ({
      gameState: {},
      ghosts: [],
      events: data.map((parsedData) => ({ parsedData })),
    });
    connections.at(-1)!.emit("packet", new Uint8Array([1, 2, 3]));
  }
  function start(options: Partial<WatchSessionManagerOptions> = {}) {
    ({ manager, connections } = createManager({
      adminVotePolicies: singleAdminPolicies,
      demoCoordinator: policyCoordinator(),
      onSessionsChanged: (_addresses, controls) => {
        saved = controls;
      },
      ...options,
    }));
    viewer = new FakeWebSocket();
    manager.watch(viewer as unknown as WebSocket, address);
    session = manager.getSession(address);
    connections[0].selfClientId = 99;
    connections[0].setStatus("connected");
    events(remote("MissionStartPhase1", "1", "Katabatic"), join(7, "1"));
    connections[0].commands.length = 0;
  }
  const sentReplies = () =>
    connections
      .at(-1)!
      .commands.filter((command) => command.command === "messageSent")
      .map((command) => command.args[0]);
  const replies = () => {
    if (session.controlReplyTimer) vi.advanceTimersByTime(3_000);
    return sentReplies().map((reply) => extractWavTag(reply).text);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    start();
  });
  afterEach(() => {
    manager.shutdown();
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const reply of sentReplies()) {
      if (reply.includes("~w"))
        expect(reply.length, reply).toBeLessThanOrEqual(120);
    }
  });

  it.each([
    ["admin", "", 8, "1", "0", "Alice", "0", []],
    ["superadmin smurf", "0", 8, "0", "1", "Alice", "1", []],
    ["admin with malformed GUID", "invalid", 8, "1", "1", "Alice", "0", []],
    ["allowlisted player", "", 8, "0", "0", "Alice", "0", ["Alice"]],
    ["allowlisted self", "0", 99, "0", "0", "MapGenius", "0", ["MapGenius"]],
  ] as const)(
    "ignores %s votes without a valid GUID but still permits status",
    (_role, guid, id, admin, superAdmin, rawName, smurf, names) => {
      manager.shutdown();
      start({
        adminVotePolicies: rolePolicies(2, 1),
        alwaysAdminPlayers: new Set(names),
      });
      const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
      events(
        join(id, admin, superAdmin, guid, rawName, smurf),
        chat("-record -watch", id),
      );
      expect(session.controls.snapshot()).not.toHaveProperty("votes");
      expect(session.controls.recording).toBe(true);
      expect(session.controls.watching).toBe(true);
      expect(session.watcherCount).toBe(1);
      expect(replies().at(-1)).toBe(
        "Nothing changed. Recording: ON. Watching: ON.",
      );
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: id,
          guid: null,
          results: {
            recording: "ignored-missing-guid",
            watching: "ignored-missing-guid",
          },
        }),
        "Mission control command processed",
      );
      events(chat("status", id));
      expect(replies().at(-1)).toBe("Recording: ON. Watching: ON.");
      events(join(9, "1", "0", "456"), chat("-record -watch", 9));
      expect(session.controls.recording).toBe(true);
      expect(session.controls.watching).toBe(true);
      expect(replies().at(-1)).toContain("Votes: -record 1/2 A, 0/1 SA");
    },
  );

  it("keeps an accepted vote when a roster refresh hides its GUID, while rejecting new votes without that GUID", () => {
    manager.shutdown();
    start({ adminVotePolicies: twoAdminPolicies });
    events(join(8, "1", "0", "123"), chat("-record", 8));
    expect(session.controls.voteCount("recording")).toBe(1);
    events(join(8, "1", "0", "0", "Alias", "1"), chat("-watch", 8));
    expect(session.controls.snapshot().votes).toEqual({
      recording: { "guid:123": "admin" },
    });
    expect(session.controls.watching).toBe(true);
    events(join(9, "1", "0", "456"), chat("-record", 9));
    expect(session.controls.recording).toBe(false);
    expect(session.controls.snapshot()).not.toHaveProperty("votes");
  });

  it.each(["record", "watch"] as const)(
    "applies -%s with two admins or a single superadmin and logs both thresholds",
    (setting) => {
      manager.shutdown();
      start({ adminVotePolicies: rolePolicies(2, 1) });
      const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
      events(chat(`-${setting}`));
      expect(replies().at(-1)).toContain(`Votes: -${setting} 1/2 A, 0/1 SA.`);
      expect(replies().at(-1)).not.toContain("Nothing changed.");
      events(join(8, "0", "1", "123"), chat(`-${setting}`, 8));
      const field = setting === "record" ? "recording" : "watching";
      expect(session.controls[field]).toBe(false);
      expect(replies().at(-1)).not.toContain("Votes:");
      expect(replies().at(-1)).not.toContain("Nothing changed.");
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          votesRequired: 2,
          superAdminVotesRequired: 1,
          isSuperAdmin: true,
          results: { [field]: "applied" },
        }),
        "Mission control command processed",
      );
      events(chat(`+${setting}`), chat(`+${setting}`, 8));
      expect(session.controls[field]).toBe(true);
      events(chat(`-${setting}`), join(9, "1"), chat(`-${setting}`, 9));
      expect(session.controls[field]).toBe(false);
    },
  );

  it("rejects regular and allowlisted admin commands under a superadmin-only policy but allows their status requests", () => {
    manager.shutdown();
    start({
      adminVotePolicies: rolePolicies(0, 2),
      alwaysAdminPlayers: new Set(["Alice"]),
    });
    const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
    events(join(8, "0", "0", "123", "Alice"), chat("-record -watch", 8));
    expect(session.controls.snapshot()).not.toHaveProperty("votes");
    expect(replies().at(-1)).toBe(
      "Nothing changed. Recording: ON. Watching: ON.",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        results: {
          recording: "ignored-superadmin-required",
          watching: "ignored-superadmin-required",
        },
      }),
      "Mission control command processed",
    );
    events(chat("status", 8));
    expect(replies().at(-1)).toBe("Recording: ON. Watching: ON.");
    events(chat("-record -watch"));
    expect(session.controls.voteCount("recording")).toBe(0);
    events(join(9, "0", "1", "456"), chat("-record -watch", 9));
    expect(replies().at(-1)).toContain("Votes: -record 1/2 SA, -watch 1/2 SA.");
    events(join(10, "0", "1", "789"), chat("-record -watch", 10));
    expect(session.controls.snapshot()).toMatchObject({
      recording: false,
      watching: false,
    });
  });

  it("counts a superadmin as an ordinary admin when the special threshold is zero", () => {
    manager.shutdown();
    start({ adminVotePolicies: rolePolicies(2, 0) });
    events(join(8, "0", "1", "123"), chat("-record", 8));
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("Votes: -record 1/2.");
    expect(replies().at(-1)).not.toContain(" SA");
    events(chat("-record"));
    expect(session.controls.recording).toBe(false);
  });

  it.each([2, 3])(
    "shows both configured tallies before tournament mode is resolved when the superadmin threshold is %i",
    (superAdminVotes) => {
      manager.shutdown();
      start({ adminVotePolicies: rolePolicies(2, superAdminVotes) });
      events(join(8, "0", "1", "123"), chat("-record", 8));
      expect(session.resolvedTournamentMode).toBeNull();
      expect(replies().at(-1)).toContain(
        `Votes: -record 1/2 A, 1/${superAdminVotes} SA.`,
      );
    },
  );

  it.each([false, true])(
    "gives allowlisted browser self commands superadmin treatment only for a server-granted role (%s)",
    (superadmin) => {
      manager.shutdown();
      start({
        adminVotePolicies: rolePolicies(0, 1),
        alwaysAdminPlayers: new Set(["MapGenius"]),
      });
      events(
        join(99, "0", superadmin ? "1" : "0", "123", "MapGenius"),
        chat("-record -watch", 99),
      );
      expect(session.controls.recording).toBe(!superadmin);
      expect(session.controls.watching).toBe(!superadmin);
      expect(replies().at(-1)?.startsWith("Nothing changed.")).toBe(
        !superadmin,
      );
    },
  );

  it("keeps a superadmin vote at its original level after demotion", () => {
    manager.shutdown();
    start({
      adminVotePolicies: rolePolicies(5, 2),
      alwaysAdminPlayers: new Set(["Alice"]),
    });
    events(join(8, "0", "1", "123", "Alice"), chat("-record", 8));
    expect(replies().at(-1)).toContain("-record 1/5 A, 1/2 SA");
    events(
      remote("ServerMessage", "MsgStripAdminPlayer", "", "Actor", "Alice", "8"),
      chat("-record", 8),
    );
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/5 A, 1/2 SA");
    expect(replies().at(-1)).toContain("Nothing changed.");
    events(join(9, "0", "1", "456"), chat("-record", 9));
    expect(session.controls.recording).toBe(false);
  });

  it("keeps superadmin-only votes on demotion but requires current superadmin privileges for new commands", () => {
    manager.shutdown();
    start({
      adminVotePolicies: rolePolicies(0, 2),
      alwaysAdminPlayers: new Set(["Alice"]),
    });
    events(join(8, "0", "1", "123", "Alice"), chat("-record -watch", 8));
    expect(replies().at(-1)).toContain("Votes: -record 1/2 SA, -watch 1/2 SA.");
    events(
      remote("ServerMessage", "MsgStripAdminPlayer", "", "Actor", "Alice", "8"),
      chat("-record -watch", 8),
    );
    expect(session.controls.snapshot().votes).toEqual({
      recording: { "guid:123": "superadmin" },
      watching: { "guid:123": "superadmin" },
    });
    expect(replies().at(-1)).toContain("Nothing changed.");
    expect(replies().at(-1)).toContain("Votes: -record 1/2 SA, -watch 1/2 SA.");
    events(join(9, "0", "1", "456"), chat("-record -watch", 9));
    expect(session.controls.recording).toBe(false);
    expect(session.controls.watching).toBe(false);
  });

  it("preserves both vote levels and deduplicates accounts through promotions, demotions, and relay restarts", () => {
    manager.shutdown();
    const options = { adminVotePolicies: rolePolicies(5, 3) };
    start(options);
    events(
      join(8, "1", "0", "123"),
      chat("-record", 8),
      join(9, "0", "1", "456"),
      chat("-record", 9),
    );
    const persisted = JSON.parse(JSON.stringify(saved));
    manager.shutdown();
    start({ ...options, initialMissionControls: persisted });
    events(
      join(9, "0", "1", "123"),
      join(10, "1", "0", "456"),
      chat("-record", 9),
      chat("-record", 10),
    );
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 2/5 A, 1/3 SA");
    expect(saved[address]).toMatchObject({
      votes: { recording: { "guid:123": "admin", "guid:456": "superadmin" } },
    });
    events(join(11, "0", "1", "123"), chat("-record", 11));
    expect(session.controls.recording).toBe(true);
    expect(session.controls.voteCount("recording")).toBe(2);
    events(
      join(12, "0", "1", "789"),
      chat("-record", 12),
      chat("+record", 11),
      chat("-record", 11),
    );
    expect(session.controls.recording).toBe(false);
  });

  it("rejects ordinary players, spoofed names, team chat and the relay's own browser chat", () => {
    events(
      join(8),
      join(99, "1", "1"),
      chat("-rec -watch", 8),
      chat("-watch", 99),
      chat("-watch", 7, "\x05%1: %2"),
    );
    expect(saved).toEqual({});
    expect(session.watcherCount).toBe(1);
    expect(replies()).toHaveLength(1);
    expect(replies()[0]).toContain("Only server admins");
    expect(replies()[0]).toMatch(/^Nothing changed\./);
  });

  it("responds to allowlisted self chat received from the server without replying to its own response", () => {
    manager.shutdown();
    start({ alwaysAdminPlayers: new Set(["MapGenius"]) });
    events(join(99, "0", "0", "456", "\x10\x0b[TAG]\x08MapGenius\x11"));
    session.sendChat("@MapGenius status");
    expect(sentReplies()).toEqual(["@MapGenius status"]);
    events(
      { type: "NetStringEvent", id: 123, value: "\x06%1: %2" },
      chat("status", 99, "\x01123"),
    );
    const response = sentReplies().at(-1)!;
    expect(response).toContain("Watching: ON.");
    events(
      remote("ChatMessage", "99", "", "1", "\x06%1: %2", "MapGenius", response),
    );
    vi.advanceTimersByTime(3_000);
    expect(sentReplies()).toEqual(["@MapGenius status", response]);
  });

  it("declines unauthorized status requests without advancing the status voice", () => {
    events(join(8), chat("status", 8));
    expect(sentReplies()).toEqual([
      "Only server admins or relay-authorized players can use MapGenius commands.~wcmd.decline",
    ]);
    events(chat("status"));
    replies();
    expect(sentReplies().at(-1)).toMatch(/~wvqk\.anytime$/);
  });

  it("fits both role tallies in one reply by omitting the reset reminder when needed", () => {
    manager.shutdown();
    start({ adminVotePolicies: rolePolicies(2, 1) });
    events(join(8, "1", "1"), chat("-record -watch", 8));
    expect(replies().at(-1)).toContain("Settings reset next map.");

    events(chat("+record +watch"));
    expect(replies().at(-1)).toBe(
      "Recording: OFF. Watching: OFF. Votes: +record 1/2 A, 0/1 SA, +watch 1/2 A, 0/1 SA.",
    );
    expect(sentReplies().at(-1)).toMatch(/~wcmd\.acknowledge$/);
    events(chat("+record +watch"));
    expect(replies().at(-1)).toBe(
      "Nothing changed. Recording: OFF. Watching: OFF. Votes: +record 1/2 A, 0/1 SA, +watch 1/2 A, 0/1 SA.",
    );
    expect(sentReplies().at(-1)).toMatch(/~wcmd\.decline$/);
    const count = sentReplies().length;
    vi.advanceTimersByTime(10_000);
    expect(sentReplies()).toHaveLength(count);
  });

  it("keeps two-digit vote counts and both role thresholds within the chat limit", () => {
    manager.shutdown();
    const ballot = Object.fromEntries(
      Array.from({ length: 98 }, (_, i) => [`guid:${1007 + i}`, "superadmin"]),
    );
    start({
      adminVotePolicies: rolePolicies(99, 99),
      initialMissionControls: {
        [address]: {
          mission: ["1", "Katabatic"],
          recording: false,
          watching: false,
          votes: { recording: ballot, watching: ballot },
        },
      },
    });
    events(chat("+record +watch"));
    expect(sentReplies()).toEqual([
      "Nothing changed. Recording: OFF. Watching: OFF. Votes: +record 98/99 A, 98/99 SA, +watch 98/99 A, 98/99 SA.~wcmd.decline",
    ]);
    expect(sentReplies()[0]).toHaveLength(120);
  });

  it("applies both controls from allowlisted self chat without game admin privileges", () => {
    manager.shutdown();
    start({ alwaysAdminPlayers: new Set(["MapGenius"]) });
    events(join(99, "0", "0", "456", "MapGenius"), chat("-rec -watch", 99));
    expect(saved[address]).toMatchObject({ recording: false, watching: false });
    expect(replies().at(-1)).toContain("Watching: OFF.");
  });

  it("retains the shared account's single vote while still requiring a second admin", () => {
    manager.shutdown();
    start({
      alwaysAdminPlayers: new Set(["MapGenius"]),
      adminVotePolicies: twoAdminPolicies,
    });
    events(join(99, "0", "0", "456", "MapGenius"));
    for (let i = 0; i < 4; i++) events(chat("-rec", 99));
    events(chat("status", 7));
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/2");
    events(chat("-rec", 7));
    expect(session.controls.recording).toBe(false);
  });

  it.each([
    ["MapGenius", "0", []],
    ["mapgenius", "0", ["MapGenius"]],
    ["MapGenius", "1", ["MapGenius"]],
    ["MapGenius", "", ["MapGenius"]],
  ])(
    "ignores ineligible self commands even with game admin flags: name=%s, smurf=%s, allowlist=%j",
    (rawName, smurf, names) => {
      manager.shutdown();
      start({ alwaysAdminPlayers: new Set(names) });
      const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
      events(
        join(99, "1", "1", "456", rawName, smurf),
        chat("-rec -watch", 99),
      );
      expect(session.controls.snapshot()).toMatchObject({
        recording: true,
        watching: true,
      });
      expect(replies()).toEqual([]);
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 99,
          isSelf: true,
          isSmurf: smurf === "" ? null : smurf === "1",
          isAlwaysAdmin: false,
          outcome: "rejected-not-admin",
        }),
        "Mission control command rejected",
      );
    },
  );

  it("keeps an accepted self vote after its base name leaves the allowlist, while rejecting new self commands", () => {
    manager.shutdown();
    start({
      alwaysAdminPlayers: new Set(["MapGenius"]),
      adminVotePolicies: twoAdminPolicies,
    });
    events(join(99, "1", "1", "456", "MapGenius"), chat("-rec", 99));
    events(
      remote(
        "ServerMessage",
        "MsgClientNameChanged",
        "",
        "MapGenius",
        "OtherName",
        "99",
      ),
      chat("-watch", 99),
      chat("-rec", 7),
    );
    expect(session.controls.recording).toBe(false);
    expect(session.controls.watching).toBe(true);
    expect(replies().at(-1)).not.toContain("Votes:");
  });

  it("does not bypass a disabled vote policy for allowlisted self commands", () => {
    manager.shutdown();
    start({
      alwaysAdminPlayers: new Set(["MapGenius"]),
      adminVotePolicies: [],
    });
    events(join(99, "0", "0", "456", "MapGenius"), chat("-rec -watch", 99));
    expect(session.controls.snapshot()).toMatchObject({
      recording: true,
      watching: true,
    });
    expect(replies().at(-1)).toContain("Admin controls: OFF.");
  });

  it("logs every command with its authenticated actor, vote outcome and policy context", () => {
    manager.shutdown();
    start({ adminVotePolicies: twoAdminPolicies });
    const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
    events(
      join(7, "1", "0", "123"),
      chat("-rec"),
      chat("-rec"),
      chat("+rec"),
      chat("status"),
      chat("typo"),
      join(8),
      chat("-watch", 8),
    );
    const processed = info.mock.calls
      .filter(([, message]) => message === "Mission control command processed")
      .map(([data]) => data);
    expect(processed).toEqual([
      expect.objectContaining({
        clientId: 7,
        playerName: "Same name",
        guid: "123",
        mission: ["1", "Katabatic"],
        command: "@MapGenius -rec",
        results: { recording: "vote-added" },
        votes: { recording: 1, watching: 0 },
        votesRequired: 2,
        playerCount: 1,
      }),
      expect.objectContaining({ results: { recording: "unchanged" } }),
      expect.objectContaining({
        results: { recording: "vote-withdrawn" },
        votes: { recording: 0, watching: 0 },
      }),
      expect.objectContaining({ outcome: "status" }),
    ]);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "rejected-invalid-command",
        clientId: 7,
      }),
      "Mission control command rejected",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "rejected-not-admin", clientId: 8 }),
      "Mission control command rejected",
    );
    expect(
      info.mock.calls.filter(
        ([, message]) => message === "Mission control command received",
      ),
    ).toHaveLength(6);
    events(
      chat("-rec"),
      join(8, "1"),
      chat("-rec", 8),
      remote("MissionEnd", "1"),
      chat("+rec"),
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        results: { recording: "applied" },
        recording: false,
      }),
      "Mission control command processed",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionReason: "match-end",
        recordingDecision: false,
      }),
      "Mission recording decision finalized",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        results: { recording: "ignored-final-decision" },
      }),
      "Mission control command processed",
    );
    vi.advanceTimersByTime(3_000);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        reply: expect.stringContaining("Settings reset next map."),
      }),
      "Mission control reply sent",
    );
  });

  it("logs ignored votes when no policy matches", () => {
    manager.shutdown();
    start({ adminVotePolicies: [] });
    const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
    events(chat("-rec -watch"));
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        votesRequired: null,
        results: {
          recording: "ignored-policy-disabled",
          watching: "ignored-policy-disabled",
        },
      }),
      "Mission control command processed",
    );
  });

  it("logs restored controls and their retention on a same-mission reconnect", () => {
    manager.shutdown();
    const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
    start({
      initialMissionControls: {
        [address]: {
          mission: ["1", "Katabatic"],
          recording: false,
          watching: false,
        },
      },
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        address,
        source: "watch-state",
        recording: false,
        watching: false,
      }),
      "Saved mission controls restored",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        address,
        mission: ["1", "Katabatic"],
        recording: false,
        watching: false,
      }),
      "Mission controls retained on reconnect",
    );
  });

  it("preserves mission metadata and match starts following Phase1 in the same packet", () => {
    session.reconnect("Test interruption");
    connections.at(-1)!.setStatus("connected");
    events(
      remote("MissionStartPhase1", "1", "Katabatic"),
      remote("ServerMessage", "MsgMissionStart", "Match started"),
      remote(
        "ServerMessage",
        "MsgMissionDropInfo",
        "",
        "Katabatic",
        "CTF",
        "Server",
      ),
    );
    expect(session.watchState.matchStarted).toBe(true);
    expect(session.watchState.missionType).toBe("CTF");
    expect(session.watchState.serverName).toBe("Server");
    expect(session.rotating).toBe(false);
  });

  it("authorizes each message against the privileges at that point in the packet", () => {
    events(
      join(8),
      chat("-rec", 8),
      remote("ServerMessage", "MsgAdminPlayer", "", "8"),
      chat("-rec", 8),
      remote(
        "ServerMessage",
        "MsgStripAdminPlayer",
        "",
        "Admin",
        "Target",
        "8",
      ),
      chat("-watch", 8),
    );
    expect(saved[address]).toMatchObject({ recording: false, watching: true });
    expect(
      replies().filter((text) => text.includes("Only server admins")),
    ).toHaveLength(2);
    expect(
      session.watchState
        .getHudState()
        .playerRoster.find((entry: any) => entry.clientId === 7),
    ).toMatchObject({ isAdmin: true });
  });

  it("accepts super-admin privileges independently of the admin flag", () => {
    events(join(8, "0", "1"), chat("-watch", 8));
    expect(saved[address]).toMatchObject({ recording: true, watching: false });
  });

  it("accepts an exact non-smurf base name for both controls without granting roster admin flags", () => {
    manager.shutdown();
    start({ alwaysAdminPlayers: new Set(["Alice"]) });
    const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
    events(
      join(8, "0", "0", "123", "\x10\x0b[TAG]\x08Alice\x11"),
      chat("-rec -watch", 8),
    );
    expect(saved[address]).toMatchObject({ recording: false, watching: false });
    const player = session.watchState
      .getHudState()
      .playerRoster.find((entry: any) => entry.clientId === 8);
    expect(player.isAdmin).toBeUndefined();
    expect(player.isSuperAdmin).toBeUndefined();
    expect(replies().at(-1)).toContain("Watching: OFF.");
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 8,
        isAdmin: false,
        isSuperAdmin: false,
        isAlwaysAdmin: true,
      }),
      "Mission control command processed",
    );
  });

  it.each([
    ["alice", "0"],
    ["[TAG]Alice", "0"],
    ["Alice", "1"],
    ["Alice", ""],
  ])(
    "rejects an allowlisted name mismatch or smurf: %s / %s",
    (rawName, smurf) => {
      manager.shutdown();
      start({ alwaysAdminPlayers: new Set(["Alice"]) });
      events(join(8, "0", "0", "123", rawName, smurf), chat("-rec -watch", 8));
      expect(session.controls.snapshot()).toMatchObject({
        recording: true,
        watching: true,
      });
      expect(replies().at(-1)).toContain("Only server admins");
    },
  );

  it("counts allowlisted voters toward the same threshold, preserves tag changes and ignores loss of game admin privileges", () => {
    manager.shutdown();
    start({
      alwaysAdminPlayers: new Set(["Alice"]),
      adminVotePolicies: twoAdminPolicies,
    });
    events(join(8, "1", "0", "123", "Alice"), chat("-rec", 8));
    expect(session.controls.recording).toBe(true);
    events(
      remote(
        "ServerMessage",
        "MsgClientNameChanged",
        "",
        "Alice",
        "\x10\x08Alice\x0b[NEW]\x11",
        "8",
      ),
      remote("ServerMessage", "MsgStripAdminPlayer", "", "Actor", "Alice", "8"),
      chat("status", 8),
    );
    expect(replies().at(-1)).toContain("-record 1/2");
    events(chat("-rec"));
    expect(session.controls.recording).toBe(false);
  });

  it("keeps an allowlisted player's accepted vote after a rename while rejecting their new commands", () => {
    manager.shutdown();
    start({
      alwaysAdminPlayers: new Set(["Alice"]),
      adminVotePolicies: twoAdminPolicies,
    });
    events(join(8, "0", "0", "123", "Alice"), chat("-rec", 8));
    events(
      remote("ServerMessage", "MsgClientNameChanged", "", "Alice", "Bob", "8"),
      chat("-watch", 8),
    );
    expect(session.controls.snapshot().votes).toEqual({
      recording: { "guid:123": "admin" },
    });
    events(chat("-rec"));
    expect(session.controls.snapshot()).toMatchObject({
      recording: false,
      watching: true,
    });
    expect(replies().at(-1)).not.toContain("Votes:");
  });

  it("restores allowlisted GUID votes across relay restarts without bypassing the threshold", () => {
    manager.shutdown();
    const options = {
      alwaysAdminPlayers: new Set(["Alice"]),
      adminVotePolicies: twoAdminPolicies,
    };
    start(options);
    events(join(8, "0", "0", "123", "Alice"), chat("-rec", 8));
    const persisted = JSON.parse(JSON.stringify(saved));
    manager.shutdown();
    start({ ...options, initialMissionControls: persisted });
    events(
      join(9, "0", "0", "123", "\x10\x08Alice\x0b[TAG]\x11"),
      chat("-rec", 9),
    );
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/2");
    events(chat("-rec"));
    expect(session.controls.recording).toBe(false);
  });

  it("still disables commands for allowlisted players when no vote policy matches", () => {
    manager.shutdown();
    start({ alwaysAdminPlayers: new Set(["Alice"]), adminVotePolicies: [] });
    events(join(8, "0", "0", "123", "Alice"), chat("-rec -watch", 8));
    expect(session.controls.snapshot()).toMatchObject({
      recording: true,
      watching: true,
    });
    expect(replies().at(-1)).toContain("Admin controls: OFF.");
  });

  it("ends all viewers immediately, rejects new viewers, and keeps recording independently", () => {
    const second = new FakeWebSocket();
    manager.watch(second as unknown as WebSocket, address);
    viewer.sent.length = second.sent.length = 0;
    events(chat("-watch"));
    expect(session.watcherCount).toBe(0);
    for (const ws of [viewer, second]) {
      expect(ws.jsonMessages().at(-1)).toMatchObject({
        type: "sessionStatus",
        status: "ended",
        endReason: "watchingDisabled",
        chatEnabled: false,
        message:
          "Server admins have disabled watching for this mission. You can join again when they enable watching or the next mission begins.",
      });
      expect(ws.binaryFrames()).toHaveLength(0);
    }
    const rejected = new FakeWebSocket();
    manager.watch(rejected as unknown as WebSocket, address);
    expect(rejected.jsonMessages().at(-1)).toMatchObject({
      status: "ended",
      endReason: "watchingDisabled",
      chatEnabled: false,
    });
    expect(rejected.binaryFrames()).toHaveLength(0);
    expect(saved[address]).toMatchObject({ recording: true, watching: false });
    expect(replies().at(-1)).toContain("Watching: OFF.");
    expect(replies().at(-1)).toMatch(/Settings reset next map\.$/);
    events(chat("+watch"));
    expect(replies().at(-1)).not.toContain("Settings reset next map.");
    for (const ws of [viewer, second, rejected]) {
      expect(ws.jsonMessages().at(-1)).toMatchObject({ status: "ended" });
      expect(ws.binaryFrames()).toHaveLength(0);
    }
    manager.watch(rejected as unknown as WebSocket, address);
    expect(session.watcherCount).toBe(1);
    expect(rejected.jsonMessages().at(-1)).toMatchObject({ status: "live" });
  });

  it.each([0, 1, 2])(
    "omits spectator counts with %i viewers and replies even when browser chat is disabled",
    (count) => {
      manager.shutdown();
      start({ chatEnabled: false });
      manager.detachSocket(viewer as unknown as WebSocket);
      for (let i = 0; i < count; i++)
        manager.watch(new FakeWebSocket() as unknown as WebSocket, address);
      events(chat("status"));
      expect(replies()).toEqual(["Recording: ON. Watching: ON."]);
      expect(saved).toEqual({});
    },
  );

  it("reports recording as OFF when admins disable saving and ON when they restore it", () => {
    events(chat("status"));
    expect(replies().at(-1)).toBe("Recording: ON. Watching: ON.");
    events(chat("-record"));
    expect(replies().at(-1)).toContain("Recording: OFF.");
    expect(replies().at(-1)).toMatch(/Settings reset next map\.$/);
    events(chat("+record"));
    expect(replies().at(-1)).toBe("Recording: ON. Watching: ON.");
  });

  it.each(["unconfigured", "disabled"] as const)(
    "ignores both recording vote directions when recording is %s, without blocking watch votes",
    (configuration) => {
      manager.shutdown();
      start({
        adminVotePolicies: twoAdminPolicies,
        demoCoordinator:
          configuration === "disabled"
            ? ({
                ...policyCoordinator(),
                enabled: false,
              } as unknown as DemoCoordinator)
            : undefined,
      });
      const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
      events(chat("-rec -watch"));
      expect(session.recording).toBe(false);
      expect(session.controls.recording).toBe(true);
      expect(session.controls.voteCount("recording")).toBe(0);
      expect(session.controls.voteCount("watching")).toBe(1);
      expect(replies().at(-1)).toContain("Recording: OFF.");
      expect(replies().at(-1)).not.toContain("Nothing changed.");
      expect(replies().at(-1)).not.toContain("Recording controls:");
      expect(replies().at(-1)).toContain("Votes: -watch 1/2.");
      expect(replies().at(-1)).not.toContain("Settings reset next map.");
      events(chat("-record"));
      expect(replies().at(-1)).toMatch(/^Nothing changed\./);
      events(chat("+record +watch"));
      expect(session.controls.voteCount("recording")).toBe(0);
      expect(session.controls.voteCount("watching")).toBe(0);
      expect(replies().at(-1)).not.toContain("Nothing changed.");
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "@MapGenius +record +watch",
          recordingConfigured: false,
          results: {
            recording: "ignored-recording-disabled",
            watching: "vote-withdrawn",
          },
        }),
        "Mission control command processed",
      );
      events(join(8, "1"), chat("-watch"), chat("-watch", 8));
      expect(session.controls.watching).toBe(false);
      expect(session.watcherCount).toBe(0);
      events(chat("+watch"), chat("+watch", 8));
      expect(session.controls.watching).toBe(true);
      expect(session.recording).toBe(false);
    },
  );

  it("clears restored recording votes when relay recording is disabled, preserving watch votes and the mission's keep policy", () => {
    manager.shutdown();
    start({
      adminVotePolicies: twoAdminPolicies,
      demoCoordinator: undefined,
      initialMissionControls: {
        [address]: {
          mission: ["1", "Katabatic"],
          recording: true,
          watching: true,
          votes: { recording: ["guid:123"], watching: ["guid:123"] },
        },
      },
    });
    events(join(7, "1", "0", "123"), chat("status"));
    expect(session.controls.recording).toBe(true);
    expect(session.controls.voteCount("recording")).toBe(0);
    expect(saved[address]).toMatchObject({
      votes: { watching: { "guid:123": "admin" } },
    });
    expect(saved[address]).not.toHaveProperty("votes.recording");
    expect(replies().at(-1)).toContain("Votes: -watch 1/2.");
    expect(replies().at(-1)).not.toContain("Settings reset next map.");
  });

  it.each([false, true])(
    "ends delayed viewers immediately without delivering the queued tail (buffer ready: %s)",
    (ready) => {
      manager.shutdown();
      start({ tourneyDelayMs: 60_000 });
      session.setTournamentMode(true);
      if (ready) vi.advanceTimersByTime(60_000);
      expect(viewer.jsonMessages().at(-1)).toMatchObject({
        status: ready ? "live" : "syncing",
      });
      viewer.sent.length = 0;
      events(chat("-watch"));
      const rejection = viewer.jsonMessages().at(-1);
      expect(rejection).toMatchObject({
        status: "ended",
        endReason: "watchingDisabled",
      });
      events();
      vi.advanceTimersByTime(120_000);
      expect(viewer.jsonMessages().at(-1)).toEqual(rejection);
      expect(viewer.binaryFrames()).toHaveLength(0);
      expect(session.watcherCount).toBe(0);
    },
  );

  it("does not apply part of a command with an invalid modifier", () => {
    events(chat("-watch -rec typo"));
    expect(saved).toEqual({});
    expect(session.watcherCount).toBe(1);
    expect(replies()[0]).toContain("Use @MapGenius");
    expect(replies()[0]).toMatch(/^Nothing changed\./);
  });

  it("prefixes only commands that change neither settings nor votes, excluding status requests", () => {
    manager.shutdown();
    start({ adminVotePolicies: twoAdminPolicies });
    events(chat("+record +watch"));
    expect(replies().at(-1)).toBe(
      "Nothing changed. Recording: ON. Watching: ON.",
    );
    events(chat("-record status"));
    const pending = replies().at(-1);
    expect(pending).not.toContain("Nothing changed.");
    expect(pending).toContain("Votes: -record 1/2.");
    events(chat("-record"));
    expect(replies().at(-1)).toBe(`Nothing changed. ${pending}`);
    events(chat("status"));
    expect(replies().at(-1)).not.toContain("Nothing changed.");
    expect(replies().at(-1)).toContain("Votes: -record 1/2.");
    events(chat("+record"));
    expect(replies().at(-1)).not.toContain("Nothing changed.");
    expect(session.controls.voteCount("recording")).toBe(0);
    events(chat("-record"));
    expect(replies().at(-1)).not.toContain("Nothing changed.");
    events(join(8, "1"), chat("-record", 8));
    expect(replies().at(-1)).toBe(
      "Recording: OFF. Watching: ON. Settings reset next map.",
    );
    events(chat("-record -watch"));
    expect(replies().at(-1)).not.toContain("Nothing changed.");
    expect(replies().at(-1)).toContain("Votes: -watch 1/2.");
    events(chat("-record -watch", 8));
    expect(replies().at(-1)).toBe(
      "Recording: OFF. Watching: OFF. Settings reset next map.",
    );
  });

  it("alternates status voices independently of counted votes and commands that change nothing", () => {
    manager.shutdown();
    start({ adminVotePolicies: twoAdminPolicies });
    for (const [command, voice] of [
      ["status", "vqk.anytime"],
      ["-record status", "cmd.acknowledge"],
      ["-record", "cmd.decline"],
      ["status", "gbl.anytime"],
      ["+record", "cmd.acknowledge"],
      ["+record", "cmd.decline"],
      ["-watch typo", "cmd.decline"],
      ["", "vqk.anytime"],
      ["status", "gbl.anytime"],
    ]) {
      events(chat(command));
      replies();
      expect(extractWavTag(sentReplies().at(-1)!).wavPath).toBe(voice);
    }
    events(join(8), chat("-watch", 8));
    replies();
    expect(sentReplies().at(-1)).toMatch(/^Nothing changed\..*~wcmd\.decline$/);
  });

  it("advances the status voice only for replies actually sent", () => {
    events(chat("status"));
    expect(sentReplies().at(-1)).toMatch(/~wvqk\.anytime$/);
    events(chat("status"), chat("status"));
    expect(sentReplies()).toHaveLength(1);
    replies();
    expect(sentReplies().at(-1)).toMatch(/~wgbl\.anytime$/);

    events(chat("status"), chat("+record"));
    replies();
    expect(sentReplies().at(-1)).toMatch(/~wcmd\.decline$/);
    events(chat("status"));
    replies();
    expect(sentReplies().at(-1)).toMatch(/~wvqk\.anytime$/);
  });

  it("preserves restrictions across reconnect, idle grace and session replacement", () => {
    events(chat("-rec -watch"));
    manager.unpin(address);
    session.ensureIdleGrace();
    vi.advanceTimersByTime(10 * 60_000);
    expect(manager.has(address)).toBe(true);
    session.reconnect("Test reconnect");
    connections.at(-1)!.setStatus("connected");
    events(remote("MissionStartPhase1", "1", "Katabatic"));
    expect(saved[address]).toMatchObject({ recording: false, watching: false });
    session.destroy();
    const rejected = new FakeWebSocket();
    manager.watch(rejected as unknown as WebSocket, address);
    expect(rejected.jsonMessages().at(-1)).toMatchObject({ status: "ended" });
    expect(saved[address]).toMatchObject({ recording: false, watching: false });
  });

  it("restores restrictions before the first post-restart attachment and recorder creation", () => {
    events(chat("-rec -watch"));
    const initialMissionControls = structuredClone(saved);
    manager.shutdown();
    start({ initialMissionControls });
    expect(viewer.binaryFrames()).toHaveLength(0);
    expect(viewer.jsonMessages()[0]).toMatchObject({ status: "ended" });
    expect(saved[address]).toMatchObject({ recording: false, watching: false });
    expect(session.recorder).toBeNull();
  });

  it("resets for a new mission sequence, including a restart of the same map", () => {
    events(chat("-rec -watch"));
    session.reconnect("Mission changing");
    connections.at(-1)!.setStatus("connected");
    events(remote("MissionStartPhase1", "2", "Katabatic"));
    expect(saved).toEqual({});
    const next = new FakeWebSocket();
    manager.watch(next as unknown as WebSocket, address);
    expect(next.binaryFrames().length).toBeGreaterThan(0);
  });

  it("cannot resume a delayed private mission after restrictions reset", () => {
    manager.shutdown();
    start({ tourneyDelayMs: 60_000 });
    session.setTournamentMode(true);
    const oldChannel = session.getChannelId(viewer);
    events(chat("-watch"));
    session.reconnect("Mission changing");
    connections.at(-1)!.setStatus("connected");
    events(remote("MissionStartPhase1", "2", "Katabatic"));
    session.setTournamentMode(true);
    const next = new FakeWebSocket();
    manager.watch(next as unknown as WebSocket, address, oldChannel);
    expect(session.channels.get(next)).toMatchObject({ firstEpoch: 2 });
    vi.advanceTimersByTime(60_000);
    expect(viewer.binaryFrames()).toHaveLength(0);
  });

  it("keeps controls scoped to their server", () => {
    events(chat("-watch"));
    const other = new FakeWebSocket();
    manager.watch(other as unknown as WebSocket, "2.3.4.5:28000");
    expect(manager.getSession("2.3.4.5:28000")?.watcherCount).toBe(1);
    expect(saved["2.3.4.5:28000"]).toBeUndefined();
  });

  it("requires distinct admins, counts settings independently and reports progress", () => {
    manager.shutdown();
    start({ adminVotePolicies: twoAdminPolicies });
    events(chat("-rec -watch"), chat("-recording -spectate"), chat("status"));
    expect(saved[address]).toMatchObject({ recording: true, watching: true });
    expect(session.watcherCount).toBe(1);
    expect(replies().at(-1)).toContain("Votes: -record 1/2, -watch 1/2.");
    events(join(8, "1"), chat("-rec", 8));
    expect(saved[address]).toMatchObject({ recording: false, watching: true });
    expect(replies().at(-1)).toContain("Votes: -watch 1/2.");
    events(chat("+rec"), chat("+rec", 8));
    expect(saved[address]).toMatchObject({ recording: true, watching: true });
    events(chat("-watch", 8));
    expect(session.watcherCount).toBe(0);
    expect(saved[address]).toMatchObject({ recording: true, watching: false });
    events(chat("+watch"));
    expect(saved[address]).toMatchObject({ watching: false });
    events(chat("+watch", 8));
    expect(saved[address]).toBeUndefined();
  });

  it("processes spam and conflicting commands immediately, with bounded replies showing the final decision", () => {
    manager.shutdown();
    const coordinator = policyCoordinator();
    start({
      adminVotePolicies: twoAdminPolicies,
      demoCoordinator: coordinator,
    });
    events(join(8, "1"), join(9, "1"), chat("-rec"), chat("-rec", 8));
    expect(session.recording).toBe(false);
    expect(coordinator.updateMission).toHaveBeenCalledTimes(1);
    events(
      ...Array.from({ length: 500 }, () =>
        chat("+rec +rec +recording status", 9),
      ),
    );
    expect(session.recording).toBe(false);
    expect(session.controls.voteCount("recording")).toBe(1);
    expect(coordinator.updateMission).toHaveBeenCalledTimes(1);
    expect(sentReplies()).toHaveLength(1);
    vi.advanceTimersByTime(3_000);
    expect(sentReplies()).toHaveLength(2);
    expect(sentReplies().at(-1)).toMatch(/^Nothing changed\./);
    expect(sentReplies().at(-1)).toContain("Recording: OFF.");
    expect(sentReplies().at(-1)).toContain("Votes: +record 1/2");
    expect(sentReplies().at(-1)).toMatch(/~wcmd\.decline$/);
    events(chat("+rec", 7));
    expect(session.recording).toBe(true);
    events(chat("+rec -rec +rec -watch +watch", 7), chat("-rec typo", 8));
    expect(session.controls.snapshot()).toMatchObject({
      recording: true,
      watching: true,
    });
    expect(session.controls.snapshot().votes).toBeUndefined();
    expect(coordinator.updateMission).toHaveBeenCalledTimes(2);
    events(chat("status"));
    vi.advanceTimersByTime(3_000);
    expect(sentReplies()).toHaveLength(3);
    expect(sentReplies().at(-1)).not.toContain("Nothing changed.");
    expect(sentReplies().at(-1)).toContain("Recording: ON.");
    expect(sentReplies().at(-1)).not.toContain("Votes:");
    expect(sentReplies().at(-1)).toMatch(/~wvqk\.anytime$/);
  });

  it("keeps recording and watcher side effects in order during many changes in one packet", () => {
    manager.shutdown();
    const coordinator = policyCoordinator();
    start({
      adminVotePolicies: twoAdminPolicies,
      demoCoordinator: coordinator,
    });
    const commands: ParsedData[] = [join(8, "1"), join(9, "1")];
    for (let i = 0; i < 50; i++) {
      commands.push(
        chat("-rec -watch", 7),
        chat("-rec -watch", 8),
        chat("+rec +watch", 9),
        chat("+rec +watch", 7),
      );
    }
    commands.push(
      chat("-rec", 8),
      chat("-rec", 9),
      remote("MissionEnd"),
      chat("+rec -watch", 7),
      chat("+rec -watch", 8),
    );
    events(...commands);
    expect(session.controls.snapshot()).toMatchObject({
      recording: false,
      recordingDecision: false,
      watching: false,
    });
    expect(session.controls.snapshot().votes).toBeUndefined();
    expect(session.watcherCount).toBe(0);
    expect(
      viewer
        .jsonMessages()
        .filter((m) => m.type === "sessionStatus" && m.status === "ended"),
    ).toHaveLength(1);
    expect(connections).toHaveLength(1);
    expect(sentReplies()).toHaveLength(1);
    vi.advanceTimersByTime(3_000);
    expect(sentReplies()).toHaveLength(2);
    expect(sentReplies().at(-1)).toContain("Recording: OFF.");
    expect(sentReplies().at(-1)).toContain("Watching: OFF.");
    expect(coordinator.updateMission).toHaveBeenLastCalledWith(
      address,
      expect.objectContaining({ recordingDecision: false, watching: false }),
    );
  });

  it("renders delayed replies using accepted votes and match-end state", () => {
    manager.shutdown();
    start({
      demoCoordinator: policyCoordinator(),
      adminVotePolicies: twoAdminPolicies,
    });
    events(
      join(7, "1", "0", "123"),
      chat("status"),
      chat("-rec"),
      remote("ServerMessage", "MsgClientDrop", "", "Same name", "7"),
    );
    vi.advanceTimersByTime(3_000);
    expect(sentReplies().at(-1)).toContain("Votes: -record 1/2.");
    events(join(7, "1", "0", "123"), chat("-rec"), remote("MissionEnd"));
    vi.advanceTimersByTime(3_000);
    expect(sentReplies().at(-1)).toContain("Recording: ON.");
    expect(sentReplies().at(-1)).not.toContain("Votes:");
  });

  it("reports the current threshold if more players join while a reply is waiting", () => {
    manager.shutdown();
    start({
      adminVotePolicies: [
        { tournament: false, minPlayerCount: 1, adminVotes: 2 },
        { tournament: false, minPlayerCount: 3, adminVotes: 3 },
      ],
    });
    events(
      remote(
        "ServerMessage",
        "MsgVoteItem",
        "",
        "TourneyQuery",
        "VoteTournamentMode",
      ),
      chat("status"),
      chat("-rec"),
      join(8, "1"),
      join(9, "1"),
    );
    vi.advanceTimersByTime(3_000);
    expect(sentReplies().at(-1)).toContain("-record 1/3");
    events(chat("-rec", 8));
    expect(session.controls.recording).toBe(true);
    events(chat("-rec", 9));
    expect(session.controls.recording).toBe(false);
  });

  it.each(["reconnect", "mission", "destroy"])(
    "cancels stale replies on %s",
    (boundary) => {
      events(chat("status"), chat("typo"));
      expect(sentReplies()).toHaveLength(1);
      if (boundary === "reconnect") session.reconnect("Test reconnect");
      else if (boundary === "mission")
        session.observeControlledMission("2", "Raindance");
      else session.destroy();
      vi.advanceTimersByTime(3_000);
      expect(
        connections
          .flatMap((conn) => conn.commands)
          .filter((cmd) => cmd.command === "messageSent"),
      ).toHaveLength(1);
    },
  );

  it("selects the highest player threshold, counting observers but excluding MapGenius", () => {
    manager.shutdown();
    start({
      adminVotePolicies: [
        { tournament: true, minPlayerCount: 20, adminVotes: 2 },
        { tournament: true, minPlayerCount: 1, adminVotes: 1 },
        { tournament: false, minPlayerCount: 1, adminVotes: 1 },
      ],
    });
    events(
      remote("ServerMessage", "MsgVoteItem", "", "TourneyQuery", "VoteFFAMode"),
      join(99, "1"),
      ...Array.from({ length: 18 }, (_, i) => join(100 + i)),
      chat("-rec"),
    );
    // 19 players, all observers, plus the relay: one admin still suffices.
    expect(session.controls.recording).toBe(false);
    events(chat("+rec"), join(118), chat("-rec"));
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/2");
    events(
      remote("ServerMessage", "MsgAdminPlayer", "", "100"),
      chat("-rec", 100),
    );
    expect(session.controls.recording).toBe(false);
    expect(session.streamDelayMs).toBe(0);
  });

  it("reselects when players leave, but status and departures alone never enact a vote", () => {
    manager.shutdown();
    start({
      adminVotePolicies: [
        { tournament: true, minPlayerCount: 2, adminVotes: 2 },
        { tournament: true, minPlayerCount: 1, adminVotes: 1 },
      ],
    });
    events(
      remote("ServerMessage", "MsgVoteItem", "", "TourneyQuery", "VoteFFAMode"),
      join(8),
      chat("-rec"),
    );
    expect(replies().at(-1)).toContain("-record 1/2");
    events(
      remote("ServerMessage", "MsgClientDrop", "", "Same name", "8"),
      chat("status"),
    );
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/1");
    events(chat("-rec"));
    expect(session.controls.recording).toBe(false);
  });

  it("detects mode without stream delay and reselects on a new server mode report", () => {
    manager.shutdown();
    start({
      adminVotePolicies: [
        { tournament: true, minPlayerCount: 1, adminVotes: 2 },
        { tournament: false, minPlayerCount: 1, adminVotes: 1 },
      ],
    });
    session.reconnect("Test reconnect");
    connections.at(-1)!.setStatus("connected");
    expect(connections.at(-1)!.commands).toContainEqual({
      command: "GetVoteMenu",
      args: ["TourneyQuery"],
    });
    events(join(7, "1"), chat("-rec"));
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/2");
    events(
      remote(
        "ServerMessage",
        "MsgVoteItem",
        "",
        "TourneyQuery",
        "VoteTournamentMode",
      ),
      chat("-rec"),
    );
    expect(session.controls.recording).toBe(false);
    events(
      remote("ServerMessage", "MsgVoteItem", "", "TourneyQuery", "VoteFFAMode"),
      chat("+rec"),
    );
    expect(session.controls.recording).toBe(false);
    expect(replies().at(-1)).toContain("+record 1/2");
    expect(session.streamDelayMs).toBe(0);
  });

  it("resolves the post-drop mode fallback without requiring stream delay", () => {
    manager.shutdown();
    start({
      adminVotePolicies: [
        { tournament: false, minPlayerCount: 1, adminVotes: 1 },
      ],
    });
    events(chat("-rec"));
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("Admin controls: OFF");
    events(remote("ServerMessage", "MsgClientReady", "", "CTFGame"));
    vi.advanceTimersByTime(4_000);
    events(chat("-rec"));
    expect(session.controls.recording).toBe(false);
  });

  it("keeps delay exemptions separate from the actual tournament mode for voting", () => {
    manager.shutdown();
    start({
      tourneyDelayMs: 60_000,
      tourneySkipTypes: ["CTF"],
      adminVotePolicies: [
        { tournament: true, minPlayerCount: 1, adminVotes: 2 },
        { tournament: false, minPlayerCount: 1, adminVotes: 1 },
      ],
    });
    session.watchState.missionTypeDisplayName = "CTF";
    events();
    expect(session.streamDelayMs).toBe(0);
    events(chat("-rec"));
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/2");
    events(
      remote("ServerMessage", "MsgVoteItem", "", "TourneyQuery", "VoteFFAMode"),
      chat("-rec"),
    );
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/2");
    expect(session.streamDelayMs).toBe(0);
  });

  it.each([
    { adminVotePolicies: undefined },
    { adminVotePolicies: [] },
    {
      adminVotePolicies: [
        { tournament: true, minPlayerCount: 1, adminVotes: 1 },
      ],
    },
    {
      adminVotePolicies: [
        { tournament: false, minPlayerCount: 20, adminVotes: 2 },
      ],
    },
  ])("disables changes when no policy matches: %j", ({ adminVotePolicies }) => {
    manager.shutdown();
    start({ adminVotePolicies });
    events(
      remote(
        "ServerMessage",
        "MsgVoteItem",
        "",
        "TourneyQuery",
        "VoteTournamentMode",
      ),
      chat("-rec -watch"),
      chat("status"),
    );
    expect(session.controls.snapshot()).toMatchObject({
      recording: true,
      watching: true,
    });
    expect(session.controls.snapshot().votes).toBeUndefined();
    expect(session.watcherCount).toBe(1);
    expect(replies()).toHaveLength(2);
    expect(
      replies().every((reply) => reply.includes("Admin controls: OFF.")),
    ).toBe(true);
    expect(replies()[0]).toMatch(/^Nothing changed\./);
    expect(replies().at(-1)).not.toContain("Nothing changed.");
    expect(replies().at(-1)).toContain("Watching: ON.");
  });

  it("deduplicates account GUIDs across simultaneous connections, reconnects and renamed players", () => {
    manager.shutdown();
    start({ adminVotePolicies: twoAdminPolicies });
    events(
      join(7, "1", "0", "00123"),
      join(8, "1", "0", "123"),
      chat("-rec"),
      chat("-rec", 8),
    );
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/2");
    session.reconnect("Test reconnect");
    connections.at(-1)!.setStatus("connected");
    events(
      remote("MissionStartPhase1", "1", "Katabatic"),
      join(9, "1", "0", "123"),
      chat("-rec", 9),
    );
    expect(session.controls.recording).toBe(true);
    events(
      join(10, "1", "0", "456"),
      remote(
        "ServerMessage",
        "MsgClientNameChanged",
        "",
        "Same name",
        "Renamed",
        "10",
      ),
      chat("-rec", 10),
    );
    expect(session.controls.recording).toBe(false);
  });

  it.each(["drop", "demote", "reuse"])(
    "preserves an accepted admin vote after %s",
    (change) => {
      manager.shutdown();
      start({ adminVotePolicies: twoAdminPolicies });
      events(chat("-rec"));
      if (change === "demote")
        events(
          remote(
            "ServerMessage",
            "MsgStripAdminPlayer",
            "",
            "Actor",
            "Target",
            "7",
          ),
        );
      else {
        events(remote("ServerMessage", "MsgClientDrop", "", "Same name", "7"));
        if (change === "reuse") events(join(7, "1", "0", "2007"));
      }
      expect(session.controls.snapshot().votes).toEqual({
        recording: { "guid:1007": "admin" },
      });
      events(join(8, "1"), chat("-rec", 8));
      expect(session.controls.recording).toBe(false);
      expect(replies().at(-1)).not.toContain("Votes:");
    },
  );

  it("restores pending account votes after restart without treating status as a vote", () => {
    manager.shutdown();
    start({ adminVotePolicies: twoAdminPolicies });
    events(join(7, "1", "0", "123"), chat("-rec"));
    const persisted = JSON.parse(JSON.stringify(saved));
    manager.shutdown();
    start({
      adminVotePolicies: twoAdminPolicies,
      initialMissionControls: persisted,
    });
    events(
      join(7, "1", "0", "123"),
      join(8, "1", "0", "456"),
      chat("status", 8),
    );
    expect(session.controls.recording).toBe(true);
    expect(replies().at(-1)).toContain("-record 1/2");
    events(chat("-rec", 8));
    expect(session.controls.recording).toBe(false);
  });

  it("does not let later votes reverse a recording decision settled by the pending timeout", () => {
    manager.shutdown();
    const coordinator = policyCoordinator();
    start({ demoCoordinator: coordinator });
    events(chat("-rec"));
    vi.spyOn(coordinator, "takeRestoredPolicy").mockReturnValueOnce({
      recording: false,
      recordingDecision: false,
    });
    events(chat("+rec"));
    expect(session.controls.recordingDecision).toBe(false);
    expect(session.recording).toBe(false);
    expect(replies().at(-1)).toContain("Recording: OFF.");
    expect(replies().at(-1)).toMatch(/^Nothing changed\./);
  });

  it("keeps REC on until votes pass, preserves it across reconnects, and locks at match end", () => {
    manager.shutdown();
    start({
      adminVotePolicies: twoAdminPolicies,
      demoCoordinator: policyCoordinator(),
    });
    const status = () =>
      viewer
        .jsonMessages()
        .filter((m) => m.type === "sessionStatus")
        .at(-1);
    expect(status()).toMatchObject({ recording: true });
    events(chat("-rec"));
    expect(status()).toMatchObject({ recording: true });
    events(join(8, "1"), chat("-rec", 8));
    expect(status()).toMatchObject({ recording: false });
    events(chat("+rec"), chat("+rec", 8));
    expect(status()).toMatchObject({ recording: true });
    session.reconnect("Test reconnect");
    expect(status()).toMatchObject({ recording: true });
    connections.at(-1)!.setStatus("connected");
    events(
      remote("MissionStartPhase1", "1", "Katabatic"),
      join(7, "1"),
      join(8, "1"),
      remote("MissionEnd"),
      chat("-rec"),
      chat("-rec", 8),
    );
    expect(status()).toMatchObject({ recording: true });
    expect(session.controls.recordingDecision).toBe(true);
    expect(replies().at(-1)).toContain("Recording: ON.");
    expect(replies().at(-1)).not.toContain("Votes:");
    expect(status()).not.toHaveProperty("recordingPolicy");
  });

  it("updates delayed REC immediately and keeps the previous mission's final policy during a map change", () => {
    manager.shutdown();
    start({ demoCoordinator: policyCoordinator(), tourneyDelayMs: 60_000 });
    session.setTournamentMode(true);
    vi.advanceTimersByTime(60_000);
    // The synthetic packets don't carry a real handshake. Seed the parsed
    // replica's map, as in the delayed-transition transport tests below.
    session.replica.watchState.missionName = "Katabatic";
    const status = () =>
      viewer
        .jsonMessages()
        .filter((m) => m.type === "sessionStatus")
        .at(-1);
    expect(status()).toMatchObject({ recording: true });
    events(chat("-rec"));
    expect(status()).toMatchObject({ recording: false, mapName: "Katabatic" });
    events(chat("+rec"));
    expect(status()).toMatchObject({ recording: true });
    events(chat("-rec"), remote("MissionEnd"));
    expect(status()).toMatchObject({ recording: false });
    session.reconnect("Mission changing");
    connections.at(-1)!.setStatus("connected");
    events(
      remote("MissionStartPhase1", "2", "Raindance"),
      join(7, "1"),
      chat("-rec"),
      chat("+rec"),
    );
    expect(session.recording).toBe(true);
    expect(status()).toMatchObject({ recording: false, mapName: "Katabatic" });
    vi.advanceTimersByTime(60_000);
    expect(status()).toMatchObject({ recording: true });
    expect(status()).not.toHaveProperty("recordingPolicy");
  });
});

describe("watch observer recovery", () => {
  const address = "1.2.3.4:28000";
  let manager: WatchSessionManager;
  let conn: FakeGameConnection;
  let session: any;

  function events(...data: ParsedData[]) {
    session.parserKit.packetParser.parsePacket = () => ({
      gameState: {},
      ghosts: [],
      events: data.map((parsedData) => ({ parsedData })),
    });
    conn.emit("packet", new Uint8Array([1, 2, 3]));
  }

  function messages(...commands: string[][]) {
    events(
      ...commands.map((args) => ({
        type: "RemoteCommandEvent",
        funcName: "ServerMessage",
        args,
      })),
    );
  }

  const sensorGroup = (group: number) =>
    events({ type: "SetSensorGroupEvent", sensorGroup: group });
  const joinTeam = (team: number, clientId = 7) =>
    messages([
      "MsgClientJoinTeam",
      "",
      "MapGenius",
      "Team",
      String(clientId),
      String(team),
    ]);
  const requests = () =>
    conn.commands.filter((c) => c.command === "ClientMakeObserver");

  beforeEach(() => {
    vi.useFakeTimers();
    const setup = createManager();
    manager = setup.manager;
    manager.watch(new FakeWebSocket() as unknown as WebSocket, address);
    conn = setup.connections[0];
    session = manager.getSession(address);
    conn.setStatus("connected");
    conn.commands.length = 0;
  });

  afterEach(() => {
    manager.shutdown();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("uses the handshake client ID without a welcome or account GUID", () => {
    conn.selfClientId = 7;
    events();
    expect(session.watchState.selfClientId).toBe(7);
    messages(["MsgClientJoin", "Welcome", "Another client", "9", "33"]);
    expect(session.watchState.selfClientId).toBe(7);
    joinTeam(1);
    vi.advanceTimersByTime(2_000);
    expect(requests()).toHaveLength(0);
    sensorGroup(1);
    vi.advanceTimersByTime(2_000);
    expect(requests()).toEqual([{ command: "ClientMakeObserver", args: [] }]);
  });

  it("keeps retrying through roster refreshes, team messages, and roster removal", () => {
    messages(["MsgClientJoin", "Welcome to Tribes2", "MapGenius", "7", "32"]);
    sensorGroup(1);
    vi.advanceTimersByTime(2_000);
    messages(["MsgClientJoin", "", "MapGenius", "7", "32"]);
    joinTeam(0);
    messages(["MsgClientDrop", "", "MapGenius", "7"]);
    expect(session.watchState.getPlayerRoster().has(7)).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(requests()).toHaveLength(2);
  });

  it("ignores roster and target teams without a connection sensor-group change", () => {
    messages(["MsgClientJoin", "Welcome to Tribes2", "MapGenius", "7", "32"]);
    joinTeam(1);
    joinTeam(1, 9);
    events({ type: "TargetInfoEvent", targetId: 32, sensorGroup: 1 });
    vi.advanceTimersByTime(2_000);
    expect(requests()).toHaveLength(0);
  });

  it("uses the game's Join Observers command without a welcome, GUID, or roster", () => {
    expect(session.watchState.selfClientId).toBeNull();
    expect(conn.selfClientId).toBeNull();
    sensorGroup(1);
    vi.advanceTimersByTime(1_999);
    expect(requests()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(requests()).toEqual([{ command: "ClientMakeObserver", args: [] }]);
    expect(conn.commands.some((c) => c.command === "setPlayerTeam")).toBe(
      false,
    );
    expect(conn.commands.some((c) => c.command === "WatchOnly")).toBe(true);
  });

  it("tries after 2s then every 10s, stops on confirmation, and rearms", () => {
    sensorGroup(1);
    vi.advanceTimersByTime(2_000);
    expect(requests()).toHaveLength(1);
    // Staying on a team, even a different one, must not restart the grace period.
    sensorGroup(2);
    vi.advanceTimersByTime(9_999);
    expect(requests()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(requests()).toHaveLength(2);
    vi.advanceTimersByTime(10_000);
    expect(requests()).toHaveLength(3);
    vi.advanceTimersByTime(10_000);
    expect(requests()).toHaveLength(4);
    sensorGroup(0);
    vi.advanceTimersByTime(60_000);
    expect(requests()).toHaveLength(4);
    sensorGroup(2);
    vi.advanceTimersByTime(2_000);
    expect(requests()).toHaveLength(5);
  });

  it("cancels the grace timer if the server restores observer mode", () => {
    sensorGroup(1);
    sensorGroup(0);
    vi.advanceTimersByTime(60_000);
    expect(requests()).toHaveLength(0);
  });

  it("waits for connected status before acting on an earlier sensor group", () => {
    conn.setStatus("authenticating");
    sensorGroup(1);
    vi.advanceTimersByTime(10_000);
    expect(requests()).toHaveLength(0);
    conn.setStatus("connected");
    vi.advanceTimersByTime(2_000);
    expect(requests()).toHaveLength(1);
  });

  it("starts a fresh grace period after reconnect and ignores the retired connection", () => {
    sensorGroup(1);
    vi.advanceTimersByTime(2_000);
    expect(requests()).toHaveLength(1);
    const retired = conn;
    session.reconnect("Re-syncing with server...");
    conn = session.connection;
    conn.setStatus("connected");
    conn.commands.length = 0;

    retired.emit("packet", new Uint8Array([1, 2, 3]));
    retired.setStatus("disconnected", "You have been kicked");
    vi.advanceTimersByTime(10_000);
    expect(session.watchState.playerSensorGroup).toBe(0);
    expect(requests()).toHaveLength(0);

    sensorGroup(2);
    vi.advanceTimersByTime(1_999);
    expect(requests()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(requests()).toHaveLength(1);
    vi.advanceTimersByTime(10_000);
    expect(requests()).toHaveLength(2);
  });

  it.each(["shutdown", "disconnect", "reconnect", "mission cycle"])(
    "cancels recovery on %s",
    (action) => {
      sensorGroup(1);
      vi.advanceTimersByTime(6_000);
      const before = requests().length;
      if (action === "shutdown") manager.shutdown();
      if (action === "disconnect")
        conn.setStatus("disconnected", "You have been kicked");
      if (action === "reconnect")
        session.reconnect("Re-syncing with server...");
      if (action === "mission cycle") {
        session.watchState.missionName = "Katabatic";
        session.handleMissionCycle("EndGhosting");
      }
      expect(session.reObserveTimer).toBeNull();
      expect(session.reObserveAttempts).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(requests()).toHaveLength(before);
    },
  );
});

describe("WatchSessionManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one game connection between two watchers", () => {
    const { manager, connections } = createManager();
    const ws1 = new FakeWebSocket();
    const ws2 = new FakeWebSocket();

    manager.watch(ws1 as unknown as WebSocket, "1.2.3.4:28000");
    manager.watch(ws2 as unknown as WebSocket, "1.2.3.4");

    expect(connections).toHaveLength(1);
    expect(connections[0].connectCalls).toBe(1);
    expect(manager.getStatusSummary()).toEqual([
      {
        address: "1.2.3.4:28000",
        status: "connecting",
        watchers: 2,
        recording: false,
        pinned: false,
        delayMs: 0,
      },
    ]);
  });

  it("treats a server that starts the mission without T2csri auth as connected", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("authenticating");
    const session = (manager as any).sessions.get("1.2.3.4:28000");
    session.handleResponderEvent({
      type: "RemoteCommandEvent",
      funcName: "MissionStartPhase1",
      args: ["1", "Galadon"],
    });
    expect(conn.noAuthPromotions).toBe(1);
    expect(conn.status).toBe("connected");
    expect(manager.getStatusSummary()[0].status).not.toBe("authenticating");
  });

  it("queues watchers during handshake and delivers ordered catch-up on connect", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];

    // Pending watcher sees status updates but no catch-up yet.
    conn.setStatus("authenticating");
    expect(ws.frameTypes()).toEqual([
      "sessionStatus",
      "watcherCount",
      "sessionStatus",
    ]);

    conn.setStatus("connected");
    // syncing → catchupBegin → chunk(s) → catchupEnd → live.
    const types = ws.frameTypes();
    const begin = types.indexOf("catchupBegin");
    expect(begin).toBeGreaterThan(-1);
    expect(types[begin - 1]).toBe("sessionStatus"); // syncing
    expect(types[begin + 1]).toBe("<binary>");
    expect(types.slice(begin).filter((t) => t === "catchupEnd")).toHaveLength(
      1,
    );
    expect(types[types.length - 1]).toBe("sessionStatus"); // live

    // ScopeCommanderMap + getScores fired on connect.
    expect(conn.commands.map((c) => c.command)).toContain("ScopeCommanderMap");
    expect(conn.commands.map((c) => c.command)).toContain("getScores");

    // Live packets arrive only after the catch-up boundary.
    const packetsBefore = ws.binaryFrames().length;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(ws.binaryFrames()).toHaveLength(packetsBefore + 1);
  });

  it("refreshes catch-up timer ages during packet gaps while sharing concurrent joins", () => {
    const { manager, connections } = createManager();
    const address = "1.2.3.4:28000";
    const first = new FakeWebSocket();
    manager.watch(first as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    session["watchState"].applyPacket({
      gameState: {},
      ghosts: [],
      events: [
        ["MsgClientReady", "", "CTFGame"],
        ["MsgCTFFlagDropped", "", "Alice", "Storm", "1"],
        ["MsgSystemClock", "", "20", "1200000"],
      ].map((args) => ({
        parsedData: {
          type: "RemoteCommandEvent",
          funcName: "ServerMessage",
          args,
        },
      })),
    } as unknown as PacketData);
    connections[0].setStatus("connected");
    const cached = session["cachedPayload"];
    const concurrent = new FakeWebSocket();
    manager.watch(concurrent as unknown as WebSocket, address);
    expect(session["cachedPayload"]).toBe(cached);

    vi.advanceTimersByTime(10_000);
    const later = new FakeWebSocket();
    manager.watch(later as unknown as WebSocket, address);
    const payload = JSON.parse(
      gunzipSync(Buffer.concat(later.binaryFrames())).toString(),
    );
    expect(payload.hudState.flagDropElapsedSec).toEqual({ 1: 10 });
    expect(payload.hudState.clock.elapsedMs).toBe(10_000);
    manager.shutdown();
  });

  it("ends a failed catch-up with a reason without disrupting other watchers", () => {
    const { manager, connections } = createManager();
    const address = "1.2.3.4:28000";
    const existing = new FakeWebSocket();
    manager.watch(existing as unknown as WebSocket, address);
    const conn = connections[0];
    conn.setStatus("connected");
    const session = manager.getSession(address)!;
    const build = vi
      .spyOn(session as any, "buildPayloadBytes")
      .mockImplementationOnce(() => {
        throw new Error("Snapshot serialization failed");
      });
    const joining = new FakeWebSocket();
    manager.watch(joining as unknown as WebSocket, address);
    expect(joining.jsonMessages().at(-1)).toMatchObject({
      type: "sessionStatus",
      status: "ended",
      address,
      message: "Unable to prepare the game stream. Please try joining again.",
    });
    expect(session.watcherCount).toBe(1);
    const messages = joining.sent.length;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(joining.sent).toHaveLength(messages);
    expect(build).toHaveBeenCalledTimes(1);
    expect(existing.binaryFrames().at(-1)).toEqual(new Uint8Array([1, 2, 3]));
    expect(conn.disconnectCalls).toBe(0);
    // The failed viewer can retry normally.
    manager.watch(joining as unknown as WebSocket, address);
    expect(joining.jsonMessages().at(-1)).toMatchObject({
      type: "sessionStatus",
      status: "live",
    });
    expect(session.watcherCount).toBe(2);
    build.mockRestore();
  });

  it("holds the stream delayed until a server is confirmed non-tournament", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: 1000 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    // Fail-safe: the epoch starts delayed, so nothing is delivered or
    // forwarded yet — the tournament probe went out with connect.
    expect(conn.commands.map((c) => c.command)).toContain("GetVoteMenu");
    expect(ws.frameTypes()).not.toContain("catchupEnd");
    const beforeDelay = ws.binaryFrames().length;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(ws.binaryFrames()).toHaveLength(beforeDelay);
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);

    // The delay elapses: the watcher hydrates from the (past) replica and
    // then receives the buffered packet — one shared connection, no
    // reconnect, so the live pipeline never waited.
    vi.advanceTimersByTime(1000);
    expect(ws.frameTypes()).toContain("catchupEnd");
    expect(ws.binaryFrames().at(-1)).toEqual(new Uint8Array([1, 2, 3]));
    expect(connections).toHaveLength(1);
  });

  it("lifts the delay to live once a server is confirmed non-tournament", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: 1000 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    // Pending during the cold-start window (delayed, nothing delivered).
    expect(ws.frameTypes()).not.toContain("catchupEnd");

    // Not a tournament server: lift the provisional delay, no reconnect.
    const session = manager.getSession("1.2.3.4:28000")!;
    session.setTournamentMode(false);
    expect(manager.getStatusSummary()[0].delayMs).toBe(0);
    expect(connections).toHaveLength(1);
    // The watcher now gets a live catch-up and live-forwarded packets.
    expect(ws.frameTypes()).toContain("catchupEnd");
    const beforeLive = ws.binaryFrames().length;
    conn.emit("packet", new Uint8Array([7, 7, 7]));
    expect(ws.binaryFrames()).toHaveLength(beforeLive + 1);
  });

  it("resolves non-tournament after the mission-drop grace when no banner arrives", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: 1000 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    const session = manager.getSession("1.2.3.4:28000")!;
    // Provisional delay while the decision is pending.
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);

    // The mission-drop burst (MsgClientReady) lands with no tournament
    // banner; a following packet arms the post-drop grace.
    (
      session as unknown as { watchState: { sawMissionDropReady: boolean } }
    ).watchState.sawMissionDropReady = true;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);

    // Grace elapses with no banner → resolved non-tournament → live.
    vi.advanceTimersByTime(4000);
    expect(manager.getStatusSummary()[0].delayMs).toBe(0);
  });

  it("stays delayed when the tournament banner rides the mission-drop burst", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: 1000 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    const session = manager.getSession("1.2.3.4:28000")!;

    // Banner + drop burst in the same packet → resolves tournament at once,
    // so the grace is never armed and the delay holds.
    const ws2 = session as unknown as {
      watchState: { sawMissionDropReady: boolean; tournamentMode: boolean };
    };
    ws2.watchState.sawMissionDropReady = true;
    ws2.watchState.tournamentMode = true;
    conn.emit("packet", new Uint8Array([1, 2, 3]));
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);

    vi.advanceTimersByTime(10_000);
    expect(manager.getStatusSummary()[0].delayMs).toBe(1000);
  });

  it("does not forward pre-attach packets to a late watcher", () => {
    const { manager, connections } = createManager();
    const ws1 = new FakeWebSocket();
    manager.watch(ws1 as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    conn.emit("packet", new Uint8Array([9, 9, 9]));

    const ws2 = new FakeWebSocket();
    manager.watch(ws2 as unknown as WebSocket, "1.2.3.4:28000");
    const catchupChunks = ws2.binaryFrames().length;
    conn.emit("packet", new Uint8Array([4, 4, 4]));

    // ws2 got its catch-up chunks plus exactly the one post-attach packet.
    expect(ws2.binaryFrames()).toHaveLength(catchupChunks + 1);
    const last = ws2.binaryFrames().at(-1)!;
    expect([...last]).toEqual([4, 4, 4]);
  });

  it("disconnects after the idle grace period, cancelled by a new watcher", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");

    manager.detachSocket(ws as unknown as WebSocket);
    expect(conn.disconnectCalls).toBe(0);

    // A new watcher during the grace period cancels the teardown.
    vi.advanceTimersByTime(60_000);
    const ws2 = new FakeWebSocket();
    manager.watch(ws2 as unknown as WebSocket, "1.2.3.4:28000");
    vi.advanceTimersByTime(10 * 60_000);
    expect(conn.disconnectCalls).toBe(0);
    expect(connections).toHaveLength(1);

    // Grace expiry with no watchers tears the session down.
    manager.detachSocket(ws2 as unknown as WebSocket);
    vi.advanceTimersByTime(5 * 60_000);
    expect(conn.disconnectCalls).toBe(1);
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("reconnects on mission cycle and re-delivers catch-up on a new epoch", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn1 = connections[0];
    conn1.setStatus("connected");
    const firstBegin = ws.jsonMessages().find((m) => m.type === "catchupBegin");
    expect(firstBegin).toBeDefined();

    conn1.setStatus("disconnected", missionCyclingReason);
    // Watcher is re-pended and told we're reconnecting.
    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ status: "connecting" });

    vi.advanceTimersByTime(4_999);
    expect(connections).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(2);
    const conn2 = connections[1];
    conn2.setStatus("connected");

    const begins = ws
      .jsonMessages()
      .filter((m) => m.type === "catchupBegin") as Array<{ epoch: number }>;
    expect(begins).toHaveLength(2);
    expect(begins[1].epoch).toBe(begins[0].epoch + 1);
    for (const frame of ws.binaryFrames()) {
      expect(JSON.parse(gunzipSync(frame).toString()).protocolVersion).toBe(
        GAME_PROTOCOL_VERSION,
      );
    }
  });

  it("waits 30 seconds before automatically retrying a stalled connection", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    connections[0].setStatus("connected");
    connections[0].setStatus("disconnected", "Connection stalled");
    vi.advanceTimersByTime(29_999);
    expect(connections).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(2);
    manager.shutdown();
  });

  it("logs scheduled retries and stops at the retry limit", () => {
    const info = vi.spyOn(relayLog, "info").mockImplementation(() => {});
    const { manager, connections } = createManager();
    try {
      const ws = new FakeWebSocket();
      manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
      for (let retriesUsed = 0; retriesUsed <= 3; retriesUsed++) {
        connections.at(-1)!.setStatus("disconnected", missionCyclingReason);
        const retryScheduled = retriesUsed < 3;
        expect(info).toHaveBeenCalledWith(
          expect.objectContaining({
            address: "1.2.3.4:28000",
            reason: missionCyclingReason,
            cooldownMs: 5_000,
            autoRetry: true,
            retryScheduled,
            retriesUsed,
            maxRetries: 3,
            cooldownBlocked: false,
          }),
          retryScheduled
            ? "Watch session will reconnect"
            : "Watch session will not reconnect",
        );
        vi.advanceTimersByTime(5_000);
      }
      expect(connections).toHaveLength(4);
      expect(manager.getStatusSummary()).toEqual([]);
    } finally {
      manager.shutdown();
      info.mockRestore();
    }
  });

  it.each([true, false])(
    "advertises and enforces watcher chatEnabled=%s",
    (chatEnabled) => {
      const { manager, connections } = createManager({ chatEnabled });
      const ws = new FakeWebSocket();
      manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
      const conn = connections[0];
      conn.setStatus("connected");
      manager.sendChat(ws as unknown as WebSocket, "hello");
      expect(
        conn.commands.filter((c) => c.command === "messageSent"),
      ).toHaveLength(chatEnabled ? 1 : 0);
      const late = new FakeWebSocket();
      manager.watch(late as unknown as WebSocket, "1.2.3.4:28000");
      for (const client of [ws, late]) {
        const statuses = client
          .jsonMessages()
          .filter((m) => m.type === "sessionStatus");
        expect(statuses.length).toBeGreaterThan(0);
        expect(statuses.every((m) => m.chatEnabled === chatEnabled)).toBe(true);
      }
      manager.shutdown();
    },
  );

  it("relays watcher chat through the shared identity", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    const wsPending = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];

    // Not connected yet: chat is dropped.
    manager.sendChat(ws as unknown as WebSocket, "too early");
    conn.setStatus("connected");

    const chats = () =>
      conn.commands.filter((c) => c.command === "messageSent");

    manager.sendChat(ws as unknown as WebSocket, "  hello observers  ");
    manager.sendChat(ws as unknown as WebSocket, "second");
    expect(chats()).toEqual([
      { command: "messageSent", args: ["hello observers"] },
      { command: "messageSent", args: ["second"] },
    ]);

    // Empty and unknown-socket messages are ignored; long text truncated.
    manager.sendChat(ws as unknown as WebSocket, "   ");
    manager.sendChat(wsPending as unknown as WebSocket, "not attached");
    manager.sendChat(ws as unknown as WebSocket, "x".repeat(400));
    expect(chats()).toHaveLength(3);
    expect(chats()[2].args[0]).toHaveLength(255);
  });

  it("re-syncs from a fresh connection when packet parsing fails", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");

    const session = (manager as any).sessions.get("1.2.3.4:28000");
    const conn1 = connections[0];
    conn1.setStatus("connected");

    session.parserKit.packetParser.parsePacket = () => {
      throw new Error("bad packet");
    };
    const binBefore = ws.binaryFrames().length;
    conn1.emit("packet", new Uint8Array([1, 2, 3]));

    // The bad packet is not forwarded, the watcher is re-pended, and a
    // fresh connection replaces the diverged one.
    expect(ws.binaryFrames()).toHaveLength(binBefore);
    expect(conn1.disconnectCalls).toBe(1);
    expect(connections).toHaveLength(2);
    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ status: "connecting" });

    // The new connection delivers a fresh catch-up on a new epoch.
    connections[1].setStatus("connected");
    const begins = ws
      .jsonMessages()
      .filter((m) => m.type === "catchupBegin") as Array<{ epoch: number }>;
    expect(begins).toHaveLength(2);
    expect(begins[1].epoch).toBe(begins[0].epoch + 1);
  });

  it("re-syncs when the parser reports a fault it swallowed", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");

    const session = (manager as any).sessions.get("1.2.3.4:28000");
    const conn1 = connections[0];
    conn1.setStatus("connected");

    // A ghost the parser could not read: parsePacket returns normally,
    // but its tracker no longer mirrors the server.
    session.parserKit.packetParser.parsePacket = () => ({
      dnetHeader: {},
      rateInfo: {},
      gameState: {},
      events: [],
      ghosts: [
        {
          index: 9,
          type: "create",
          classId: 25,
          updateBitsStart: 0,
          updateBitsEnd: 0,
          failed: true,
        },
      ],
      parseFault: { stage: "ghost", message: "ghost 9 failed" },
    });
    const binBefore = ws.binaryFrames().length;
    conn1.emit("packet", new Uint8Array([1, 2, 3]));

    expect(ws.binaryFrames()).toHaveLength(binBefore);
    expect(conn1.disconnectCalls).toBe(1);
    expect(connections).toHaveLength(2);
    expect(session.resyncCount).toBe(1);
  });

  it("ends the session when re-syncs repeat without a healthy stretch", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");

    const session = (manager as any).sessions.get("1.2.3.4:28000");
    connections[0].setStatus("connected");

    // Each re-sync builds a fresh parser, so re-break it every round.
    for (let i = 0; i < 4; i++) {
      session.parserKit.packetParser.parsePacket = () => {
        throw new Error("bad packet");
      };
      connections.at(-1)!.emit("packet", new Uint8Array([1]));
    }

    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ status: "ended" });
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("ends the session on non-retryable disconnect", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    connections[0].setStatus("connected");
    connections[0].setStatus("disconnected", "You have been kicked");

    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ status: "ended" });
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("retries retryable disconnects for pinned sessions with no watchers", () => {
    const { manager, connections } = createManager();
    manager.pin("1.2.3.4:28000");
    expect(connections).toHaveLength(1);
    connections[0].setStatus("connected");

    // A disconnect-style mission cycle must not destroy a patrol
    // session — the next mission's recording depends on the retry.
    connections[0].setStatus("disconnected", missionCyclingReason);
    expect(manager.getStatusSummary()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(connections).toHaveLength(2);
  });

  it("preserves a rejected patrol join's reason for viewers arriving while its delay queue drains", () => {
    const address = "1.2.3.4:28000";
    const reason = "You are not allowed to play on this server.";
    const { manager, connections } = createManager({ tourneyDelayMs: 120_000 });
    manager.pin(address);
    connections[0].setStatus("connected");
    const early = new FakeWebSocket();
    manager.watch(early as unknown as WebSocket, address);
    connections[0].setStatus("disconnected", reason);
    expect(manager.has(address)).toBe(true);
    const late = new FakeWebSocket();
    manager.watch(late as unknown as WebSocket, address);
    for (const viewer of [early, late]) {
      expect(
        viewer
          .jsonMessages()
          .findLast((message) => message.type === "sessionStatus"),
      ).toMatchObject({ status: "ended", message: reason });
      expect(viewer.binaryFrames()).toHaveLength(0);
    }
    expect(connections).toHaveLength(1);
    manager.shutdown();
  });

  it("keeps polling scores while a pinned session records without watchers", () => {
    const { manager, connections } = createManager();
    manager.pin("1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    expect(manager.getStatusSummary()[0]).toMatchObject({
      watchers: 0,
      pinned: true,
    });
    const requests = () =>
      conn.commands.filter((c) => c.command === "getScores");
    expect(requests()).toHaveLength(1);
    vi.advanceTimersByTime(12_000);
    expect(requests()).toHaveLength(4);

    conn.setStatus("disconnected", missionCyclingReason);
    vi.advanceTimersByTime(5_000);
    expect(requests()).toHaveLength(4);
    const reconnected = connections[1];
    reconnected.setStatus("connected");
    vi.advanceTimersByTime(4_000);
    expect(
      reconnected.commands.filter((c) => c.command === "getScores"),
    ).toHaveLength(2);

    manager.shutdown();
    const count = reconnected.commands.length;
    vi.advanceTimersByTime(12_000);
    expect(reconnected.commands).toHaveLength(count);
  });

  it("keeps polling scores after the last watcher leaves during recording grace", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const conn = connections[0];
    conn.setStatus("connected");
    manager.detachSocket(ws as unknown as WebSocket);
    expect(manager.getStatusSummary()[0].watchers).toBe(0);
    vi.advanceTimersByTime(8_000);
    expect(conn.commands.filter((c) => c.command === "getScores")).toHaveLength(
      3,
    );
    manager.shutdown();
  });

  it("announces relayRestarting to watchers before shutdown teardown", () => {
    const { manager, connections } = createManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    connections[0].setStatus("connected");

    manager.shutdown();
    const types = ws.frameTypes();
    const restartIndex = types.indexOf("relayRestarting");
    expect(restartIndex).toBeGreaterThan(-1);
    // The restart notice precedes the session's "ended" teardown status.
    const messages = ws.jsonMessages();
    const endedIndex = messages.findIndex(
      (m) => m.type === "sessionStatus" && m.status === "ended",
    );
    expect(endedIndex).toBeGreaterThan(-1);
    expect(types.indexOf("sessionStatus", restartIndex)).toBeGreaterThan(
      restartIndex,
    );
  });

  it("warm-starts sessions that expire via idle grace if nobody returns", () => {
    const changes: string[][] = [];
    const { manager, connections } = createManager({
      onSessionsChanged: (addresses) => changes.push(addresses),
    });

    manager.warmStart("1.2.3.4");
    expect(connections).toHaveLength(1);
    expect(connections[0].connectCalls).toBe(1);
    expect(changes.at(-1)).toEqual(["1.2.3.4:28000"]);

    // A returning watcher cancels the grace timer and attaches normally.
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    expect(connections).toHaveLength(1);
    vi.advanceTimersByTime(10 * 60_000);
    expect(connections[0].disconnectCalls).toBe(0);

    // With no watchers, a warm-started session expires on its own.
    manager.detachSocket(ws as unknown as WebSocket);
    vi.advanceTimersByTime(5 * 60_000);
    expect(connections[0].disconnectCalls).toBe(1);
    expect(changes.at(-1)).toEqual([]);
  });
});

describe("WatchSession delayed transitions", () => {
  const address = "1.2.3.4:28000";
  const delayMs = 60_000;
  const managers: WatchSessionManager[] = [];

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const manager of managers.splice(0)) manager.shutdown();
    vi.useRealTimers();
  });

  function start() {
    const { manager, connections } = createManager({ tourneyDelayMs: delayMs });
    managers.push(manager);
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    connections[0].setStatus("connected");
    session.setTournamentMode(true);
    vi.advanceTimersByTime(delayMs);
    return { manager, connections, ws, session };
  }

  function statuses(ws: FakeWebSocket) {
    return ws.jsonMessages().filter((m) => m.type === "sessionStatus");
  }

  function catchup(ws: FakeWebSocket) {
    const begin = ws.sent.findIndex(
      (f) => !f.binary && JSON.parse(f.data as string).type === "catchupBegin",
    );
    expect(begin).toBeGreaterThanOrEqual(0);
    const chunks: Uint8Array[] = [];
    for (const frame of ws.sent.slice(begin + 1)) {
      if (!frame.binary) break;
      chunks.push(frame.data as Uint8Array);
    }
    const payload = JSON.parse(gunzipSync(Buffer.concat(chunks)).toString());
    expect(payload.protocolVersion).toBe(GAME_PROTOCOL_VERSION);
    return payload;
  }

  // Seed a mission already parsed on both timelines, then exercise the
  // real packet queue, connection events, socket framing, and catch-up.
  function recordedMission(session: any, name = "OldMap") {
    session.watchState.missionName = name;
    session.replica.watchState.missionName = name;
    session.cachedPayload = null;
    session.recorder = { state: "recording", onPacket: () => false };
    session.options.demoCoordinator = policyCoordinator();
    session.fanOutSessionStatus();
    vi.advanceTimersByTime(delayMs);
  }

  function cycle(
    connections: FakeGameConnection[],
    session: ReturnType<WatchSessionManager["getSession"]>,
    tournament: boolean,
  ) {
    connections.at(-1)!.setStatus("disconnected", missionCyclingReason);
    vi.advanceTimersByTime(5_000);
    connections.at(-1)!.setStatus("connected");
    session!.setTournamentMode(tournament);
  }

  it("moves live viewers to the tournament countdown without sending early packets", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: delayMs });
    managers.push(manager);
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    connections[0].setStatus("connected");
    session.setTournamentMode(false);
    ws.sent = [];
    cycle(connections, session, true);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "syncing",
      streamDelayMs: delayMs,
      streamDelayReadyInMs: delayMs,
    });
    const packet = new Uint8Array([7, 7, 7]);
    connections[1].emit("packet", packet);
    vi.advanceTimersByTime(delayMs - 1);
    expect(ws.binaryFrames()).not.toContainEqual(packet);
    vi.advanceTimersByTime(1);
    expect(ws.binaryFrames()).toContainEqual(packet);
    expect(catchup(ws).epoch).toBe(2);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      streamDelayMs: delayMs,
    });
  });

  it("serves old and new viewers on separate channels until the tournament tail finishes", () => {
    const { manager, connections, ws, session } = start();
    recordedMission(session);
    const oldChannel = statuses(ws).at(-1)!.channelId;
    ws.sent = [];
    const tail = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", tail);
    vi.advanceTimersByTime(100);
    cycle(connections, session, false);
    const state = session as any;
    state.watchState.missionName = "NormalMap";
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(catchup(joiner)).toMatchObject({
      epoch: 2,
      missionName: "NormalMap",
    });
    expect(statuses(joiner).at(-1)).toMatchObject({
      streamDelayMs: 0,
      recording: true,
    });
    expect(statuses(joiner).at(-1)!.channelId).not.toBe(oldChannel);
    joiner.sent = [];
    const current = new Uint8Array([7, 7, 7]);
    connections[1].emit("packet", current);
    expect(joiner.binaryFrames()).toEqual([current]);
    expect(ws.binaryFrames()).toHaveLength(0);
    vi.advanceTimersByTime(delayMs);
    expect(ws.binaryFrames()[0]).toEqual(tail);
    expect(catchup(ws)).toMatchObject({ epoch: 2, missionName: "NormalMap" });
    expect(statuses(ws).at(-1)).toMatchObject({
      streamDelayMs: 0,
      status: "live",
    });
    expect(joiner.binaryFrames()).toEqual([current]);
    expect(statuses(joiner)).toEqual([]);
  });

  it("waits for the mode decision before placing a new arrival on either channel", () => {
    const { manager, connections, session } = start();
    connections[0].setStatus("disconnected", missionCyclingReason);
    vi.advanceTimersByTime(5_000);
    connections[1].setStatus("connected");
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(joiner.frameTypes()).not.toContain("catchupBegin");
    session.setTournamentMode(false);
    expect(catchup(joiner).epoch).toBe(2);
    expect(statuses(joiner).at(-1)).toMatchObject({ streamDelayMs: 0 });
  });

  it.each(["disconnect", "in-place"])(
    "does not put a new arrival on the old channel during a %s mission change",
    (transition) => {
      const { manager, connections, session } = start();
      if (transition === "disconnect") {
        connections[0].setStatus("disconnected", missionCyclingReason);
      } else {
        const state = session as any;
        state.watchState.missionName = "OldMap";
        state.handleResponderEvent({
          type: "GhostingMessageEvent",
          message: 2,
        });
      }
      const joiner = new FakeWebSocket();
      manager.watch(joiner as unknown as WebSocket, address);
      expect(joiner.frameTypes()).not.toContain("catchupBegin");
      vi.advanceTimersByTime(5_000);
      connections[1].setStatus("connected");
      session.setTournamentMode(false);
      expect(catchup(joiner).epoch).toBe(2);
      expect(statuses(joiner).at(-1)).toMatchObject({
        streamDelayMs: 0,
        status: "live",
      });
    },
  );

  it("switches a drained channel to the latest normal mission after multiple rapid map cycles", () => {
    const { manager, connections, ws, session } = start();
    ws.sent = [];
    cycle(connections, session, false);
    const normalViewer = new FakeWebSocket();
    manager.watch(normalViewer as unknown as WebSocket, address);
    normalViewer.sent = [];
    cycle(connections, session, false);
    expect(catchup(normalViewer).epoch).toBe(3);
    const snapshotCount = normalViewer
      .frameTypes()
      .filter((t) => t === "catchupEnd").length;
    vi.advanceTimersByTime(delayMs - 5_000);
    expect(catchup(ws).epoch).toBe(3);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      streamDelayMs: 0,
    });
    // Old delayed epoch markers must not rehydrate viewers already live.
    vi.advanceTimersByTime(5_000);
    expect(
      normalViewer.frameTypes().filter((t) => t === "catchupEnd"),
    ).toHaveLength(snapshotCount);
    expect(session.streamDelayMs).toBe(0);
  });

  it("keeps a same-socket catch-up retry on its existing delayed channel", () => {
    const { manager, connections, ws, session } = start();
    cycle(connections, session, false);
    ws.sent = [];
    manager.watch(ws as unknown as WebSocket, address);
    expect(catchup(ws).epoch).toBe(1);
    expect(statuses(ws).at(-1)?.streamDelayMs).toBe(delayMs);
  });

  it("preserves channel continuity through the socket request coordinator", async () => {
    const { manager, connections, ws, session } = start();
    const socket = ws as unknown as WebSocket;
    const channelId = session.getChannelId(socket);
    cycle(connections, session, false);
    const request = new WatchRequest({
      isKnown: (address) => manager.has(address),
      probe: async () => false,
      checking: () => {},
      rejected: () => {},
      attach: (address, channelId) => manager.watch(socket, address, channelId),
      detach: () => manager.detachSocket(socket),
    });

    // server.ts captures the channel before WatchRequest detaches the socket.
    ws.sent = [];
    await request.watch(address, session.getChannelId(socket));
    expect(catchup(ws).epoch).toBe(1);
    expect(statuses(ws).at(-1)).toMatchObject({
      channelId,
      streamDelayMs: delayMs,
    });

    request.leave();
    ws.sent = [];
    await request.watch(address, channelId);
    expect(catchup(ws).epoch).toBe(1);
    vi.advanceTimersByTime(delayMs);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      streamDelayMs: 0,
    });

    request.leave();
    ws.sent = [];
    await request.watch(address, channelId);
    expect(catchup(ws).epoch).toBe(2);
    expect(statuses(ws).at(-1)?.channelId).not.toBe(channelId);
  });

  it.each([false, true])(
    "restarts a dormant connection when a viewer returns after the retry was skipped (tournament=%s)",
    (tournament) => {
      const { manager, connections } = createManager({
        tourneyDelayMs: delayMs,
      });
      managers.push(manager);
      const ws = new FakeWebSocket();
      manager.watch(ws as unknown as WebSocket, address);
      const session = manager.getSession(address)!;
      connections[0].setStatus("connected");
      session.setTournamentMode(tournament);
      if (tournament) vi.advanceTimersByTime(delayMs);
      const channelId = session.getChannelId(ws as unknown as WebSocket);
      connections[0].setStatus("disconnected", missionCyclingReason);
      manager.detachSocket(ws as unknown as WebSocket);
      vi.advanceTimersByTime(10_000);
      expect(connections).toHaveLength(1);
      const resumed = new FakeWebSocket();
      manager.watch(resumed as unknown as WebSocket, address, channelId);
      expect(connections).toHaveLength(2);
      connections[1].setStatus("connected");
      session.setTournamentMode(false);
      if (tournament) {
        expect(catchup(resumed).epoch).toBe(1);
        expect(statuses(resumed).at(-1)?.streamDelayMs).toBe(delayMs);
        vi.advanceTimersByTime(delayMs);
      }
      expect(statuses(resumed).at(-1)).toMatchObject({
        status: "live",
        streamDelayMs: 0,
      });
      expect(
        resumed
          .jsonMessages()
          .filter((m) => m.type === "catchupBegin")
          .at(-1),
      ).toMatchObject({ epoch: 2 });
    },
  );

  it("reconnects only once when EndGhosting is followed by a server disconnect", () => {
    const { connections, session } = start();
    const state = session as any;
    state.watchState.missionName = "OldMap";
    state.handleResponderEvent({ type: "GhostingMessageEvent", message: 2 });
    connections[0].setStatus("disconnected", missionCyclingReason);
    vi.advanceTimersByTime(5_000);
    expect(connections).toHaveLength(2);
    connections[1].setStatus("connected");
    session.setTournamentMode(false);
    vi.advanceTimersByTime(delayMs);
    expect(connections).toHaveLength(2);
    expect(connections[1].disconnectCalls).toBe(0);
  });

  it("rejects channel continuity from a destroyed session", () => {
    const { manager, ws, session, connections } = start();
    const oldId = session.getChannelId(ws as unknown as WebSocket);
    manager.shutdown();
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address, oldId);
    connections.at(-1)!.setStatus("connected");
    manager.getSession(address)!.setTournamentMode(false);
    expect(catchup(joiner).epoch).toBe(1);
    expect(statuses(joiner).at(-1)).toMatchObject({ streamDelayMs: 0 });
    expect(statuses(joiner).at(-1)!.channelId).not.toBe(oldId);
  });

  it("resumes a draining channel after socket loss, but cannot resume it after it finishes", () => {
    const { manager, connections, ws, session } = start();
    const channelId = statuses(ws).at(-1)!.channelId;
    cycle(connections, session, false);
    manager.detachSocket(ws as unknown as WebSocket);
    const resumed = new FakeWebSocket();
    manager.watch(resumed as unknown as WebSocket, address, channelId);
    expect(catchup(resumed).epoch).toBe(1);
    expect(statuses(resumed).at(-1)).toMatchObject({
      channelId,
      streamDelayMs: delayMs,
    });
    vi.advanceTimersByTime(delayMs);
    manager.detachSocket(resumed as unknown as WebSocket);
    const returned = new FakeWebSocket();
    manager.watch(returned as unknown as WebSocket, address, channelId);
    expect(catchup(returned).epoch).toBe(2);
    expect(statuses(returned).at(-1)?.streamDelayMs).toBe(0);
  });

  it("keeps the original countdown when a tournament mission ends before its first delayed frame", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: delayMs });
    managers.push(manager);
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    connections[0].setStatus("connected");
    session.setTournamentMode(true);
    const channelId = statuses(ws).at(-1)!.channelId;
    cycle(connections, session, false);
    connections[1].setMapName("FutureMap");
    manager.detachSocket(ws as unknown as WebSocket);
    const resumed = new FakeWebSocket();
    manager.watch(resumed as unknown as WebSocket, address, channelId);
    expect(statuses(resumed).at(-1)).toMatchObject({
      streamDelayMs: delayMs,
      streamDelayReadyInMs: delayMs - 5_000,
    });
    expect(statuses(resumed).at(-1)!.mapName).not.toBe("FutureMap");
    vi.advanceTimersByTime(delayMs - 5_000);
    expect(catchup(resumed).epoch).toBe(1);
    vi.advanceTimersByTime(5_000);
    expect(statuses(resumed).at(-1)).toMatchObject({
      streamDelayMs: 0,
      status: "live",
    });
  });

  it("does not replay old tournament packets or leak new ones during a rapid tournament-normal-tournament switch", () => {
    const { manager, connections, ws, session } = start();
    ws.sent = [];
    const oldPacket = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", oldPacket);
    cycle(connections, session, false);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(catchup(joiner).epoch).toBe(2);
    joiner.sent = [];
    cycle(connections, session, true);
    const newPacket = new Uint8Array([7, 7, 7]);
    connections[2].emit("packet", newPacket);
    vi.advanceTimersByTime(delayMs - 1);
    expect(ws.binaryFrames()).toEqual([oldPacket]);
    expect(joiner.binaryFrames()).toHaveLength(0);
    expect(statuses(ws).at(-1)).toMatchObject({
      streamDelayMs: delayMs,
      status: "syncing",
    });
    vi.advanceTimersByTime(1);
    expect(catchup(ws).epoch).toBe(3);
    expect(catchup(joiner).epoch).toBe(3);
    expect(joiner.binaryFrames()).not.toContainEqual(oldPacket);
    expect(ws.binaryFrames().at(-1)).toEqual(newPacket);
    expect(joiner.binaryFrames().at(-1)).toEqual(newPacket);
  });

  it("ends the live channel immediately but drains the delayed channel on terminal disconnect", () => {
    const { manager, connections, ws, session } = start();
    ws.sent = [];
    const packet = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", packet);
    cycle(connections, session, false);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    joiner.sent = [];
    connections[1].setStatus("disconnected", "You have been kicked");
    expect(statuses(joiner).at(-1)).toMatchObject({
      status: "ended",
      streamDelayMs: 0,
    });
    expect(statuses(ws)).toHaveLength(0);
    vi.advanceTimersByTime(delayMs);
    expect(ws.binaryFrames()).toContainEqual(packet);
    expect(joiner.binaryFrames()).toHaveLength(0);
    expect(manager.has(address)).toBe(false);
  });

  it("keeps status, recording and catch-ups on the old timeline while the upstream reconnects", () => {
    const { manager, connections, ws, session } = start();
    recordedMission(session);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      recording: true,
      streamDelayMs: delayMs,
    });
    ws.sent = [];
    const tail = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", tail);
    vi.advanceTimersByTime(100);
    connections[0].setStatus("disconnected", missionCyclingReason);
    // The recording stopped upstream, but nothing changed at the playhead.
    expect(ws.sent).toHaveLength(0);

    const joiner = new FakeWebSocket();
    manager.watch(
      joiner as unknown as WebSocket,
      address,
      session.getChannelId(ws as unknown as WebSocket),
    );
    expect(catchup(joiner)).toMatchObject({ epoch: 1, missionName: "OldMap" });
    expect(statuses(joiner).at(-1)).toMatchObject({
      status: "live",
      mapName: "OldMap",
      recording: true,
      streamDelayMs: delayMs,
    });

    vi.advanceTimersByTime(5_000);
    connections[1].setMapName("FutureMap");
    connections[1].setStatus("authenticating");
    connections[1].setStatus("connected");
    // Even the next epoch's unresolved tournament decision stays private.
    expect(statuses(ws)).toHaveLength(0);
    const laterJoiner = new FakeWebSocket();
    manager.watch(laterJoiner as unknown as WebSocket, address);
    expect(laterJoiner.frameTypes()).not.toContain("catchupBegin");
    session.setTournamentMode(true);
    expect(statuses(laterJoiner).at(-1)).toMatchObject({
      mapName: "OldMap",
      recording: true,
      streamDelayMs: delayMs,
    });

    vi.advanceTimersByTime(delayMs - 5_100);
    expect(ws.binaryFrames()).toEqual([tail]);
    expect(statuses(ws)).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "connecting",
      streamDelayMs: delayMs,
    });
    expect(statuses(ws).some((s) => s.status === "ended")).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      mapName: "FutureMap",
      streamDelayMs: delayMs,
    });
  });

  it("drains a terminal disconnect and still accepts catch-ups until the delayed end", () => {
    const { manager, connections, ws, session } = start();
    recordedMission(session);
    ws.sent = [];
    const tail = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", tail);
    vi.advanceTimersByTime(100);
    connections[0].setStatus("disconnected", "You have been kicked");
    expect(manager.has(address)).toBe(true);
    expect(ws.sent).toHaveLength(0);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(catchup(joiner).epoch).toBe(1);
    expect(statuses(joiner).at(-1)).toMatchObject({
      recording: true,
      streamDelayMs: delayMs,
    });
    vi.advanceTimersByTime(delayMs - 100);
    expect(ws.binaryFrames()).toEqual([tail]);
    expect(manager.has(address)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "ended",
      message: "You have been kicked",
    });
    expect(manager.has(address)).toBe(false);
    expect(connections).toHaveLength(1);
  });

  it("finishes the tournament tail before lifting delay on the next normal-mode epoch", () => {
    const { connections, ws, session } = start();
    ws.sent = [];
    const tail = new Uint8Array([1, 2, 3]);
    connections[0].emit("packet", tail);
    vi.advanceTimersByTime(100);
    connections[0].setStatus("disconnected", missionCyclingReason);
    vi.advanceTimersByTime(5_000);
    connections[1].setStatus("connected");
    session.setTournamentMode(false);
    expect(session.streamDelayMs).toBe(delayMs);
    expect(ws.sent).toHaveLength(0);
    vi.advanceTimersByTime(delayMs - 5_100);
    expect(ws.binaryFrames()).toEqual([tail]);
    vi.advanceTimersByTime(5_100);
    expect(session.streamDelayMs).toBe(0);
    expect(statuses(ws).at(-1)).toMatchObject({
      status: "live",
      streamDelayMs: 0,
    });
    expect(catchup(ws).epoch).toBe(2);
    const before = ws.binaryFrames().length;
    connections[1].emit("packet", new Uint8Array([7, 7, 7]));
    expect(ws.binaryFrames()).toHaveLength(before + 1);
  });

  it("lifts provisional delays promptly across ordinary non-tournament cycles", () => {
    const { manager, connections } = createManager({ tourneyDelayMs: delayMs });
    managers.push(manager);
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, address);
    const session = manager.getSession(address)!;
    expect(statuses(ws).at(-1)?.streamDelayMs).toBe(0);
    connections[0].setStatus("connected");
    session.setTournamentMode(false);
    expect(session.streamDelayMs).toBe(0);
    connections[0].setStatus("disconnected", missionCyclingReason);
    vi.advanceTimersByTime(5_000);
    connections[1].setStatus("connected");
    expect(statuses(ws).at(-1)?.streamDelayMs).toBe(0);
    session.setTournamentMode(false);
    // There is no old delayed tail, so the next mission need not wait a minute.
    expect(session.streamDelayMs).toBe(0);
    expect(
      ws.frameTypes().filter((type) => type === "catchupEnd"),
    ).toHaveLength(2);
  });

  it("rotates unrecorded missions too, without cutting off the delayed stream", () => {
    const { manager, connections, ws, session } = start();
    const state = session as any;
    state.watchState.missionName = "OldMap";
    state.replica.watchState.missionName = "OldMap";
    ws.sent = [];
    state.handleResponderEvent({ type: "GhostingMessageEvent", message: 2 });
    vi.advanceTimersByTime(5_000);
    expect(connections).toHaveLength(2);
    expect(ws.sent).toHaveLength(0);
    const joiner = new FakeWebSocket();
    manager.watch(
      joiner as unknown as WebSocket,
      address,
      session.getChannelId(ws as unknown as WebSocket),
    );
    expect(catchup(joiner)).toMatchObject({ epoch: 1, missionName: "OldMap" });
  });

  it("includes delayed mission-phase metadata in reconnect snapshots", () => {
    const { manager, connections, session } = start();
    const state = session as any;
    const parsed = {
      gameState: {},
      ghosts: [],
      events: [
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "MissionStartPhase1",
            args: ["1", "DelayedMap"],
          },
        },
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args: ["MsgMissionStart", "Match started"],
          },
        },
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args: ["MsgMissionDropInfo", "", "DelayedMap", "CTF", "Server"],
          },
        },
      ],
    };
    state.parserKit.packetParser.parsePacket = () => parsed;
    state.replica.kit.packetParser.parsePacket = () => parsed;
    connections[0].emit("packet", new Uint8Array([1, 2, 3]));
    vi.advanceTimersByTime(delayMs);
    expect(state.replica.watchState.matchStarted).toBe(true);
    expect(state.replica.watchState.missionType).toBe("CTF");
    expect(state.replica.watchState.serverName).toBe("Server");
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(catchup(joiner).missionName).toBe("DelayedMap");
    expect(statuses(joiner).at(-1)).toMatchObject({ mapName: "DelayedMap" });
  });

  it.each([0, delayMs])(
    "hydrates at the complete packet boundary when handshake/delay resolves inside a packet (delay=%d)",
    (tourneyDelayMs) => {
      const { manager, connections } = createManager({ tourneyDelayMs });
      managers.push(manager);
      const ws = new FakeWebSocket();
      manager.watch(ws as unknown as WebSocket, address);
      const session = manager.getSession(address) as any;
      connections[0].setStatus(tourneyDelayMs ? "connected" : "authenticating");
      session.watchState.tournamentMode = false;
      session.parserKit.packetParser.parsePacket = () => ({
        gameState: {},
        ghosts: [],
        events: [
          {
            parsedData: {
              type: "RemoteCommandEvent",
              funcName: "MissionStartPhase1",
              args: ["1", "NewMap"],
            },
          },
        ],
      });
      connections[0].emit("packet", new Uint8Array([1, 2, 3]));
      expect(catchup(ws).missionName).toBe("NewMap");
      // One compressed snapshot; its packet must not also be raw-forwarded.
      expect(ws.binaryFrames()).toHaveLength(1);
    },
  );

  it("still drains to completion if the upstream ends while a delay lift is pending", () => {
    const { manager, connections, ws, session } = start();
    connections[0].emit("packet", new Uint8Array([1, 2, 3]));
    vi.advanceTimersByTime(100);
    connections[0].setStatus("disconnected", missionCyclingReason);
    vi.advanceTimersByTime(5_000);
    connections[1].setStatus("connected");
    session.setTournamentMode(false);
    connections[1].emit("packet", new Uint8Array([7, 7, 7]));
    connections[1].setStatus("disconnected", "You have been kicked");
    vi.advanceTimersByTime(delayMs);
    expect(ws.binaryFrames()).toContainEqual(new Uint8Array([1, 2, 3]));
    expect(ws.binaryFrames()).toContainEqual(new Uint8Array([7, 7, 7]));
    expect(statuses(ws).at(-1)).toMatchObject({ status: "ended" });
    expect(manager.has(address)).toBe(false);
  });

  it("stops forwarding a failed replica and repairs it with a fresh epoch", () => {
    const { manager, connections, ws, session } = start();
    ws.sent = [];
    const state = session as any;
    const parse = vi.fn(() => ({ parseFault: { message: "bad ghost" } }));
    state.replica.kit.packetParser.parsePacket = parse;
    connections[0].emit("packet", new Uint8Array([1, 2, 3]));
    connections[0].emit("packet", new Uint8Array([1, 2, 3]));
    vi.advanceTimersByTime(delayMs);
    expect(parse).toHaveBeenCalledOnce();
    expect(ws.binaryFrames()).toHaveLength(0);
    expect(connections).toHaveLength(2);
    const joiner = new FakeWebSocket();
    manager.watch(joiner as unknown as WebSocket, address);
    expect(joiner.frameTypes()).not.toContain("catchupBegin");
    connections[1].setStatus("connected");
    vi.advanceTimersByTime(delayMs);
    expect(statuses(ws).at(-1)).toMatchObject({ status: "live" });
    expect(catchup(joiner).epoch).toBe(2);
  });
});

describe("WatchSession demo recording", () => {
  // Real timers: recorder finalize does real fs work. The mission-cycle
  // linger is zeroed so rotations happen on the next timer tick.
  beforeEach(() => {
    process.env.WATCH_CYCLE_LINGER_MS = "0";
  });
  afterEach(() => {
    delete process.env.WATCH_CYCLE_LINGER_MS;
  });
  const flushImmediate = () => new Promise((r) => setImmediate(r));

  async function createRecordingManager(
    overrides: { minPlayers?: number; initialMissionControls?: unknown } = {},
  ) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "watch-demo-"));
    const finalized: string[] = [];
    const coordinator = new DemoCoordinator({
      enabled: true,
      dir,
      minFreeBytes: 0,
      maxBytes: 512 * 1024 * 1024,
      minLengthMs: 0,
      minPlayers: overrides.minPlayers ?? 0,
      recorderName: "Observer",
      onFinalized: (filePath) => finalized.push(filePath),
    });
    const connections: FakeGameConnection[] = [];
    const manager = new WatchSessionManager({
      gameBasePath: "/nonexistent",
      getCachedServer: () => undefined,
      demoCoordinator: coordinator,
      adminVotePolicies: singleAdminPolicies,
      initialMissionControls: overrides.initialMissionControls,
      createConnection: (address) => {
        const conn = new FakeGameConnection(address);
        connections.push(conn);
        return conn as unknown as GameConnection;
      },
    });
    return { manager, connections, coordinator, finalized, dir };
  }

  function getSession(manager: WatchSessionManager) {
    return (manager as any).sessions.get("1.2.3.4:28000");
  }

  function firePhase1(session: any, missionName: string): void {
    session.handleResponderEvent({
      type: "RemoteCommandEvent",
      funcName: "MissionStartPhase1",
      args: ["1", missionName],
    });
  }

  function fireEndGhosting(session: any): void {
    session.handleResponderEvent({
      type: "GhostingMessageEvent",
      message: 2,
      sequence: 0,
      ghostCount: 0,
    });
  }

  it("restores the previous mission's journal before settling stale watch state on a new map", async () => {
    const address = "1.2.3.4:28000";
    const { manager, connections, coordinator, finalized, dir } =
      await createRecordingManager({
        initialMissionControls: {
          [address]: {
            mission: ["1", "Katabatic"],
            recording: true,
            watching: false,
          },
        },
      });
    try {
      const pending = path.join(dir, "pending", "previous-segment");
      await fsp.mkdir(pending, { recursive: true });
      await fsp.writeFile(
        path.join(pending, "policy.json"),
        JSON.stringify({
          address,
          mission: ["1", "Katabatic"],
          keep: false,
          complete: false,
        }),
      );
      await fsp.writeFile(path.join(pending, "private.rec"), "private footage");
      await coordinator.restorePending();
      manager.warmStart(address);
      connections[0].setStatus("connected");
      firePhase1(getSession(manager), "Raindance");
      await coordinator.sweepPending();
      expect(finalized).toEqual([]);
      expect(await fsp.stat(pending).catch(() => null)).toBeNull();
      expect(getSession(manager).controls.snapshot()).toMatchObject({
        mission: ["1", "Raindance"],
        recording: true,
        watching: true,
      });
    } finally {
      manager.shutdown();
      await coordinator.shutdown(5_000);
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    { keep: true, reconnect: false },
    { keep: false, reconnect: false },
    { keep: true, reconnect: true },
    { keep: false, reconnect: true },
  ])(
    "holds the whole match until its final decision: %j",
    async ({ keep, reconnect }) => {
      const { manager, connections, coordinator, finalized, dir } =
        await createRecordingManager();
      manager.watch(
        new FakeWebSocket() as unknown as WebSocket,
        "1.2.3.4:28000",
      );
      const session = getSession(manager);
      connections[0].setStatus("connected");
      firePhase1(session, "Katabatic");
      session.watchState.matchStarted = true;
      const original = session.recorder;
      const remote = (funcName: string, ...args: string[]) => ({
        parsedData: { type: "RemoteCommandEvent", funcName, args },
      });
      const events = (...commands: ReturnType<typeof remote>[]) => {
        session.parserKit.packetParser.parsePacket = () => ({
          gameState: {},
          ghosts: [],
          events: commands,
        });
        connections.at(-1)!.emit("packet", new Uint8Array([1, 2, 3]));
      };
      const command = (text: string) =>
        events(
          remote(
            "ServerMessage",
            "MsgClientJoin",
            "",
            "Admin",
            "7",
            "-1",
            "0",
            "1",
            "0",
            "0",
            "123",
          ),
          remote(
            "ChatMessage",
            "7",
            "",
            "1",
            "\x06%1: %2",
            "Admin",
            `@MapGenius ${text}`,
          ),
        );
      try {
        command("-rec");
        expect(original.state).toBe("recording");
        expect(session.recorder).toBe(original);
        expect(session.recording).toBe(false);
        expect(connections).toHaveLength(1);
        expect(session.watcherCount).toBe(1);
        expect(finalized).toEqual([]);
        expect(connections[0].commands.at(-1)?.args[0]).toContain(
          "Recording: OFF.",
        );
        if (reconnect) {
          session.reconnect("Test interruption");
          connections[1].setStatus("connected");
          firePhase1(session, "Katabatic");
          session.watchState.matchStarted = true;
          await vi.waitFor(() => expect(original.state).toBe("done"));
          expect(finalized).toEqual([]);
          expect(
            (await fsp.readdir(dir)).filter((name) => name.endsWith(".rec")),
          ).toEqual([]);
        }
        if (keep) command("+rec");
        const current = session.recorder;
        expect(current.state).toBe("recording");
        expect(connections).toHaveLength(reconnect ? 2 : 1);
        events(remote("MissionEnd"));
        expect(session.controls.recordingDecision).toBe(keep);
        // Changes during the debrief cannot reverse the already final decision.
        command(keep ? "-rec" : "+rec");
        expect(session.controls.recording).toBe(keep);
        fireEndGhosting(session);
        await vi.waitFor(() =>
          expect(current.state).toBe(keep ? "done" : "aborted"),
        );
        const count = reconnect ? 2 : 1;
        await vi.waitFor(() =>
          expect(coordinator.getStats()).toMatchObject(
            keep ? { kept: count } : { dropped: count },
          ),
        );
        expect(finalized).toHaveLength(keep ? count : 0);
        for (const file of finalized) {
          const metadata = JSON.parse(
            await fsp.readFile(`${file}.json`, "utf8"),
          );
          expect(metadata).toMatchObject({
            address: "1.2.3.4:28000",
            games: [{ mission: "Katabatic", missionSequence: 1 }],
          });
        }
        expect(await fsp.readdir(path.dirname(original.partialPath!))).toEqual([
          "policy.json",
        ]);
      } finally {
        manager.shutdown();
        await coordinator.shutdown(5000);
        await fsp.rm(dir, { recursive: true, force: true });
      }
    },
  );

  it("applies the old mission's discard choice before Phase1 resets defaults", async () => {
    const { manager, connections, coordinator, finalized, dir } =
      await createRecordingManager();
    manager.watch(new FakeWebSocket() as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");
    session.watchState.matchStarted = true;
    const original = session.recorder;
    session.controls.recording = false;
    coordinator.updateMission(session.key, session.controls.snapshot());
    try {
      // No MissionEnd or EndGhosting, including a restart of the same map.
      session.parserKit.packetParser.parsePacket = () => ({
        gameState: {},
        ghosts: [],
        events: [
          {
            parsedData: {
              type: "RemoteCommandEvent",
              funcName: "MissionStartPhase1",
              args: ["2", "Katabatic"],
            },
          },
        ],
      });
      connections[0].emit("packet", new Uint8Array([1, 2, 3]));
      expect(session.controls.recording).toBe(true);
      expect(session.controls.recordingDecision).toBeUndefined();
      await vi.waitFor(() => expect(coordinator.getStats().dropped).toBe(1));
      await vi.waitFor(() => expect(connections).toHaveLength(2));
      expect(finalized).toEqual([]);
      expect(original.state).toBe("aborted");
    } finally {
      manager.shutdown();
      await coordinator.shutdown(5000);
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it("reports the keep policy while buffering and after recording starts at Phase1", async () => {
    const { manager, connections } = await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");

    expect(session.recorder).not.toBeNull();
    expect(session.recorder.state).toBe("buffering");
    expect(manager.getStatusSummary()[0].recording).toBe(true);

    firePhase1(session, "Katabatic");
    expect(session.recorder.state).toBe("recording");
    expect(manager.getStatusSummary()[0].recording).toBe(true);
    const statuses = ws
      .jsonMessages()
      .filter((m) => m.type === "sessionStatus");
    expect(statuses.at(-1)).toMatchObject({ recording: true });

    manager.shutdown();
  });

  it("records roster events before a same-packet mission cycle finalizes the demo", async () => {
    const { manager, connections, finalized, coordinator, dir } =
      await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].selfClientId = 7;
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");
    const commands = [
      // The handshake identifies the recorder even without a welcome or GUID.
      ["MsgClientJoin", "", "Actual observer name", "7", "1"],
      ["MsgMissionStart", "Match started"],
      ["MsgClientJoin", "", "Alice", "10", "2"],
      ["MsgClientNameChanged", "", "Alice", "Bob", "10"],
      ["MsgClientDrop", "", "Bob", "10"],
    ];
    session.parserKit.packetParser.parsePacket = () => ({
      gameState: {},
      ghosts: [],
      events: [
        ...commands.map((args) => ({
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args,
          },
        })),
        {
          parsedData: {
            type: "GhostingMessageEvent",
            message: 2,
            sequence: 0,
            ghostCount: 0,
          },
        },
      ],
    });
    try {
      connections[0].emit("packet", new Uint8Array([1, 2, 3]));
      expect(session.recorder).toBeNull();
      await vi.waitFor(() => expect(finalized).toHaveLength(1));
      const sidecar = JSON.parse(
        await fsp.readFile(`${finalized[0]}.json`, "utf8"),
      );
      expect(sidecar.players).toEqual(["Alice", "Bob"]);
      expect(sidecar.playerCount).toBe(2);
    } finally {
      manager.shutdown();
      await coordinator.shutdown(5000);
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it("rotates the recording on EndGhosting via a reconnect that skips the resync budget", async () => {
    const { manager, connections, finalized, coordinator } =
      await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");
    // Satisfy the keep gates (players gate is 0 in these tests).
    session.watchState.matchStarted = true;
    const firstRecorder = session.recorder;

    fireEndGhosting(session);
    expect(session.recorder).toBeNull();
    await vi.waitFor(() => expect(connections).toHaveLength(2));
    expect(connections[0].disconnectCalls).toBe(1);
    expect(session.resyncCount).toBe(0);
    connections[1].setStatus("connected");
    expect(session.recorder).not.toBeNull();
    expect(session.recorder).not.toBe(firstRecorder);

    // The mission-N demo was finalized and handed to the upload queue.
    // No cached server info in this fake, so the slug is the address.
    await vi.waitFor(() => expect(finalized).toHaveLength(1));
    expect(finalized[0]).toMatch(
      /1-2-3-4-28000_\d{8}T\d{4}_katabatic_[0-9a-f]{6}\.rec$/,
    );
    expect(coordinator.getStats()).toMatchObject({
      enabled: true,
      buffering: 1, // the new epoch's recorder, pre-Phase1
      recording: 0,
      started: 2,
      kept: 1,
      dropped: 0,
      failed: 0,
    });

    manager.shutdown();
  });

  it("keeps buffering through a cycle that arrives before Phase1", async () => {
    const { manager, connections } = await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    const recorder = session.recorder;
    expect(recorder.state).toBe("buffering");

    // Joined mid-cycle: EndGhosting before any Phase1. The from-connect
    // stream stays valid — no rotation, no reconnect.
    fireEndGhosting(session);
    await flushImmediate();
    await flushImmediate();
    expect(connections).toHaveLength(1);
    expect(session.recorder).toBe(recorder);

    // The new mission's Phase1 flushes the buffer under its name.
    firePhase1(session, "Damnation");
    expect(recorder.state).toBe("recording");

    manager.shutdown();
  });

  it("reconnects on every mission cycle, however short the previous map", async () => {
    const { manager, connections } = await createRecordingManager();
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");

    fireEndGhosting(session);
    await vi.waitFor(() => expect(connections).toHaveLength(2));
    connections[1].setStatus("connected");
    firePhase1(session, "Damnation");
    const secondRecorder = session.recorder;

    // A second cycle right after the first: no "ride in place" any more,
    // so every map change reconnects into a fresh epoch (which is what
    // re-decides tournament mode per mission).
    fireEndGhosting(session);
    await vi.waitFor(() => expect(connections).toHaveLength(3));
    // The Damnation recording was rotated out; the new epoch buffers.
    expect(session.recorder).not.toBe(secondRecorder);
    expect(session.recorder?.state).toBe("buffering");

    manager.shutdown();
  });

  it("finalizes the recording on disconnect-style mission cycles and session end", async () => {
    const { manager, connections, coordinator } =
      await createRecordingManager();
    const finalizeSpy = vi.spyOn(coordinator, "finalize");
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");

    connections[0].setStatus("disconnected", missionCyclingReason);
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
    expect(session.recorder).toBeNull();

    manager.shutdown();
  });

  it("drops recordings from sessions that never had enough players", async () => {
    const { manager, connections, coordinator, finalized } =
      await createRecordingManager({ minPlayers: 2 });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");
    firePhase1(session, "Katabatic");
    expect(session.recorder.state).toBe("recording");

    // Empty roster the whole session → peak 0 < 2 → dropped at the end.
    connections[0].setStatus("disconnected", "You have been kicked");
    await vi.waitFor(() =>
      expect(coordinator.getStats()).toMatchObject({ dropped: 1, kept: 0 }),
    );
    expect(finalized).toEqual([]);

    manager.shutdown();
  });

  it("does not reconnect before the first mission is known when recording is disabled", async () => {
    const connections: FakeGameConnection[] = [];
    const manager = new WatchSessionManager({
      gameBasePath: "/nonexistent",
      getCachedServer: () => undefined,
      createConnection: (address) => {
        const conn = new FakeGameConnection(address);
        connections.push(conn);
        return conn as unknown as GameConnection;
      },
    });
    const ws = new FakeWebSocket();
    manager.watch(ws as unknown as WebSocket, "1.2.3.4:28000");
    const session = getSession(manager);
    connections[0].setStatus("connected");

    expect(session.recorder).toBeNull();
    fireEndGhosting(session);
    await flushImmediate();
    await flushImmediate();
    expect(connections).toHaveLength(1);
    expect(connections[0].disconnectCalls).toBe(0);

    manager.shutdown();
  });
});

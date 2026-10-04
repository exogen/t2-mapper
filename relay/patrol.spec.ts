import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import {
  Patroller,
  estimateEligiblePlayers,
  globToRegExp,
  loadPatrolInteger,
  loadPatrolList,
  loadPatrolPlayerMinimums,
  type PatrolOptions,
} from "./patrol";
import { WatchSessionManager } from "./watchSession";
import type { GameConnection } from "./gameConnection";
import type { ServerInfo } from "./types";
import { ServerPasswords } from "./serverPasswords";

class FakeGameConnection extends EventEmitter {
  address: string;
  status = "connecting";
  mapName: string | undefined;
  connectSequence = 1;
  disconnectCalls = 0;

  constructor(address: string) {
    super();
    this.address = address;
  }

  async connect(): Promise<void> {}
  disconnect(): void {
    this.disconnectCalls++;
    this.status = "disconnected";
  }
  sendCommand(): void {}
  setMapName(mapName: string): void {
    this.mapName = mapName;
  }
  setStatus(status: string): void {
    this.status = status;
    this.emit("status", status);
  }
}

function makeServer(
  name: string,
  address: string,
  playerCount: number,
  botCount = 0,
): ServerInfo {
  return {
    address,
    name,
    mod: "classic",
    gameType: "CTF",
    mapName: "Katabatic",
    playerCount,
    maxPlayers: 64,
    botCount,
    ping: 40,
    buildVersion: 22337,
    passwordRequired: false,
    tournament: false,
    isPatrolled: false,
  };
}

function setup(
  patterns: string[],
  opts: Partial<
    Pick<
      PatrolOptions,
      | "maxSessions"
      | "missionTypes"
      | "minPlayers"
      | "minPlayersByType"
      | "excludedMissionTypes"
      | "hasServerPassword"
    >
  > = {},
) {
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
  const servers: ServerInfo[] = [];
  const patroller = new Patroller({
    patterns,
    missionTypes: opts.missionTypes ?? [],
    minPlayers: opts.minPlayers ?? 2,
    minPlayersByType: opts.minPlayersByType,
    excludedMissionTypes: opts.excludedMissionTypes,
    maxSessions: opts.maxSessions ?? 3,
    intervalMs: 60_000,
    getServerList: () => Promise.resolve(servers),
    sessions: manager,
    hasServerPassword: opts.hasServerPassword,
  });
  return { connections, manager, servers, patroller };
}

describe("globToRegExp", () => {
  it("matches whole names exactly when there is no wildcard", () => {
    const re = globToRegExp("THE CUT");
    expect(re.test("THE CUT")).toBe(true);
    expect(re.test("the cut")).toBe(true); // case-insensitive
    expect(re.test("| THE CUT | Back to Ymir")).toBe(false); // no substring
  });

  it("supports * wildcards and escapes regex specials", () => {
    const re = globToRegExp("Ski Club - Slope *");
    expect(re.test("Ski Club - Slope 1")).toBe(true);
    expect(re.test("Ski Club - Slope 12 (beta)")).toBe(true);
    expect(re.test("Ski Club")).toBe(false);
    expect(globToRegExp("| THE CUT | *").test("| THE CUT | Back to Ymir")).toBe(
      true,
    );
  });
});

describe("patrol configuration", () => {
  it("loads integer settings with fallbacks and explicit zero", () => {
    expect(loadPatrolInteger(undefined, "DEMO_PATROL_MIN_PLAYERS", 2)).toBe(2);
    expect(loadPatrolInteger(" ", "DEMO_PATROL_MIN_PLAYERS", 2)).toBe(2);
    expect(loadPatrolInteger("0", "DEMO_PATROL_MIN_PLAYERS", 2)).toBe(0);
    expect(loadPatrolInteger(" 8 ", "DEMO_PATROL_MIN_PLAYERS", 2)).toBe(8);
  });

  it.each(["garbage", "2players", "1.5", "-1", "1e3", "9007199254740992"])(
    "rejects malformed integer settings: %s",
    (value) => {
      expect(() =>
        loadPatrolInteger(value, "DEMO_PATROL_MIN_PLAYERS", 2),
      ).toThrow("DEMO_PATROL_MIN_PLAYERS");
    },
  );

  it.each(["0", "2147483648"])(
    "rejects intervals that Node would clamp to 1ms: %s",
    (value) => {
      expect(() =>
        loadPatrolInteger(
          value,
          "DEMO_PATROL_INTERVAL_MS",
          60_000,
          1,
          2_147_483_647,
        ),
      ).toThrow("DEMO_PATROL_INTERVAL_MS");
    },
  );

  it("accepts JSON arrays and comma-separated lists, trimming empty entries", () => {
    expect(loadPatrolList(undefined, "DEMO_PATROL_SERVERS")).toEqual([]);
    expect(loadPatrolList("   ", "DEMO_PATROL_SERVERS")).toEqual([]);
    expect(
      loadPatrolList(
        '[" My Server ", "", "Slope, One"]',
        "DEMO_PATROL_SERVERS",
      ),
    ).toEqual(["My Server", "Slope, One"]);
    expect(
      loadPatrolList(
        " Arena, , LakRabbit ",
        "DEMO_PATROL_EXCLUDED_MISSION_TYPES",
      ),
    ).toEqual(["Arena", "LakRabbit"]);
  });

  it.each(['["Arena",', '["Arena", 1]', "{}"])(
    "rejects invalid lists with the correct variable name: %s",
    (raw) => {
      expect(() =>
        loadPatrolList(raw, "DEMO_PATROL_EXCLUDED_MISSION_TYPES"),
      ).toThrow("DEMO_PATROL_EXCLUDED_MISSION_TYPES");
    },
  );

  it("loads exact-type minimums including zero without changing display names", () => {
    expect(loadPatrolPlayerMinimums(undefined)).toEqual({});
    expect(loadPatrolPlayerMinimums(" ")).toEqual({});
    expect(
      loadPatrolPlayerMinimums('{" Capture the Flag ":8,"Arena":0}'),
    ).toEqual({ "Capture the Flag": 8, Arena: 0 });
  });

  it.each([
    "{",
    "[]",
    "null",
    '{"Arena":-1}',
    '{"Arena":1.5}',
    '{"Arena":"2"}',
    '{"Arena":null}',
    '{"Arena":9007199254740992}',
    '{" ":2}',
    '{"Arena":2," arena ":3}',
  ])("rejects invalid or ambiguous minimums: %s", (raw) => {
    expect(() => loadPatrolPlayerMinimums(raw)).toThrow(
      "DEMO_PATROL_MIN_PLAYERS_BY_TYPE",
    );
  });
});

describe("estimateEligiblePlayers", () => {
  const base = makeServer("Slope 1", "1.1.1.1:28000", 4);

  it("counts only header-team players when a team roster is present", () => {
    const server = {
      ...base,
      teams: [
        { name: "Storm", score: 1 },
        { name: "Inferno", score: 0 },
      ],
      players: [
        { name: "Alice", team: "Storm", score: 10 },
        { name: "Bob", team: "Inferno", score: 5 },
        { name: "Watcher", team: "Unassigned", score: 0 },
      ],
    };
    expect(estimateEligiblePlayers(server)).toBe(2);
  });

  it("counts all listed players in teamless modes", () => {
    const server = {
      ...base,
      teams: [],
      players: [
        { name: "Alice", team: "", score: 10 },
        { name: "Bob", team: "", score: 5 },
      ],
    };
    expect(estimateEligiblePlayers(server)).toBe(2);
  });

  it("falls back to counts minus bots without a roster", () => {
    expect(
      estimateEligiblePlayers({ ...base, playerCount: 6, botCount: 5 }),
    ).toBe(1);
    expect(
      estimateEligiblePlayers({ ...base, playerCount: 0, botCount: 1 }),
    ).toBe(0);
  });

  it("subtracts bots from roster counts (bot showcases report them)", () => {
    // Live-observed: bot-showcase servers list bots on teams with an
    // accurate botCount == playerCount — eligible must come out 0.
    expect(
      estimateEligiblePlayers({
        ...base,
        playerCount: 2,
        botCount: 2,
        teams: [
          { name: "Storm", score: 0 },
          { name: "Inferno", score: 0 },
        ],
        players: [
          { name: "Alice", team: "Storm", score: 0 },
          { name: "Bob", team: "Inferno", score: 0 },
        ],
      }),
    ).toBe(0);
    // Mixed: 2 humans + 1 bot on teams, one observer.
    expect(
      estimateEligiblePlayers({
        ...base,
        playerCount: 4,
        botCount: 1,
        teams: [
          { name: "Storm", score: 0 },
          { name: "Inferno", score: 0 },
        ],
        players: [
          { name: "Alice", team: "Storm", score: 0 },
          { name: "Bob", team: "Inferno", score: 0 },
          { name: "Bot", team: "Inferno", score: 0 },
          { name: "Watcher", team: "Unassigned", score: 0 },
        ],
      }),
    ).toBe(2);
  });
});

describe("Patroller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("patrols passworded servers only with configured credentials, keeping health summaries public", async () => {
    const passwords = new ServerPasswords(
      '{"Known Locked":"private-server-password","Empty Locked":"","Overridden Locked":"private-server-password","192.0.2.4:28000":""}',
    );
    const { connections, manager, servers, patroller } = setup(["*"], {
      hasServerPassword: (server) => passwords.hasPassword(server),
    });
    servers.push(
      {
        ...makeServer("Known Locked", "192.0.2.1:28000", 5),
        passwordRequired: true,
      },
      {
        ...makeServer("Unknown Locked", "192.0.2.2:28000", 5),
        passwordRequired: true,
      },
      {
        ...makeServer("Empty Locked", "192.0.2.3:28000", 5),
        passwordRequired: true,
      },
      {
        ...makeServer("Overridden Locked", "192.0.2.4:28000", 5),
        passwordRequired: true,
      },
    );
    await patroller.tick();
    expect(connections.map((conn) => conn.address)).toEqual([
      "192.0.2.1:28000",
    ]);
    expect(JSON.stringify(patroller.getStatus())).not.toContain(
      "private-server-password",
    );
    expect(JSON.stringify(manager.getStatusSummary())).not.toContain(
      "private-server-password",
    );
    expect(JSON.stringify(servers)).not.toContain("private-server-password");
    manager.shutdown();
  });

  it("pins matching servers that pass the player pre-filter", async () => {
    const { connections, manager, servers, patroller } = setup([
      "Ski Club - Slope *",
      "Legacy CTF+",
    ]);
    servers.push(
      makeServer("Ski Club - Slope 1", "1.1.1.1:28000", 3),
      makeServer("Legacy CTF+", "2.2.2.2:28000", 1), // too few players
      makeServer("Unrelated Server", "3.3.3.3:28000", 10), // no match
      makeServer("Botfarm - Slope", "4.4.4.4:28000", 6, 5), // bots don't count
      {
        // Roster says both humans are observers — not joined despite
        // the raw playerCount passing the naive filter.
        ...makeServer("Ghost Town - Slope", "5.5.5.5:28000", 2),
        teams: [
          { name: "Storm", score: 0 },
          { name: "Inferno", score: 0 },
        ],
        players: [
          { name: "Cam", team: "Unassigned", score: 0 },
          { name: "Watcher", team: "Unassigned", score: 0 },
        ],
      },
      {
        // Passworded: we could never authenticate — skip.
        ...makeServer("Locked - Slope", "6.6.6.6:28000", 5),
        passwordRequired: true,
      },
    );
    await patroller.tick();

    expect(connections.map((c) => c.address)).toEqual(["1.1.1.1:28000"]);
    expect(manager.getStatusSummary()).toMatchObject([
      { address: "1.1.1.1:28000", pinned: true, watchers: 0 },
    ]);
    // Pinned with no watchers: no idle teardown.
    vi.advanceTimersByTime(30 * 60_000);
    expect(connections[0].disconnectCalls).toBe(0);
  });

  it("filters by mission type and releases on a disallowed rotation", async () => {
    const { connections, servers, patroller } = setup(["*"], {
      missionTypes: ["Capture the Flag (Practice)", "lctf"],
    });
    servers.push(
      { ...makeServer("Lak House", "1.1.1.1:28000", 6), gameType: "LakRabbit" },
      {
        ...makeServer("Practice CTF", "2.2.2.2:28000", 6),
        gameType: "Capture the Flag (Practice)",
      },
      // Exact but case-insensitive.
      { ...makeServer("Ski Club", "3.3.3.3:28000", 6), gameType: "LCTF" },
    );
    await patroller.tick();
    expect(connections.map((c) => c.address)).toEqual([
      "2.2.2.2:28000",
      "3.3.3.3:28000",
    ]);

    // The LCTF server rotates into LakRabbit: released immediately.
    servers[2] = { ...servers[2], gameType: "LakRabbit" };
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(1);
  });

  it("respects the max session cap", async () => {
    const { connections, servers, patroller } = setup(["Slope *"], {
      maxSessions: 2,
    });
    servers.push(
      makeServer("Slope 1", "1.1.1.1:28000", 4),
      makeServer("Slope 2", "2.2.2.2:28000", 4),
      makeServer("Slope 3", "3.3.3.3:28000", 4),
    );
    await patroller.tick();
    expect(connections).toHaveLength(2);
    expect(patroller.pinnedCount).toBe(2);
  });

  it("uses per-type minimums and the default for unspecified types", async () => {
    const { connections, servers, patroller } = setup(["*"], {
      minPlayers: 3,
      minPlayersByType: { " Capture the Flag ": 8, Arena: 1, Construction: 0 },
      maxSessions: 4,
    });
    servers.push(
      {
        ...makeServer("CTF below", "192.0.2.1:28000", 7),
        gameType: "Capture the Flag",
      },
      {
        ...makeServer("CTF qualifies", "192.0.2.2:28000", 8),
        gameType: "CAPTURE THE FLAG",
      },
      { ...makeServer("Arena", "192.0.2.3:28000", 1), gameType: " arena " },
      {
        ...makeServer("Default below", "192.0.2.4:28000", 2),
        gameType: "LakRabbit",
      },
      {
        ...makeServer("Default qualifies", "192.0.2.5:28000", 3),
        gameType: "LakRabbit",
      },
      {
        ...makeServer("Empty", "192.0.2.6:28000", 0),
        gameType: "Construction",
      },
    );
    await patroller.tick();
    expect(connections.map((connection) => connection.address)).toEqual([
      "192.0.2.2:28000",
      "192.0.2.3:28000",
      "192.0.2.5:28000",
      "192.0.2.6:28000",
    ]);
    expect(
      patroller.getStatus().pinned.map(({ minPlayers }) => minPlayers),
    ).toEqual([8, 1, 3, 0]);
  });

  it("excludes types even when explicitly included and given a zero minimum", async () => {
    const { connections, manager, servers, patroller } = setup(["*"], {
      missionTypes: ["CTF", "Arena"],
      excludedMissionTypes: [" arena "],
      minPlayersByType: { Arena: 0 },
    });
    servers.push(
      { ...makeServer("Arena", "192.0.2.1:28000", 10), gameType: "ARENA" },
      makeServer("CTF", "192.0.2.2:28000", 10),
    );
    await patroller.tick();
    expect(connections.map((connection) => connection.address)).toEqual([
      "192.0.2.2:28000",
    ]);
    servers[1].gameType = "Arena";
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(0);
    expect(manager.getSession(servers[1].address)?.isPinned).toBe(false);
    expect(patroller.getStatus().cooldowns).toEqual([]);
    servers[1].gameType = "CTF";
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(1);
    manager.shutdown();
  });

  it("keeps normal and practice CTF separate when selecting player minimums", async () => {
    const { connections, manager, servers, patroller } = setup(["*"], {
      minPlayersByType: {
        "Capture the Flag": 8,
        "Capture the Flag (Practice)": 2,
      },
    });
    servers.push(
      {
        ...makeServer("Normal", "192.0.2.1:28000", 2),
        gameType: "Capture the Flag",
      },
      {
        ...makeServer("Practice", "192.0.2.2:28000", 2),
        gameType: "Capture the Flag (Practice)",
      },
    );
    await patroller.tick();
    expect(connections.map((connection) => connection.address)).toEqual([
      "192.0.2.2:28000",
    ]);
    expect(patroller.getStatus().pinned[0]).toMatchObject({
      gameType: "Capture the Flag (Practice)",
      minPlayers: 2,
    });
    manager.shutdown();
  });

  it("supports type exclusions without a type allowlist", async () => {
    const { connections, servers, patroller } = setup(["*"], {
      excludedMissionTypes: ["Arena"],
    });
    servers.push(
      { ...makeServer("Arena", "192.0.2.1:28000", 10), gameType: "Arena" },
      makeServer("CTF", "192.0.2.2:28000", 10),
    );
    await patroller.tick();
    expect(connections.map((connection) => connection.address)).toEqual([
      "192.0.2.2:28000",
    ]);
  });

  it("releases a pin when its name no longer matches the included server patterns", async () => {
    const { connections, manager, servers, patroller } = setup(["Open *"]);
    servers.push(makeServer("Open Server", "192.0.2.3:28000", 10));
    await patroller.tick();
    expect(connections.map((connection) => connection.address)).toEqual([
      "192.0.2.3:28000",
    ]);
    servers[0].name = "Closed Server";
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(0);
    expect(manager.getSession(servers[0].address)?.isPinned).toBe(false);
    manager.shutdown();
  });

  it("updates the minimum on rotation and preserves it when the server list omits the pin", async () => {
    const { connections, manager, servers, patroller } = setup(["*"], {
      minPlayers: 2,
      minPlayersByType: { Arena: 1, CTF: 4 },
    });
    const server = {
      ...makeServer("Server", "192.0.2.1:28000", 2),
      gameType: "Arena",
    };
    servers.push(server);
    await patroller.tick();
    connections[0].setStatus("connected");
    const session = manager.getSession(server.address)!;
    vi.spyOn(session, "activePlayerCount", "get").mockReturnValue(2);
    await patroller.tick();
    expect(patroller.getStatus().pinned[0]).toMatchObject({
      minPlayers: 1,
      strikes: 0,
    });
    server.gameType = "CTF";
    await patroller.tick();
    expect(patroller.getStatus().pinned[0]).toMatchObject({
      gameType: "CTF",
      minPlayers: 4,
      strikes: 1,
    });
    servers.length = 0;
    await patroller.tick();
    expect(patroller.getStatus().pinned[0]).toMatchObject({
      minPlayers: 4,
      strikes: 2,
    });
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(0);
    expect(patroller.getStatus().cooldowns).toHaveLength(1);
    manager.shutdown();
  });

  it("clears quiet strikes when a rotation lowers the required minimum", async () => {
    const { connections, manager, servers, patroller } = setup(["*"], {
      minPlayersByType: { CTF: 4, Arena: 1 },
    });
    servers.push(makeServer("Server", "192.0.2.1:28000", 4));
    await patroller.tick();
    connections[0].setStatus("connected");
    vi.spyOn(
      manager.getSession(servers[0].address)!,
      "activePlayerCount",
      "get",
    ).mockReturnValue(1);
    await patroller.tick();
    await patroller.tick();
    servers[0].gameType = "Arena";
    await patroller.tick();
    expect(patroller.getStatus().pinned[0]).toMatchObject({
      minPlayers: 1,
      strikes: 0,
    });
    manager.shutdown();
  });

  it("releases a pinned server after consecutive quiet polls", async () => {
    const { connections, manager, servers, patroller } = setup(["Slope *"]);
    servers.push(makeServer("Slope 1", "1.1.1.1:28000", 4));
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(1);

    // While connecting: grace, no strikes accumulate.
    await patroller.tick();
    await patroller.tick();
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(1);

    // Connected with an empty roster (0 non-observers) → 3 strikes.
    connections[0].setStatus("connected");
    // The server also empties on the list so it isn't instantly re-pinned.
    servers[0] = makeServer("Slope 1", "1.1.1.1:28000", 0);
    await patroller.tick();
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(1);
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(0);
    expect(manager.getStatusSummary()).toMatchObject([{ pinned: false }]);

    // Unpinned with no watchers: idle grace tears the session down.
    vi.advanceTimersByTime(5 * 60_000);
    expect(connections[0].disconnectCalls).toBe(1);
    expect(manager.getStatusSummary()).toEqual([]);
  });

  it("releases a pin stuck in pre-live states past the connect grace", async () => {
    const { servers, patroller } = setup(["Slope *"]);
    servers.push(makeServer("Slope 1", "1.1.1.1:28000", 4));
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(1);

    // Connection never reaches "live" (stalled handshake): 5 grace
    // polls, then 3 strikes.
    for (let i = 0; i < 7; i++) {
      await patroller.tick();
      expect(patroller.pinnedCount).toBe(1);
    }
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(0);
  });

  it("applies a re-pin cooldown after a quiet release", async () => {
    const { connections, servers, patroller } = setup(["Slope *"]);
    servers.push(makeServer("Slope 1", "1.1.1.1:28000", 4));
    await patroller.tick();
    connections[0].setStatus("connected");
    servers[0] = makeServer("Slope 1", "1.1.1.1:28000", 0);
    for (let i = 0; i < 3; i++) await patroller.tick();
    expect(patroller.pinnedCount).toBe(0);

    // The server fills back up immediately — still cooling down.
    servers[0] = makeServer("Slope 1", "1.1.1.1:28000", 4);
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(0);

    vi.advanceTimersByTime(2 * 60_000 + 1);
    await patroller.tick();
    expect(patroller.pinnedCount).toBe(1);
  });

  it("reports pin and cooldown detail via getStatus", async () => {
    const { connections, servers, patroller } = setup(["Slope *"]);
    expect(patroller.getStatus()).toMatchObject({
      patterns: ["Slope *"],
      minPlayers: 2,
      maxSessions: 3,
      lastTickAgoSec: null,
      pinned: [],
      cooldowns: [],
    });

    servers.push(makeServer("Slope 1", "1.1.1.1:28000", 4));
    await patroller.tick();
    // Pre-live poll without a roster: the session's player count is an
    // empty stub, so the pin-time estimate is kept.
    await patroller.tick();
    expect(patroller.getStatus().pinned[0]).toMatchObject({
      status: "connecting",
      eligiblePlayers: 4,
    });
    connections[0].setStatus("connected");
    vi.advanceTimersByTime(90_000);
    // Renamed + roster on the next poll: name and eligible refresh.
    servers[0] = {
      ...makeServer("Slope 1 [night]", "1.1.1.1:28000", 4),
      teams: [
        { name: "Storm", score: 0 },
        { name: "Inferno", score: 0 },
      ],
      players: [
        { name: "Alice", team: "Storm", score: 0 },
        { name: "Bob", team: "Inferno", score: 0 },
        { name: "Cara", team: "Inferno", score: 0 },
        { name: "Watcher", team: "Unassigned", score: 0 },
      ],
    };
    await patroller.tick();
    expect(patroller.getStatus()).toMatchObject({
      lastTickAgoSec: 0,
      pinned: [
        {
          address: "1.1.1.1:28000",
          serverName: "Slope 1 [night]",
          status: "live",
          eligiblePlayers: 3,
          watchers: 0,
          strikes: 0,
          pinnedForSec: 90,
        },
      ],
    });

    // Quiet release: pin becomes a cooldown entry.
    servers[0] = makeServer("Slope 1 [night]", "1.1.1.1:28000", 0);
    for (let i = 0; i < 3; i++) await patroller.tick();
    const released = patroller.getStatus();
    expect(released.pinned).toEqual([]);
    expect(released.cooldowns).toEqual([
      { address: "1.1.1.1:28000", remainingSec: 120 },
    ]);

    // An expired cooldown no longer blocks a re-pin — not reported,
    // even before the next tick prunes it.
    vi.advanceTimersByTime(2 * 60_000 + 1);
    expect(patroller.getStatus().cooldowns).toEqual([]);
  });

  it("does nothing after stop(), even with a list query in flight", async () => {
    const { connections, servers, patroller } = setup(["Slope *"]);
    servers.push(makeServer("Slope 1", "1.1.1.1:28000", 4));
    const inFlight = patroller.tick();
    patroller.stop();
    await inFlight;
    expect(connections).toHaveLength(0);
    await patroller.tick();
    expect(connections).toHaveLength(0);
  });
});

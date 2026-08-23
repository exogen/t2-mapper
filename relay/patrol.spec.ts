import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { Patroller, estimateEligiblePlayers, globToRegExp } from "./patrol";
import { WatchSessionManager } from "./watchSession";
import type { GameConnection } from "./gameConnection";
import type { ServerInfo } from "./types";

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
  opts: { maxSessions?: number; missionTypes?: string[] } = {},
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
    minPlayers: 2,
    maxSessions: opts.maxSessions ?? 3,
    intervalMs: 60_000,
    getServerList: () => Promise.resolve(servers),
    sessions: manager,
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

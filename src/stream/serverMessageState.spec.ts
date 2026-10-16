import { legacyFlagFields } from "../../relay/flagState";
import { PlayerResolver } from "../../relay/playerReference";
import { describe, expect, it, vi } from "vitest";
import type { PacketData, ParsedData } from "t2-demo-parser";
import type { ConnectionState } from "../../relay/connectionState";
import { WatchStateAccumulator } from "../../relay/watchState";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import type { TeamScore } from "./types";

class MessageStream extends LiveStreamAdapter {
  constructor() {
    super({} as RelayClient, { mode: "watch" });
  }

  message(args: string[]): void {
    this.handleServerMessage(args);
  }

  event(parsedData: ParsedData): void {
    this.processEvent({ classId: 0, parsedData }, undefined);
  }

  connection(): ConnectionState {
    return this.conn;
  }

  command(funcName: string, args: string[]): void {
    this.processEvent(
      {
        classId: 0,
        parsedData: { type: "RemoteCommandEvent", funcName, args },
      },
      undefined,
    );
  }

  history() {
    return this.buildTimeFilteredEvents(this.getTimeSec());
  }

  checkpoint() {
    return this.captureSimulationState();
  }

  restore(checkpoint: ReturnType<MessageStream["checkpoint"]>): void {
    this.restoreSimulationState(checkpoint);
  }

  setString(id: number, value: string): void {
    this.conn.netStrings.set(id, value);
  }

  hud() {
    const { playerRoster, teamScores } = this.buildCachedHudState();
    return { playerRoster, teamScores, matchStarted: this.matchStarted };
  }

  seedPlayer(targetId: number, name: string, rawName: string): void {
    this.entities.set("player", {
      id: "player",
      ghostIndex: 1,
      className: "Player",
      spawnTick: 0,
      type: "Player",
      targetId,
      playerName: name,
      playerRawName: rawName,
      rotation: [0, 0, 0, 1],
    });
  }

  flag(teamId: number) {
    return this.conn.flags.get(teamId);
  }
  players() {
    const hud = this.buildCachedHudState();
    return new PlayerResolver(
      this.conn.playerIdentity.scope,
      hud.playerRoster,
      hud.playerTargets,
    );
  }

  target(targetId: number) {
    return {
      name: this.entities.get("player")?.playerName,
      rawName: this.conn.targets.rawNames.get(targetId),
      entity: this.buildEntityList().find(
        (entity) => entity.targetId === targetId,
      ),
    };
  }
}

function packet(messages: string[][]): PacketData {
  return {
    gameState: {},
    ghosts: [],
    events: messages.map((args) => ({
      parsedData: {
        type: "RemoteCommandEvent",
        funcName: "ServerMessage",
        args,
      },
    })),
  } as unknown as PacketData;
}

function join(name: string, clientId = "7", targetId = "32", guid = "12345") {
  return [
    "MsgClientJoin",
    "",
    name,
    clientId,
    targetId,
    "0",
    "0",
    "0",
    "0",
    guid,
  ];
}

function joinTeam(name: string, clientId = "7", teamId = "1") {
  return ["MsgClientJoinTeam", "", name, "Storm", clientId, teamId];
}

function scoreHud(...data: string[]) {
  return ["SetLineHud", "", "tag", "0", "fmt", ...data];
}

function debrief(...data: string[]) {
  return ["MsgDebriefAddLine", "", "fmt", ...data];
}

// The browser additionally derives player counts and flag skins for rendering.
function commonTeam(team: { teamId: number; name: string; score: number }) {
  const { teamId, name, score } = team;
  return { teamId, name, score };
}
function flagFields(team: TeamScore) {
  return legacyFlagFields(team.flag, new PlayerResolver("test", []));
}

/**
 * The connection state both sides keep, less what their own clocks make
 * differ: clock anchors and drop times compare by duration and team.
 */
function sharedState(conn: ConnectionState) {
  const { clock, flagDroppedAtSec, matchEndedAtSec, loadInfo, ...state } =
    conn.save();
  return {
    ...state,
    clockDurationMs: clock?.durationMs ?? null,
    flagDropTeams: Object.keys(flagDroppedAtSec).sort(),
    ended: matchEndedAtSec != null,
    loadInfo: loadInfo.complete,
  };
}

function fixture() {
  const browser = new MessageStream();
  const relay = new WatchStateAccumulator();
  const relayState = (relay as unknown as { state: ConnectionState }).state;
  // A watcher hydrated from the relay shares its identity scope.
  browser.connection().playerIdentity.scope = relayState.playerIdentity.scope;
  const notifications: ReturnType<
    WatchStateAccumulator["getHudState"]
  >["playerRoster"][] = [];
  const onRosterChange = vi.fn(() => {
    notifications.push(relay.getHudState().playerRoster);
  });

  const expectParity = () => {
    const actual = browser.hud();
    const expected = relay.getHudState();
    expect(actual.playerRoster).toEqual(expected.playerRoster);
    expect(actual.teamScores.map(commonTeam)).toEqual(
      expected.teamScores.map(commonTeam),
    );
    expect(actual.matchStarted).toBe(expected.matchStarted);
    // Everything else both keep, beyond what the HUD shows.
    expect(sharedState(browser.connection())).toEqual(sharedState(relayState));
  };
  const send = (...messages: string[][]) => {
    // Read first so later assertions also exercise browser cache invalidation.
    browser.hud();
    for (const args of messages) browser.message(args);
    relay.applyPacket(packet(messages), onRosterChange);
    expectParity();
  };
  const setString = (id: number, value: string) => {
    browser.setString(id, value);
    relay.netStrings.set(id, value);
  };
  const sendEvents = (...events: ParsedData[]) => {
    for (const parsedData of events) browser.event(parsedData);
    relay.applyPacket({
      gameState: {},
      ghosts: [],
      events: events.map((parsedData) => ({ parsedData })),
    } as unknown as PacketData);
    expectParity();
  };
  return {
    browser,
    relay,
    send,
    sendEvents,
    setString,
    onRosterChange,
    notifications,
  };
}

describe("browser and relay server-message state", () => {
  it("keeps live server names current across later server messages", () => {
    const stream = new MessageStream();
    stream.message([
      "MsgMissionDropInfo",
      "",
      "Surreal",
      "Capture the Flag",
      "First Server",
    ]);
    expect(stream.serverDisplayName).toBe("First Server");

    stream.message([
      "MsgLoadInfo",
      "",
      "Surreal",
      "Classic  1.3",
      "Second Server",
    ]);
    expect(stream.serverDisplayName).toBe("Second Server");

    stream.message([
      "MsgMissionDropInfo",
      "",
      "Blue Moon",
      "Capture the Flag",
      "Third Server",
    ]);
    expect(stream.serverDisplayName).toBe("Third Server");

    stream.message(["MsgMissionDropInfo", "", "Blue Moon", "CTF", ""]);
    stream.message(["MsgLoadInfo", "", "BlueMoon_x2", "Classic  1.3", ""]);
    expect(stream.serverDisplayName).toBe("Third Server");
  });

  it("recovers Classic's server name without replacing mission metadata", () => {
    const stream = new MessageStream();
    const onMissionInfoChange = vi.fn();
    stream.onMissionInfoChange = onMissionInfoChange;
    stream.message([
      "MsgLoadInfo",
      "",
      "Surreal",
      "Surreal",
      "Capture the Flag",
    ]);
    stream.setString(10, "Classic  1.3");
    stream.setString(11, "\x0bRapture Competition East");
    stream.message(["MsgLoadInfo", "", "Surreal", "\x0110", "\x0111"]);

    expect(stream.missionDisplayName).toBe("Surreal");
    expect(stream.missionTypeDisplayName).toBe("Capture the Flag");
    expect(stream.serverDisplayName).toBe("Rapture Competition East");
    expect(onMissionInfoChange).toHaveBeenCalledTimes(2);

    stream.message([
      "MsgLoadInfo",
      "",
      "Surreal",
      "Surreal",
      "Capture the Flag",
    ]);
    expect(stream.missionDisplayName).toBe("Surreal");
    expect(stream.missionTypeDisplayName).toBe("Capture the Flag");
    expect(stream.serverDisplayName).toBe("Rapture Competition East");
  });

  it.each(["Classic", "Classic Ruins", "Classic  1.3 Ruins", "Classic 1.3"])(
    "treats %s as ordinary mission metadata",
    (missionName) => {
      const stream = new MessageStream();
      stream.message([
        "MsgLoadInfo",
        "",
        "classic_map",
        missionName,
        "Capture the Flag",
      ]);
      expect(stream.missionDisplayName).toBe(missionName);
      expect(stream.missionTypeDisplayName).toBe("Capture the Flag");
      expect(stream.serverDisplayName).toBeNull();
    },
  );

  it.each([
    ["MsgMissionDropInfo", "", "Surreal", "Capture the Flag", "\x0199"],
    ["MsgLoadInfo", "", "Surreal", "Classic  1.3", "\x0199"],
  ])(
    "keeps the known server when its new reference is unresolved (%j)",
    (...args) => {
      const stream = new MessageStream();
      stream.message([
        "MsgMissionDropInfo",
        "",
        "Surreal",
        "Capture the Flag",
        "Known Server",
      ]);
      stream.message(args);
      expect(stream.serverDisplayName).toBe("Known Server");
    },
  );

  it("publishes each loading-screen burst once and restores it from checkpoints", () => {
    const stream = new MessageStream();
    const onMissionInfoChange = vi.fn();
    stream.message([
      "MsgLoadInfo",
      "",
      "Surreal",
      "Surreal",
      "Capture the Flag",
    ]);
    stream.onMissionInfoChange = onMissionInfoChange;
    stream.message(["MsgLoadQuoteLine", "", "Q1"]);
    expect(onMissionInfoChange).not.toHaveBeenCalled();
    stream.message(["MsgLoadInfoDone", ""]);
    const first = { quoteLines: ["Q1"], objectiveLines: [], rulesLines: [] };
    expect(stream.serverLoadInfo).toEqual(first);
    expect(onMissionInfoChange).toHaveBeenCalledTimes(1);
    const checkpoint = stream.checkpoint();

    stream.message([
      "MsgLoadInfo",
      "",
      "Surreal",
      "Surreal",
      "Capture the Flag",
    ]);
    stream.message(["MsgLoadRulesLine", "", "R1"]);
    stream.message(["MsgLoadInfoDone", ""]);
    expect(stream.serverLoadInfo).toEqual({
      quoteLines: [],
      objectiveLines: [],
      rulesLines: ["R1"],
    });
    stream.restore(checkpoint);
    expect(stream.serverLoadInfo).toEqual(first);
  });

  it.each([
    "ServerMessage",
    "TeamDestroyMessage",
    "TeamRepairMessage",
    "teamrepairmessage",
  ])(
    "renders %s as server chat and preserves it through checkpoint restoration",
    (command) => {
      const stream = new MessageStream();
      const before = stream.checkpoint();
      stream.setString(10, "%1 repaired the %2 Generator!~wfx/repair");
      const args = [
        "msgGenRepaired",
        "\x0110",
        "\x10\bAlice\x0b.TAG\x11",
        "Main",
      ];
      stream.command(command, args);
      const history = stream.history();
      expect(history.chatMessages).toHaveLength(1);
      expect(history.chatMessages[0]).toMatchObject({
        text: "Alice.TAG repaired the Main Generator!",
        kind: "server",
        soundPath: "fx/repair",
      });
      expect(history.serverEvents).toHaveLength(1);
      expect(history.serverEvents[0].args).toEqual([
        args[0],
        "%1 repaired the %2 Generator!~wfx/repair",
        args[2],
        args[3],
      ]);
      const after = stream.checkpoint();
      stream.restore(before);
      expect(stream.history().chatMessages).toEqual([]);
      stream.restore(after);
      expect(stream.history()).toEqual(history);
    },
  );

  it.each(["TeamDestroyMessage", "TeamRepairMessage"])(
    "dispatches empty %s messages without adding blank chat lines",
    (command) => {
      const stream = new MessageStream();
      const relay = new WatchStateAccumulator();
      const args = join("Alice");
      const parsed = packet([args]);
      parsed.events[0].parsedData!.funcName = command;
      stream.command(command, args);
      relay.applyPacket(parsed);
      expect(stream.history().chatMessages).toEqual([]);
      expect(stream.history().serverEvents).toHaveLength(1);
      expect(stream.hud().playerRoster).toEqual(
        relay.getHudState().playerRoster,
      );
    },
  );

  it("does not display arbitrary remote commands as server chat", () => {
    const stream = new MessageStream();
    stream.command("SomethingElse", [
      "msgDestroyed",
      "%1 destroyed a %2 Generator!",
      "Alice",
      "Main",
    ]);
    expect(stream.history().chatMessages).toEqual([]);
    expect(stream.history().serverEvents).toEqual([]);
  });

  it("applies messages to restored collections without mutating the saved checkpoint", () => {
    const browser = new MessageStream();
    browser.message(join("Alice"));
    browser.message(joinTeam("Alice"));
    browser.message(["MsgCTFAddTeam", "", "1", "Storm", "<At Base>", "0"]);
    const checkpoint = browser.checkpoint();
    const savedHud = structuredClone(browser.hud());

    browser.message(["MsgClientNameChanged", "", "Alice", "Later name", "7"]);
    browser.message(["MsgPlayerScore", "", "7", "17", "31", "1"]);
    browser.message(["MsgTeamScore", "", "1", "2"]);
    browser.restore(checkpoint);
    const restoredHud = browser.hud();
    expect(restoredHud).toEqual(savedHud);

    browser.message(["MsgPlayerScore", "", "7", "99", "42", "3"]);
    browser.message(["MsgTeamScore", "", "1", "4"]);
    browser.message(["MsgCTFFlagTaken", "", "Alice", "Storm", "1"]);
    const updatedHud = browser.hud();
    expect(updatedHud.playerRoster[0]).toMatchObject({
      name: "Alice",
      score: 99,
      ping: 42,
      packetLoss: 3,
    });
    expect(updatedHud.teamScores[0]).toMatchObject({
      score: 4,
      flag: { status: "held", carrier: { rawName: "Alice" } },
      playerCount: 1,
    });
    expect(updatedHud.matchStarted).toBe(true);
    expect(restoredHud).toEqual(savedHud);

    browser.restore(checkpoint);
    expect(browser.hud()).toEqual(savedHud);
  });

  it("recreates roster entries on joins, including a team message before the join", () => {
    const { browser, relay, send } = fixture();
    const rawName = "\x10\x0bTAG|\x08Alice\x11";
    send(joinTeam(rawName, "7", "2"));
    expect(browser.hud().playerRoster).toEqual([
      {
        clientId: 7,
        name: "",
        rawName: "",
        teamId: 2,
        score: 0,
        ping: 0,
        packetLoss: 0,
      },
    ]);

    send(join(rawName, "7", "32", "009007199254740993"));
    expect(relay.getPlayerRoster().get(7)).toEqual({
      clientGeneration: 1,
      name: "TAG|Alice",
      rawName,
      guid: "9007199254740993",
      isSmurf: false,
      targetId: 32,
      teamId: 0,
      score: 0,
      ping: 0,
      packetLoss: 0,
    });
    send(
      joinTeam(rawName),
      ["MsgPlayerScore", "", "7", "17", "31", "1"],
      scoreHud("TAG|Alice", "42", "5"),
    );

    send(join("Anonymous", "7", "45", "0"));
    expect(browser.hud().playerRoster[0]).toEqual({
      clientId: 7,
      clientGeneration: 2,
      name: "Anonymous",
      rawName: "Anonymous",
      guid: undefined,
      isSmurf: false,
      targetId: 45,
      teamId: 0,
      score: 0,
      ping: 0,
      packetLoss: 0,
    });
    send(["MsgClientDrop", "", "Anonymous", "7"]);
    expect(relay.getPlayerRoster().size).toBe(0);
    send(join(rawName, "9", "51", "9007199254740993"));
    expect(browser.hud().playerRoster[0]).toMatchObject({
      clientId: 9,
      guid: "9007199254740993",
    });
  });

  it("resolves netstring arguments while retaining the raw colored name", () => {
    const { browser, send, setString } = fixture();
    const rawName = "\x10\x0bTAG|\x08Alice\x11";
    setString(1, "MsgClientJoin");
    setString(2, rawName);
    setString(3, "7");
    setString(4, "32");
    setString(5, "0012345");
    send(["\x011", "", "\x012", "\x013", "\x014", "0", "0", "0", "0", "\x015"]);
    expect(browser.hud().playerRoster[0]).toMatchObject({
      clientId: 7,
      name: "TAG|Alice",
      rawName,
      guid: "12345",
      targetId: 32,
    });
  });

  it("keeps authoritative scores through zero fallbacks and malformed updates", () => {
    const { browser, relay, send, onRosterChange } = fixture();
    send(join("Alice"), join("Bob", "8", "33"));
    send(scoreHud("Alice", "470", "35"));
    expect(browser.hud().playerRoster[0].score).toBe(0);
    send(joinTeam("Alice"), joinTeam("Bob", "8", "2"));
    const metadataNotifications = onRosterChange.mock.calls.length;

    send(scoreHud("Alice", "470", "35"));
    send(["MsgPlayerScore", "", "7", "0", "42", "3"]);
    expect(browser.hud().playerRoster[0]).toMatchObject({
      score: 470,
      kills: 35,
      ping: 42,
      packetLoss: 3,
    });
    send(["MsgPlayerScore", "", "7", "n/a", "n/a", "n/a"]);
    expect(relay.getPlayerRoster().get(7)).toMatchObject({
      score: 470,
      ping: 42,
      packetLoss: 3,
    });
    send(
      ["MsgPlayerScore", "", "999", "12", "2", "0"],
      ["MsgPlayerScore", "", "bad", "12", "2", "0"],
    );
    expect(browser.hud().playerRoster).toHaveLength(2);

    send(scoreHud("Alice", "120", "Bob", "90"));
    expect(browser.hud().playerRoster.map((player) => player.score)).toEqual([
      120, 90,
    ]);
    send(debrief("Alice", "210", "8"), debrief("Bob", "Inferno", "180", "6"));
    expect(
      browser.hud().playerRoster.map((player) => [player.score, player.kills]),
    ).toEqual([
      [210, 8],
      [180, 6],
    ]);
    send(scoreHud("Alice", "n/a", "bad"), debrief("Alice", "n/a", "bad"));
    expect(relay.getPlayerRoster().get(7)).toMatchObject({
      score: 210,
      kills: 8,
    });
    expect(onRosterChange).toHaveBeenCalledTimes(metadataNotifications);
  });

  it("updates CTF scores and flag state without replacing valid scores with malformed values", () => {
    const { browser, send } = fixture();
    send(["MsgCTFAddTeam", "", "1", "Storm", "<At Base>", "0"]);
    expect(browser.matchStarted).toBe(false);
    send(["MsgCTFAddTeam", "", "1", "Storm", "Alice", "2"]);
    expect(browser.hud().teamScores[0]).toMatchObject({
      teamId: 1,
      score: 2,
      flag: { status: "held", carrier: { rawName: "Alice" } },
    });
    expect(browser.matchStarted).toBe(true);
    send(["MsgCTFAddTeam", "", "1", "Storm renamed", "<In the Field>", "n/a"]);
    expect(browser.hud().teamScores[0]).toMatchObject({
      name: "Storm renamed",
      score: 2,
      flag: { status: "field" },
    });
    send(["MsgTeamScoreIs", "", "1", "5"], ["MsgTeamScore", "", "1", "n/a"]);
    expect(browser.hud().teamScores[0].score).toBe(5);

    for (const [msgType, flagStatus] of [
      ["MsgCTFFlagTaken", "held"],
      ["MsgCTFFlagDropped", "field"],
      ["MsgCTFFlagReturned", "home"],
      ["MsgCTFFlagCapped", "home"],
    ]) {
      send([msgType, "", "\x0bAlice", "Storm", "1"]);
      expect(flagFields(browser.hud().teamScores[0])).toMatchObject({
        flagStatus,
        flagCarrier: flagStatus === "held" ? "Alice" : undefined,
      });
    }
    const before = browser.hud().teamScores;
    send(
      ["MsgCTFAddTeam", "", "bad", "Invalid", "<At Base>", "n/a"],
      ["MsgCTFFlagTaken", "", "Alice", "Storm"],
    );
    expect(browser.hud().teamScores).toEqual(before);
  });

  it("retains carrier name colors across relay state, browser snapshots and checkpoint restores", () => {
    const { browser, relay, send, setString } = fixture();
    const raw = "\x10\x0b=TAG=\x0cCarrier\x11";
    setString(12, raw);
    send(["MsgCTFAddTeam", "", "1", "Storm", "\x0112", "0"]);
    const expectCarrier = () =>
      expect(flagFields(browser.hud().teamScores[0])).toMatchObject({
        flagStatus: "held",
        flagCarrier: "=TAG=Carrier",
        flagCarrierRawName: raw,
      });
    expectCarrier();
    expect(
      JSON.parse(JSON.stringify(relay.getHudState())).teamScores[0]
        .flagCarrierRawName,
    ).toBe(raw);
    const checkpoint = browser.checkpoint();
    send(["MsgCTFFlagDropped", "", "\x0112", "Storm", "1"]);
    expect(browser.hud().teamScores[0].flag?.carrier).toBeUndefined();
    browser.restore(checkpoint);
    expectCarrier();
    send(["MsgCTFFlagTaken", "", "\x0112", "Storm", "1"]);
    expectCarrier();
  });

  it.each(["MsgCnHAddTeam", "MsgHuntAddTeam", "MsgSiegeAddTeam"])(
    "%s does not use a team-add score as evidence of a running match",
    (msgType) => {
      const { browser, send } = fixture();
      send([msgType, "", "1", "Storm", "12"]);
      expect(browser.hud().teamScores[0]).toMatchObject({
        score: msgType === "MsgSiegeAddTeam" ? 0 : 12,
      });
      expect(browser.matchStarted).toBe(false);
      send([msgType, "", "1", "Storm renamed", "n/a"]);
      expect(browser.hud().teamScores[0].name).toBe("Storm renamed");
      expect(browser.hud().teamScores[0].score).toBe(
        msgType === "MsgSiegeAddTeam" ? 0 : 12,
      );
    },
  );

  it("propagates valid renames to target names and rejects empty display names", () => {
    const { browser, relay, send, onRosterChange } = fixture();
    browser.seedPlayer(32, "Alice", "Alice");
    send(join("Alice"), joinTeam("Alice"), [
      "MsgPlayerScore",
      "",
      "7",
      "17",
      "31",
      "1",
    ]);
    const rawName = "\x10\x0bNEW|\x08Alice\x11";
    send(["MsgClientNameChanged", "", "Alice", rawName, "7"]);
    expect(browser.hud().playerRoster[0]).toMatchObject({
      name: "NEW|Alice",
      rawName,
      teamId: 1,
      score: 17,
      guid: "12345",
    });
    expect(browser.target(32)).toMatchObject({
      name: "NEW|Alice",
      rawName,
      entity: { playerName: "NEW|Alice", playerRawName: rawName },
    });
    expect(
      relay.getTargetEntries().find((entry) => entry.targetId === 32)?.name,
    ).toBe(rawName);
    const notificationCount = onRosterChange.mock.calls.length;
    send(
      ["MsgClientNameChanged", "", rawName, "", "7"],
      ["MsgClientNameChanged", "", rawName, "\x10\x0b\x08\x11", "7"],
      ["MsgClientNameChanged", "", rawName, "Unknown", "999"],
    );
    expect(browser.hud().playerRoster[0].rawName).toBe(rawName);
    expect(browser.target(32).rawName).toBe(rawName);
    expect(
      relay.getTargetEntries().find((entry) => entry.targetId === 32)?.name,
    ).toBe(rawName);
    expect(onRosterChange).toHaveBeenCalledTimes(notificationCount);
  });

  it("keeps a rename when the target's pending name tag resolves later", () => {
    const { browser, relay, send, sendEvents } = fixture();
    sendEvents({ type: "TargetInfoEvent", targetId: 32, nameTag: 40 });
    const rawName = "\x10\x0bNEW|\x08Alice\x11";
    send(join("Alice"), ["MsgClientNameChanged", "", "Alice", rawName, "7"]);
    sendEvents({ type: "NetStringEvent", id: 40, value: "Alice" });
    expect(
      relay.getTargetEntries().find((entry) => entry.targetId === 32)?.name,
    ).toBe(rawName);
    expect(browser.target(32).rawName).toBe(rawName);
  });

  it("keeps mission info, the clock, colors, targets and load info in step", () => {
    const { browser, relay, send, sendEvents } = fixture();
    send([
      "MsgMissionDropInfo",
      "",
      "Surreal",
      "Capture the Flag",
      " Known Server ",
    ]);
    expect(browser.serverDisplayName).toBe("Known Server");
    send(["MsgLoadInfo", "", "Surreal", "Classic  1.3", "Rapture East"]);
    send(["MsgMissionDropInfo", "", "Surreal", "Capture the Flag", "\x0199"]);
    expect(browser.serverDisplayName).toBe("Rapture East");
    expect(relay.serverName).toBe("Rapture East");
    expect(browser.missionTypeDisplayName).toBe("Capture the Flag");

    send(["MsgSystemClock", "", "20", "1200000"]);
    expect(relay.getHudState().clock?.durationMs).toBe(1200000);
    expect(browser.matchStarted).toBe(true);

    send(["MsgLoadInfo", "", "Surreal", "Surreal", "Capture the Flag"]);
    send(["MsgLoadQuoteLine", "", "Q1"], ["MsgLoadRulesLine", "", "R1"]);
    expect(browser.serverLoadInfo).toBeNull();
    send(["MsgLoadInfoDone", ""]);
    expect(browser.serverLoadInfo).toEqual({
      quoteLines: ["Q1"],
      objectiveLines: [],
      rulesLines: ["R1"],
    });

    sendEvents(
      {
        type: "SensorGroupColorEvent",
        sensorGroup: 1,
        colors: [{ index: 2, r: 200, g: 10, b: 10 }],
      },
      { type: "TargetInfoEvent", targetId: 40, renderFlags: 2 },
      { type: "TargetFreeEvent", targetId: 40 },
    );
    expect(relay.getSensorGroupColors()).toEqual([
      { group: 1, targetGroup: 2, r: 200, g: 10, b: 10, a: 255 },
    ]);
    expect(relay.getHudState().targetGenerations).toEqual([[40, 1]]);

    sendEvents({
      type: "RemoteCommandEvent",
      funcName: "MissionEnd",
      args: [],
    });
    expect(browser.matchEnded).toBe(true);
    expect(relay.getHudState().matchEnded).toBe(true);
    send(["MsgClientReady", "", "CTFGame"]);
    expect(browser.matchEnded).toBe(false);
    expect(browser.gameClassName).toBe("CTFGame");
    expect(relay.getHudState().gameClassName).toBe("CTFGame");
  });

  it("notifies relay roster metadata changes in wire order without score-only notifications", () => {
    const { send, notifications, onRosterChange } = fixture();
    send(
      join("Alice"),
      joinTeam("Alice"),
      scoreHud("Alice", "42", "5"),
      ["MsgClientNameChanged", "", "Alice", "Renamed", "7"],
      ["MsgClientDrop", "", "Renamed", "7"],
      ["MsgClientDrop", "", "Renamed", "7"],
      joinTeam("Pending", "9", "2"),
    );
    expect(onRosterChange).toHaveBeenCalledTimes(5);
    expect(
      notifications.map((roster) =>
        roster.map((player) => [
          player.clientId,
          player.name,
          player.teamId,
          player.score,
        ]),
      ),
    ).toEqual([
      [[7, "Alice", 0, 0]],
      [[7, "Alice", 1, 0]],
      [[7, "Renamed", 1, 42]],
      [],
      [[9, "", 2, 0]],
    ]);
  });
});

describe("current flag carrier identity", () => {
  it.each(["0", "12345"])(
    "keeps carrier identity and current colors through renames, GUID %s",
    (guid) => {
      const { browser, relay, send } = fixture();
      send(join("Alice", "7", "32", guid));
      send(["MsgCTFAddTeam", "", "1", "Storm", "Alice", "0"]);
      const carrier = browser.flag(1)!.carrier!;
      expect(carrier.kind).toBe("player");
      send(["MsgClientNameChanged", "", "Alice", "\x0cSmurf", "7"]);
      expect(browser.flag(1)!.carrier).toMatchObject({
        kind: "player",
        clientId: 7,
        clientGeneration: 1,
      });
      expect(browser.players().display(carrier)).toMatchObject({
        name: "Smurf",
        rawName: "\x0cSmurf",
      });
      expect(relay.getHudState().teamScores[0].flagCarrierRawName).toBe(
        "\x0cSmurf",
      );
      const checkpoint = browser.checkpoint();
      send(["MsgClientDrop", "", "Smurf", "7"]);
      send(join("Someone else", "7", "32", "999"));
      expect(browser.players().resolve(carrier)).toBeUndefined();
      browser.restore(checkpoint);
      expect(browser.players().display(browser.flag(1)!.carrier!).name).toBe(
        "Smurf",
      );
    },
  );

  it("binds a carrier received before the roster, before a subsequent rename", () => {
    const browser = new MessageStream();
    browser.message(["MsgCTFFlagTaken", "", "Alice", "", "2"]);
    expect(browser.flag(2)?.carrier?.kind).toBe("name");
    browser.message(join("Alice", "7", "32", "0"));
    browser.message(["MsgClientNameChanged", "", "Alice", "New name", "7"]);
    expect(browser.players().display(browser.flag(2)!.carrier!).name).toBe(
      "New name",
    );
  });

  it("tracks Rabbit independently of teams, including home, pickups, drops, and mission changes", () => {
    const { browser, relay, send } = fixture();
    send(join("Rabbit", "7", "32", "0"));
    send(["MsgRabbitFlagStatus", "", "<At Home>"]);
    expect(browser.flag(0)).toMatchObject({ teamId: 0, status: "home" });
    send(["MsgRabbitFlagTaken", "", "Rabbit"]);
    expect(browser.players().display(browser.flag(0)!.carrier!).name).toBe(
      "Rabbit",
    );
    send(["MsgClientNameChanged", "", "Rabbit", "Fast Rabbit", "7"]);
    expect(browser.players().display(browser.flag(0)!.carrier!).name).toBe(
      "Fast Rabbit",
    );
    expect(relay.getHudState().flags?.[0].carrier?.kind).toBe("player");
    send(["MsgRabbitFlagDropped", ""]);
    expect(browser.flag(0)).toEqual({ teamId: 0, status: "field" });
    send(["MsgRabbitFlagReturned", ""]);
    expect(browser.flag(0)).toEqual({ teamId: 0, status: "home" });
    expect(browser.hud().teamScores).toEqual([]);
    send(["MsgClientReady", "", "LakRabbitGame"]);
    expect(browser.flag(0)).toBeUndefined();
    expect(relay.getHudState().flags).toEqual([]);
  });
});

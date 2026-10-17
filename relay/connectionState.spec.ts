import { describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { ConnectionState, TargetTable } from "./connectionState.js";
import { WatchStateAccumulator } from "./watchState.js";

function connection(clock = { now: 0 }, identityScope = "test") {
  return new ConnectionState({ now: () => clock.now, identityScope });
}

/**
 * A ServerMessage's args, after the command name.
 */
const message = (state: ConnectionState, ...args: string[]) =>
  state.applyServerMessage(args);

const events = (state: ConnectionState, ...data: ParsedData[]) => {
  for (const event of data) state.applyEvent(event);
};

/**
 * Give every field a value, as a connection a few minutes into a CTF
 * match holds them: Alice carries Inferno's flag, Storm's lies dropped.
 */
function populate(state: ConnectionState, clock: { now: number }) {
  message(state, "MsgClientReady", "", "CTFGame");
  events(
    state,
    { type: "NetStringEvent", id: 10, value: "\x02flag" },
    { type: "NetStringEvent", id: 11, value: "Flag" },
    { type: "TargetInfoEvent", targetId: 32, nameTag: 10, typeTag: 11 },
    { type: "TargetInfoEvent", targetId: 33, skinTag: 99, sensorGroup: 2 },
    { type: "TargetInfoEvent", targetId: 40, renderFlags: 2 },
    { type: "TargetFreeEvent", targetId: 40 },
    { type: "SetSensorGroupEvent", sensorGroup: 1 },
    {
      type: "SensorGroupColorEvent",
      sensorGroup: 1,
      colors: [{ index: 2, r: 200, g: 10, b: 10 }],
    },
  );
  for (const args of [
    ["MsgCTFAddTeam", "", "1", "Storm", "<At Base>", "0"],
    ["MsgCTFAddTeam", "", "2", "Inferno", "<At Base>", "0"],
    ["MsgClientJoin", "", "Alice", "7", "50", "0", "0", "0", "0", "12345"],
    ["MsgClientJoinTeam", "", "Alice", "Storm", "7", "1"],
    ["MsgSystemClock", "", "20", "1200000"],
    ["MsgMissionStart", ""],
    ["MsgLoadInfo", "", "Surreal", "Surreal", "Capture the Flag"],
    ["MsgLoadQuoteLine", "", "Hold the line."],
    ["MsgLoadInfoDone", ""],
    ["MsgCTFFlagTaken", "", "Alice", "Storm", "1"],
    ["MsgCTFFlagDropped", "", "Alice", "Storm", "1"],
    ["MsgCTFFlagTaken", "", "Alice", "Inferno", "2"],
  ])
    message(state, ...args);
  const { serverName } =
    message(state, "MsgMissionDropInfo", "", "Surreal", "CTF", "Server") ?? {};
  if (serverName) state.serverDisplayName = serverName;
  clock.now += 2.5;
  state.endMatch();
}

describe("TargetTable", () => {
  it("round-trips every target through entries() and seed()", () => {
    const netStrings = new Map([[10, "\x02flag"]]);
    const table = new TargetTable(netStrings);
    table.applyInfo({ targetId: 32, nameTag: 10, typeTag: 11, sensorGroup: 1 });
    table.applyInfo({ targetId: 33, nameTag: 0x400, renderFlags: 2 });
    table.applyInfo({ targetId: 34, skinTag: 12, skinPrefTag: 13 });

    const copy = new TargetTable(netStrings);
    for (const entry of table.entries()) copy.seed(entry);
    expect(copy.save()).toEqual(table.save());
    expect(copy.entries()).toEqual(table.entries());
    // A tag still waiting on its string keeps waiting in the copy.
    expect(copy.pendingTypeTags.get(32)).toBe(11);
    expect(copy.rawNames.get(33)).toBe("");
  });

  it("resolves every target waiting on a string, field by field", () => {
    const table = new TargetTable(new Map());
    table.applyInfo({ targetId: 32, nameTag: 10, typeTag: 10 });
    table.applyInfo({ targetId: 33, nameTag: 10 });
    expect(table.resolveNetString(10, "Flag")).toEqual([32, 33, 32]);
    expect(table.rawNames.get(33)).toBe("Flag");
    expect(table.types.get(32)).toBe("Flag");
    expect(table.resolveNetString(10, "Flag")).toEqual([]);
  });

  it("frees a slot completely and counts the generation", () => {
    const table = new TargetTable(new Map([[10, "Alice"]]));
    table.applyInfo({
      targetId: 32,
      nameTag: 10,
      typeTag: 11,
      sensorGroup: 2,
      renderFlags: 2,
    });
    table.free(32);
    table.free(32);
    expect(table.entries()).toEqual([]);
    expect(table.generations.get(32)).toBe(2);
  });

  it("lets a rename replace a name still waiting on its string", () => {
    const table = new TargetTable(new Map());
    table.applyInfo({ targetId: 32, nameTag: 40 });
    table.rename(32, "Alice");
    expect(table.resolveNetString(40, "Old name")).toEqual([]);
    expect(table.rawNames.get(32)).toBe("Alice");
  });
});

describe("ConnectionState", () => {
  it("clears a network string slot without changing already resolved target skins", () => {
    const state = connection();
    events(
      state,
      { type: "NetStringEvent", id: 10, value: "baseb" },
      { type: "TargetInfoEvent", targetId: 32, skinTag: 10 },
      { type: "NetStringEvent", id: 10, hasValue: false },
    );
    expect(state.netStrings.has(10)).toBe(false);
    expect(
      state.targets.entries().find((entry) => entry.targetId === 32)?.skin,
    ).toBe("baseb");
  });

  it("reports whether a target event changed what the HUD shows", () => {
    const state = connection();
    expect(
      state.applyEvent({
        type: "TargetInfoEvent",
        targetId: 32,
        skinPrefTag: 9,
      }),
    ).toEqual({ kind: "targetInfo", targetId: 32, hudChanged: false });
    state.applyEvent({ type: "TargetInfoEvent", targetId: 32, renderFlags: 2 });
    expect(state.applyEvent({ type: "TargetFreeEvent", targetId: 32 })).toEqual(
      { kind: "targetFree", targetId: 32, hadFlagBit: true },
    );
    expect(state.applyEvent({ type: "GravityEvent" })).toBeNull();
  });

  it("keeps sensor colors until a default entry resets one", () => {
    const state = connection();
    events(
      state,
      {
        type: "SensorGroupColorEvent",
        sensorGroup: 1,
        colors: [
          { index: 2, r: 200, g: 10, b: 10 },
          { index: 3, r: 1, g: 2, b: 3 },
        ],
      },
      {
        type: "SensorGroupColorEvent",
        sensorGroup: 1,
        colors: [{ index: 3, default: true }],
      },
    );
    const entries = state.sensorGroupColorEntries();
    expect(entries).toEqual([
      { group: 1, targetGroup: 2, r: 200, g: 10, b: 10, a: 255 },
    ]);
    const joiner = connection();
    joiner.seedTables({
      taggedStrings: [],
      targetEntries: [],
      sensorGroupColors: entries,
    });
    expect(joiner.sensorGroupColorEntries()).toEqual(entries);
  });

  it("hands a late joiner everything through its catch-up", () => {
    const relayClock = { now: 1000 };
    const relay = connection(relayClock, "relay-scope");
    populate(relay, relayClock);
    const hud = structuredClone(relay.hudState());
    expect(hud.flags).toHaveLength(2);
    expect(hud.flags?.find((flag) => flag.teamId === 2)?.carrier?.kind).toBe(
      "player",
    );
    expect(hud.flagDropElapsedSec).toEqual({ 1: 2.5 });
    expect(hud.clock).toEqual({ durationMs: 1_200_000, elapsedMs: 2500 });
    expect(hud.targetGenerations).toEqual([[40, 1]]);
    expect(hud.serverDisplayName).toBe("Server");
    expect(hud.matchEnded).toBe(true);

    const joiner = connection({ now: 40 }, "joiner-scope");
    joiner.seedTables({
      taggedStrings: relay.taggedStringEntries(),
      targetEntries: relay.targets.entries(),
      sensorGroupColors: relay.sensorGroupColorEntries(),
      targetGenerations: hud.targetGenerations,
    });
    joiner.playerSensorGroup = relay.playerSensorGroup;
    joiner.hydrateHud(hud);
    if (hud.matchEnded) joiner.endMatch();

    expect(joiner.hudState()).toEqual(hud);
    expect(joiner.playerIdentity.scope).toBe("relay-scope");
    expect(joiner.flagDroppedAtSec).toEqual({ 1: 37.5 });
    expect(joiner.clock).toEqual({ anchorSec: 37.5, durationMs: 1_200_000 });
    expect(joiner.targets.save()).toEqual(relay.targets.save());
    expect(joiner.netStrings).toEqual(relay.netStrings);
    expect(joiner.sensorGroupColors).toEqual(relay.sensorGroupColors);
  });

  it("restores a checkpoint exactly, as its own copy", () => {
    const clock = { now: 1000 };
    const state = connection(clock);
    populate(state, clock);
    const saved = structuredClone(state.save());

    message(state, "MsgClientReady", "", "LakRabbitGame");
    events(
      state,
      { type: "NetStringEvent", id: 12, value: "Later" },
      { type: "TargetFreeEvent", targetId: 32 },
    );
    state.restore(structuredClone(saved));
    expect(structuredClone(state.save())).toEqual(saved);
    // The tables still read the state's own strings after a restore.
    state.applyEvent({ type: "NetStringEvent", id: 99, value: "Skin" });
    expect(state.targets.skins.get(33)).toBe("Skin");
    expect(saved.targets.skins.has(33)).toBe(false);
  });

  it("forgets everything on reset but its identity scope", () => {
    const clock = { now: 1000 };
    const state = connection(clock);
    populate(state, clock);
    state.reset();
    expect(structuredClone(state.save())).toEqual(
      structuredClone(connection().save()),
    );
  });

  it("forgets only mission-scoped display state when a mission loads", () => {
    const clock = { now: 1000 };
    const state = connection(clock);
    populate(state, clock);
    const before = structuredClone(state.save());
    state.beginMissionChange();
    expect(structuredClone(state.save())).toEqual({
      ...before,
      flags: new Map(),
      flagDroppedAtSec: {},
      missionDisplayName: null,
      missionTypeDisplayName: null,
      gameClassName: null,
      serverDisplayName: null,
      matchStarted: false,
    });
  });

  it("holds the clock across a match end and resumes it at the next drop", () => {
    const clock = { now: 0 };
    const state = connection(clock);
    message(state, "MsgSystemClock", "", "20", "1200000");
    clock.now = 10;
    expect(state.endMatch()).toBe(true);
    expect(state.endMatch()).toBe(false);
    clock.now = 25;
    expect(state.hudState().clock).toEqual({
      durationMs: 1_200_000,
      elapsedMs: 10_000,
    });
    expect(message(state, "MsgClientReady", "", "CTFGame")).toMatchObject({
      missionDropReady: true,
    });
    expect(state.matchEnded).toBe(false);
    expect(state.hudState().clock?.elapsedMs).toBe(10_000);
  });

  it("names no target when a client renames after its target was freed", () => {
    const state = connection();
    message(state, "MsgClientJoin", "", "Alice", "7", "32");
    events(
      state,
      { type: "NetStringEvent", id: 10, value: "Alice" },
      { type: "TargetInfoEvent", targetId: 32, nameTag: 10 },
      { type: "TargetFreeEvent", targetId: 32 },
    );
    const effects = message(
      state,
      "MsgClientNameChanged",
      "",
      "Alice",
      "Renamed",
      "7",
    );
    expect(effects?.renamedPlayer?.targetId).toBe(-1);
    expect(effects?.renamedTargetId).toBeUndefined();
    expect(state.targets.entries()).toEqual([]);
  });
});

describe("relay mission info", () => {
  const packet = (...args: string[]) =>
    ({
      gameState: {},
      events: [
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args,
          },
        },
      ],
    }) as never;

  it("takes Classic's mod info as the server name, not the mission", () => {
    const relay = new WatchStateAccumulator();
    relay.applyPacket(
      packet("MsgLoadInfo", "", "Surreal", "Surreal", "Capture the Flag"),
    );
    relay.applyPacket(
      packet("MsgLoadInfo", "", "Surreal", "Classic  1.3", "Rapture East"),
    );
    expect(relay.serverName).toBe("Rapture East");
    expect(relay.missionType).toBe("Capture the Flag");
    expect(relay.getHudState().missionDisplayName).toBe("Surreal");
  });

  it("keeps the known server name when a new one is an unresolved tag", () => {
    const relay = new WatchStateAccumulator();
    relay.applyPacket(
      packet("MsgMissionDropInfo", "", "Surreal", "CTF", " Known Server "),
    );
    relay.applyPacket(
      packet("MsgMissionDropInfo", "", "Surreal", "CTF", "\x0199"),
    );
    expect(relay.serverName).toBe("Known Server");
  });
});

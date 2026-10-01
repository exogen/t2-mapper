import { describe, expect, it, vi } from "vitest";
import {
  applyServerMessageState,
  type ServerMessageChanges,
  type ServerMessageRosterEntry,
  type ServerMessageTeamScore,
} from "./serverMessageState.js";

interface BrowserTeam extends ServerMessageTeamScore {
  playerCount: number;
}

function harness(strings: Record<string, string> = {}) {
  const state = {
    playerRoster: new Map<number, ServerMessageRosterEntry>(),
    teamScores: [] as BrowserTeam[],
  };
  const resolve = (value: string) => strings[value] ?? value;
  const createTeam = vi.fn((entry: ServerMessageTeamScore): BrowserTeam => ({
    ...entry,
    playerCount: 0,
  }));
  const message = (type: string, ...data: string[]) =>
    applyServerMessageState(
      type,
      [type, "", ...data],
      resolve,
      state,
      createTeam,
    );
  return { state, message, resolve, createTeam };
}

function player(overrides: Partial<ServerMessageRosterEntry> = {}) {
  return {
    name: "Alice",
    rawName: "Alice",
    teamId: 1,
    score: 100,
    ping: 40,
    packetLoss: 2,
    ...overrides,
  } satisfies ServerMessageRosterEntry;
}

function expectNoEffects(changes: ServerMessageChanges | null) {
  expect(changes).not.toBeNull();
  expect(
    Object.values(changes ?? {}).every(
      (value) => value === false || value === undefined,
    ),
  ).toBe(true);
}

describe("applyServerMessageState", () => {
  it("leaves unrelated server messages to the caller", () => {
    const { state, message, createTeam } = harness();
    state.playerRoster.set(7, player());
    expect(message("MsgSystemClock", "20", "120000")).toBeNull();
    expect(message("CommunityExtension", "7", "999")).toBeNull();
    expect(state.playerRoster.get(7)?.score).toBe(100);
    expect(createTeam).not.toHaveBeenCalled();
  });

  it.each([
    "MsgTeamScoreIs",
    "MsgTeamScore",
    "MsgCTFAddTeam",
    "MsgCnHAddTeam",
    "MsgHuntAddTeam",
    "MsgSiegeAddTeam",
    "MsgCTFFlagTaken",
    "MsgCTFFlagDropped",
    "MsgCTFFlagReturned",
    "MsgCTFFlagCapped",
    "MsgClientJoin",
    "MsgClientDrop",
    "MsgClientNameChanged",
    "MsgClientJoinTeam",
    "MsgPlayerScore",
    "SetLineHud",
    "MsgDebriefAddLine",
  ])("recognizes an incomplete %s without mutating state", (type) => {
    const { state, resolve, createTeam } = harness();
    state.playerRoster.set(7, player());
    const before = structuredClone(state);
    expect(
      applyServerMessageState(type, [type], resolve, state, createTeam),
    ).toEqual({});
    expect(state).toEqual(before);
    expect(createTeam).not.toHaveBeenCalled();
  });

  it("resolves join identity fields and resets an existing player rep", () => {
    const rawName = "\x10\x0b[TAG]\x08 Alice\x11";
    const { state, message } = harness({
      "@name": rawName,
      "@client": "7",
      "@target": "31",
      "@guid": " 00012345678901234567890 ",
    });
    const old = player({ kills: 35, guid: "99", targetId: 9 });
    state.playerRoster.set(7, old);
    expect(
      message(
        "MsgClientJoin",
        "@name",
        "@client",
        "@target",
        "0",
        "0",
        "0",
        "0",
        "@guid",
      ),
    ).toMatchObject({
      rosterChanged: true,
      rosterMetadataChanged: true,
      joinedClientId: 7,
    });
    expect(state.playerRoster.get(7)).toEqual({
      name: "[TAG] Alice",
      rawName,
      guid: "12345678901234567890",
      targetId: 31,
      teamId: 0,
      score: 0,
      ping: 0,
      packetLoss: 0,
    });
    expect(state.playerRoster.get(7)).not.toBe(old);
  });

  it("accepts a short join without inventing a target or account identity", () => {
    const { state, message } = harness();
    message("MsgClientJoin", "Alice", "7");
    expect(state.playerRoster.get(7)).toMatchObject({ name: "Alice" });
    expect(state.playerRoster.get(7)?.targetId).toBeUndefined();
    expect(state.playerRoster.get(7)?.guid).toBeUndefined();
    message("MsgClientJoin", "Bob", "8", "bad", "0", "0", "0", "0", "0");
    expect(state.playerRoster.get(8)?.targetId).toBeUndefined();
    expect(state.playerRoster.get(8)?.guid).toBeUndefined();
  });

  it("keeps a placeholder for join-team messages received before the join", () => {
    const { state, message } = harness();
    expect(
      message("MsgClientJoinTeam", "Alice", "Storm", "7", "2"),
    ).toMatchObject({ rosterChanged: true, rosterMetadataChanged: true });
    expect(state.playerRoster.get(7)).toEqual({
      name: "",
      rawName: "",
      teamId: 2,
      score: 0,
      ping: 0,
      packetLoss: 0,
    });
    message("MsgClientJoin", "Alice", "7");
    expect(state.playerRoster.get(7)?.teamId).toBe(0);
  });

  it("renames by client ID while preserving identity and statistics", () => {
    const rawName = "\x02  [NEW]Alice \x11";
    const { state, message } = harness({ "@new": rawName, "@client": "7" });
    const entry = player({ guid: "123", targetId: 31, kills: 12 });
    state.playerRoster.set(7, entry);
    const changes = message(
      "MsgClientNameChanged",
      "Wrong old name",
      "@new",
      "@client",
    );
    expect(changes).toMatchObject({
      rosterChanged: true,
      rosterMetadataChanged: true,
    });
    expect(changes?.renamedPlayer).toBe(entry);
    expect(entry).toEqual(
      player({
        name: "[NEW]Alice",
        rawName,
        guid: "123",
        targetId: 31,
        kills: 12,
      }),
    );
  });

  it("rejects empty stripped names and unknown clients when renaming", () => {
    const { state, message } = harness();
    const entry = player();
    state.playerRoster.set(7, entry);
    expect(
      message("MsgClientNameChanged", "Alice", "\x10 \x02\x11", "7"),
    ).toEqual({});
    expect(message("MsgClientNameChanged", "Ghost", "Bob", "99")).toEqual({});
    expect(entry).toEqual(player());
    expect(state.playerRoster.size).toBe(1);
  });

  it("distinguishes an actual departure from a repeated drop notification", () => {
    const { state, message } = harness();
    state.playerRoster.set(7, player());
    expect(message("MsgClientDrop", "Alice", "7")).toMatchObject({
      rosterChanged: true,
      rosterMetadataChanged: true,
    });
    expect(state.playerRoster.size).toBe(0);
    const duplicate = message("MsgClientDrop", "Alice", "7");
    expect(duplicate?.rosterChanged).toBe(true);
    expect(duplicate?.rosterMetadataChanged).not.toBe(true);
  });

  it("ignores malformed IDs and teams without creating roster entries", () => {
    const { state, message } = harness();
    expect(message("MsgClientJoin", "Alice", "bad")).toEqual({});
    expect(message("MsgClientDrop", "Alice", "bad")).toEqual({});
    expect(message("MsgClientJoinTeam", "Alice", "Storm", "7", "bad")).toEqual(
      {},
    );
    expect(state.playerRoster.size).toBe(0);
  });

  it("preserves authoritative HUD scores while accepting ping and packet loss", () => {
    const { state, message } = harness({ "@ping": "61", "@loss": "3" });
    const entry = player({ kills: 12 });
    state.playerRoster.set(7, entry);
    expect(message("MsgPlayerScore", "7", "0", "@ping", "@loss")).toMatchObject(
      { rosterChanged: true },
    );
    expect(entry).toEqual(
      player({ score: 100, ping: 61, packetLoss: 3, kills: 12 }),
    );
    message("MsgPlayerScore", "7", "-4", "bad", "bad");
    expect(entry).toMatchObject({ score: -4, ping: 61, packetLoss: 3 });
    expect(message("MsgPlayerScore", "99", "99", "40")).toEqual({});
    expect(state.playerRoster.has(99)).toBe(false);
  });

  it.each(["MsgTeamScoreIs", "MsgTeamScore"])(
    "%s updates existing teams and detects scores before team registration",
    (type) => {
      const { state, message } = harness({ "@team": "1", "@score": "3" });
      state.teamScores.push({
        teamId: 1,
        name: "Storm",
        score: 0,
        playerCount: 8,
      });
      expect(message(type, "@team", "@score")).toMatchObject({
        teamScoresChanged: true,
        matchStarted: true,
      });
      expect(state.teamScores[0]).toEqual({
        teamId: 1,
        name: "Storm",
        score: 3,
        playerCount: 8,
      });
      expect(message(type, "2", "1")).toMatchObject({ matchStarted: true });
      expect(state.teamScores).toHaveLength(1);
      expect(message(type, "1", "bad")).toEqual({});
    },
  );

  it("uses the caller's team factory only on insertion and preserves extra fields", () => {
    const { state, message, createTeam } = harness();
    expect(
      message("MsgCTFAddTeam", "1", "\x02Storm", "Alice", "3"),
    ).toMatchObject({ teamScoresChanged: true, matchStarted: true });
    expect(createTeam).toHaveBeenCalledOnce();
    expect(state.teamScores[0]).toEqual({
      teamId: 1,
      name: "Storm",
      score: 3,
      flagStatus: "held",
      flagCarrier: "Alice",
      playerCount: 0,
    });
    state.teamScores[0].playerCount = 8;
    message("MsgSiegeAddTeam", "1", "Defenders", "1");
    expect(state.teamScores[0]).toMatchObject({
      name: "Defenders",
      score: 3,
      flagStatus: "held",
      flagCarrier: "Alice",
      playerCount: 8,
    });
    expect(createTeam).toHaveBeenCalledOnce();
  });

  it.each(["MsgCnHAddTeam", "MsgHuntAddTeam"])(
    "%s reads its score without declaring a CTF match start",
    (type) => {
      const { state, message } = harness();
      const changes = message(type, "1", "Storm", "12");
      expect(changes?.teamScoresChanged).toBe(true);
      expect(changes?.matchStarted).not.toBe(true);
      expect(state.teamScores[0]).toMatchObject({ score: 12 });
    },
  );

  it("rejects invalid add-team identities and retains an existing score on malformed input", () => {
    const { state, message, createTeam } = harness();
    expectNoEffects(message("MsgCnHAddTeam", "0", "Observers", "0"));
    expectNoEffects(message("MsgCnHAddTeam", "bad", "Storm", "0"));
    expect(createTeam).not.toHaveBeenCalled();
    state.teamScores.push({ teamId: 1, name: "Old", score: 9, playerCount: 4 });
    message("MsgCTFAddTeam", "1", "Storm", "<At Base>", "bad");
    expect(state.teamScores[0]).toMatchObject({
      name: "Storm",
      score: 9,
      flagStatus: "home",
    });
  });

  it("uses the flag's team and clears its carrier when dropped, returned, or capped", () => {
    const { state, message } = harness({
      "@actor": "\x02 Alice ",
      "@team": "2",
    });
    state.teamScores.push({
      teamId: 2,
      name: "Inferno",
      score: 0,
      playerCount: 4,
    });
    message("MsgCTFFlagTaken", "@actor", "1", "@team");
    expect(state.teamScores[0]).toMatchObject({
      flagStatus: "held",
      flagCarrier: "Alice",
    });
    for (const [type, status] of [
      ["MsgCTFFlagDropped", "field"],
      ["MsgCTFFlagReturned", "home"],
      ["MsgCTFFlagCapped", "home"],
    ]) {
      expect(message(type, "@actor", "1", "@team")).toMatchObject({
        teamScoresChanged: true,
      });
      expect(state.teamScores[0].flagStatus).toBe(status);
      expect(state.teamScores[0].flagCarrier).toBeUndefined();
    }
    expect(message("MsgCTFFlagTaken", "Alice", "1", "99")).toEqual({});
    expect(state.teamScores).toHaveLength(1);
  });

  it("updates both players in a resolved stock HUD line while ignoring observers", () => {
    const { state, message } = harness({
      "@alice": "\x02Alice",
      "@score": "120",
    });
    state.playerRoster.set(7, player());
    state.playerRoster.set(
      8,
      player({ name: "Bob", rawName: "Bob", teamId: 2 }),
    );
    state.playerRoster.set(
      9,
      player({ name: "Observer", rawName: "Observer", teamId: 0 }),
    );
    expect(
      message(
        "SetLineHud",
        "tag",
        "0",
        "format",
        "@alice",
        "@score",
        "Bob",
        "90",
      ),
    ).toMatchObject({ rosterChanged: true });
    expect(state.playerRoster.get(7)?.score).toBe(120);
    expect(state.playerRoster.get(8)?.score).toBe(90);
    expectNoEffects(
      message("SetLineHud", "tag", "0", "format", "Observer", "999", "35"),
    );
    expect(state.playerRoster.get(9)?.score).toBe(100);
  });

  it.each([
    ["@name", "470", "35"],
    ["@name", "Storm", "470", "35"],
  ])(
    "applies final debrief statistics for either column layout",
    (...columns) => {
      const { state, message } = harness({ "@name": "\x02 Alice " });
      const entry = player();
      state.playerRoster.set(7, entry);
      expect(message("MsgDebriefAddLine", "format", ...columns)).toMatchObject({
        rosterChanged: true,
      });
      expect(entry).toMatchObject({
        score: 470,
        kills: 35,
        ping: 40,
        packetLoss: 2,
      });
      expectNoEffects(
        message("MsgDebriefAddLine", "format", "Alice", "bad", "bad"),
      );
      expect(entry.score).toBe(470);
    },
  );
});

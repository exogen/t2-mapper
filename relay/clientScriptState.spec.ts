import { describe, expect, it } from "vitest";
import { ClientScriptState, expandRemoteArgs } from "./clientScriptState.js";

const STRINGS = new Map<number, string>([
  [1, "ServerMessage"],
  [2, "ChatMessage"],
  [3, "CannedChatMessage"],
  [4, "MsgClientJoin"],
  [5, "MsgClientDrop"],
  [6, "MsgClientJoinTeam"],
  [7, "MsgClientNameChanged"],
  [8, "MsgPlayerScore"],
  [9, "MsgAdminPlayer"],
  [10, "MsgPlayerMuted"],
  [11, "MsgVoiceEnable"],
  [12, "MsgCanListen"],
  [13, "MsgListenState"],
  [14, "MsgSystemClock"],
  [15, "openVoteHud"],
  [16, "closeVoteHud"],
  [17, "\x03%1 joined the game."],
  [18, "\x05%1: %2"],
  [19, "Alice"],
  [20, "Bob"],
  [21, "MsgCTFFlagTaken"],
  [22, "Flag taken~wfx/misc/flag_snatch.wav"],
  [23, "~wfx/misc/flag_snatch.wav"],
  [24, "msgclientjoin"],
  [25, "PotentialTeamTask"],
  [26, "AcceptedTask"],
  [27, "Defend our flag"],
]);

const tag = (id: number) => `\x01${id}`;
const serverMessage = (type: string, message: string, ...args: string[]) => [
  tag(1),
  type,
  message,
  ...args,
];
const join = (name: string, clientId: string) =>
  serverMessage(tag(4), tag(17), name, clientId, "7", "0", "", "", "0", "1234");

function run(...commands: string[][]): ClientScriptState {
  const state = new ClientScriptState();
  for (const argv of commands) state.apply(argv, STRINGS, 0);
  return state;
}

describe("expandRemoteArgs", () => {
  it("expands tags last to first, each with the detagged arguments after it", () => {
    const strings = new Map([
      [1, "%1 says %2"],
      [2, "Alice%1"],
      [3, "!"],
    ]);
    expect(expandRemoteArgs([tag(1), tag(2), tag(3)], strings)).toEqual([
      "\x011 Alice! says !",
      "\x012 Alice!",
      "\x013 !",
    ]);
  });

  it("drops parameters past the last and keeps other escaped characters", () => {
    const strings = new Map([[1, "%2 of %1: 100%% %0%x%"]]);
    expect(expandRemoteArgs([tag(1), "a", "%1"], strings)).toEqual([
      "\x011 %1 of a: 100% 0x",
      "a",
      "%1",
    ]);
    expect(expandRemoteArgs([tag(1)], strings)[0]).toBe("\x011  of : 100% 0x");
  });

  it("marks a tag with no string", () => {
    expect(expandRemoteArgs([tag(99), "a"], STRINGS)).toEqual([
      "\x0199 <NULL>",
      "a",
    ]);
  });
});

describe("ClientScriptState", () => {
  it("saves a join as the rep handleClientJoin makes, with later updates", () => {
    const state = run(
      join(tag(19), "10"),
      serverMessage(tag(6), "", "Alice", "Storm", "10", "1"),
      serverMessage(tag(8), "", "10", "5", "40", "0"),
      serverMessage(tag(9), "", "10"),
      serverMessage(tag(10), "", "Alice", "10", "1"),
      serverMessage(tag(11), "", "1", "10"),
      serverMessage(tag(12), "", "1", "10"),
      serverMessage(tag(13), "", "1", "10"),
      serverMessage(tag(7), "", "Alice", "\x10\x0b[T]\x08Alice\x11", "10"),
    );
    expect(state.save(0)).toEqual({
      voting: false,
      players: [
        [
          "\x10\x0b[T]\x08Alice\x11",
          "1234",
          "10",
          "7",
          "1",
          "5",
          "40",
          "0",
          "1",
          "1",
          "1",
          "1",
          "0",
          "1",
          "",
          "0",
        ],
      ],
      clockMinutes: 0,
      chat: ["\x03Alice joined the game."],
    });
  });

  it("keeps an earlier rep when a client joins twice, as PlayerListGroup does", () => {
    const state = run(
      join(tag(19), "10"),
      join(tag(20), "10"),
      serverMessage(tag(5), "", "Bob", "10"),
      serverMessage(tag(6), "", "Bob", "Storm", "10", "1"),
    );
    expect(state.save(0).players.map((fields) => fields.slice(0, 5))).toEqual([
      ["Alice", "1234", "10", "7", "0"],
    ]);
  });

  it("dispatches only tagged message types, matched exactly", () => {
    const state = run(
      serverMessage("MsgClientJoin", "", "Alice", "10"),
      serverMessage(tag(24), "", "Alice", "10"),
      serverMessage(tag(6), "", "Alice", "Storm", "10", "1"),
    );
    expect(state.save(0).players).toEqual([]);
  });

  it("adds a message's text up to its sound", () => {
    const state = run(
      serverMessage("", ""),
      serverMessage(tag(21), tag(22)),
      serverMessage(tag(21), tag(23)),
      serverMessage("", "plain %1", "Alice"),
    );
    expect(state.save(0).chat).toEqual(["Flag taken", "plain %1"]);
  });

  it("keeps chat only from players it knows and has not muted", () => {
    const chat = (sender: string, text: string) => [
      tag(2),
      sender,
      "",
      "1",
      tag(18),
      sender === "10" ? tag(19) : tag(20),
      text,
    ];
    const state = run(
      chat("11", "before joining"),
      join(tag(19), "10"),
      chat("10", "hello~wvoice/male1/gbl.hi.wav"),
      [tag(3), "10", "\x05Alice: Hi.~wgbl.hi", "Alice", "Hi.", "VGH"],
      serverMessage(tag(10), "", "Alice", "10", "1"),
      chat("10", "muted"),
    );
    expect(state.save(0).chat).toEqual([
      "\x03Alice joined the game.",
      "\x05Alice: hello",
      "[VGH] \x05Alice: Hi.",
    ]);
  });

  it("saves the clock's minutes from the deadline the last time-left message set", () => {
    const state = new ClientScriptState();
    state.apply(serverMessage(tag(14), "", "20", "600000"), STRINGS, 1000);
    expect(state.save(1096).clockMinutes).toBeCloseTo(599904 / 60000, 9);
    // Overtime counts up from zero.
    expect(state.save(661000).clockMinutes).toBe(1);
  });

  it("tracks whether a vote is open", () => {
    expect(run(serverMessage(tag(15), "", "8", "0.5")).save(0).voting).toBe(
      true,
    );
    expect(
      run(
        serverMessage(tag(15), "", "8", "0.5"),
        serverMessage(tag(16), ""),
      ).save(0).voting,
    ).toBe(false);
  });

  it("writes task lines as clientTasks.cs does", () => {
    const state = run([tag(25), tag(27)], [tag(26), "Defend our flag"]);
    expect(state.save(0).chat).toEqual([
      "\x04Team:\x0f Defend our flag.",
      "\x05Your current task is:\x0f Defend our flag",
    ]);
  });
});

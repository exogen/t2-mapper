import { describe, expect, it } from "vitest";
import {
  decodedPacket,
  remoteCommandEvent,
  serverMessagePacket,
} from "./serverPacketFixtures.js";
import { WatchStateAccumulator } from "./watchState.js";

describe("tournament mode from vote menus", () => {
  it.each([
    ["TourneyQuery", "VoteFFAMode", true],
    ["TourneyQuery", "VoteTournamentMode", false],
    ["6", "VoteFFAMode", true],
    ["7", "VoteTournamentMode", false],
  ] as const)("recognizes %s / %s", (key, voteName, expected) => {
    const state = new WatchStateAccumulator();
    state.applyPacket(serverMessagePacket(["MsgVoteItem", "", key, voteName]));
    expect(state.tournamentMode).toBe(expected);
  });

  it("resolves tagged menu options and applies later reports in wire order", () => {
    const state = new WatchStateAccumulator();
    state.applyPacket(
      decodedPacket(
        { type: "NetStringEvent", id: 10, value: "MsgVoteItem" },
        { type: "NetStringEvent", id: 11, value: "VoteFFAMode" },
        remoteCommandEvent("ServerMessage", "\x0110", "", "6", "\x0111"),
      ),
    );
    expect(state.tournamentMode).toBe(true);

    state.applyPacket(
      decodedPacket(
        { type: "NetStringEvent", id: 11, value: "VoteTournamentMode" },
        remoteCommandEvent("ServerMessage", "\x0110", "", "7", "\x0111"),
      ),
    );
    expect(state.tournamentMode).toBe(false);
  });

  it.each([null, false, true])(
    "keeps mode %s for unrelated or incomplete menu options",
    (mode) => {
      const state = new WatchStateAccumulator();
      state.tournamentMode = mode;
      state.applyPacket(
        serverMessagePacket(
          ["MsgVoteItem", "", "6", "VoteChangeMission", "VoteFFAMode"],
          ["MsgVoteItem", "", "7"],
          ["ChatMessage", "VoteTournamentMode", "6", "VoteFFAMode"],
        ),
      );
      expect(state.tournamentMode).toBe(mode);
    },
  );
});

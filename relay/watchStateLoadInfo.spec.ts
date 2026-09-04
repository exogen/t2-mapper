import { describe, it, expect } from "vitest";
import { WatchStateAccumulator } from "./watchState.js";

/** Minimal packet carrying one `ServerMessage` remote command. */
function serverMessage(...args: string[]) {
  return {
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
  } as never;
}

// MsgLoadInfo: [type, message, missionName, missionDisplayName, missionType]
const loadInfo = () =>
  serverMessage("MsgLoadInfo", "", "Katabatic", "Katabatic", "CTF");
const line = (type: string, text: string) => serverMessage(type, "", text);

describe("WatchStateAccumulator load info", () => {
  it("collects the loading-screen text for late joiners", () => {
    const ws = new WatchStateAccumulator();
    expect(ws.getHudState().loadInfo).toBeUndefined();

    ws.applyPacket(loadInfo());
    ws.applyPacket(line("MsgLoadQuoteLine", "Hold the line."));
    ws.applyPacket(line("MsgLoadObjectiveLine", "Capture the flag."));
    ws.applyPacket(line("MsgLoadRulesLine", "No spawn camping."));
    ws.applyPacket(line("MsgLoadRulesLine", "Have fun."));
    // Not published until the burst is complete.
    expect(ws.getHudState().loadInfo).toBeUndefined();

    ws.applyPacket(serverMessage("MsgLoadInfoDone", ""));
    expect(ws.getHudState().loadInfo).toEqual({
      quoteLines: ["Hold the line."],
      objectiveLines: ["Capture the flag."],
      rulesLines: ["No spawn camping.", "Have fun."],
    });
  });

  it("drops an empty burst and clears on a mission change", () => {
    const ws = new WatchStateAccumulator();
    ws.applyPacket(loadInfo());
    ws.applyPacket(line("MsgLoadQuoteLine", "Q"));
    ws.applyPacket(serverMessage("MsgLoadInfoDone", ""));
    expect(ws.getHudState().loadInfo?.quoteLines).toEqual(["Q"]);

    ws.beginMissionChange();
    expect(ws.getHudState().loadInfo).toBeUndefined();

    ws.applyPacket(loadInfo());
    ws.applyPacket(serverMessage("MsgLoadInfoDone", ""));
    expect(ws.getHudState().loadInfo).toBeUndefined();
  });
});

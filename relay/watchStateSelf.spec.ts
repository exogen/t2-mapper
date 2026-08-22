import { describe, it, expect } from "vitest";
import { WatchStateAccumulator } from "./watchState.js";

/**
 * Minimal packet carrying one server message (`ServerMessage` remote
 * command). args[0] is the message type; the rest are its fields.
 */
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

// MsgClientJoin: [type, message, name, clientId, targetId, isBot,
// isAdmin, isSuperAdmin, isSmurf, sendGuid]
const join = (msg: string, name: string, id: string, guid = "") =>
  serverMessage("MsgClientJoin", msg, name, id, "-1", "0", "0", "0", "0", guid);
// MsgClientJoinTeam: [type, message, name, teamName, clientId, teamId]
const joinTeam = (name: string, id: string, team: string) =>
  serverMessage("MsgClientJoinTeam", "", name, "T", id, team);

describe("WatchStateAccumulator self identity", () => {
  it("picks our own welcome among clients sharing our account GUID", () => {
    const ws = new WatchStateAccumulator();
    ws.expectedSelfGuid = "555000";
    // Another MapGenius observer on the SAME account, already connected —
    // arrives as a silent roster-sync join. Same GUID, but not us.
    ws.applyPacket(join("", "MapGenius", "3", "555000"));
    expect(ws.selfClientId).toBeNull();
    // A different account's welcome-style join — GUID mismatch, ignored.
    ws.applyPacket(join("Impostor joined", "Impostor", "4", "999"));
    expect(ws.selfClientId).toBeNull();
    // Our own welcome: matching GUID and a non-empty greeting.
    ws.applyPacket(join("Welcome to Tribes2", "MapGenius", "7", "555000"));
    expect(ws.selfClientId).toBe(7);
    // A LATER same-account observer joining must not steal self.
    ws.applyPacket(
      join("MapGenius joined the game", "MapGenius", "9", "555000"),
    );
    expect(ws.selfClientId).toBe(7);
  });

  it("ignores a matching-account silent join and a mismatched welcome", () => {
    const ws = new WatchStateAccumulator();
    ws.expectedSelfGuid = "555000";
    // Silent (roster) join on our account is never self...
    ws.applyPacket(join("", "MapGenius", "3", "555000"));
    // ...and a non-matching account's welcome is never self either.
    ws.applyPacket(join("Welcome to Tribes2", "Impostor", "4", "999"));
    expect(ws.selfClientId).toBeNull();
  });

  it("learns selfClientId from the welcome join, ignoring silent roster joins", () => {
    const ws = new WatchStateAccumulator();
    // Roster sync sends existing clients with an empty message.
    ws.applyPacket(join("", "Alice", "3"));
    ws.applyPacket(join("", "Bob", "4"));
    expect(ws.selfClientId).toBeNull();
    // The welcome about us carries a non-empty message.
    ws.applyPacket(join("Welcome to Tribes2", "MapGenius", "7"));
    expect(ws.selfClientId).toBe(7);
    // A later real join (also non-empty) must not steal self.
    ws.applyPacket(join("Carol joined the game", "Carol", "9"));
    expect(ws.selfClientId).toBe(7);
  });

  it("reports our team via getSelfTeamId; > 0 means we were placed on a team", () => {
    const ws = new WatchStateAccumulator();
    ws.applyPacket(join("welcome", "MapGenius", "7"));
    expect(ws.getSelfTeamId()).toBe(0); // observer
    ws.applyPacket(joinTeam("MapGenius", "7", "1"));
    expect(ws.getSelfTeamId()).toBe(1); // teamed
    ws.applyPacket(joinTeam("MapGenius", "7", "0"));
    expect(ws.getSelfTeamId()).toBe(0); // back to observer
  });

  it("returns null when self is not yet identified", () => {
    const ws = new WatchStateAccumulator();
    ws.applyPacket(joinTeam("Alice", "3", "1"));
    expect(ws.getSelfTeamId()).toBeNull();
  });
});

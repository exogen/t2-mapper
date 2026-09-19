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
  it("uses a welcome only as a fallback for old demos without a client ID", () => {
    const ws = new WatchStateAccumulator();
    // Another MapGenius observer on the SAME account, already connected —
    // arrives as a silent roster-sync join. Same GUID, but not us.
    ws.applyPacket(join("", "MapGenius", "3", "555000"));
    expect(ws.selfClientId).toBeNull();
    // A join announcement does not identify the recorder.
    ws.applyPacket(join("Impostor joined", "Impostor", "4", "999"));
    expect(ws.selfClientId).toBeNull();
    // Our own private welcome identifies the recorder.
    ws.applyPacket(join("Welcome to Tribes2", "MapGenius", "7", "555000"));
    expect(ws.selfClientId).toBe(7);
    // A LATER same-account observer joining must not steal self.
    ws.applyPacket(
      join("MapGenius joined the game", "MapGenius", "9", "555000"),
    );
    expect(ws.selfClientId).toBe(7);
  });

  it("never replaces an ID supplied by the handshake or demo header", () => {
    const ws = new WatchStateAccumulator();
    ws.selfClientId = 7;
    ws.applyPacket(join("", "MapGenius", "3", "555000"));
    ws.applyPacket(join("Welcome to Tribes2", "Impostor", "4", "999"));
    expect(ws.selfClientId).toBe(7);
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

  it("keeps roster team updates separate from the connection's sensor group", () => {
    const ws = new WatchStateAccumulator();
    ws.applyPacket(join("welcome", "MapGenius", "7"));
    expect(ws.getPlayerRoster().get(7)?.teamId).toBe(0);
    ws.applyPacket(joinTeam("MapGenius", "7", "1"));
    expect(ws.getPlayerRoster().get(7)?.teamId).toBe(1);
    expect(ws.playerSensorGroup).toBe(0);
    ws.applyPacket(joinTeam("MapGenius", "7", "0"));
    expect(ws.getPlayerRoster().get(7)?.teamId).toBe(0);
  });

  it("does not infer self identity from a roster team update", () => {
    const ws = new WatchStateAccumulator();
    ws.applyPacket(joinTeam("Alice", "3", "1"));
    expect(ws.selfClientId).toBeNull();
  });

  it.each(["%1 joined the game.", "%1 connected.", "A new player arrived"])(
    "does not infer the recorder from a broadcast: %s",
    (message) => {
      const ws = new WatchStateAccumulator();
      ws.applyPacket(join(message, "MapGenius", "3", "555000"));
      expect(ws.selfClientId).toBeNull();
      ws.applyPacket(join("Welcome to Tribes2", "MapGenius", "7", "555000"));
      expect(ws.selfClientId).toBe(7);
    },
  );

  it.each(["", "0"])(
    "accepts our welcome when the server hides the GUID as %j",
    (guid) => {
      const ws = new WatchStateAccumulator();
      ws.applyPacket(join("%1 joined the game.", "Alice", "3", guid));
      expect(ws.selfClientId).toBeNull();
      ws.applyPacket(join("\x02Welcome to Tribes2", "MapGenius", "7", guid));
      expect(ws.selfClientId).toBe(7);
    },
  );

  it("resets the roster team on a repeated join, like the stock client", () => {
    const ws = new WatchStateAccumulator();
    ws.applyPacket(join("welcome", "MapGenius", "7"));
    ws.applyPacket(joinTeam("MapGenius", "7", "1"));
    ws.applyPacket(join("", "MapGenius", "7"));
    expect(ws.getPlayerRoster().get(7)?.teamId).toBe(0);
    ws.applyPacket(joinTeam("MapGenius", "7", "1"));
    expect(ws.getPlayerRoster().get(7)?.teamId).toBe(1);
  });

  it("resets a placeholder roster entry when the welcome arrives", () => {
    const ws = new WatchStateAccumulator();
    ws.applyPacket(joinTeam("MapGenius", "7", "2"));
    ws.applyPacket(join("welcome", "MapGenius", "7"));
    expect(ws.getPlayerRoster().get(7)?.teamId).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { WatchStateAccumulator } from "./watchState.js";

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

// MsgClientJoin: [type, message, name, clientId, targetId, isBot, …]
const join = (name: string, id: string) =>
  serverMessage(
    "MsgClientJoin",
    "welcome",
    name,
    id,
    "-1",
    "0",
    "0",
    "0",
    "0",
    "",
  );
// MsgClientJoinTeam: [type, message, name, teamName, clientId, teamId]
const joinTeam = (name: string, id: string, team: string) =>
  serverMessage("MsgClientJoinTeam", "", name, "T", id, team);
// SetLineHud: [type, message, tag, index, format, d1, d2, d3, …]
const setLineHud = (...data: string[]) =>
  serverMessage("SetLineHud", "", "tag", "0", "fmt", ...data);
// MsgDebriefAddLine: [type, message, format, name, …rest]
const debrief = (...rest: string[]) =>
  serverMessage("MsgDebriefAddLine", "", "fmt", ...rest);

const teamPlayer = (ws: WatchStateAccumulator, name: string, id: string) => {
  ws.applyPacket(join(name, id));
  ws.applyPacket(joinTeam(name, id, "1"));
};

describe("score-line parsing is crash-safe", () => {
  // Malformed lines must never throw out of applyPacket — a throw there
  // escapes to uncaughtException and kills every in-flight demo.
  const adversarial: Array<[string, ReturnType<typeof serverMessage>]> = [
    ["empty score-hud data", setLineHud("", "")],
    [
      "control chars (net-string-ref shaped)",
      setLineHud("\x01x", "\x02", "\x1f"),
    ],
    [
      "huge / negative numbers",
      setLineHud("Name", "99999999999999999999", "-3"),
    ],
    ["team-header shaped", setLineHud("Storm", "208", "19", "Players")],
    ["debrief missing score", debrief("Player")],
    ["debrief non-numeric score", debrief("Player", "n/a", "n/a")],
    ["debrief empty name", debrief("")],
    ["debrief control chars", debrief("\x01\x02", "\x1f", "\x03")],
  ];

  for (const [label, packet] of adversarial) {
    it(`does not throw: ${label}`, () => {
      const ws = new WatchStateAccumulator();
      teamPlayer(ws, "Vaxity", "7");
      expect(() => ws.applyPacket(packet)).not.toThrow();
    });
  }

  it("still applies a valid live score-hud line to a matched player", () => {
    const ws = new WatchStateAccumulator();
    teamPlayer(ws, "Vaxity", "7");
    ws.applyPacket(setLineHud("Vaxity", "470", "35"));
    const entry = ws
      .getHudState()
      .playerRoster.find((p) => p.name === "Vaxity");
    expect(entry?.score).toBe(470);
    expect(entry?.kills).toBe(35);
  });

  it("still applies a valid debrief line to a matched player", () => {
    const ws = new WatchStateAccumulator();
    teamPlayer(ws, "Vaxity", "7");
    // Single-team debrief row: [name, score, kills].
    ws.applyPacket(debrief("Vaxity", "470", "35"));
    const entry = ws
      .getHudState()
      .playerRoster.find((p) => p.name === "Vaxity");
    expect(entry?.score).toBe(470);
    expect(entry?.kills).toBe(35);
  });
});

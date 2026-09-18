import { describe, expect, it } from "vitest";
import { parseDemoValues } from "./demoStreaming";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import { normalizePlayerGuid } from "./streamHelpers";

class RosterStream extends LiveStreamAdapter {
  constructor() {
    super({} as RelayClient, { mode: "watch" });
  }
  message(...args: string[]) {
    this.handleServerMessage(args);
  }
  get roster() {
    return [...this.playerRoster].map(([clientId, entry]) => ({
      clientId,
      ...entry,
    }));
  }
}

describe("recorded player identities", () => {
  it("retains account GUIDs and target IDs from the demo's saved PLAYERLIST", () => {
    const { playerRoster } = parseDemoValues([
      "",
      "2",
      "\x10\x0bTAG|\x08Runner\x11\t12345\t100\t32\t1\t10\t50\t0",
      "Anonymous\t0\t200\t\t2\t0\t50\t0",
    ]);
    expect(playerRoster.get(100)).toMatchObject({
      name: "TAG|Runner",
      guid: "12345",
      targetId: 32,
    });
    expect(playerRoster.get(200)).toMatchObject({
      name: "Anonymous",
      guid: undefined,
      targetId: undefined,
    });
  });

  it("retains the same GUID across drops/rejoins and clears it when a client ID is reused anonymously", () => {
    const stream = new RosterStream();
    stream.message(
      "MsgClientJoin",
      "",
      "Runner",
      "100",
      "32",
      "0",
      "0",
      "0",
      "0",
      "12345",
    );
    expect(stream.roster[0]).toMatchObject({
      clientId: 100,
      guid: "12345",
      targetId: 32,
    });
    stream.message("MsgClientNameChanged", "", "Runner", "TAG|Runner", "100");
    expect(stream.roster[0]).toMatchObject({
      name: "TAG|Runner",
      guid: "12345",
    });
    stream.message("MsgClientDrop", "", "TAG|Runner", "100");
    expect(stream.roster).toHaveLength(0);
    stream.message(
      "MsgClientJoin",
      "",
      "Renamed",
      "200",
      "45",
      "0",
      "0",
      "0",
      "0",
      "12345",
    );
    expect(stream.roster[0]).toMatchObject({
      clientId: 200,
      guid: "12345",
      targetId: 45,
    });
    stream.message(
      "MsgClientJoin",
      "",
      "Anonymous",
      "200",
      "45",
      "0",
      "0",
      "0",
      "1",
      "0",
    );
    expect(stream.roster[0].guid).toBeUndefined();
  });

  it("normalizes positive GUIDs without losing precision and rejects shared/invalid placeholders", () => {
    expect(normalizePlayerGuid(" 0012345 ")).toBe("12345");
    expect(normalizePlayerGuid("9007199254740993")).toBe("9007199254740993");
    for (const guid of [
      undefined,
      "",
      "0",
      "000",
      "-1",
      "unknown",
      "123x",
      "1.5",
    ]) {
      expect(normalizePlayerGuid(guid)).toBeUndefined();
    }
  });
});

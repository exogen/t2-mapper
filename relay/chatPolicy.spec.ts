import { describe, expect, it } from "vitest";
import { loadChatEnabled } from "./chatPolicy";
import { isChatCommand } from "./shared";

describe("relay chat policy", () => {
  it.each([undefined, "", "1", "true", " TRUE "])(
    "enables chat for %j",
    (raw) => {
      expect(loadChatEnabled(raw)).toBe(true);
    },
  );
  it.each(["0", "false", " FALSE "])("disables chat for %j", (raw) => {
    expect(loadChatEnabled(raw)).toBe(false);
  });
  it("rejects ambiguous configuration", () => {
    expect(() => loadChatEnabled("flase")).toThrow("RELAY_CHAT_ENABLED");
  });
  it.each([
    "messageSent",
    "TeamMessageSent",
    "CannedChat",
    "MESSAGESENT",
    "tEaMmEsSaGeSeNt",
    "cannedchat",
    "\u016dessageSent",
    "messageSent\0ignored",
  ])("recognizes %s regardless of case", (command) => {
    expect(isChatCommand(command)).toBe(true);
  });
  it.each([
    "getScores",
    "ScopeCommanderMap",
    "t2csri_pokeClient",
    "MissionStartPhase1Done",
  ])("leaves %s available", (command) => {
    expect(isChatCommand(command)).toBe(false);
  });
});

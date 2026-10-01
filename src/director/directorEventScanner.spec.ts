import { expect, it } from "vitest";
import { scanDirectorEvent } from "./directorEventScanner";

it.each([
  ["MsgGameOver"],
  ["MsgGameOver", ""],
  ["MsgGameOver", "\x02<font:Arial:16>  "],
  ["MsgGameOver", "~wvoice/announcer/ann.gameover.wav"],
])("does not mark Classic's welcome screen as a match end (%j)", (...args) => {
  expect(
    scanDirectorEvent({ id: 1, timeSec: 6.08, msgType: "MsgGameOver", args }),
  ).toEqual([]);
});

it("retains the announced game over for the director", () => {
  expect(
    scanDirectorEvent({
      id: 1,
      timeSec: 1800,
      msgType: "MsgGameOver",
      args: [
        "MsgGameOver",
        "Match has ended.~wvoice/announcer/ann.gameover.wav",
      ],
    }),
  ).toEqual([{ timeSec: 1800, type: "match-end", description: "Match ended" }]);
});

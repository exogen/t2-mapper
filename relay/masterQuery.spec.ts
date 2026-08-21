import { describe, expect, it } from "vitest";
import { parseServerStatusString } from "./masterQuery";

describe("parseServerStatusString", () => {
  it("strips tagged-string markup control bytes from names", () => {
    // Live-observed wrapping: \x10\x0e<name>\x11 (and \x08 prefixes).
    const status = [
      "1",
      "Storm\t0",
      "2",
      "\x10\x0eSnake Pliskin \x11\tStorm\t12",
      "\x08Krash\tStorm\t3",
    ].join("\n");
    expect(parseServerStatusString(status)?.players).toEqual([
      { name: "Snake Pliskin", team: "Storm", score: 12 },
      { name: "Krash", team: "Storm", score: 3 },
    ]);
  });

  it("parses teams and players from the retail status format", () => {
    const status = [
      "2",
      "Storm\t3",
      "Inferno\t1",
      "4",
      "Alice\tStorm\t120",
      "Bob\tInferno\t85",
      "Watcher\tUnassigned\t0",
      "Carol\tStorm\t40",
    ].join("\n");
    expect(parseServerStatusString(status)).toEqual({
      teams: [
        { name: "Storm", score: 3 },
        { name: "Inferno", score: 1 },
      ],
      players: [
        { name: "Alice", team: "Storm", score: 120 },
        { name: "Bob", team: "Inferno", score: 85 },
        { name: "Watcher", team: "Unassigned", score: 0 },
        { name: "Carol", team: "Storm", score: 40 },
      ],
    });
  });

  it("parses teamless (numTeams 0) rosters", () => {
    const status = ["0", "2", "Alice\t\t10", "Bob\t\t5"].join("\n");
    expect(parseServerStatusString(status)).toEqual({
      teams: [],
      players: [
        { name: "Alice", team: "", score: 10 },
        { name: "Bob", team: "", score: 5 },
      ],
    });
  });

  it("tolerates a truncated player section", () => {
    const status = ["1", "Storm\t0", "5", "Alice\tStorm\t1"].join("\n");
    const parsed = parseServerStatusString(status);
    expect(parsed?.players).toHaveLength(1);
  });

  it("rejects garbage", () => {
    expect(parseServerStatusString("NoGame")).toBeNull();
    expect(parseServerStatusString("")).toBeNull();
    expect(parseServerStatusString("9999")).toBeNull();
  });
});

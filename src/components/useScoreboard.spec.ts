import { describe, expect, it } from "vitest";
import type { PlayerRosterEntry, TeamScore } from "../stream/types";
import { groupScoreboard } from "./useScoreboard";

const player = (
  clientId: number,
  name: string,
  teamId: number,
  score: number,
): PlayerRosterEntry => ({
  clientId,
  name,
  rawName: name,
  teamId,
  score,
  ping: 0,
  packetLoss: 0,
});
const team = (teamId: number): TeamScore => ({
  teamId,
  name: `Team ${teamId}`,
  score: 0,
  playerCount: 0,
});

describe("groupScoreboard", () => {
  it("groups declared teams and sorts by score, then name, without changing the snapshot", () => {
    const roster = Object.freeze([
      player(1, "Zed", 1, 4),
      player(2, "Amy", 1, 4),
      player(3, "Leader", 1, 10),
      player(4, "Opponent", 2, -2),
      player(5, "Observer", 0, 100),
    ]);
    const teams = Object.freeze([team(2), team(1)]);
    const result = groupScoreboard(roster, teams);
    expect(result.sortedTeams.map((t) => t.teamId)).toEqual([1, 2]);
    expect(result.teamPlayers.get(1)?.map((p) => p.name)).toEqual([
      "Leader",
      "Amy",
      "Zed",
    ]);
    expect(result.teamPlayers.get(2)?.[0].score).toBe(-2);
    expect(result.observers.map((p) => p.name)).toEqual(["Observer"]);
    expect(result.ffaPlayers).toBeNull();
    expect(roster[0].name).toBe("Zed");
    expect(teams[0].teamId).toBe(2);
  });

  it("combines teamless players across sensor groups, excluding observers", () => {
    const result = groupScoreboard([
      player(1, "First", 12, 10),
      player(2, "Second", 2, 5),
      player(3, "Observer", 0, 100),
      player(4, "Unassigned", -1, 50),
    ]);
    expect(result.ffaPlayers?.map((p) => p.name)).toEqual(["First", "Second"]);
    expect(result.sortedTeams).toEqual([]);
    expect(result.observers).toHaveLength(2);
  });

  it("handles empty rosters and more than two teams", () => {
    expect(groupScoreboard().ffaPlayers).toBeNull();
    const result = groupScoreboard([], [team(4), team(2), team(1), team(3)]);
    expect(result.sortedTeams.map((t) => t.teamId)).toEqual([1, 2, 3, 4]);
    expect(result.teamPlayers.size).toBe(0);
    expect(result.ffaPlayers).toBeNull();
  });
});

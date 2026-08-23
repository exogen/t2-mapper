import { describe, it, expect } from "vitest";
import {
  decodeFlagStatus,
  decodeTeamAdd,
  decodeFlagEvent,
  shouldReplaceScore,
  applyScoreHudToRoster,
  applyDebriefRowToRoster,
  type MutableRosterEntry,
} from "./serverMessageDecode.js";

const id = (s: string) => s; // no net-string indirection in tests

function roster(
  entries: Array<
    Partial<MutableRosterEntry> & { name: string; teamId: number }
  >,
) {
  const map = new Map<number, MutableRosterEntry>();
  entries.forEach((e, i) =>
    map.set(i, { score: 0, ...e } as MutableRosterEntry),
  );
  return map;
}

describe("decodeFlagStatus", () => {
  it("maps the status text", () => {
    expect(decodeFlagStatus("<At Base>")).toBe("home");
    expect(decodeFlagStatus("<In the Field>")).toBe("field");
    expect(decodeFlagStatus("Vaxity")).toBe("held");
    expect(decodeFlagStatus("")).toBe("home");
  });
});

describe("decodeTeamAdd", () => {
  it("decodes MsgCTFAddTeam with flag state and carrier", () => {
    expect(
      decodeTeamAdd(
        "MsgCTFAddTeam",
        ["MsgCTFAddTeam", "", "1", "Storm", "Vaxity", "3"],
        id,
      ),
    ).toEqual({
      teamId: 1,
      name: "Storm",
      score: 3,
      flag: { status: "held", carrier: "Vaxity" },
    });
  });

  it("MsgCTFAddTeam at base has no carrier", () => {
    const d = decodeTeamAdd(
      "MsgCTFAddTeam",
      ["MsgCTFAddTeam", "", "2", "Inferno", "<At Base>", "0"],
      id,
    );
    expect(d).toEqual({
      teamId: 2,
      name: "Inferno",
      score: 0,
      flag: { status: "home", carrier: undefined },
    });
  });

  it("CnH/Hunt use args[4] as score; Siege carries none", () => {
    expect(
      decodeTeamAdd("MsgCnHAddTeam", ["x", "", "1", "Alpha", "12"], id),
    ).toEqual({
      teamId: 1,
      name: "Alpha",
      score: 12,
    });
    expect(
      decodeTeamAdd("MsgSiegeAddTeam", ["x", "", "1", "Def", "1"], id),
    ).toEqual({
      teamId: 1,
      name: "Def",
      score: null,
    });
  });

  it("returns null when too short or not an add-team message", () => {
    expect(
      decodeTeamAdd("MsgCTFAddTeam", ["x", "", "1", "S", "<At Base>"], id),
    ).toBeNull();
    expect(decodeTeamAdd("MsgCnHAddTeam", ["x", "", "1"], id)).toBeNull();
    expect(decodeTeamAdd("MsgTeamScore", ["x", "", "1", "5"], id)).toBeNull();
  });

  it("score is null for a non-numeric CTF score, leaving teamId intact", () => {
    const d = decodeTeamAdd(
      "MsgCTFAddTeam",
      ["x", "", "1", "S", "<At Base>", "n/a"],
      id,
    );
    expect(d).toMatchObject({ teamId: 1, score: null });
  });
});

describe("decodeFlagEvent", () => {
  // Wire: args[2]=actor name, args[4]=flag's team.
  it("taken → held with actor as carrier", () => {
    expect(
      decodeFlagEvent("MsgCTFFlagTaken", ["x", "", "Vaxity", "", "2"], id),
    ).toEqual({ teamId: 2, status: "held", carrier: "Vaxity" });
  });
  it("dropped → field, returned/capped → home, no carrier", () => {
    expect(
      decodeFlagEvent("MsgCTFFlagDropped", ["x", "", "V", "", "1"], id),
    ).toMatchObject({
      status: "field",
      carrier: undefined,
    });
    expect(
      decodeFlagEvent("MsgCTFFlagCapped", ["x", "", "V", "", "1"], id),
    ).toMatchObject({
      status: "home",
    });
  });
  it("null when too short", () => {
    expect(
      decodeFlagEvent("MsgCTFFlagTaken", ["x", "", "V", ""], id),
    ).toBeNull();
  });
});

describe("shouldReplaceScore", () => {
  it("a real score always wins; 0 only fills an unset (0) slot", () => {
    expect(shouldReplaceScore(470, 0)).toBe(true);
    expect(shouldReplaceScore(470, 100)).toBe(true);
    expect(shouldReplaceScore(0, 0)).toBe(true); // 0 over 0 is a no-op but allowed
    expect(shouldReplaceScore(0, 100)).toBe(false); // don't clobber a real score
    expect(shouldReplaceScore(NaN, 100)).toBe(false);
  });
});

describe("applyScoreHudToRoster", () => {
  it("applies a TacoServer line to the matching team player, returns changed", () => {
    const r = roster([{ name: "Vaxity", teamId: 1 }]);
    const args = ["SetLineHud", "", "tag", "0", "fmt", "Vaxity", "470", "35"];
    expect(applyScoreHudToRoster(args, id, r)).toBe(true);
    expect([...r.values()][0]).toMatchObject({ score: 470, kills: 35 });
  });

  it("re-scans the roster for each player in a two-player stock line", () => {
    const r = roster([
      { name: "P1", teamId: 1 },
      { name: "P2", teamId: 2 },
    ]);
    const args = ["SetLineHud", "", "tag", "0", "fmt", "P1", "120", "P2", "90"];
    expect(applyScoreHudToRoster(args, id, r)).toBe(true);
    expect([...r.values()].map((e) => e.score)).toEqual([120, 90]);
  });

  it("ignores observers/headers (no team) and returns false", () => {
    const r = roster([{ name: "Obs", teamId: 0 }]);
    expect(
      applyScoreHudToRoster(
        ["SetLineHud", "", "t", "0", "f", "Obs", "5", "1"],
        id,
        r,
      ),
    ).toBe(false);
  });
});

describe("applyDebriefRowToRoster", () => {
  it("single-team row: name, score, kills", () => {
    const r = roster([{ name: "Vaxity", teamId: 1 }]);
    expect(
      applyDebriefRowToRoster(
        ["MsgDebriefAddLine", "", "fmt", "Vaxity", "470", "35"],
        id,
        r,
      ),
    ).toBe(true);
    expect([...r.values()][0]).toMatchObject({ score: 470, kills: 35 });
  });

  it("multi-team row: name, team, score, kills", () => {
    const r = roster([{ name: "Vaxity", teamId: 1 }]);
    applyDebriefRowToRoster(
      ["MsgDebriefAddLine", "", "fmt", "Vaxity", "Storm", "470", "35"],
      id,
      r,
    );
    expect([...r.values()][0]).toMatchObject({ score: 470, kills: 35 });
  });

  it("ignores header rows and unknown names", () => {
    const r = roster([{ name: "Vaxity", teamId: 1 }]);
    expect(applyDebriefRowToRoster(["x", "", "fmt", ""], id, r)).toBe(false);
    expect(
      applyDebriefRowToRoster(["x", "", "fmt", "Ghost", "1", "2"], id, r),
    ).toBe(false);
  });
});

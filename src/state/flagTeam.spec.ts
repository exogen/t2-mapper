import { afterEach, expect, it } from "vitest";
import { flagLabel, resolveFlagTeam } from "./flagTeam";
import { streamEntityToGameEntity } from "../stream/entityBridge";
import { setStreamSnapshot } from "./streamSnapshotStore";
import type { StreamSnapshot } from "../stream/types";

afterEach(() => setStreamSnapshot(null));

it.each([
  [undefined, "Flag", "Flag"],
  ["flag", "Flag", "flag Flag"],
  ["flag", "", "flag"],
  ["\x02Rabbit", "Flag", "Rabbit Flag"],
  ["_hidden", "Flag", "Flag"],
  ["_hidden", "_hidden", ""],
] as const)(
  "labels a ground flag with server name %j and type %j",
  (playerName, targetTypeName, label) => {
    const entity = streamEntityToGameEntity({
      id: "flag",
      type: "Item",
      playerName,
      targetTypeName,
      teamId: 0,
    });
    expect(flagLabel(entity, "original", {})).toBe(label);
  },
);

it("uses the server target name rather than inventing one from the sensor group", () => {
  setStreamSnapshot({
    teamScores: [{ teamId: 1, name: "Storm" }],
  } as StreamSnapshot);
  const entity = streamEntityToGameEntity({
    id: "flag",
    type: "Item",
    targetTypeName: "Flag",
    teamId: 1,
  });
  expect(flagLabel(entity, "original", {})).toBe("Flag");
  expect(flagLabel(entity, "original", { 1: "Knights" })).toBe("Knights Flag");
});

it("shows the carrier's name without changing it to the carried flag's team name", () => {
  const entity = streamEntityToGameEntity({
    id: "carrier",
    type: "Player",
    className: "Player",
    playerName: "\x02Alice",
    targetTypeName: "_ClientConnection",
    imageSlots: [
      { shapeName: "flag", skinName: "base", mountPoint: 0, dataBlockId: 1 },
    ],
  });
  expect(flagLabel(entity, "contextual", { 1: "Knights" })).toBe("Alice");
});

it("tests the internal-name prefix before removing player color codes", () => {
  const entity = streamEntityToGameEntity({
    id: "carrier",
    type: "Player",
    className: "Player",
    playerName: "_Alice",
    playerRawName: "\x08_Alice",
    targetTypeName: "_ClientConnection",
  });
  expect(flagLabel(entity, "contextual", {})).toBe("_Alice");
});

it("does not invent a team-qualified label for a stream ghost missing its target strings", () => {
  setStreamSnapshot({
    teamScores: [{ teamId: 1, name: "Storm" }],
  } as StreamSnapshot);
  const entity = streamEntityToGameEntity({
    id: "flag",
    ghostIndex: 0,
    type: "Item",
    teamId: 1,
  });
  expect(flagLabel(entity, "original", {})).toBe("");
});

it("does not assign a neutral carried flag to Storm just because its image uses the base skin", () => {
  setStreamSnapshot({
    teamScores: [
      { teamId: 1, name: "Hunters" },
      { teamId: 2, name: "Rabbit" },
    ],
  } as StreamSnapshot);
  const entity = streamEntityToGameEntity({
    id: "carrier",
    type: "Player",
    className: "Player",
    playerName: "Alice",
    teamId: 2,
    imageSlots: [
      { shapeName: "flag", skinName: "base", mountPoint: 0, dataBlockId: 1 },
    ],
  });
  expect(resolveFlagTeam(entity).teamId).toBeNull();
  setStreamSnapshot({
    teamScores: [{ teamId: 2, name: "Rabbit", skinName: "base" }],
  } as StreamSnapshot);
  expect(resolveFlagTeam(entity).teamId).toBe(2);
});

it("labels an already-carried CTF flag from its original target, without ever seeing its ghost", () => {
  setStreamSnapshot({
    flagTargets: [
      {
        targetId: 40,
        name: "Storm",
        typeName: "Flag",
        teamId: 1,
        skinName: "base",
      },
      {
        targetId: 41,
        name: "Inferno",
        typeName: "Flag",
        teamId: 2,
        skinName: "baseb",
      },
    ],
  } as StreamSnapshot);
  const entity = streamEntityToGameEntity({
    id: "carrier",
    type: "Player",
    className: "Player",
    targetId: 32,
    playerName: "Alice",
    targetTypeName: "_ClientConnection",
    teamId: 2,
    imageSlots: [
      {
        shapeName: "flag.dts",
        skinName: "BASE",
        mountPoint: 0,
        dataBlockId: 1,
      },
    ],
  });
  expect(flagLabel(entity, "original", {})).toBe("Storm Flag");
  expect(flagLabel(entity, "original", { 1: "Knights", 2: "Raiders" })).toBe(
    "Knights Flag",
  );
  expect(flagLabel(entity, "contextual", {})).toBe("Alice");
});

it("uses the single original flag target in Rabbit without a team skin association", () => {
  setStreamSnapshot({
    flagTargets: [
      { targetId: 40, name: "\x02Golden", typeName: "Flag", teamId: 0 },
    ],
  } as StreamSnapshot);
  const entity = streamEntityToGameEntity({
    id: "carrier",
    type: "Player",
    className: "Player",
    playerName: "Alice",
  });
  expect(flagLabel(entity, "original", {})).toBe("Golden Flag");
  // A real server rename or explicit clearing is reflected; it is not a
  // cached historical name from the first time the item was seen.
  setStreamSnapshot({
    flagTargets: [{ targetId: 40, name: "_hidden", typeName: "" }],
  } as StreamSnapshot);
  expect(flagLabel(entity, "original", {})).toBe("");
  setStreamSnapshot({ flagTargets: [] } as unknown as StreamSnapshot);
  expect(flagLabel(entity, "original", {})).toBe("Flag");
});

it("does not guess an original flag from ambiguous skins or use the carrier's own team", () => {
  setStreamSnapshot({
    flagTargets: [
      {
        targetId: 40,
        name: "Storm",
        typeName: "Flag",
        teamId: 1,
        skinName: "base",
      },
      {
        targetId: 41,
        name: "Inferno",
        typeName: "Flag",
        teamId: 2,
        skinName: "base",
      },
    ],
  } as StreamSnapshot);
  const entity = streamEntityToGameEntity({
    id: "carrier",
    type: "Player",
    className: "Player",
    teamId: 2,
    playerName: "Alice",
    imageSlots: [
      { shapeName: "flag", skinName: "base", mountPoint: 0, dataBlockId: 1 },
    ],
  });
  expect(flagLabel(entity, "original", {})).toBe("Flag");
});

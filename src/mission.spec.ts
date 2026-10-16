import { expect, it } from "vitest";
import { lookupMissionType } from "./mission";

it.each([
  ["Capture the Flag", "CTF"],
  ["CTF", "CTF"],
  ["Capture the Flag (Practice)", "CTF (Practice)"],
  ["LCTF", "LCTF"],
  ["Spawn CtF", "SCtF"],
])("abbreviates the server's %s game type as %s", (gameType, code) => {
  expect(lookupMissionType(gameType)).toBe(code);
});

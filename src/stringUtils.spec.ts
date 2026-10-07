import { expect, it } from "vitest";
import { formatTargetName } from "./stringUtils";

it.each([
  [undefined, "Flag", "Flag"],
  ["", "Flag", "Flag"],
  ["Storm", "Flag", "Storm Flag"],
  ["flag", "Flag", "flag Flag"],
  ["Flag", "Flag", "Flag Flag"],
  ["flag", "", "flag"],
  ["Alice", "_ClientConnection", "Alice"],
  ["_hidden", "Flag", "Flag"],
  ["_hidden", "_hidden", ""],
  ["", "", ""],
] as const)(
  "formats target name %j and type %j like Tribes2.exe",
  (name, type, expected) => {
    expect(formatTargetName(name, type)).toBe(expected);
  },
);

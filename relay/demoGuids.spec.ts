import { describe, expect, it } from "vitest";
import {
  mergeNamesByGuid,
  readDemoGuidSidecar,
  withoutReconnectNames,
} from "./demoGuids.js";

describe("mergeNamesByGuid", () => {
  it("unions each GUID's names across demos in numeric GUID order", () => {
    const merged = mergeNamesByGuid([
      { namesByGuid: { "67890": ["BazzMan"], "12345": ["foo", "exogen"] } },
      { namesByGuid: { "12345": ["exogen", "Bar"], "999": ["Zed"] } },
      { namesByGuid: {} },
    ]);
    expect(merged).toEqual({
      "999": ["Zed"],
      "12345": ["Bar", "exogen", "foo"],
      "67890": ["BazzMan"],
    });
    expect(Object.keys(merged)).toEqual(["999", "12345", "67890"]);
  });
});

describe("readDemoGuidSidecar", () => {
  it("accepts the stored shape", () => {
    const sidecar = { namesByGuid: { "12345": ["exogen"] } };
    expect(readDemoGuidSidecar(sidecar)).toEqual(sidecar);
  });

  it.each([
    null,
    {},
    { namesByGuid: [] },
    { namesByGuid: { "0": ["Smurf"] } },
    { namesByGuid: { "012": ["Padded"] } },
    { namesByGuid: { "12345": "exogen" } },
    { namesByGuid: { "12345": [7] } },
  ])("rejects %j", (value) => {
    expect(() => readDemoGuidSidecar(value)).toThrow(/Invalid/);
  });
});

describe("withoutReconnectNames", () => {
  it("drops .1 through .9 renames only beside the GUID's base name", () => {
    expect(
      withoutReconnectNames({
        "12345": [
          "andycap",
          "andycap.1",
          "andycap.9",
          "andycap.0",
          "andycap.10",
        ],
        "67890": ["Agent.7"],
        "999": ["Mia", "Mia.2", "Other.1"],
      }),
    ).toEqual({
      "12345": ["andycap", "andycap.0", "andycap.10"],
      "67890": ["Agent.7"],
      "999": ["Mia", "Other.1"],
    });
  });
});

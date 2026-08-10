import { describe, it, expect } from "vitest";
import {
  ENGINE_CLASSES,
  TYPE_MASKS,
  getClassTypeMask,
  getEngineParent,
  getOnAddStyle,
  isGroupClass,
  isSetClass,
} from "./classHierarchy";

describe("TYPE_MASKS", () => {
  it("assigns a distinct bit to every mask", () => {
    const values = Object.values(TYPE_MASKS);
    let combined = 0;
    for (const value of values) {
      expect(combined & value).toBe(0);
      combined = (combined | value) >>> 0;
    }
  });
});

describe("ENGINE_CLASSES", () => {
  it("chains every parent to a defined class", () => {
    for (const [name, info] of ENGINE_CLASSES) {
      if (info.parent !== null) {
        expect(
          ENGINE_CLASSES.has(info.parent),
          `${name} → ${info.parent}`,
        ).toBe(true);
      }
    }
  });

  it("terminates every chain at SimObject without cycles", () => {
    for (const [name] of ENGINE_CLASSES) {
      const seen = new Set<string>();
      let current: string | null = name;
      while (current) {
        expect(seen.has(current.toLowerCase()), `cycle at ${current}`).toBe(
          false,
        );
        seen.add(current.toLowerCase());
        current = ENGINE_CLASSES.get(current)?.parent ?? null;
      }
      expect(seen.has("simobject")).toBe(true);
    }
  });
});

describe("getEngineParent", () => {
  it("walks the C++ chain", () => {
    expect(getEngineParent("StaticShape")).toBe("ShapeBase");
    expect(getEngineParent("ShapeBase")).toBe("GameBase");
    expect(getEngineParent("Turret")).toBe("StaticShape");
    expect(getEngineParent("SimGroup")).toBe("SimSet");
    expect(getEngineParent("simobject")).toBe(null);
  });

  it("chains data classes to SimObject through SimDataBlock", () => {
    expect(getEngineParent("StaticShapeData")).toBe("ShapeBaseData");
    expect(getEngineParent("ShapeBaseData")).toBe("GameBaseData");
    expect(getEngineParent("GameBaseData")).toBe("SimDataBlock");
    expect(getEngineParent("SimDataBlock")).toBe("SimObject");
  });

  it("falls back for unknown classes by name shape", () => {
    expect(getEngineParent("ExoticCustomData")).toBe("SimDataBlock");
    expect(getEngineParent("SomeAudioProfile")).toBe("SimDataBlock");
    expect(getEngineParent("ExoticThing")).toBe("SimObject");
  });
});

describe("getClassTypeMask", () => {
  it("accumulates ancestor bits", () => {
    const mask = getClassTypeMask("StaticShape");
    expect(mask & TYPE_MASKS.StaticShapeObjectType).toBeTruthy();
    expect(mask & TYPE_MASKS.StaticObjectType).toBeTruthy();
    expect(mask & TYPE_MASKS.ShapeBaseObjectType).toBeTruthy();
    expect(mask & TYPE_MASKS.GameBaseObjectType).toBeTruthy();
    expect(mask & TYPE_MASKS.ItemObjectType).toBeFalsy();
  });

  it("gives turrets the full StaticShape lineage", () => {
    const mask = getClassTypeMask("Turret");
    expect(mask & TYPE_MASKS.TurretObjectType).toBeTruthy();
    expect(mask & TYPE_MASKS.StaticShapeObjectType).toBeTruthy();
    expect(mask & TYPE_MASKS.GameBaseObjectType).toBeTruthy();
  });

  it("returns 0 for unknown classes", () => {
    expect(getClassTypeMask("NotARealClass")).toBe(0);
  });
});

describe("getOnAddStyle", () => {
  it("uses datablock style for shapes and object style for ScriptObject", () => {
    expect(getOnAddStyle("StaticShape", true)).toBe("datablock");
    expect(getOnAddStyle("Item", true)).toBe("datablock");
    expect(getOnAddStyle("ScriptObject", false)).toBe("object");
    expect(getOnAddStyle("SimGroup", false)).toBe("none");
    // CTFGame.cs: "there is no MissionMarker::onAdd script call".
    expect(getOnAddStyle("MissionMarker", true)).toBe("none");
    expect(getOnAddStyle("WayPoint", false)).toBe("none");
  });

  it("falls back by datablock presence for unknown classes", () => {
    expect(getOnAddStyle("MapPackThing", true)).toBe("datablock");
    expect(getOnAddStyle("MapPackThing", false)).toBe("object");
  });
});

describe("group/set semantics", () => {
  it("distinguishes owning groups from non-owning sets", () => {
    expect(isGroupClass("SimGroup")).toBe(true);
    expect(isGroupClass("ScriptGroup")).toBe(true);
    expect(isGroupClass("SimSet")).toBe(false);
    expect(isGroupClass("StaticShape")).toBe(false);
    expect(isSetClass("SimSet")).toBe(true);
    expect(isSetClass("SimGroup")).toBe(true);
    expect(isSetClass("StaticShape")).toBe(false);
  });
});

import { describe, it, expect, vi } from "vitest";
import { createRuntime } from "./runtime";
import { registerEngineStubs } from "./engineMethods";
import { transpile } from "./index";
import { TYPE_MASKS } from "./classHierarchy";
import type { TorqueRuntimeOptions } from "./types";

const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
}));

vi.mock("../logger", () => ({
  createLogger: () => mockLogger,
}));

function makeRuntime(options?: TorqueRuntimeOptions) {
  const runtime = createRuntime(options);
  registerEngineStubs(runtime, {
    mountTransforms: {
      vehicle_pad: {
        mount0: {
          // Entity-local Three space: 13.068 north (+x), 3.21 up (+y),
          // -0.079 east; identity rotation (matches the generated table).
          position: [13.06814, 3.21005, -0.07934],
          rotation: [0, 0, 0, 1],
        },
      },
    },
  });
  const exec = (script: string) => {
    const { code } = transpile(script);
    const $l = runtime.$.locals();
    new Function("$", "$f", "$g", "$l", code)(
      runtime.$,
      runtime.$f,
      runtime.$g,
      $l,
    );
  };
  return { runtime, exec };
}

describe("transforms", () => {
  it("round-trips getTransform through setTransform", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new StaticShape(A) { position = "10 20 30"; rotation = "0 0 -1 90"; };
      new StaticShape(B) {};
      B.setTransform(A.getTransform());
    `);
    const a = runtime.getObjectByName("A")!;
    const b = runtime.getObjectByName("B")!;
    const posB = String(b.position)
      .split(" ")
      .map((n) => Math.round(parseFloat(n) * 1000) / 1000);
    expect(posB).toEqual([10, 20, 30]);
    const rotA = String(a.rotation).split(" ").map(parseFloat);
    const rotB = String(b.rotation).split(" ").map(parseFloat);
    // Same rotation up to axis-angle sign convention.
    const dot =
      rotA[0] * rotB[0] * Math.sign(rotA[3] * rotB[3]) +
      rotA[1] * rotB[1] * Math.sign(rotA[3] * rotB[3]) +
      rotA[2] * rotB[2] * Math.sign(rotA[3] * rotB[3]);
    expect(Math.abs(dot)).toBeCloseTo(1, 3);
    expect(Math.abs(rotB[3])).toBeCloseTo(90, 3);
  });

  it("transform strings carry radians in the angle word", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new StaticShape(A) { position = "1 2 3"; rotation = "0 0 1 180"; };
      $xform = A.getTransform();
    `);
    const words = String(runtime.$g.get("xform")).split(" ").map(parseFloat);
    expect(words.slice(0, 3)).toEqual([1, 2, 3]);
    expect(Math.abs(words[6])).toBeCloseTo(Math.PI, 3);
  });
});

describe("getSlotTransform", () => {
  it("composes the mount node with the pad transform (station.cs pattern)", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(StationVehiclePad) { shapeFile = "vehicle_pad.dts"; };
      new StaticShape(Pad) {
        dataBlock = StationVehiclePad;
        position = "100 200 50";
        rotation = "1 0 0 0";
      };
      $xform = Pad.getSlotTransform(0);
      $pos = getWords($xform, 0, 2);
    `);
    const pos = String(runtime.$g.get("pos")).split(" ").map(parseFloat);
    // Identity pad rotation: mount offset in Torque = (east, north, up) =
    // (-0.079, 13.068, 3.210).
    expect(pos[0]).toBeCloseTo(100 - 0.07934, 3);
    expect(pos[1]).toBeCloseTo(200 + 13.06814, 3);
    expect(pos[2]).toBeCloseTo(50 + 3.21005, 3);
  });

  it("rotates the mount offset with the pad", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(StationVehiclePad) { shapeFile = "vehicle_pad.dts"; };
      new StaticShape(Pad) {
        dataBlock = StationVehiclePad;
        position = "0 0 0";
        rotation = "0 0 -1 90";
      };
      $pos = getWords(Pad.getSlotTransform(0), 0, 2);
    `);
    const pos = String(runtime.$g.get("pos")).split(" ").map(parseFloat);
    // The Recalescence pads use "0 0 -1 90"; the mount offset must rotate
    // with the pad rather than staying axis-aligned.
    const r = Math.hypot(pos[0], pos[1]);
    expect(r).toBeCloseTo(Math.hypot(0.07934, 13.06814), 3);
    expect(Math.abs(pos[1])).toBeLessThan(1);
    expect(Math.abs(pos[0])).toBeGreaterThan(12);
    expect(pos[2]).toBeCloseTo(3.21005, 3);
  });

  it("falls back to the object transform for unknown shapes", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(NoMounts) { shapeFile = "mystery.dts"; };
      new StaticShape(Obj) { dataBlock = NoMounts; position = "5 6 7"; };
      $pos = getWords(Obj.getSlotTransform(0), 0, 2);
    `);
    expect(String(runtime.$g.get("pos"))).toBe("5 6 7");
  });
});

describe("visual state recording", () => {
  it("hide() writes the hidden field", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new StaticShape(Obj) {};
      Obj.hide(true);
    `);
    expect(runtime.getObjectByName("Obj")!.hidden).toBe(true);
  });

  it("mountImage records slot state and unmountImage clears it", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ItemImageData(SentryBarrel) { shapeFile = "sentry_barrel.dts"; };
      new Turret(T) {};
      T.mountImage(SentryBarrel, 0, true);
    `);
    const t = runtime.getObjectByName("T")!;
    expect(t._mountedImages[0]).toMatchObject({
      image: "SentryBarrel",
      loaded: true,
    });
    runtime.$.call(t, "unmountImage", 0);
    expect(t._mountedImages[0]).toBeUndefined();
  });

  it("force field open/close toggles _fieldopen", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ForceFieldBareData(FF) {};
      new ForceFieldBare(Field) { dataBlock = FF; };
      Field.open();
    `);
    const field = runtime.getObjectByName("Field")!;
    expect(field._fieldopen).toBe(true);
    runtime.$.call(field, "close");
    expect(field._fieldopen).toBe(false);
  });

  it("getType combines class mask and datablock dynamicType", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(SensorData) { dynamicType = $TypeMasks::SensorObjectType; };
      new StaticShape(S) { dataBlock = SensorData; };
      $type = S.getType();
      $isSensor = $type & $TypeMasks::SensorObjectType ? 1 : 0;
      $isGameBase = $type & $TypeMasks::GameBaseObjectType ? 1 : 0;
      $isItem = $type & $TypeMasks::ItemObjectType ? 1 : 0;
    `);
    expect(runtime.$g.get("isSensor")).toBe(1);
    expect(runtime.$g.get("isGameBase")).toBe(1);
    expect(runtime.$g.get("isItem")).toBe(0);
    expect(TYPE_MASKS.SensorObjectType).toBeTruthy();
  });
});

describe("target system", () => {
  it("setTargetSkin reaches the object's skin field", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new Item(FlagItem) {};
      $t = createTarget(FlagItem, "Flag", "", "", 'Flag', 0);
      setTargetSkin($t, "swolf");
    `);
    const flag = runtime.getObjectByName("FlagItem")!;
    expect(flag.skin).toBe("swolf");
    expect(flag._targetSkin).toBe("swolf");
    expect(flag._target).toBe(runtime.$g.get("t"));
  });

  it("allocates target ids from 32 and resets", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new Item(A) {};
      $t1 = createTarget(A, "A", "", "", '', 0);
      resetTargetManager();
      new Item(B) {};
      $t2 = createTarget(B, "B", "", "", '', 0);
    `);
    expect(runtime.$g.get("t1")).toBe(32);
    expect(runtime.$g.get("t2")).toBe(32);
  });
});

describe("settle", () => {
  it("drains chained zero-delay schedules", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function stepOne() { $steps = $steps @ "1"; schedule(0, 0, stepTwo); }
      function stepTwo() { $steps = $steps @ "2"; schedule(0, 0, stepThree); }
      function stepThree() { $steps = $steps @ "3"; }
      $steps = "";
      schedule(0, 0, stepOne);
    `);
    await runtime.settle();
    expect(runtime.$g.get("steps")).toBe("123");
  });

  it("ignores longer timers", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function never() { $ran = true; }
      $ran = false;
      schedule(5000, 0, never);
    `);
    await runtime.settle();
    expect(runtime.$g.get("ran")).toBe(false);
    runtime.destroy();
  });

  it("object schedule() participates in settle", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(PadData) {};
      function PadData::onAdd(%data, %obj) {
        %data.schedule(0, "createStation", %obj);
      }
      function PadData::createStation(%data, %obj) {
        new StaticShape(SpawnedStation) {};
      }
      new StaticShape(Pad) { dataBlock = PadData; };
    `);
    expect(runtime.getObjectByName("SpawnedStation")).toBeUndefined();
    await runtime.settle();
    expect(runtime.getObjectByName("SpawnedStation")).toBeDefined();
  });
});

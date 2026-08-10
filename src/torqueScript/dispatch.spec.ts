import { describe, it, expect, vi } from "vitest";
import { createRuntime } from "./runtime";
import { registerEngineStubs } from "./engineMethods";
import { transpile } from "./index";
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
  registerEngineStubs(runtime);
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

describe("engine namespace chain dispatch", () => {
  it("finds SimSet methods from a SimGroup object", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function SimSet::tag(%this) { return "set:" @ %this.getName(); }
      new SimGroup(MyGroup) {};
    `);
    const group = runtime.getObjectByName("MyGroup")!;
    expect(runtime.$.call(group, "tag")).toBe("set:MyGroup");
  });

  it("finds GameBase methods from a StaticShape object", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function GameBase::poke(%this) { return "poked"; }
      new StaticShape(TestShape) {};
    `);
    const shape = runtime.getObjectByName("TestShape")!;
    expect(runtime.$.call(shape, "poke")).toBe("poked");
  });

  it("keeps the datablock namespace out of the object's own chain", () => {
    // The engine routes datablock callbacks explicitly through the
    // datablock (%obj.getDataBlock().method(%obj)); object dispatch must
    // NOT stop at datablock-name handlers, or e.g. cleanNonType would hit
    // the wrong namespace (server.cs relies on ShapeBase::cleanNonType
    // winning over SimObject::cleanNonType for shapes).
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(GeneratorLarge) { className = Generator; };
      function GeneratorLarge::whoami(%this) { return "generator-large"; }
      function ShapeBase::whoami(%this) { return "shape"; }
      new StaticShape(Gen) { dataBlock = GeneratorLarge; };
    `);
    const gen = runtime.getObjectByName("Gen")!;
    expect(runtime.$.call(gen, "whoami")).toBe("shape");
    // getDataBlock() routing reaches the datablock namespace.
    exec(`$viaData = Gen.getDataBlock().whoami();`);
    expect(runtime.$g.get("viaData")).toBe("generator-large");
  });

  it("hops through the datablock className field on the datablock", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(GeneratorLarge) { className = Generator; };
      function Generator::isPowering(%this) { return 1; }
      new StaticShape(Gen) { dataBlock = GeneratorLarge; };
      $powering = Gen.getDataBlock().isPowering();
    `);
    const db = runtime.state.datablocks.get("GeneratorLarge")!;
    expect(runtime.$g.get("powering")).toBe(1);
    // Datablocks are dispatch targets themselves.
    expect(runtime.$.call(db, "isPowering")).toBe(1);
  });

  it("falls through to data-class handlers from a datablock", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function ShapeBaseData::describe(%this) { return "shape-data"; }
      datablock StaticShapeData(PlainShape) {};
    `);
    const db = runtime.state.datablocks.get("PlainShape")!;
    expect(runtime.$.call(db, "describe")).toBe("shape-data");
  });

  it("lets script class win over the engine chain", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function GameBase::label(%this) { return "engine"; }
      function Special::label(%this) { return "script"; }
      new StaticShape(Obj) { class = Special; };
    `);
    const obj = runtime.getObjectByName("Obj")!;
    expect(runtime.$.call(obj, "label")).toBe("script");
  });

  it("dispatches by object name when a name namespace exists", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function Nexus::spin(%this) { return "spinning"; }
      new Item(Nexus) {};
    `);
    const obj = runtime.getObjectByName("Nexus")!;
    expect(runtime.$.call(obj, "spin")).toBe("spinning");
  });

  it("invalidates cached chains when a method namespace appears later", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new StaticShape(Late) {};
    `);
    const obj = runtime.getObjectByName("Late")!;
    expect(runtime.$.call(obj, "latecomer")).toBe("");
    exec(`
      function Late::latecomer(%this) { return "arrived"; }
    `);
    expect(runtime.$.call(obj, "latecomer")).toBe("arrived");
  });

  it("re-resolves after package activation changes dispatch", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function ShapeBase::greet(%this) { return "base"; }
      new StaticShape(Obj) {};
      package Override {
        function ShapeBase::greet(%this) { return "override"; }
      };
    `);
    const obj = runtime.getObjectByName("Obj")!;
    expect(runtime.$.call(obj, "greet")).toBe("base");
    runtime.$.activatePackage("Override");
    expect(runtime.$.call(obj, "greet")).toBe("override");
    runtime.$.deactivatePackage("Override");
    expect(runtime.$.call(obj, "greet")).toBe("base");
  });
});

describe("Parent:: through the engine chain", () => {
  it("crosses data-class namespace boundaries", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function GameBaseData::onAdd(%data, %obj) { $trace = $trace @ "|GameBaseData"; }
      function ShapeBaseData::onAdd(%data, %obj) {
        $trace = $trace @ "|ShapeBaseData";
        Parent::onAdd(%data, %obj);
      }
      datablock StaticShapeData(TestData) {};
      function TestData::onAdd(%data, %obj) {
        $trace = $trace @ "|TestData";
        Parent::onAdd(%data, %obj);
      }
      $trace = "";
      new StaticShape(Obj) { dataBlock = TestData; };
    `);
    expect(runtime.$g.get("trace")).toBe(
      "|TestData|ShapeBaseData|GameBaseData",
    );
  });

  it("passes exactly the explicit arguments (no %this shift)", () => {
    // The gameBase.cs pattern: GameBaseData::onAdd must see the OBJECT as
    // %obj (a regression here silently sets targets on the datablock).
    const { runtime, exec } = makeRuntime();
    exec(`
      function GameBaseData::onAdd(%data, %obj) {
        $dataName = %data.getName();
        $objName = %obj.getName();
        %obj.target = 42;
      }
      datablock ItemData(FlagData) {};
      function FlagData::onAdd(%data, %obj) {
        Parent::onAdd(%data, %obj);
      }
      new Item(FlagObj) { dataBlock = FlagData; };
    `);
    expect(runtime.$g.get("dataName")).toBe("FlagData");
    expect(runtime.$g.get("objName")).toBe("FlagObj");
    expect(runtime.getObjectByName("FlagObj")!.target).toBe(42);
    expect(runtime.state.datablocks.get("FlagData")!.target).toBeUndefined();
  });
});

describe("onAdd conventions", () => {
  it("fires datablock-style onAdd with (%data, %obj)", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ItemData(Flag) {};
      function Flag::onAdd(%data, %obj) {
        $addedData = %data.getName();
        %obj.tagged = true;
      }
      new Item(TheFlag) { dataBlock = Flag; };
    `);
    expect(runtime.$g.get("addedData")).toBe("Flag");
    expect(runtime.getObjectByName("TheFlag")!.tagged).toBe(true);
  });

  it("fires object-style onAdd for ScriptObjects with (%obj)", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      function Widget::onAdd(%this) { $widgetAdded = %this.getName(); }
      new ScriptObject(W1) { class = Widget; };
    `);
    expect(runtime.$g.get("widgetAdded")).toBe("W1");
  });

  it("fires onAdd for script-created objects at runtime", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(SpawnData) {};
      function SpawnData::onAdd(%data, %obj) { $spawnCount++; }
      function makeOne() { new StaticShape() { dataBlock = SpawnData; }; }
      $spawnCount = 0;
      makeOne();
      makeOne();
    `);
    expect(runtime.$g.get("spawnCount")).toBe(2);
  });

  it("does not fire onAdd for MissionMarker subclasses or datablock declarations", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock MissionMarkerData(WayPointMarker) {};
      function WayPointMarker::onAdd(%data, %obj) { $markerAdds++; }
      function MissionMarkerData::onAdd(%data, %obj) { $markerAdds++; }
      $markerAdds = 0;
      new WayPoint() { dataBlock = WayPointMarker; };
    `);
    expect(runtime.$g.get("markerAdds")).toBe(0);
  });

  it("fires onRemove through the datablock chain on delete()", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock StaticShapeData(Doomed) {};
      function Doomed::onRemove(%data, %obj) { $removed = %obj.getName(); }
      new StaticShape(Victim) { dataBlock = Doomed; };
    `);
    const victim = runtime.getObjectByName("Victim")!;
    runtime.$.deleteObject(victim);
    expect(runtime.$g.get("removed")).toBe("Victim");
    expect(runtime.getObjectByName("Victim")).toBeUndefined();
  });
});

describe("$instantGroup", () => {
  it("places root-level news into the instant group", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(Cleanup) {};
      $instantGroup = Cleanup;
      new StaticShape(Loose) {};
    `);
    const cleanup = runtime.getObjectByName("Cleanup")!;
    const loose = runtime.getObjectByName("Loose")!;
    expect(loose._parent).toBe(cleanup);
    expect(cleanup._children).toContain(loose);
  });

  it("leaves nested children with their literal parent", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(Cleanup) {};
      $instantGroup = Cleanup;
      new SimGroup(Outer) {
        new StaticShape(Inner) {};
      };
    `);
    const outer = runtime.getObjectByName("Outer")!;
    const inner = runtime.getObjectByName("Inner")!;
    expect(inner._parent).toBe(outer);
    expect(outer._parent).toBe(runtime.getObjectByName("Cleanup"));
  });

  it("never captures datablocks", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(Cleanup) {};
      $instantGroup = Cleanup;
      datablock StaticShapeData(FreeData) {};
    `);
    const cleanup = runtime.getObjectByName("Cleanup")!;
    expect(cleanup._children ?? []).toHaveLength(0);
  });
});

describe("group vs set semantics", () => {
  it("owning adds reparent; non-owning adds only record membership", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(GroupA) { new StaticShape(Member) {}; };
      new SimGroup(GroupB) {};
      new SimSet(SetC) {};
    `);
    const groupA = runtime.getObjectByName("GroupA")!;
    const groupB = runtime.getObjectByName("GroupB")!;
    const setC = runtime.getObjectByName("SetC")!;
    const member = runtime.getObjectByName("Member")!;

    runtime.addToGroup(setC, member, { owning: false });
    expect(member._parent).toBe(groupA);
    expect(setC._children).toContain(member);

    runtime.addToGroup(groupB, member, { owning: true });
    expect(member._parent).toBe(groupB);
    expect(groupA._children ?? []).not.toContain(member);
    // Set membership is untouched by reparenting.
    expect(setC._children).toContain(member);
  });

  it("deleting a set spares members owned elsewhere", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(Owner) { new StaticShape(Kept) {}; };
      new SimSet(Doomed) {};
    `);
    const doomed = runtime.getObjectByName("Doomed")!;
    const kept = runtime.getObjectByName("Kept")!;
    runtime.addToGroup(doomed, kept, { owning: false });
    runtime.$.deleteObject(doomed);
    expect(runtime.getObjectByName("Kept")).toBe(kept);
    expect(kept._parent).toBe(runtime.getObjectByName("Owner"));
  });
});
